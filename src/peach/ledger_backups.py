"""账本备份的保留规则：`ledger.pre-<用途>-<时间戳>.db` 只留该留的，其余清退。

每个 `--apply` 脚本与 `peach migrate` 都在写入前留一份完整备份，每份和账本一样大
（一百多 MB）。备份的价值只在「这次写入被复核之前」，之后它就是一份没人会再读的旧账本。
三条规则任一成立就留：最近 `KEEP_RECENT` 份之内、还没满 `MIN_AGE`、或者比当前账本更新
（正常不会出现，出现了说明有事没弄清，先别删）。三条都不成立才删，连同 `-wal`／`-shm`
一起删。当前账本 `integrity_check` 不是 `ok` 时拒绝清退任何一份：那正是要回滚的时候。

主文件已经不在的 `-wal`／`-shm` 另外扫一遍。清退按 `.db` 列举，边车只跟着主文件走，所以
主文件删掉而边车没删掉的那一刻，这几个文件就再没有人会看它们一眼：下一轮列不到，只会
一直留在账本目录里。2026-09-13 在真实数据目录数到 20 个，最早的来自 08-21。

 Backups of organizing (post-download organizing and manual organizing) are placed in `<generated>/organize-backups/`, written by
`organize_backup` written and purged in the same place, recognizing only the `ORGANIZE_PATTERN` two file name forms. A download wave can
 organize forty files within an hour, so keeping by age here would amount to no limit; this category is therefore kept only by count
(`ORGANIZE_KEEP_RECENT`, `ORGANIZE_MIN_AGE` is zero); the copy in use while organizing runs is `holding`
 registered, and no purge in the same process touches it. Registration does not span processes: when a manual script is given `--keep 0` it is protected by count alone.
"""
from __future__ import annotations

import logging
import re
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .migrations import sqlite_backup

log = logging.getLogger(__name__)

BACKUP_PATTERN = re.compile(r"^ledger\.pre-.+\.db$")
SIDECAR_SUFFIXES = ("-wal", "-shm")
KEEP_RECENT = 5
MIN_AGE = timedelta(hours=24)

ORGANIZE_DIRNAME = "organize-backups"
ORGANIZE_PATTERN = re.compile(r"^ledger\.pre-(?:download|organize)-.+\.db$")
ORGANIZE_KEEP_RECENT = 5
ORGANIZE_MIN_AGE = timedelta(0)

#: Backups currently referenced by a write round in this process. Both post-download organizing and manual organizing run on threads of the web service process,
#: when one side purges it must see the copy the other side holds.
_held: set[Path] = set()
_held_lock = threading.Lock()


@dataclass(frozen=True)
class BackupPlan:
    keep: tuple[Path, ...]
    remove: tuple[Path, ...]
    refused: str | None = None   # 不为 None 时一份都不删，这里写原因
    removable_bytes: int = 0     # 算计划时量好，删完文件就量不到了
    orphans: tuple[Path, ...] = ()   # 主文件已不在的 `-wal`／`-shm`，和 remove 一起删


@contextmanager
def holding(path: Path) -> Iterator[Path]:
    """Register a backup in use; while registered, purges in this process keep it."""
    key = path.resolve()
    with _held_lock:
        _held.add(key)
    try:
        yield path
    finally:
        with _held_lock:
            _held.discard(key)


def _is_held(path: Path) -> bool:
    with _held_lock:
        return path.resolve() in _held


def organize_dir(generated_root: Path | str) -> Path:
    return Path(generated_root) / ORGANIZE_DIRNAME


@contextmanager
def organize_backup(live: Path, generated_root: Path | str, name: str) -> Iterator[Path]:
    """Write a whole-database backup before organizing, hold it during organizing, and purge old backups in the same directory beyond the retention count.

    A purge failure is only logged: deleting a few fewer old backups must not make this organizing fail.
    """
    if not ORGANIZE_PATTERN.match(name):
        raise ValueError(f"Organize backup file name does not follow the pattern: {name}")
    backup = organize_dir(generated_root) / name
    sqlite_backup(live, backup)
    with holding(backup):
        try:
            prune(live, apply=True, directory=backup.parent, pattern=ORGANIZE_PATTERN,
                  keep_recent=ORGANIZE_KEEP_RECENT, min_age=ORGANIZE_MIN_AGE)
        except Exception:
            log.warning("Organize backup purge failed", exc_info=True)
        yield backup


def _size_with_sidecars(path: Path) -> int:
    total = 0
    for candidate in (path, *(path.with_name(path.name + s) for s in SIDECAR_SUFFIXES)):
        try:
            total += candidate.stat().st_size
        except OSError:
            continue
    return total


def list_backups(directory: Path, pattern: re.Pattern[str] = BACKUP_PATTERN) -> list[Path]:
    """All backups in the directory, from oldest to newest modification time."""
    if not directory.is_dir():
        return []
    found = [
        path for path in directory.iterdir()
        if path.is_file() and pattern.match(path.name)
    ]
    return sorted(found, key=lambda path: path.stat().st_mtime)


def orphan_sidecars(directory: Path, pattern: re.Pattern[str] = BACKUP_PATTERN) -> list[Path]:
    """主文件已经不在的备份边车，按名字排序。"""
    if not directory.is_dir():
        return []
    found = []
    for path in directory.iterdir():
        if not path.is_file():
            continue
        for suffix in SIDECAR_SUFFIXES:
            base = path.name.removesuffix(suffix)
            if base != path.name and pattern.match(base) and not (directory / base).is_file():
                found.append(path)
    return sorted(found)


def integrity(db: Path) -> str:
    try:
        connection = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        return f"Cannot open: {exc}"
    try:
        return str(connection.execute("PRAGMA integrity_check").fetchone()[0])
    except sqlite3.Error as exc:
        return f"Check failed: {exc}"
    finally:
        connection.close()


def _live_mtime(live: Path) -> float:
    """WAL 模式下已提交的改动先落在 `-wal`，主库文件的时间不一定动，取两者较新的。"""
    stamps = [live.stat().st_mtime]
    wal = live.with_name(live.name + "-wal")
    if wal.is_file():
        stamps.append(wal.stat().st_mtime)
    return max(stamps)


def plan(
    live: Path,
    *,
    directory: Path | None = None,
    pattern: re.Pattern[str] = BACKUP_PATTERN,
    keep_recent: int = KEEP_RECENT,
    min_age: timedelta = MIN_AGE,
    now: datetime | None = None,
) -> BackupPlan:
    """`directory` defaults to the ledger's directory; the integrity check always targets `live`."""
    folder = directory if directory is not None else live.parent
    backups = list_backups(folder, pattern)
    orphans = tuple(orphan_sidecars(folder, pattern))
    if not backups and not orphans:
        return BackupPlan((), ())
    if not live.is_file():
        return BackupPlan(tuple(backups), (), "当前数据库不存在，不清退任何备份")
    check = integrity(live)
    if check != "ok":
        return BackupPlan(tuple(backups), (), f"The current database integrity_check is not ok: {check}")
    moment = now or datetime.now()
    live_mtime = _live_mtime(live)
    recent = set(backups[-keep_recent:]) if keep_recent > 0 else set()
    keep: list[Path] = []
    remove: list[Path] = []
    for backup in backups:
        mtime = backup.stat().st_mtime
        young = moment - datetime.fromtimestamp(mtime) < min_age
        if backup in recent or young or mtime > live_mtime or _is_held(backup):
            keep.append(backup)
        else:
            remove.append(backup)
    return BackupPlan(
        tuple(keep), tuple(remove), orphans=orphans,
        removable_bytes=(sum(_size_with_sidecars(path) for path in remove)
                         + sum(path.stat().st_size for path in orphans)))


def prune(
    live: Path,
    *,
    apply: bool,
    directory: Path | None = None,
    pattern: re.Pattern[str] = BACKUP_PATTERN,
    keep_recent: int = KEEP_RECENT,
    min_age: timedelta = MIN_AGE,
    now: datetime | None = None,
) -> BackupPlan:
    """算出计划；`apply` 为真且没有拒绝理由时真的删。删不掉的记日志、继续。"""
    decided = plan(live, directory=directory, pattern=pattern,
                   keep_recent=keep_recent, min_age=min_age, now=now)
    if not apply or decided.refused:
        return decided
    doomed = [target for backup in decided.remove
              for target in (backup,
                             *(backup.with_name(backup.name + s) for s in SIDECAR_SUFFIXES))]
    for target in (*doomed, *decided.orphans):
        try:
            target.unlink(missing_ok=True)
        except OSError as exc:
            log.warning("Database backup could not be deleted %s: %s", target, exc)
    return decided
