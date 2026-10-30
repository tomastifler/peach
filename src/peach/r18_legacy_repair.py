"""可由启动补修与维护命令复用的已验证存量修复。"""
from __future__ import annotations
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from .entities import normalize_entity_name, rewrite_flat_projection
from .field_owners import auto_owner, owner_of, write_owned_fields


SOURCE_OWNER = auto_owner("r18dev")
FIELDS = (
    "asset_id", "code", "field", "current", "target", "machine_translation", "owner", "snapshot",
    "action", "reason",
)


def _key(value: object) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _text(value: object) -> str:
    return " ".join(str(value or "").split())


def _contains_japanese(value: str) -> bool:
    return bool(re.search(r"[\u3040-\u30ff\u3400-\u9fff]", value))


def _snapshot(path: Path) -> dict[str, object] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError, TypeError):
        return None
    return payload if isinstance(payload, dict) else None


def _japanese(payload: dict[str, object], field: str) -> str:
    combined = payload.get("combined")
    if isinstance(combined, dict):
        key = "title_ja" if field == "catalog_title" else "series_name_ja"
        value = _text(combined.get(key))
        if value:
            return value
    key = "title" if field == "catalog_title" else "series"
    for translation in payload.get("translations") or []:
        if (isinstance(translation, dict)
                and str(translation.get("language") or "").lower().startswith("ja")):
            return _text(translation.get(key))
    return ""


def _english_machine_translation(payload: dict[str, object], field: str) -> tuple[str, bool]:
    combined = payload.get("combined")
    if not isinstance(combined, dict):
        return "", False
    value_key = "title_en" if field == "catalog_title" else "series_name_en"
    flag_key = value_key + "_is_machine_translation"
    return _text(combined.get(value_key)), combined.get(flag_key) is True


def _snapshot_code(payload: dict[str, object]) -> str:
    combined = payload.get("combined")
    if isinstance(combined, dict):
        value = combined.get("dvd_id")
        if value:
            return _key(value)
    return _key(payload.get("id"))


def snapshot_index(root: Path) -> dict[str, Path]:
    """把一层快照目录按番号索引；同番号多份时拒绝猜哪一份才是证据。"""
    grouped: dict[str, list[Path]] = defaultdict(list)
    for path in root.glob("*-r18dev.json"):
        grouped[_key(path.name.removesuffix("-r18dev.json"))].append(path)
    return {key: paths[0] for key, paths in grouped.items() if key and len(paths) == 1}


def collect(connection: sqlite3.Connection, snapshots: Path) -> list[dict[str, object]]:
    connection.row_factory = sqlite3.Row
    indexed = snapshot_index(snapshots)
    rows: list[dict[str, object]] = []
    assets = connection.execute(
        "SELECT id,code,catalog_title,series,field_owners FROM asset "
        "WHERE json_extract(COALESCE(field_owners,'{}'),'$.catalog_title')=? "
        "OR json_extract(COALESCE(field_owners,'{}'),'$.series')=? ORDER BY id",
        (SOURCE_OWNER, SOURCE_OWNER),
    )
    for asset in assets:
        code = str(asset["code"] or "").strip()
        code_key = _key(code)
        path = indexed.get(code_key)
        payload = _snapshot(path) if path else None
        for field in ("catalog_title", "series"):
            owner = owner_of(asset["field_owners"], field)
            if owner != SOURCE_OWNER:
                continue
            current = _text(asset[field])
            row: dict[str, object] = {
                "asset_id": int(asset["id"]), "code": code, "field": field,
                "current": current, "target": "", "machine_translation": "", "owner": owner,
                "snapshot": str(path.resolve()) if path else "", "action": "skip",
                "reason": "",
            }
            if not code_key:
                row["reason"] = "missing-code"
            elif not path:
                row["reason"] = "missing-unique-snapshot"
            elif payload is None:
                row["reason"] = "invalid-snapshot"
            elif _snapshot_code(payload) != code_key:
                row["reason"] = "snapshot-code-mismatch"
            else:
                english, machine = _english_machine_translation(payload, field)
                target = _japanese(payload, field)
                row["target"] = target
                row["machine_translation"] = "yes" if machine else "no"
                if not english or current != english:
                    row["reason"] = "current-no-longer-matches-snapshot-english"
                elif not target:
                    row["reason"] = "missing-japanese"
                elif not _contains_japanese(target):
                    row["reason"] = "target-has-no-japanese-script"
                elif target == current:
                    row["reason"] = "already-japanese"
                else:
                    row["action"] = "replace"
                    row["reason"] = ("verified-r18dev-japanese-machine" if machine
                                     else "verified-r18dev-japanese")
            rows.append(row)
    return rows


def apply_rows(connection: sqlite3.Connection, rows: list[dict[str, object]]) -> dict[str, int]:
    by_asset: dict[int, dict[str, object]] = defaultdict(dict)
    for row in rows:
        if row["action"] == "replace":
            by_asset[int(row["asset_id"])][str(row["field"])] = row["target"]
    repaired_fields = 0
    repaired_assets = 0
    for asset_id, values in by_asset.items():
        result = write_owned_fields(connection, [asset_id], values, SOURCE_OWNER)
        repaired_fields += len(result.written)
        repaired_assets += bool(result.written)
    return {"assets": repaired_assets, "fields": repaired_fields}


#: 实体那一遍只看这两类；厂牌的规范名本来就是品牌名。
ENTITY_KINDS = ("series", "performer")
#: 这几种关联来源说明实体是按 r18 给的写法建出来的。
R18_LINK_SOURCES = tuple(
    f"{prefix}:{kind}" for prefix in ("javinizer:r18dev", "r18") for kind in ENTITY_KINDS)
ENTITY_ALIAS_SOURCE = "script:repair_r18_machine_translations"
ENTITY_FIELDS = (
    "entity_id", "kind", "current", "target", "assets", "snapshots", "action", "reason",
    "conflict_entity_id",
)


def _payload(path: Path) -> dict[str, object] | None:
    """快照正文。Javinizer-Go 的快照把作品包在 ``result`` 里，Peach 自己的直接是作品。"""
    payload = _snapshot(path)
    if payload is not None and isinstance(payload.get("result"), dict):
        return payload["result"]
    return payload


def _person_key(value: object) -> str:
    """罗马字人名的比较键：大小写不算，姓名先后也不算（``Remu Suzumori`` 与 ``Suzumori Remu``）。"""
    return " ".join(sorted(_text(value).casefold().split()))


def _translation(payload: dict[str, object], language: str) -> dict[str, object]:
    for translation in payload.get("translations") or []:
        if (isinstance(translation, dict)
                and str(translation.get("language") or "").lower().startswith(language)):
            return translation
    return {}


def _japanese_names(payload: dict[str, object], kind: str, current: str) -> set[str]:
    """这份快照里，与 ``current`` 同一个名字的日文那一侧写法。快照没提到这个英文名时为空。

    日文那一侧也可能就是拉丁字母（``RARA``、``Night Safari``），调用方据此判它本来就是原名。
    """
    combined = payload.get("combined") if isinstance(payload.get("combined"), dict) else {}
    raw = payload.get("raw") if isinstance(payload.get("raw"), dict) else {}
    found: set[str] = set()
    if kind == "series":
        raw_series = raw.get("series") if isinstance(raw.get("series"), dict) else {}
        english = {_text(value).casefold() for value in (
            payload.get("series"), combined.get("series_name_en"), raw_series.get("name"),
            _translation(payload, "en").get("series")) if _text(value)}
        if _text(current).casefold() in english:
            found = {_text(value) for value in (
                combined.get("series_name_ja"), _translation(payload, "ja").get("series"))}
    else:
        key = _person_key(current)
        people = [row for row in (combined.get("actresses") or []) if isinstance(row, dict)]
        people += [row for row in (payload.get("actresses") or []) if isinstance(row, dict)]
        for person in people:
            romaji = {_person_key(person.get("name_romaji")),
                      _person_key(f"{person.get('first_name') or ''} {person.get('last_name') or ''}")}
            if key in romaji:
                found.add(_text(person.get("name_kanji") or person.get("japanese_name")))
    return {name for name in found if name}


def _entity_snapshots(connection: sqlite3.Connection, entity_id: int, metadata: object,
                      indexed: dict[str, Path], javinizer: Path) -> tuple[int, list[Path]]:
    """挂在这条实体名下的作品数，和它们留下的 r18 快照。"""
    paths: list[Path] = []

    def remember(raw: object) -> None:
        try:
            data = json.loads(raw) if isinstance(raw, str) and raw else {}
        except ValueError:
            data = {}
        snapshot = data.get("raw_snapshot") if isinstance(data, dict) else None
        if snapshot:
            paths.append(Path(str(snapshot)))

    remember(metadata)
    assets = connection.execute(
        "SELECT DISTINCT a.id,a.code FROM asset_entity ae JOIN asset a ON a.id=ae.asset_id "
        "WHERE ae.entity_id=?", (entity_id,)).fetchall()
    for (link,) in connection.execute(
            "SELECT metadata_json FROM asset_entity WHERE entity_id=?", (entity_id,)):
        remember(link)
    for _asset_id, code in assets:
        key = _key(code)
        if key in indexed:
            paths.append(indexed[key])
        if code:
            paths.append(javinizer / str(code).strip() / "r18dev.json")
    unique = list(dict.fromkeys(path for path in paths if path.is_file()))
    return len(assets), unique


def _entity_clash(connection: sqlite3.Connection, kind: str, entity_id: int, name: str) -> int | None:
    """日文名已经属于另一条同类实体（规范名或别名）时，返回那一条的 id。"""
    key = normalize_entity_name(name)
    taken = connection.execute(
        "SELECT id FROM entity WHERE kind=? AND normalized_name=? AND id<>?",
        (kind, key, entity_id)).fetchone()
    if taken:
        return int(taken[0])
    alias = connection.execute(
        "SELECT a.entity_id FROM entity_alias a JOIN entity e ON e.id=a.entity_id "
        "WHERE e.kind=? AND a.normalized_alias=? AND a.entity_id<>? ORDER BY a.entity_id LIMIT 1",
        (kind, key, entity_id)).fetchone()
    return int(alias[0]) if alias else None


def collect_entities(connection: sqlite3.Connection, snapshots: Path,
                     javinizer: Path) -> list[dict[str, object]]:
    """r18 来源建出、规范名不含日文的系列与女优，逐条找日文写法并判改名、待合并或跳过。"""
    connection.row_factory = sqlite3.Row
    indexed = snapshot_index(snapshots)
    marks = ",".join("?" * len(R18_LINK_SOURCES))
    entities = connection.execute(
        "SELECT DISTINCT e.id,e.kind,e.canonical_name,e.metadata_json FROM entity e "
        "LEFT JOIN asset_entity ae ON ae.entity_id=e.id "
        f"WHERE e.kind IN ('series','performer') AND (ae.source IN ({marks}) OR "
        "(json_valid(e.metadata_json) AND json_extract(e.metadata_json,'$.source') IN ('r18dev','r18'))) "
        "ORDER BY e.kind,e.id", R18_LINK_SOURCES).fetchall()
    rows: list[dict[str, object]] = []
    for entity in entities:
        current = str(entity["canonical_name"] or "")
        if _contains_japanese(current):
            continue
        entity_id, kind = int(entity["id"]), str(entity["kind"])
        count, paths = _entity_snapshots(
            connection, entity_id, entity["metadata_json"], indexed, javinizer)
        row: dict[str, object] = {
            "entity_id": entity_id, "kind": kind, "current": current, "target": "",
            "assets": count, "snapshots": " | ".join(str(path) for path in paths),
            "action": "skip", "reason": "", "conflict_entity_id": "",
        }
        rows.append(row)
        sides: set[str] = set()
        for path in paths:
            payload = _payload(path)
            if payload is not None:
                sides |= _japanese_names(payload, kind, current)
        evidence = {name for name in sides if _contains_japanese(name)}
        if _text(current).casefold() in {name.casefold() for name in sides}:
            # 有一份快照的日文那一侧就写这个名字：它是原名，不是译名。
            row["reason"] = "already-original"
            continue
        if len(evidence) == 1:
            row["target"], row["reason"] = next(iter(evidence)), "verified-r18dev-japanese"
        elif evidence:
            row["target"] = " | ".join(sorted(evidence))
            row["reason"] = "ambiguous-japanese"
            continue
        else:
            row["reason"] = ("target-has-no-japanese-script" if sides
                             else "missing-japanese" if paths else "missing-snapshot")
            continue
        clash = _entity_clash(connection, kind, entity_id, str(row["target"]))
        if clash is not None:
            row["action"], row["conflict_entity_id"] = "merge-needed", clash
        else:
            row["action"] = "rename"
    return rows


def apply_entity_rows(connection: sqlite3.Connection, rows: list[dict[str, object]], now: str) -> Counter:
    """按 ``rename`` 行改规范名：英文旧名留作别名，扁平投影跟着改。现名已变的整行跳过。"""
    counts: Counter = Counter()
    for row in rows:
        if row["action"] != "rename":
            continue
        entity_id, kind = int(row["entity_id"]), str(row["kind"])
        old, new = str(row["current"]), str(row["target"])
        found = connection.execute(
            "SELECT canonical_name FROM entity WHERE id=? AND kind=?", (entity_id, kind)).fetchone()
        if found is None or found[0] != old or _entity_clash(connection, kind, entity_id, new):
            counts["stale"] += 1
            continue
        connection.execute(
            "UPDATE entity SET canonical_name=?,normalized_name=?,updated_at=? WHERE id=?",
            (new, normalize_entity_name(new), now, entity_id))
        counts["renamed"] += connection.execute("SELECT changes()").fetchone()[0]
        connection.execute(
            "INSERT OR IGNORE INTO entity_alias(entity_id,alias,normalized_alias,source,confidence)"
            " VALUES(?,?,?,?,1.0)",
            (entity_id, old, normalize_entity_name(old), ENTITY_ALIAS_SOURCE))
        counts["aliases"] += connection.execute("SELECT changes()").fetchone()[0]
        if kind == 'series':
            for asset in connection.execute(
                'SELECT DISTINCT a.id,a.field_owners FROM asset a JOIN asset_entity ae ON ae.asset_id=a.id '
                'WHERE ae.entity_id=? AND a.series=?', (entity_id, old)).fetchall():
                result = write_owned_fields(connection, [asset[0]], {'series': new}, SOURCE_OWNER)
                counts['flat_rewritten'] += bool(result.written)
        else:
            counts["flat_rewritten"] += rewrite_flat_projection(connection, kind, entity_id, old, new)
    return counts
