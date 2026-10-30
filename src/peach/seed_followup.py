"""导入实体种子后继：扫描结算后把私有种子包补进账本（ADR-0075、ADR-0111）。

 The seed pack lives in the app resources at `resources/seed/entities.json` (`seed_pack.DEFAULT_PACK`), import only fills blanks in entities the machine already has and replaces seeds
自己写过的旧行（`seed_pack.land`）。这条后继由扫描与采集在结算时声明（ADR-0040 第一条），
派的条件是两个里有一个：这一轮登记了新的女优、厂牌或事务所，或这个版本的包还没有成功导入过。
同一版本因此会跑多次；`land` 幂等，多跑一次只是没有东西可补。

与本机不一致的事实、对上本机两位实体的包项写进 `candidate_root` 下的 `seed-landing.csv`，
活动页只给条数。
"""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from . import seed_pack, seed_corrections, seed_validation
from .followups import Followup, FollowupType, register

TASK_KEY = "seed-import"
TASK_LABEL = "Import seed data"
REVIEW_FILE = "seed-landing.csv"
FIELDS = ("kind", "entity", "field", "ours", "source", "theirs", "detail", "batch", "withdrawal_id", "evidence")
#: 活动页摘要里的计数键与它们的中文名，按这个顺序拼结论。
SUMMARY_LABELS = (("aliases", "Aliases"), ("refs", "Codes"), ("links", "Links"), ("profiles", "Profiles"),
                  ("memberships", "Memberships"), ("makers", "Makers"), ("refreshed", "Refreshed"), ("withdrawn", "Withdrawn"), ("names", "Chinese names"))


def followup_key(version: str, content_hash: str = "") -> str:
    return f"{TASK_KEY}:{version}" + (f":{content_hash}:names1" if content_hash else "")


def pack_version(path: Path | None = None) -> str | None:
    """私有种子包版本；缺包时返回 None，包损坏时报告校验错误。"""
    path = Path(path) if path is not None else seed_pack.DEFAULT_PACK
    if not path.is_file():
        return None
    return str(seed_pack.load(path)["version"])


def landed(connection: sqlite3.Connection, key: str) -> bool:
    """这个版本有没有成功导入过：看任务记录里同 key 的后继有没有走到成功。"""
    return connection.execute(
        "SELECT 1 FROM task_run WHERE followup_key=? AND status='succeeded' LIMIT 1", (key,)).fetchone() is not None


def _new_entities(connection: sqlite3.Connection, since_entity_id: int) -> bool:
    marks = ",".join("?" * len(seed_pack.KINDS))
    return connection.execute(
        f"SELECT 1 FROM entity WHERE id>? AND kind IN ({marks}) LIMIT 1",
        (int(since_entity_id), *seed_pack.KINDS)).fetchone() is not None


def plan(connection: sqlite3.Connection, *, since_entity_id: int, pack_path: Path | None = None) -> list[Followup]:
    """这一轮该不该派：包的版本没成功导过，或这一轮登记了包里那三类的新实体。"""
    path = Path(pack_path) if pack_path is not None else seed_pack.DEFAULT_PACK
    if not path.is_file():
        return []
    pack = seed_pack.load(path)
    seed_corrections.check_history(connection, pack)
    version = pack["version"]
    key = followup_key(version, seed_validation.digest(pack))
    if landed(connection, key) and not _new_entities(connection, since_entity_id):
        return []
    return [Followup(key=key, task_key=TASK_KEY, label=f"{TASK_LABEL}：{version}")]


def _rows(report: dict) -> list[dict]:
    rows = [{"kind": item["kind"], "entity": item["entity"], "field": item["field"], "ours": item["ours"],
             "source": item["source"], "theirs": item["theirs"], "batch": report["batch"],
             "detail": "The pack disagrees with this machine; this entry was not written by a seed, so the seed leaves it alone"}
            for item in report["conflicts"]]
    rows += [{"kind": item["kind"], "entity": "、".join(item["entities"]), "field": "identity", "ours": "",
              "source": "", "theirs": item["name"], "batch": report["batch"],
              "detail": "One entry in the pack matches two on this machine, possibly a duplicate identity; merging is irreversible, so a person decides"}
             for item in report["duplicates"]]
    rows += [{"kind": item["kind"], "entity": item["entity"], "field": item["field"], "source": item["source"],
              "detail": item["detail"] + "；" + item["reason"], "withdrawal_id": item["id"],
              "evidence": item["evidence"], "batch": report["batch"]}
             for item in report.get("withdrawal_conflicts", [])]
    return rows


def record_review(root: Path, report: dict) -> Path:
    """复核产物整份换成这一轮的：种子导入每次都是全量，上一轮留下的项这一轮要么还在、要么已解决。"""
    from .review_csv import write_rows
    path = Path(root) / REVIEW_FILE
    write_rows(path, FIELDS, _rows(report), atomic=True, fill_missing=True)
    return path


def outcome(report: dict) -> str:
    parts = [f"{label} {report[key]}" for key, label in SUMMARY_LABELS if report.get(key)]
    if report["conflicts"]:
        parts.append(f"Conflicts {len(report['conflicts'])}")
    if report["duplicates"]:
        parts.append(f"Duplicate identities {len(report['duplicates'])}")
    if report.get("withdrawal_conflicts"):
        parts.append(f"Withdrawals to review {len(report['withdrawal_conflicts'])}")
    return ", ".join(parts) if parts else f"Nothing to fill ({report['matched']} matched)"


def run(contract, key: str, handle) -> dict:
    """Fill the seed pack distributed with the app into the ledger; tests use a temporary seed pack."""
    pack = seed_pack.load(seed_pack.DEFAULT_PACK)
    if key != followup_key(pack["version"], seed_validation.digest(pack)):
        raise ValueError("Seed content does not match the queued task's digest; dispatch again")
    if handle is not None:
        handle.progress(label=f"{TASK_LABEL}：{pack['version']}", throttle=0)
    with contract.database.read_connection() as connection:
        rename = bool(seed_pack.plan(connection, pack).get("names"))
    if rename:
        from .migrations import sqlite_backup
        db_path = Path(contract.database.db_path)
        backup = db_path.with_name(f"ledger.pre-seed-names-{time.time_ns()}.db")
        sqlite_backup(db_path, backup)
    with contract.database.write_transaction() as connection:
        report = seed_pack.land(connection, pack)
    if seed_pack.written(report):
        contract.cache_bust()
    record_review(contract.candidate_root, report)
    return {"outcome": outcome(report), "version": report["version"], "matched": report["matched"],
            "unmatched": report["unmatched"], **{key: report.get(key, 0) for key, _label in SUMMARY_LABELS},
            "conflicts": len(report["conflicts"]), "duplicates": len(report["duplicates"]),
            "withdrawal_conflicts": len(report.get("withdrawal_conflicts", []))}


#: 写账本：别名、编号、链接、资料、归属与片商都进账本，走写账本那一条串行通道（ADR-0040 第三条）。
TYPE = register(FollowupType(task_key=TASK_KEY, label=TASK_LABEL, writes_ledger=True, run=run))
