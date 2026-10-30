"""Peach data directory usage statistics, cache cleanup and whole-directory migration.

 The data directory grows with the library: the database and its backups, covers and avatars, preview images and the playback cache add up to tens of GB.
Windows installs place it by default in `%LOCALAPPDATA%`, that is, the system drive. The settings page's "Storage" section is fed by this module:

- **Usage statistics**: walk the whole tree once, accumulating bytes by category, and store the result in `state/storage-usage.json`.
  Tens of GB of small files take a minute or two to walk, so it runs on a background thread and the page polls.
- **Cleanup**: only the categories that can be rebuilt automatically on this machine or are covered by a retention rule: playback cache, thumbnails, old database backups,
  and archived logs. Preview images need the media re-read and covers and avatars need the network again, so they are counted but not cleaned.
- **Migration**: the server only validates and records the request; the tray stops the service, exits, and hands over to the helper process (`apply`) to move everything.
  On the same volume it simply renames; across volumes it copies, verifies item by item, then deletes the original directory. Absolute paths in the ledger that point into the data directory
  (`PATH_COLUMNS`) are rewritten together; the default location and the original directory each keep a copy of `state/data-root.txt` pointing to the new location,
  Autostart and desktop icons are rewritten for the new location. If any step fails it falls back to the original directory, which is left untouched until verification passes.

 Migration needs the tray: stopping the service, exiting, moving, and reopening at the new location are steps only the tray can do. Installed builds and source runs
(Windows, macOS) are both hosted by the tray and can both migrate; the packaged helper is the same executable with `HELPER_FLAG`,
 a source run uses the current interpreter to run `python -m peach.data_storage`. The default location of a source run is the
`peach-data`, the pointer left at the original location `state/data-root.txt` makes it and an explicit `PEACH_DATA_ROOT` both follow to the new location.
 A container's data directory is a volume mounted from the host; moving inside the container means moving out of the volume, so the mount can only be changed on the host;
 a service run directly without the tray has nobody to take over the request, so it cannot migrate either.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
import json
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from typing import Callable
import uuid

from filelock import FileLock

from . import distribution, ledger_backups, settings_file
from .fsutil import atomic_write_text

USAGE_NAME = "storage-usage.json"
REQUEST_NAME = "data-relocation-request.json"
RESULT_NAME = "data-relocation.json"
#: Arguments used by the tray to launch the migration helper, `scripts/build_app_entry.py` dispatches on it.
HELPER_FLAG = "--relocate-data"
#: The tray must take over within this time after the request is written; expired requests are voided, so a restart days later does not suddenly move the data.
REQUEST_TTL = 120
#: Extra headroom the target disk needs for a cross-volume migration: logs, lock files and the database journal still write a little during migration.
SPACE_MARGIN = 1 << 30
#: How often progress is reported while measuring, in seconds. The page asks every 1.5 seconds, and polling denser than that has no reader.
REPORT_INTERVAL = 0.5
#: Project root of a source run (`src/peach/` two levels up).
PROJECT_ROOT = Path(__file__).resolve().parents[2]
#: Columns in the ledger that hold absolute paths inside the data directory. They are rewritten to the new location after migration; all other paths are computed from the directory keys.
PATH_COLUMNS = (("asset", "snapshot_path"), ("follow_item", "evidence_path"))
#: The whole-file transcode cache; the sibling `.mp4hdr` is a rebuilt file header, which must rescan the original to generate and is outside the cleanup scope.
_TRANSCODE = re.compile(r"^\d+-.+\.mp4$")
_ROTATED_LOG = re.compile(r"^(?:.+\.until-\d{8}\.log|crash-\d+\.log)$")
#: Files in the ledger directory that belong to "Database backups": `ledger.pre-*.db` and its `-wal`/`-shm`.
_BACKUP_FILE = re.compile(r"^ledger\.pre-.+\.db(?:-wal|-shm)?$")


def backup_directories(config) -> tuple[Path, ...]:
    """All directories in a Peach data directory that hold ledger backups: the ledger directory first."""
    return (config.directory("database"), ledger_backups.organize_dir(config.directory("generated")))


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    #: What this category is.
    description: str
    cleanable: bool = False
    #: For cleanable ones, what happens after cleaning; for non-cleanable ones, why they cannot be cleaned.
    note: str = ""


#: Each category states what it is; cleanable ones say what happens after cleaning, non-cleanable ones say why not.
#: Thumbnails and preview images have similar names; the difference is their source: thumbnails are shrunk from downloaded covers and avatars and can be recomputed locally at any time;
#: preview images are extracted from video frames, and rebuilding means re-reading the entire movie.
CATEGORIES = (
    Category("database", "Database", "Movies, people, tags and watch history",
             note="Peach all of Peach's data is here; deleting it empties the media library"),
    Category("backups", "Database backups", "Database copies left automatically before upgrades, migrations and organizing", True,
             "The most recent one is kept for each location; older ones can no longer be restored"),
    Category("playback", "Playback cache", "Transcoded copies of movies the browser cannot play directly", True,
             "Re-transcoded on next playback"),
    Category("thumbnails", "Thumbnails", "Small copies of covers and avatars, which is what lists and grids display", True,
             "Shrunk again from the covers already on this machine when browsing"),
    Category("previews", "Preview images", "Contact sheets, posters and scrubber previews generated from video frames",
             note="rebuilding means re-reading the whole movie, and movies on cloud drives would be downloaded again, so they are not cleaned here"),
    Category("downloads", "Covers and online metadata", "Covers, avatars, studio logos and web caches downloaded from metadata sites",
             note="after deletion they must be downloaded again, and sources that have been taken down can never be retrieved"),
    Category("sources", "Imported data", "Data and original records imported from other software",
             note="Peach cannot be regenerated; after deletion it can only be re-imported"),
    Category("records", "Task and review records", "Resume checkpoints, automatic repair receipts, review queues and archives",
             note="deleting loses task progress and review conclusions that have not been handled"),
    Category("tools", "Media tools", "FFmpeg, face recognition and other programs used for playback, frame extraction and recognition",
             note="after deletion playback, previews and recognition are unavailable and must be reinstalled"),
    Category("accounts", "Login state", "Access tokens and the browser profile used for metadata site logins",
             note="after deletion you must log in again to every site and device"),
    Category("logs", "Logs", "Runtime logs and crash records", True,
             "Only archived logs and crash records are cleaned; ones being written are kept"),
    Category("other", "Other", "Files in the data directory that do not belong to any category above",
             note="Peach cannot tell what these are for; please confirm and handle them manually"),
)
CATEGORY_KEYS = tuple(category.key for category in CATEGORIES)
CLEANABLE = frozenset(category.key for category in CATEGORIES if category.cleanable)


def _key(path: Path) -> str:
    return os.path.normcase(os.path.abspath(path))


def _roots(config) -> dict[str, str]:
    """Which category each subdirectory of the data directory belongs to; unlisted ones go by their parent, and the outermost level is "Other"."""
    from .previews import cover_thumb_root, entity_thumb_root
    generated = config.directory("generated")
    pairs = [
        (config.directory("database"), "database"),
        (generated / ledger_backups.ORGANIZE_DIRNAME, "backups"),
        (generated / "transcodes", "playback"),
        (generated / "stream-segments", "playback"),
        (cover_thumb_root(generated / "covers"), "thumbnails"),
        (entity_thumb_root(generated / "avatars"), "thumbnails"),
        (generated / "snapshots", "previews"),
        (generated / "posters", "previews"),
        (generated / "timeline", "previews"),
        (generated / "photo-thumbs", "previews"),
        (generated / "covers", "downloads"),
        (generated / "avatars", "downloads"),
        (generated / "logos", "downloads"),
        (generated / "follow-assets", "downloads"),
        (generated / "sample-cache", "downloads"),
        (generated / "provider-cache", "downloads"),
        (config.directory("sources"), "sources"),
        (config.directory("state"), "records"),
        (config.directory("review"), "records"),
        (config.data_root / "archive", "records"),
        (config.directory("tools"), "tools"),
        (config.directory("secrets"), "accounts"),
        (config.directory("logs"), "logs"),
    ]
    return {_key(path): category for path, category in pairs}


def _reclaimable(category: str, path: Path, parent_name: str) -> bool:
    if category == "playback":
        return parent_name != "transcodes" or bool(_TRANSCODE.match(path.name))
    if category == "thumbnails":
        return True
    if category == "logs":
        return bool(_ROTATED_LOG.match(path.name))
    return False


def measure(config, *, should_stop: Callable[[], bool] = lambda: False,
            report: Callable[[int, int], None] | None = None) -> dict:
    """Walk the data directory and count files, bytes and cleanable bytes by category. Links are not followed.

    `report(file count, bytes)` reports progress, at most once every `REPORT_INTERVAL` seconds.
    """
    root = config.data_root
    roots = _roots(config)
    database = _key(config.directory("database"))
    totals = {key: {"bytes": 0, "files": 0, "reclaimable": 0} for key in CATEGORY_KEYS}
    stack = [(root, "other")]
    files = size_seen = 0
    reported = time.monotonic()
    while stack:
        if should_stop():
            raise InterruptedError("Measurement stopped")
        if report is not None and time.monotonic() - reported >= REPORT_INTERVAL:
            reported = time.monotonic()
            report(files, size_seen)
        folder, inherited = stack.pop()
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        in_database = _key(folder) == database
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    stack.append((Path(entry.path), roots.get(_key(Path(entry.path)), inherited)))
                    continue
                size = entry.stat(follow_symlinks=False).st_size
            except OSError:
                continue
            category = inherited
            if in_database and _BACKUP_FILE.match(entry.name):
                category = "backups"
            bucket = totals[category]
            bucket["bytes"] += size
            bucket["files"] += 1
            files += 1
            size_seen += size
            if _reclaimable(category, Path(entry.path), Path(folder).name):
                bucket["reclaimable"] += size
    live = config.directory("database") / "ledger.db"
    totals["backups"]["reclaimable"] = sum(
        _backup_plan(live, directory).removable_bytes
        for directory in backup_directories(config))
    return {
        "root": str(root.resolve()), "measured_at": time.time(),
        "total_bytes": sum(item["bytes"] for item in totals.values()),
        "total_files": sum(item["files"] for item in totals.values()),
        "categories": totals,
    }


def _backup_plan(live: Path, directory: Path, *, apply: bool = False) -> ledger_backups.BackupPlan:
    """Manual cleanup keeps only the most recent copy per location, regardless of backup age; if the current ledger fails verification, none are deleted."""
    return ledger_backups.prune(live, apply=apply, keep_recent=1, min_age=timedelta(0), directory=directory)


def _remove(path: Path) -> tuple[int, int, int]:
    """Delete a file or an entire directory, returning (files deleted, bytes, files that could not be deleted)."""
    removed = size = failed = 0
    if path.is_dir() and not path.is_symlink():
        for folder, _dirs, files in os.walk(path, topdown=False):
            for name in files:
                file = Path(folder) / name
                try:
                    length = file.stat().st_size
                    file.unlink()
                except OSError:
                    failed += 1
                    continue
                removed += 1
                size += length
            try:
                Path(folder).rmdir()
            except OSError:
                pass
        return removed, size, failed
    try:
        length = path.stat().st_size
        path.unlink()
    except OSError:
        return 0, 0, 1
    return 1, length, 0


def clean(config, category: str) -> dict:
    """Clean one category of rebuildable artifacts, returning the number of files deleted, bytes, and files that could not be deleted."""
    if category not in CLEANABLE:
        raise ValueError("This category cannot be cleaned here")
    generated = config.directory("generated")
    targets: list[Path] = []
    if category == "backups":
        live = config.directory("database") / "ledger.db"
        removed = size = 0
        for directory in backup_directories(config):
            decided = _backup_plan(live, directory, apply=True)
            if decided.refused:
                raise ValueError(f"Database backups were not cleaned: {decided.refused}")
            removed += len(decided.remove) + len(decided.orphans)
            size += decided.removable_bytes
        return {"files": removed, "bytes": size, "failed": 0}
    if category == "playback":
        transcodes, segments = generated / "transcodes", generated / "stream-segments"
        if transcodes.is_dir():
            targets += [path for path in transcodes.iterdir() if path.is_file() and _TRANSCODE.match(path.name)]
        if segments.is_dir():
            targets += list(segments.iterdir())
    elif category == "thumbnails":
        from .previews import cover_thumb_root, entity_thumb_root
        for folder in (cover_thumb_root(generated / "covers"), entity_thumb_root(generated / "avatars")):
            if folder.is_dir():
                targets += list(folder.iterdir())
    elif category == "logs":
        logs = config.directory("logs")
        if logs.is_dir():
            targets += [path for path in logs.iterdir() if path.is_file() and _ROTATED_LOG.match(path.name)]
    totals = [0, 0, 0]
    for target in targets:
        for index, value in enumerate(_remove(target)):
            totals[index] += value
    return {"files": totals[0], "bytes": totals[1], "failed": totals[2]}


def read_usage(config) -> dict | None:
    """Result of the last measurement; one that is not for this data directory (left over from before a migration) does not count."""
    try:
        data = json.loads((config.directory("state") / USAGE_NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("root") != str(config.data_root.resolve()):
        return None
    return data


class StorageJobs:
    """Measuring and cleaning share one background thread: only one thing at a time, and after cleaning it re-measures."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict = {"state": "idle", "message": ""}
        self._thread: threading.Thread | None = None

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self._state)

    def busy(self) -> bool:
        with self._lock:
            return self._state["state"] != "idle"

    def start(self, config, action: str | list[str] | tuple[str, ...]) -> dict:
        """`"measure"` is a re-measure; one or several category keys are cleaned in turn, and a single measurement follows once cleaning is done."""
        keys = [] if action == "measure" else [action] if isinstance(action, str) else list(action)
        if action != "measure" and (not keys or any(key not in CLEANABLE for key in keys)):
            raise ValueError("This category cannot be cleaned here")
        keys = [key for key in CATEGORY_KEYS if key in keys]
        with self._lock:
            if self._state["state"] != "idle":
                raise RuntimeError("Measuring or cleaning in progress; please wait")
            self._state = {"state": "cleaning" if keys else "measuring", "category": keys[0] if keys else "",
                           "categories": keys, "message": "", **self._expected(config)}
            self._thread = threading.Thread(target=self._run, args=(config, keys),
                                            name="PeachStorage", daemon=True)
            self._thread.start()
            return dict(self._state)

    @staticmethod
    def _expected(config) -> dict:
        """File count from the last measurement, used to estimate this round's progress bar; if never measured, only the number walked is reported."""
        usage = read_usage(config)
        return {"files": 0, "bytes": 0, "expected_files": int(usage["total_files"]) if usage else None}

    def _progress(self, files: int, size: int) -> None:
        with self._lock:
            self._state.update(files=files, bytes=size)

    def join(self, timeout: float | None = None) -> None:
        thread = self._thread
        if thread is not None:
            thread.join(timeout)

    def _run(self, config, keys: list[str]) -> None:
        message = ""
        try:
            if keys:
                freed = failed = 0
                for key in keys:
                    with self._lock:
                        self._state.update(category=key)
                    result = clean(config, key)
                    freed += result["bytes"]
                    failed += result["failed"]
                labels = ", ".join(item.label for item in CATEGORIES if item.key in keys)
                message = f"Cleaned {labels}, freed {format_size(freed)}"
                if failed:
                    message += f"; {failed} files are in use and could not be deleted"
                with self._lock:
                    self._state.update(state="measuring", category="", message=message, files=0, bytes=0)
            usage = measure(config, report=self._progress)
            atomic_write_text(config.directory("state") / USAGE_NAME, json.dumps(usage))
        except Exception as exc:
            message = f"{message}; {exc}" if message else str(exc)
            with self._lock:
                self._state = {"state": "idle", "message": message, "error": True}
            return
        with self._lock:
            self._state = {"state": "idle", "message": message}


JOBS = StorageJobs()


def format_size(size: int) -> str:
    """Same notation as the frontend `fmtSize` so the numbers in the receipt match the page."""
    if size <= 0:
        return "0 B"
    if size < 1 << 20:
        return f"{max(1, round(size / 1024))} KB"
    if size < 1 << 30:
        return f"{size >> 20} MB"
    if size < 1 << 40:
        return f"{size / (1 << 30):.1f} GB"
    return f"{size / (1 << 40):.2f} TB"


# --------------------------------------------------------------------------- Migration

def availability(config) -> tuple[bool, str]:
    """Whether this deployment can migrate the data directory from the settings page; if not, explain why and how to do it by hand."""
    if os.environ.get("PEACH_DISTRIBUTION") == "docker":
        return False, ("The container's data directory is a data volume on the host, its location is set by the mount in compose.yaml, and it cannot be changed from inside the container; "
                       "Moving it out inside the container would leave the data volume and be lost when the container is rebuilt. Please migrate on the host following the steps below")
    if not (distribution.standalone() or os.environ.get("PEACH_TRAY_MANAGED") == "1"
            or os.environ.get("PEACH_HEADLESS_MANAGED") == "1"):
        return False, ("Migration must be done by the tray or the headless service (python -m peach.server) to stop and restart Peach, "
                       "The current service was started directly. Please start it in one of those ways and migrate again; or quit Peach, "
                       "move the data directory manually, then set PEACH_DATA_ROOT to the new location")
    root = config.data_root.resolve()
    for key in settings_file.DIRECTORY_KEYS:
        raw = (config.directories.get(key) or "").strip()
        directory = config.directory(key)
        if raw and (PureWindowsPath(raw).is_absolute() or Path(raw).is_absolute()):
            return False, "Some data is set outside the data directory; please quit Peach and migrate manually"
        if directory.is_symlink() or directory.is_junction() or not directory.resolve().is_relative_to(root):
            return False, "Some data uses directory links; please quit Peach and migrate manually"
    return True, ""


#: Steps for migrating the data directory on the host for a container deployment: each step is a one-line description plus a command. The commands follow the repository's compose.yaml,
#: The volume name carries the compose project name prefix, so the first step looks it up.
DOCKER_STEPS = (
    ("Look up the data volume's name (ending in _peach-data)", "docker volume ls"),
    ("In the directory containing compose.yaml, stop Peach", "docker compose down"),
    ("Copy the data volume to a new folder; the new folder must be writable by UID 1000",
     "docker run --rm -v <data volume name>:/from -v <new folder>:/to alpine cp -a /from/. /to/"),
    ("In compose.yaml, change peach-data:/data to <new folder>:/data, then start; do not delete the old data volume until you have confirmed everything works",
     "docker compose up -d"),
)


def manual_steps() -> list[dict[str, str]]:
    """Manual steps given when the settings page cannot migrate. Currently only containers have them."""
    if os.environ.get("PEACH_DISTRIBUTION") != "docker":
        return []
    return [{"text": text, "command": command} for text, command in DOCKER_STEPS]


def _vacant(folder: Path) -> bool:
    """An empty directory, or one with only a data-directory location record (the kind left behind after a migration)."""
    entries = list(folder.iterdir())
    if not entries:
        return True
    if len(entries) != 1 or entries[0].name != "state" or not entries[0].is_dir():
        return False
    return [path.name for path in entries[0].iterdir()] == [settings_file.DATA_ROOT_LOCATION]


def _existing_ancestor(path: Path) -> Path:
    for candidate in (path, *path.parents):
        if candidate.exists():
            return candidate
    return Path(path.anchor) if path.anchor else path


def _same_volume(source: Path, target: Path) -> bool:
    try:
        return os.stat(source).st_dev == os.stat(_existing_ancestor(target)).st_dev
    except OSError:
        return False


def check_target(config, raw: object, *, program: Path | None = None) -> Path:
    """Validate the new data directory location and return the normalized absolute path. When unsuitable, raise ValueError, with the reason written for people."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("Please choose a new data directory")
    text = raw.strip()
    if os.name == "nt":
        pure = PureWindowsPath(text)
        if not pure.drive or not pure.root or pure.drive.startswith("\\\\"):
            raise ValueError("Please choose a folder on a local disk, for example D:\\Peach\\peach-data")
    target = Path(text)
    if not target.is_absolute():
        raise ValueError("Please enter a full path")
    if target.parent == target:
        raise ValueError("Please choose or create a dedicated folder; do not use a disk root directly")
    target = target.resolve()
    source = config.data_root.resolve()
    if target == source or target.is_relative_to(source) or source.is_relative_to(target):
        raise ValueError("The new location cannot be the same as, or contain or be contained by, the current data directory")
    program = (program or Path(sys.executable).parent).resolve()
    if target.is_relative_to(program) or program.is_relative_to(target):
        raise ValueError("The new location cannot overlap the program directory")
    for rows in (*config.locations.values(), *config.mounts.values()):
        for value in rows:
            media = Path(value)
            if not media.is_absolute():
                continue
            media = media.resolve()
            if target.is_relative_to(media) or media.is_relative_to(target):
                raise ValueError("The new location cannot overlap the media directory")
    if target.exists():
        if not target.is_dir():
            raise ValueError("A file with the same name already exists at this location")
        if not _vacant(target):
            raise ValueError("Please choose an empty folder, or create a new one")
    ancestor = _existing_ancestor(target)
    probe = ancestor / f".peach-write-test-{uuid.uuid4().hex}"
    try:
        probe.write_bytes(b"")
        probe.unlink()
    except OSError:
        raise ValueError("The current user cannot write to this location") from None
    return target


def check_space(source: Path, target: Path, needed: int) -> None:
    if _same_volume(source, target):
        return
    free = shutil.disk_usage(_existing_ancestor(target)).free
    if free < needed + SPACE_MARGIN:
        raise ValueError(f"Free space on the disk at the new location: {format_size(free)}, migration needs about {format_size(needed + SPACE_MARGIN)}")


def read_result(config) -> dict | None:
    try:
        data = json.loads((config.directory("state") / RESULT_NAME).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _record(root: Path, **fields) -> None:
    try:
        atomic_write_text(root / "state" / RESULT_NAME, json.dumps({**fields, "finished_at": time.time()},
                                                                  ensure_ascii=False))
    except OSError:
        pass


def request(config, raw: object) -> dict:
    """Validate and record the migration request for the tray to take over. Returns the receipt for the page."""
    available, message = availability(config)
    if not available:
        raise ValueError(message)
    from . import standalone_update
    if standalone_update.public().get("state") in standalone_update.ACTIVE | {"ready"}:
        raise ValueError("An update task has not finished; please migrate after it completes")
    if JOBS.busy():
        raise ValueError("Measuring or cleaning in progress; please migrate once it finishes")
    target = check_target(config, raw)
    usage = read_usage(config)
    if usage is None:
        raise ValueError("Please measure disk usage first")
    source = config.data_root.resolve()
    check_space(source, target, int(usage.get("total_bytes") or 0))
    path = config.directory("state") / REQUEST_NAME
    with FileLock(str(path) + ".lock", timeout=0):
        atomic_write_text(path, json.dumps({"source": str(source), "target": str(target),
                                            "requested_at": time.time()}, ensure_ascii=False))
    headless = os.environ.get("PEACH_HEADLESS_MANAGED") == "1"
    return {"accepted": True, "target": str(target),
            "message": "Migrating the data directory; the service will pause and resume automatically when done; refresh the page shortly." if headless
            else "Migrating the data directory, Peach will quit temporarily and reopen automatically when done."}


def snapshot(config) -> dict:
    """Data for the settings page's "Storage" screen."""
    root = config.data_root.resolve()
    try:
        disk = shutil.disk_usage(root)
        free, total = disk.free, disk.total
    except OSError:
        free = total = None
    drive = PureWindowsPath(str(root)).drive.casefold()
    system = os.environ.get("SystemDrive", "C:").casefold()
    available, message = availability(config)
    usage = read_usage(config)
    categories = None
    if usage is not None:
        found = usage.get("categories") or {}
        categories = [{"key": item.key, "label": item.label, "description": item.description, "note": item.note,
                       "cleanable": item.cleanable, **(found.get(item.key) or {"bytes": 0, "files": 0, "reclaimable": 0})}
                      for item in CATEGORIES]
    return {
        "data_root": str(root),
        "free_bytes": free, "total_bytes": total,
        "system_drive": os.name == "nt" and bool(drive) and drive == system,
        "usage": None if usage is None else {
            "measured_at": usage.get("measured_at"), "total_bytes": usage.get("total_bytes", 0),
            "total_files": usage.get("total_files", 0), "categories": categories},
        "job": JOBS.snapshot(),
        "relocation": {"available": available, "message": message, "steps": manual_steps(),
                       "last": read_result(config)},
    }


def poll(tray) -> None:
    """Check once in the tray monitoring loop for a migration request; if there is one, stop the service, hand over to the helper, and exit."""
    try:
        config = settings_file.load_config()
    except Exception:
        # First-time setup was not finished or the settings file is broken: there can be no migration request then, so the monitoring loop carries on as usual.
        return
    path = config.directory("state") / REQUEST_NAME
    if not path.is_file() or not tray._action_lock.acquire(blocking=False):
        return
    from . import update_tasks
    database = config.directory("database") / "ledger.db"
    token = None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - data["requested_at"] > REQUEST_TTL:
            path.unlink()
            return
        if data["source"] != str(config.data_root.resolve()):
            raise ValueError("The data directory has changed; please choose again")
        check_target(config, data["target"])
        token = update_tasks.reserve(database)
        update_tasks.wait_quiescent(database)
        atomic_write_text(path, json.dumps(dict(data, token=token), ensure_ascii=False))
        process = _spawn([*_program_command(), *_helper_arguments(path, os.getpid())])
        update_tasks.transfer(database, token, process.pid)
        _notify(tray, "Migrating the data directory, Peach will quit temporarily and reopen automatically when done.")
        tray.exit(reason="data-relocation")
    except Exception as exc:
        if token:
            update_tasks.release(database, token)
        path.unlink(missing_ok=True)
        _record(config.data_root, state="error", message=f"Could not start the migration: {exc}")
        _notify(tray, f"Could not migrate the data directory: {exc}")
    finally:
        tray._action_lock.release()


def poll_headless(stop: Callable[[], None], restart: Callable[[dict[str, str]], None]) -> bool:
    """On each round the supervisor of the headless service checks for a migration request; if there is one, it stops the web service, moves the data in this process, then restarts the service.

    The supervisor does not hold files in the data directory itself, so it need not exit and hand over to a helper as the tray does. `restart(environment)` at the new location
    (or the original location on failure) restarts the web service, and the environment's `PEACH_DATA_ROOT` is that location. Returns whether a request was handled.
    """
    try:
        config = settings_file.load_config()
    except Exception:
        return False
    path = config.directory("state") / REQUEST_NAME
    if not path.is_file():
        return False
    from . import update_tasks
    database = config.directory("database") / "ledger.db"
    token = None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - data["requested_at"] > REQUEST_TTL:
            path.unlink()
            return False
        if data["source"] != str(config.data_root.resolve()):
            raise ValueError("The data directory has changed; please choose again")
        check_target(config, data["target"])
        token = update_tasks.reserve(database)
        update_tasks.wait_quiescent(database)
        atomic_write_text(path, json.dumps(dict(data, token=token), ensure_ascii=False))
    except Exception as exc:
        if token:
            update_tasks.release(database, token)
        path.unlink(missing_ok=True)
        _record(config.data_root, state="error", message=f"Could not start the migration: {exc}")
        return True
    stop()
    apply(path, None, start=lambda _program, environment: restart(environment))
    return True


def _notify(tray, message: str) -> None:
    """The tray balloon is only an incidental notice; some platforms do not support it, and it must not interrupt the migration flow."""
    try:
        tray.icon.notify(message, "Peach")
    except Exception:
        pass


def _packaged() -> bool:
    """A packaged Peach (installed build, or one built in a source checkout `dist/Peach`): the helper and the tray are the same executable."""
    return bool(getattr(sys, "frozen", False)) or distribution.standalone()


def _program_command() -> list[str]:
    """The program that runs the helper: for a packaged build it is the executable itself, for a source run it is the current interpreter running this module."""
    if _packaged():
        executable = Path(sys.executable).resolve()
        return [str(executable.parent / "Peach.exe" if sys.platform == "win32" else executable)]
    return [sys.executable, "-m", "peach.data_storage"]


def _helper_arguments(request_path: Path, wait_pid: int) -> list[str]:
    return [HELPER_FLAG, str(request_path), str(wait_pid)]


def _tray_command() -> list[str]:
    """Command to reopen the tray after migration. A source run prefers the virtual environment's `peach-tray` entry point."""
    if _packaged():
        return _program_command()
    script = Path(sys.executable).with_name("peach-tray.exe" if os.name == "nt" else "peach-tray")
    if script.is_file():
        return [str(script)]
    return [sys.executable, "-c", "from peach.error_reporting import tray_main; raise SystemExit(tray_main())"]


def _spawn(command: list[str], environment: dict[str, str] | None = None):
    """Start a process outside the tray, so it is not taken away when the tray exits.

    A packaged build starts as is; a source run on Windows is held by the virtual-environment launcher, whose kill-on-close Job
    also ends child processes when the tray exits, so the desktop process takes it over instead; macOS starts a new session to detach from the tray.
    """
    environment = dict(os.environ if environment is None else environment, PYINSTALLER_RESET_ENVIRONMENT="1")
    # The working directory must not land inside the data directory being moved: a source run always uses the project root.
    cwd = Path(command[0]).parent if _packaged() else PROJECT_ROOT
    if sys.platform == "win32" and not _packaged():
        from .tray_detached import launch_detached
        return launch_detached(command, cwd=cwd, env=environment)
    if sys.platform == "win32":
        return subprocess.Popen(command, cwd=str(cwd), env=environment, creationflags=subprocess.CREATE_NO_WINDOW)
    return subprocess.Popen(command, cwd=str(cwd), env=environment, start_new_session=True,
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def count_files(root: Path) -> tuple[int, int]:
    """(file count, total bytes), links are not followed; measured once before and once after migration, and the copy counts as complete only if both sides match."""
    files = size = 0
    stack = [root]
    while stack:
        for entry in os.scandir(stack.pop()):
            if entry.is_dir(follow_symlinks=False):
                stack.append(Path(entry.path))
            else:
                files += 1
                size += entry.stat(follow_symlinks=False).st_size
    return files, size


def _shell_copy(source: Path, target: Path) -> None:
    """Copy using Explorer's copy (`SHFileOperationW`): which brings its own progress, remaining time and a cancel button."""
    import ctypes
    from ctypes import wintypes

    class Operation(ctypes.Structure):
        _fields_ = [("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT), ("pFrom", wintypes.LPCWSTR),
                    ("pTo", wintypes.LPCWSTR), ("fFlags", ctypes.c_ushort), ("fAnyOperationsAborted", wintypes.BOOL),
                    ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", wintypes.LPCWSTR)]

    copy, no_confirmation, simple_progress, no_confirm_mkdir, no_error_ui = 2, 0x10, 0x100, 0x200, 0x400
    operation = Operation(None, copy, str(source / "*") + "\0", str(target) + "\0",
                          no_confirmation | simple_progress | no_confirm_mkdir | no_error_ui,
                          False, None, "Migrating Peach data")
    code = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation))
    if operation.fAnyOperationsAborted:
        raise RuntimeError("Migration cancelled")
    if code:
        raise OSError(f"Copy did not finish (code 0x{code:X})")


def _python_copy(source: Path, target: Path) -> None:
    shutil.copytree(source, target, symlinks=True, dirs_exist_ok=True)


def _rebase(value: str, old: Path, new: Path) -> str | None:
    normal = os.path.normpath(value)
    prefix = os.path.normcase(os.path.normpath(str(old)))
    folded = os.path.normcase(normal)
    if folded == prefix:
        return str(new)
    if not folded.startswith(prefix.rstrip(os.sep) + os.sep):
        return None
    return str(new / normal[len(prefix.rstrip(os.sep)) + 1:])


def rewrite_ledger_paths(database: Path, old: Path, new: Path) -> int:
    """Rewrite the absolute paths in the ledger that point to the old data directory to the new location, returning the number of rows rewritten."""
    if not database.is_file():
        return 0
    changed = 0
    connection = sqlite3.connect(database, timeout=30)
    try:
        with connection:
            for table, column in PATH_COLUMNS:
                columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
                if column not in columns:
                    continue
                rows = connection.execute(
                    f"SELECT rowid, {column} FROM {table} WHERE {column} IS NOT NULL AND {column} <> ''").fetchall()
                for rowid, value in rows:
                    moved = _rebase(str(value), old, new)
                    if moved is not None and moved != value:
                        connection.execute(f"UPDATE {table} SET {column}=? WHERE rowid=?", (moved, rowid))
                        changed += 1
            if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Database check failed")
    finally:
        connection.close()
    return changed


def _point(source: Path, target: Path, bootstrap: Path) -> None:
    """Record the new location at both the default location and the original directory; the new location itself must not point elsewhere, or it would form a loop.

    The default location is written only when it is the original directory, does not exist, or holds only a location record: if it is another data
    directory in use (a source checkout already has one beside it `peach-data`), writing into it would hijack it to this new location.
    """
    (target / "state" / settings_file.DATA_ROOT_LOCATION).unlink(missing_ok=True)
    seen = {_key(target)}
    for root in (bootstrap, source):
        if _key(root) in seen:
            continue
        seen.add(_key(root))
        if root is bootstrap and _key(root) != _key(source) and root.is_dir() and not _vacant(root):
            continue
        atomic_write_text(root / "state" / settings_file.DATA_ROOT_LOCATION, str(target))


def _rename(source: Path, target: Path, *, timeout: float = 30) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            os.rename(source, target)
            return
        except OSError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.5)


class MovedWithoutRewrite(RuntimeError):
    """The data has reached the new location and the location was recorded, but the paths in the ledger were not rewritten. The migration counts as complete, and the reason must be told to the user."""


def relocate(config, target: Path, *, bootstrap: Path,
             copy: Callable[[Path, Path], None] | None = None) -> bool:
    """Move the whole data directory to `target` and rewrite the ledger paths, and record the location. Returns whether the original directory still needs deleting (cross-volume copy).

    On failure raises an exception and the original directory stays usable: a same-volume rename is reverted, and a cross-volume copy deletes the part already copied to the new location.
    """
    source = config.data_root.resolve()
    database = config.directory("database").resolve().relative_to(source) / "ledger.db"
    same_volume = _same_volume(source, target)
    if target.exists():
        # `check_target` has confirmed it is an empty directory or has only a location record (previously migrated away from here).
        if (target / "state").is_dir():
            shutil.rmtree(target / "state")
        if same_volume:
            target.rmdir()
    if same_volume:
        target.parent.mkdir(parents=True, exist_ok=True)
        _rename(source, target)
        try:
            rewrite_ledger_paths(target / database, source, target)
        except Exception as exc:
            try:
                _rename(target, source)
            except OSError:
                # When it cannot be reverted the data is already entirely at the new location: record the location anyway, otherwise the next startup would enter the first-time setup page.
                _point(source, target, bootstrap)
                raise MovedWithoutRewrite(f"Preview image paths could not be rewritten ({exc}), they will be re-registered the next time the library is processed") from exc
            raise
        copied = False
    else:
        expected = count_files(source)
        # The free space was checked once from the last measurement at request time; after the tray exits and tasks pause it is checked again here against the actual size.
        check_space(source, target, expected[1])
        target.mkdir(parents=True, exist_ok=True)
        try:
            (copy or (_shell_copy if sys.platform == "win32" else _python_copy))(source, target)
            actual = count_files(target)
            if actual != expected:
                raise RuntimeError(f"Incomplete copy: original directory {expected[0]} files, {format_size(expected[1])}, "
                                   f"new location {actual[0]} files, {format_size(actual[1])}")
            rewrite_ledger_paths(target / database, source, target)
        except BaseException:
            shutil.rmtree(target, ignore_errors=True)
            raise
        copied = True
    _point(source, target, bootstrap)
    return copied


def remove_source(source: Path) -> int:
    """Delete the original directory that has been copied away, keeping only `state/data-root.txt`. Returns the number of files that could not be deleted."""
    keep = source / "state" / settings_file.DATA_ROOT_LOCATION
    failed = 0
    for child in list(source.iterdir()):
        if child.name == "state" and child.is_dir():
            failed += sum(_remove(item)[2] for item in list(child.iterdir()) if item != keep)
        else:
            failed += _remove(child)[2]
    return failed


def _startup(config) -> dict | None:
    from . import desktop_startup
    try:
        state = desktop_startup.snapshot(config)
    except Exception:
        return None
    return state if state.get("available") else None


def _restore_startup(config, state: dict | None) -> str:
    """Rewrite autostart and desktop icons at the new location per the pre-migration switches; failures are only reported and do not affect the migration result."""
    if not state or not (state.get("enabled") or state.get("desktop")):
        return ""
    from . import desktop_startup
    try:
        desktop_startup.save(config, enabled=bool(state["enabled"]), silent=bool(state["silent"]),
                             desktop=bool(state.get("desktop")))
    except Exception as exc:
        return f"Autostart and desktop icons could not be updated ({exc}), please turn them on again in settings"
    return ""


def apply(request_path: Path, wait_pid: int | None, *, environ: dict[str, str] | None = None,
          copy: Callable[[Path, Path], None] | None = None,
          start: Callable[[Path, dict[str, str]], object] | None = None,
          wait: float = 90) -> int:
    """Migration helper: wait for the tray to exit, move, restart the tray, then delete the original directory. Exit code 0 means success, 1 failure, 2 invalid request.

    `wait_pid` being None means it waits for no process: the headless supervisor has already stopped the web service itself.
    """
    from . import update_tasks
    from .windows_restart import process_alive
    environ = dict(os.environ if environ is None else environ)
    try:
        data = json.loads(Path(request_path).read_text(encoding="utf-8"))
        source = Path(data["source"])
        target_raw = data["target"]
    except (OSError, ValueError, KeyError, TypeError):
        return 2
    # The new location must not overlap the program: for a packaged build that is the directory holding the executable, for a source run it is the whole project checkout.
    program = Path(sys.executable).resolve().parent if _packaged() else PROJECT_ROOT
    final, copied, notes = source, False, []
    old = startup = None
    try:
        deadline = time.monotonic() + wait
        while wait_pid is not None and process_alive(wait_pid):
            if time.monotonic() > deadline:
                raise TimeoutError("The tray has not exited yet")
            time.sleep(.25)
        old = settings_file.load_config(environ=dict(environ, PEACH_DATA_ROOT=str(source)))
        if old.data_root.resolve() != source:
            raise ValueError("The data directory has changed; please choose again")
        target = check_target(old, target_raw, program=program)
        Path(request_path).unlink(missing_ok=True)
        if data.get("token"):
            update_tasks.release(old.directory("database") / "ledger.db", data["token"])
        startup = _startup(old)
        if startup and (startup.get("enabled") or startup.get("desktop")):
            from . import desktop_startup
            desktop_startup.save(old, enabled=False, silent=bool(startup["silent"]), desktop=False)
        bootstrap = _bootstrap(environ)
        try:
            copied = relocate(old, target, bootstrap=bootstrap, copy=copy)
        except MovedWithoutRewrite as exc:
            notes.append(str(exc))
        final = target
    except Exception as exc:
        Path(request_path).unlink(missing_ok=True)
        if old is not None:
            notes.append(_restore_startup(old, startup))
        _record(source, state="error", source=str(source), target=str(target_raw),
                message="; ".join(filter(None, [f"Data directory was not migrated and remains at the original location: {exc}", *notes])))
        _start_tray(dict(environ, PEACH_DATA_ROOT=str(source)), start)
        return 1
    try:
        new = settings_file.load_config(environ=dict(environ, PEACH_DATA_ROOT=str(final)))
        notes.append(_restore_startup(new, startup))
    except Exception as exc:
        notes.append(f"Autostart and desktop icons could not be updated ({exc}), please turn them on again in settings")
    message = "Data directory migrated"
    _record(final, state="done", source=str(source), target=str(final), message=message,
            notes=[note for note in notes if note], leftovers=0)
    _start_tray(dict(environ, PEACH_DATA_ROOT=str(final)), start)
    if copied:
        # The new tray reads only the new location, and the original directory is deleted only now: deleting tens of GB takes minutes, and the user should not wait at a desktop with no tray.
        try:
            leftovers = remove_source(source)
        except OSError:
            leftovers = -1
        if leftovers:
            notes.append(f"Some files at the original location could not be deleted; delete them manually after confirming everything is fine at the new location: {source}")
        _record(final, state="done", source=str(source), target=str(final), message=message,
                notes=[note for note in notes if note], leftovers=leftovers)
    return 0


def _bootstrap(environ: dict[str, str]) -> Path:
    """Ignoring `PEACH_DATA_ROOT` the default location: an installed build uses, under the user directory, `Peach/peach-data`,
    a source run uses the one beside the project `peach-data`."""
    return settings_file._bootstrap_data_root(environ={
        key: value for key, value in environ.items() if key != settings_file.DATA_ROOT_ENV})[0]


def _start_tray(environment: dict[str, str], start) -> None:
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    command = _tray_command()
    if start is not None:
        start(Path(command[0]), environment)
        return
    cwd = Path(command[0]).parent if _packaged() else PROJECT_ROOT
    if sys.platform == "win32":
        from .tray_detached import launch_detached
        try:
            launch_detached(command, cwd=cwd, env=environment)
            return
        except OSError:
            pass
    _spawn(command, environment)


def helper_main(argv: list[str]) -> int:
    """Migration helper entry point for source runs (`python -m peach.data_storage`), doing the same preparation as the packaged entry point."""
    if len(argv) != 3 or argv[0] != HELPER_FLAG:
        return 2
    # The migration helper must not keep any file open inside the data directory being moved: crash logs are redirected to a temp directory, and no statistics are sent.
    import tempfile
    from . import error_reporting, remote_reporting
    remote_reporting.disable_for_process()
    error_reporting.install(Path(tempfile.gettempdir()) / "Peach" / "logs")
    return apply(Path(argv[1]), int(argv[2]))


if __name__ == "__main__":
    raise SystemExit(helper_main(sys.argv[1:]))
