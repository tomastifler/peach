"""Build, tray handoff and takeover state for source copy edits."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

from filelock import FileLock, Timeout

from . import dev_copy
from .diagnostic_browser import BUNDLE_CHUNK_NAME
from .fsutil import atomic_write_bytes, atomic_write_text
from .jobs import process_alive

ACTIVE = {'building', 'waiting_restart', 'restarting'}
BUNDLES = ('peach-app.js', 'peach-app.css', 'peach-pages.js', 'peach-pages.css')


def _directory(root: Path) -> Path:
    return root / 'build/copy-editor'


def _write(root: Path, data: dict) -> dict:
    atomic_write_text(_directory(root) / 'apply.json', json.dumps(data, ensure_ascii=False))
    return data


def _read_status(path: Path) -> dict:
    """Windows a brief hold during an atomic replace can be re-read; persistent access denial is still left to the caller."""
    for attempt in range(5):
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return {}
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(.02)
    return {}


def status(root: Path) -> dict:
    data = _read_status(_directory(root) / 'apply.json')
    if data.get('state') in ACTIVE:
        if data['state'] == 'waiting_restart':
            if time.time() - data['updated'] > 30:
                return {**data, 'state': 'error', 'message': 'Source tray not connected; retry once the tray is started'}
        elif not process_alive(data['pid']):
            return {**data, 'state': 'error', 'message': 'The apply task was interrupted; you can retry'}
    return data


def _start(root: Path, saved: dict) -> dict:
    state = 'building' if saved['needs_build'] else 'waiting_restart' if saved['file'].endswith('.py') else 'ready'
    job = _write(root, {'id': uuid.uuid4().hex, 'state': state, 'file': saved['file'],
                        'needs_build': saved['needs_build'], 'pid': os.getpid(), 'updated': time.time(),
                        'message': {'building': 'Saved, building…', 'waiting_restart': 'Saved, waiting for the service to reload…',
                                    'ready': 'Saved, refreshing…'}[state]})
    if state == 'building':
        try:
            threading.Thread(target=_build, args=(root, job), daemon=True, name='PeachCopyBuild').start()
        except RuntimeError as exc:
            job = _write(root, {**job, 'state': 'error', 'message': str(exc)})
    return job


def submit(root: Path, body: dict, *, retry: bool = False) -> dict:
    directory = _directory(root)
    directory.mkdir(parents=True, exist_ok=True)
    try:
        with FileLock(directory / 'apply.lock', timeout=0):
            current = status(root)
            if current.get('state') in ACTIVE:
                raise ValueError('The copy is taking effect; please edit again later')
            if retry:
                if not isinstance(body, dict) or current.get('id') != body.get('id') or current.get('state') != 'error':
                    raise ValueError('No apply task to retry')
                return {'ok': True, 'apply': _start(root, current)}
            saved = dev_copy.save(root, body)
            return {**saved, 'apply': _start(root, saved)}
    except Timeout as exc:
        raise ValueError('Another copy is being saved; please retry later') from exc


def _chunks(folder: Path) -> list[str]:
    """A chunk split out of the main bundle by page chunk (ADR-0118), its name carries a content hash and is not in `BUNDLES` 's fixed list."""
    return sorted(path.name for path in folder.glob('*.js') if BUNDLE_CHUNK_NAME.fullmatch(path.name))


def build_frontend(root: Path) -> None:
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm:
        raise ValueError('Could not find npm, please install the required Node.js')
    directory = _directory(root)
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='build-', dir=directory) as temporary:
        stage = Path(temporary).resolve()
        result = subprocess.run([npm, '--prefix', str(root / 'frontend'), 'run', 'build'],
            cwd=root, env={**os.environ, 'PEACH_FRONTEND_OUT_DIR': str(stage)},
            stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8', errors='replace',
            **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
        atomic_write_text(directory / 'build.log', (result.stdout or '') + (result.stderr or ''))
        if result.returncode:
            raise ValueError('Build failed: ' + ((result.stderr or result.stdout or '').strip()[-600:] or str(result.returncode)))
        if any(not (stage / name).is_file() for name in BUNDLES):
            raise ValueError('Build output is incomplete; see build/copy-editor/build.log')
        destination = root / 'web/dist'
        fresh = _chunks(stage)
        stale = [name for name in _chunks(destination) if name not in fresh]
        # chunk is written before the entry point: as soon as the new entry takes effect it can fetch the chunk; old chunks are deleted only after all writes finish.
        published = [*fresh, *BUNDLES]
        previous = {name: (destination / name).read_bytes() if (destination / name).exists() else None for name in published}
        try:
            for name in published:
                atomic_write_bytes(destination / name, (stage / name).read_bytes())
        except OSError:
            for name, content in previous.items():
                if content is not None:
                    atomic_write_bytes(destination / name, content)
                else:
                    (destination / name).unlink(missing_ok=True)
            raise
        for name in stale:
            (destination / name).unlink(missing_ok=True)


def _build(root: Path, job: dict) -> None:
    try:
        build_frontend(root)
        _write(root, {**job, 'state': 'ready', 'message': 'Build complete, refreshing…'})
    except Exception as exc:
        _write(root, {**job, 'state': 'error', 'message': str(exc)})


def poll(tray, root: Path) -> None:
    """Reload is taken over by the source tray that owns the child service; the service is stopped only after the task gate passes."""
    if getattr(sys, 'frozen', False):
        return
    directory = _directory(root)
    if not (directory / 'apply.json').exists():
        return
    try:
        with FileLock(directory / 'apply.lock', timeout=0):
            job = status(root)
            if job.get('state') != 'waiting_restart' or not tray._action_lock.acquire(blocking=False):
                return
            try:
                job = _write(root, {**job, 'state': 'restarting', 'pid': os.getpid(),
                                    'message': 'Saved, reloading the service…'})
            except OSError:
                tray._action_lock.release()
                raise
    except Timeout:
        return

    def reload_services():
        try:
            from .config import DATABASE_PATH
            from .runtime_prepare import task_gate
            gate = task_gate(DATABASE_PATH, host=socket.gethostname(), alive=process_alive)
            if gate.refused:
                raise ValueError(gate.refusal())
            if not tray.manager.restart():
                raise ValueError('The service has not recovered; please check the tray log')
            readiness = tray._readiness()
            if readiness.problem:
                raise ValueError(readiness.message)
            _write(root, {**job, 'state': 'ready', 'message': 'Service reloaded, refreshing…'})
        except Exception as exc:
            _write(root, {**job, 'state': 'error', 'message': str(exc)})
        finally:
            tray._action_lock.release()
    try:
        threading.Thread(target=reload_services, daemon=True, name='PeachCopyReload').start()
    except RuntimeError as exc:
        tray._action_lock.release()
        _write(root, {**job, 'state': 'error', 'message': str(exc)})
