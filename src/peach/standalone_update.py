"""独立 Windows 包的持久更新事务：下载准备、用户重启、目录切换与回滚。"""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
import zipfile

import httpx
from filelock import FileLock, Timeout

from . import __version__, desktop_installer, distribution, release_updates, settings_file, update_packages
from .fsutil import atomic_write_text
from .windows_update import replace_with_retry
from . import update_tasks

ACTIVE = {"downloading", "verifying", "extracting", "preparing", "restarting", "installing"}
MAX_ARCHIVE = 512 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024


def state_path() -> Path:
    return settings_file.load_config().directory("state") / "standalone-update.json"


def remember_installation_data_root(config) -> bool:
    """在线安装启动时，将已知的数据目录记入空的默认启动落点。"""
    if not distribution.standalone() or not config.present:
        return False
    data = read()
    target = data.get("target")
    if (data.get("state") != "installing" or data.get("version") != __version__
            or not isinstance(target, str) or not Path(target).is_absolute()
            or Path(target).resolve() != Path(sys.executable).resolve().parent):
        return False
    bootstrap = distribution.user_data_root(os.environ)
    if (bootstrap.resolve() == config.data_root.resolve()
            or any((bootstrap / name).exists() for name in (
                settings_file.SETTINGS_FILENAME, "state/data-root.txt", "database/ledger.db"))):
        return False
    settings_file.remember_data_root(settings_file.load_config(
        environ=dict(os.environ, PEACH_DATA_ROOT=str(bootstrap))), config)
    return True


def read() -> dict:
    try:
        return json.loads(state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"state": "idle", "progress": 0}


def write(data: dict, **changes) -> dict:
    data.update(changes, updated_at=time.time())
    atomic_write_text(state_path(), json.dumps(data, ensure_ascii=False))
    return data


def public() -> dict:
    data = read()
    if data.get("state") in ACTIVE and time.time() - data.get("updated_at", 0) > 180:
        data = dict(data, state="error", message="The update was interrupted; try again.")
    return {key: value for key, value in data.items() if key in {
        "state", "progress", "message", "downloaded", "total", "version", "updated_at"}}


def extract(archive: Path, destination: Path, progress, *, tool_files: set[str] | None = None) -> Path:
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        if sum(item.file_size for item in entries) > MAX_EXPANDED or len(entries) > 20000:
            raise ValueError("Update package extracted size exceeds the limit")
        seen = set()
        for index, item in enumerate(entries):
            name = item.filename
            parts = PurePosixPath(name).parts
            if (not parts or parts[0] != "Peach" or "\\" in name or ":" in name
                    or ".." in parts or name.startswith("/") or (item.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError("Update contains an invalid path")
            if tool_files is not None and (item.is_dir() or "/".join(parts[1:]) not in tool_files):
                raise ValueError("Tool package contains files outside the manifest")
            target = destination.joinpath(*parts).resolve()
            key = str(target).casefold()
            if not target.is_relative_to(destination) or key in seen:
                raise ValueError("Update package paths are duplicated or out of bounds")
            seen.add(key)
            package.extract(item, destination)
            progress(index + 1, len(entries))
    root = destination / "Peach"
    if tool_files is None and (not (root / "Peach.exe").is_file() or not (root / "_internal" / "standalone.txt").is_file()):
        raise ValueError("Update package is not a standalone Windows build")
    return root


def download(url: str, archive: Path, size: int, digest: str, progress) -> None:
    checksum = hashlib.sha256()
    received = 0
    with httpx.Client(follow_redirects=True, timeout=30) as client, client.stream("GET", url) as response:
        response.raise_for_status()
        with archive.open("wb") as output:
            for chunk in response.iter_bytes(256 * 1024):
                received += len(chunk)
                if received > size:
                    raise ValueError("Download size does not match the release record")
                output.write(chunk)
                checksum.update(chunk)
                progress(received)
    if received != size or checksum.hexdigest() != digest:
        raise ValueError("Update package verification failed; download again")


def prepare_tools(stage: Path, target: Path, transaction: Path, release: dict, data: dict,
                  *, report=None, fetch=None) -> None:
    report, fetch = report or write, fetch or download
    manifest = update_packages.read_manifest(stage, release["latest_version"])
    missing = []
    for tool, bundle in manifest["tools"].items():
        if update_packages.matches(stage, bundle["files"]):
            continue
        if update_packages.matches(target, bundle["files"]):
            for name in bundle["files"]:
                destination = update_packages.checked_path(stage, name)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(update_packages.checked_path(target, name), destination)
        else:
            missing.append((tool, bundle))
    total = data["total"] + sum(bundle["asset"]["size"] for _, bundle in missing)
    report(data, total=total)
    for index, (tool, bundle) in enumerate(missing):
        asset = bundle["asset"]
        archive = transaction / f"tools-{tool}.zip"
        received = data["downloaded"]
        report(data, state="downloading", message=f"Downloading {tool} tool package")
        fetch(release["asset_url"].rsplit("/", 1)[0] + "/" + asset["name"], archive,
                 asset["size"], asset["sha256"],
                 lambda count, start=received, step=index, size=asset["size"]: report(
                     data, downloaded=start + count, progress=75 + round((step + count / size) / len(missing) * 13)))
        report(data, state="verifying", message=f"Verifying {tool} tool package")
        extracted = extract(archive, transaction / f"tool-{tool}", lambda *_: None, tool_files=set(bundle["files"]))
        if not update_packages.matches(extracted, bundle["files"]):
            raise ValueError(f"{tool} tool package file verification failed")
        for name in bundle["files"]:
            destination = update_packages.checked_path(stage, name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(update_packages.checked_path(extracted, name), destination)
    for tool, bundle in manifest["tools"].items():
        if not update_packages.matches(stage, bundle["files"]):
            raise ValueError(f"{tool} tool reuse verification failed")


def prepare(data: dict, lock: FileLock) -> None:
    try:
        release = release_updates.check()
        if release["state"] != "available":
            raise ValueError(release["message"])
        digest = release.get("asset_digest") or ""
        if not digest.startswith("sha256:") or len(digest) != 71:
            raise ValueError("Update package is missing SHA-256 verification info")
        total = release.get("asset_size", 0)
        if not isinstance(total, int) or not 0 < total <= MAX_ARCHIVE:
            raise ValueError("Update package size is invalid")
        target = Path(sys.executable).resolve().parent
        if state_path().resolve().is_relative_to(target):
            raise ValueError("The data directory is inside the program directory and cannot be replaced automatically")
        transaction = target.parent / f".{target.name}-update-{data['id']}"
        transaction.mkdir()
        write(data, transaction=str(transaction), target=str(target), version=release["latest_version"],
              total=total, downloaded=0, message="Downloading", state="downloading")
        archive = transaction / "package.zip"
        download(release["asset_url"], archive, total, digest[7:],
                 lambda count: write(data, downloaded=count, progress=round(count / total * 65, 1)))
        write(data, state="verifying", progress=66, message="Verifying")
        write(data, state="extracting", message="Extracting")
        stage = extract(archive, transaction / "stage", lambda done, count: write(data, progress=67 + round(done / count * 8)))
        from .buildinfo import read_build_info
        info = read_build_info(stage / "_internal")
        if not info or info.version != release["latest_version"]:
            raise ValueError("Version in the package does not match the release version")
        if release.get("package_kind") == "update":
            write(data, state="preparing", message="Reusing and verifying installed tools")
            prepare_tools(stage, target, transaction, release, data)
        write(data, state="preparing", progress=90, message="Preparing to install")
        desktop_installer.carry_uninstaller(target, stage)
        # 助手从自己的目录运行，正式目录与暂存目录都不会被它的 DLL 句柄占用。
        helper = transaction / "helper"
        shutil.copytree(target, helper, ignore=shutil.ignore_patterns("*.log"))
        write(data, stage=str(stage), helper=str(helper), state="ready", progress=100,
              message="Update is ready; it will install after restart.")
    except Exception as exc:
        write(data, state="error", message=str(exc), progress=0)
    finally:
        lock.release()


def start() -> dict:
    if not distribution.standalone() or sys.platform != "win32":
        raise ValueError("This installation method does not support standalone package updates")
    lock = FileLock(str(state_path()) + ".lock", thread_local=False)
    try:
        lock.acquire(timeout=0)
    except Timeout:
        return public()
    if public().get("state") in ACTIVE | {"ready"}:
        lock.release()
        return public()
    data = write({"id": uuid.uuid4().hex}, state="downloading", progress=0, message="Connecting to GitHub")
    threading.Thread(target=prepare, args=(data, lock), daemon=True, name="PeachPackageUpdate").start()
    return public()


def request_restart() -> dict:
    if not distribution.standalone() or sys.platform != "win32":
        raise ValueError("This installation method does not support standalone package updates")
    with FileLock(str(state_path()) + ".lock", timeout=0):
        data = read()
        if data.get("state") != "ready":
            raise ValueError("The update is not ready yet")
        db = settings_file.load_config().directory("database") / "ledger.db"
        token = update_tasks.reserve(db)
        try:
            write(data, state="restarting", task_token=token, progress=0, message="Saving task progress, then restarting to install")
        except Exception:
            update_tasks.release(db, token)
            raise
    return public()


def poll(tray) -> None:
    if not distribution.standalone() or read().get("state") != "restarting":
        return
    if not tray._action_lock.acquire(blocking=False):
        return
    try:
        data = read()
        db = settings_file.load_config().directory("database") / "ledger.db"
        token = data.get("task_token") or update_tasks.reserve(db)
        if not data.get("task_token"):
            write(data, task_token=token)
        update_tasks.wait_quiescent(db)
        helper = Path(data["helper"]) / "Peach.exe"
        environment = os.environ.copy()
        environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
        environment[settings_file.DATA_ROOT_ENV] = str(settings_file.load_config().data_root.resolve())
        process = subprocess.Popen([str(helper), "--apply-standalone-update", str(state_path()), str(os.getpid())],
                         cwd=str(helper.parent), env=environment, creationflags=subprocess.CREATE_NO_WINDOW)
        update_tasks.transfer(db, token, process.pid)
        tray.exit(reason="standalone-update")
    except Exception as exc:
        if 'token' in locals():
            update_tasks.release(db, token)
        write(read(), state="error", message=f"Could not restart: {exc}")
    finally:
        tray._action_lock.release()


def migrate_database(stage: Path, data: dict) -> Path | None:
    from .migrations import plan, sqlite_backup
    config = settings_file.load_config()
    database = config.directory("database") / "ledger.db"
    if not database.is_file():
        return None
    _, pending = plan(database, stage / "_internal" / "migrations")
    if not pending:
        return None
    backup = config.directory("state") / "update-backups" / data["id"] / "ledger.db"
    sqlite_backup(database, backup)
    write(data, database_backup=str(backup), state="installing", progress=10, message="Updating the local database")
    environment = dict(os.environ, PYINSTALLER_RESET_ENVIRONMENT="1", PEACH_DATA_ROOT=str(config.data_root.resolve()))
    with (backup.parent / "migration.log").open("wb") as log:
        result = subprocess.run([str(stage / "Peach.exe"), "migrate", "upgrade", "--yes", "--db", str(database)],
                                cwd=str(stage), env=environment, stdout=log, stderr=log, stdin=subprocess.DEVNULL,
                                timeout=180, check=False, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise RuntimeError("Database update failed")
    return backup


def restore_database(data: dict) -> None:
    config = settings_file.load_config()
    database = config.directory("database") / "ledger.db"
    backup = config.directory("state") / "update-backups" / data["id"] / "ledger.db"
    if not backup.is_file():
        return
    with closing(sqlite3.connect(backup.as_uri() + "?mode=ro", uri=True)) as source, closing(sqlite3.connect(database)) as destination:
        source.backup(destination)
        if destination.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Database recovery check failed")


def _transaction_paths(manifest: Path):
    """只接受本机状态文件与同卷暂存目录，安装目标须为完整独立包。"""
    if manifest.resolve() != state_path().resolve():
        raise ValueError('Update state file does not match')
    data = read()
    target = Path(data["target"]).resolve()
    transaction = Path(data["transaction"]).resolve()
    stage = Path(data["stage"]).resolve()
    if (transaction.parent != target.parent or transaction.name != f".{target.name}-update-{data['id']}"
            or stage != transaction / "stage" / "Peach" or state_path().resolve().is_relative_to(target)
            or not (target / "_internal" / "standalone.txt").is_file()):
        raise ValueError('Update directory is invalid')
    return data, target, transaction, stage


def apply(manifest: Path, wait_pid: int) -> int:
    """复制出来的助手等待原托盘正常退出，再在同一卷上切换两个目录。"""
    from .windows_restart import process_alive, start_tray, find_tray_windows, post_stop
    from .tray import configured_service_specs
    from .settings_file import load_config
    from . import job_recovery
    try:
        data, target, transaction, stage = _transaction_paths(manifest)
    except ValueError:
        return 2
    backup = transaction / "backup"
    moved = False
    installed = False
    db = load_config().directory("database") / "ledger.db"
    token = data.get("task_token")
    previous = job_recovery.legacy_library_request(db)
    try:
        if token:
            update_tasks.transfer(db, token, os.getpid())
        else:
            token = update_tasks.reserve(db)
    except Exception as exc:
        write(data, state="error", progress=0, message=f"Pre-install check failed; the program and database are unchanged: {exc}")
        return 1
    try:
        deadline = time.monotonic() + 90
        while process_alive(wait_pid):
            if time.monotonic() > deadline:
                raise TimeoutError("The tray has not exited; installation cancelled")
            time.sleep(.25)
        job_recovery.import_legacy_library(db, previous)
        migrate_database(stage, data)
        write(data, state="installing", progress=20, message="Preserving the old version")
        replace_with_retry(target, backup)
        moved = True
        write(data, progress=50, message="Installing the new version")
        replace_with_retry(stage, target)
        installed = True
        write(data, progress=80, message="Starting the new version")
        update_tasks.release(db, token)
        start_tray(target / "Peach.exe")
        deadline = time.monotonic() + 90
        specs = configured_service_specs(load_config())
        spec = next((s for s in specs if s.name == "https"), specs[0])
        while time.monotonic() < deadline:
            try:
                health = httpx.get(spec.health_url, verify=spec.verify, trust_env=False, timeout=3)
                ready = httpx.get(spec.health_url + "?ready=1", verify=spec.verify, trust_env=False, timeout=3)
                if (health.status_code == ready.status_code == 200 and health.json().get("version") == data["version"]
                        and ready.json().get("ready") and find_tray_windows(target / "Peach.exe")):
                    if desktop_installer.installed(target):
                        try:
                            desktop_installer.record_version(data["version"])
                        except OSError:
                            pass
                    write(data, state="complete", progress=100, message=f"Updated to {data['version']}")
                    return 0
            except (httpx.HTTPError, ValueError):
                pass
            time.sleep(1)
        raise TimeoutError("The new version did not become ready")
    except Exception as exc:
        if moved:
            from .error_reporting import event
            event('standalone-update-install', exc)
            try:
                if installed:
                    for window in find_tray_windows(target / "Peach.exe"):
                        post_stop(window.handle)
                    replace_with_retry(target, transaction / "failed")
                replace_with_retry(backup, target)
                restore_database(data)
                update_tasks.release(db, token)
                start_tray(target / "Peach.exe")
                message = f"Update failed; the old version was restored: {exc}"
            except Exception as rollback:
                event('standalone-update-rollback', rollback)
                message = f"Update failed; rollback did not complete: {rollback}"
        else:
            from .error_reporting import event
            event('standalone-update-install', exc)
            message = f"Update not installed: {exc}"
            try:
                restore_database(data)
                if token:
                    update_tasks.release(db, token)
                if not process_alive(wait_pid):
                    start_tray(target / "Peach.exe")
            except Exception as rollback:
                event('standalone-update-rollback', rollback)
                message = f"Update failed; database recovery did not complete: {rollback}"
        write(data, state="error", progress=0, message=message)
        return 1
    finally:
        if token:
            update_tasks.release(db, token)
