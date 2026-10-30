"""CLI 与 API 共用的分项诊断；不修复账本、配置、工具或挂载。"""
from __future__ import annotations

import ipaddress
import os
import platform
import shutil
import socket
import sqlite3
import sys
import tempfile
import time
from contextlib import closing

from . import __version__, access, distribution, settings_file
from .ffmpeg import FFmpegResolver, binary_diagnostics
from .health import inspect_database
from .mount_reachability import MountReachability, PROBE_TIMEOUT


def item(label, status, reason, *, action="", target=None, details=None):
    return {"label": label, "status": status, "reason": reason, "action": action,
            "target": target, "details": details or {}}


def doctor_endpoint(config):
    """选择配置端口或具有 TLS 材料的源码托盘入口。"""
    configured = (config.server.host, config.server.port)
    if distribution.standalone():
        return configured
    tls = config.directory("secrets") / "tls"
    if not all((tls / name).is_file() for name in ("peach-local-ca.crt", "peach.crt", "peach.key")):
        return configured
    if sys.platform == "darwin":
        return "0.0.0.0", 8443
    from .mdns import lan_ipv4
    try:
        address = os.environ.get("PEACH_LAN_ADDRESS") or lan_ipv4()
    except (OSError, RuntimeError):
        address = "0.0.0.0"
    return address, 443


def configuration(config, configured, *, validate=True):
    try:
        if validate:
            settings_file.load_config(environ=dict(os.environ, PEACH_DATA_ROOT=str(config.data_root)))
        elif settings_file.error():
            raise settings_file.SettingsFileError("Config file could not be read")
    except settings_file.SettingsFileError:
        return item("Config", "failed", "Config file could not be read", action="Repair the config file on this machine")
    if not configured:
        return item("Config", "failed", "First-time setup is not complete", action="Complete first-time setup", target="/settings/library")
    return item("Config", "ok", "Config is readable")


def database_checks(settings):
    state = inspect_database(settings.db_path)
    reasons = {"missing": "Database does not exist", "empty": "Database is not initialised", "unavailable": "Database could not be read"}
    readable = state["database"] == "available" and state["readable"]
    database = item("Database", "ok" if readable else "failed",
                    "Database is readable" if readable else reasons.get(state["database"], "Database schema could not be read"),
                    action="" if readable else "Check the local database and backups", details={"state": state["database"]})
    schema_reasons = {"current": "Migration check passed", "pending": "Migrations are pending", "empty": "Database is not initialised",
                      "mismatch": "Migration records do not match the current program", "unavailable": "Migration check unavailable"}
    current = state["schema"] == "current"
    schema = item("Database migrations", "ok" if current else "failed", schema_reasons[state["schema"]],
                  action="" if current else "Check database migrations and backups on this machine",
                  details={key: state[key] for key in ("schema", "version", "pending", "mismatched", "unknown_versions")})
    return database, schema


def tools(settings, *, inspect=True):
    resolver = FFmpegResolver(settings.ffmpeg_root)
    found = {}
    for name, choice in (("ffmpeg", resolver.ffmpeg()), ("ffprobe", resolver.ffprobe())):
        found[name] = (binary_diagnostics(choice, decoders=name == 'ffmpeg') if inspect else
                       {'available': choice is not None, 'source': choice.source if choice else None,
                        'path': str(choice.path) if choice else None})
    openssl = shutil.which("openssl")
    found["openssl"] = {"available": openssl is not None, "source": "path" if openssl else None,
                        "path": openssl}
    missing = [name for name, value in found.items() if not value["available"]]
    unavailable = [name for name in ('ffmpeg', 'ffprobe') if found[name]['available'] and not found[name].get('usable', True)]
    incomplete = found['ffmpeg'].get('usable') and not found['ffmpeg'].get('av1_software')
    problems = (["Not found: " + ", ".join(missing)] if missing else [])
    problems += (["Cannot execute: " + ", ".join(unavailable)] if unavailable else [])
    problems += ['FFmpeg is missing the AV1 software decoder'] if incomplete else []
    return item("FFmpeg／OpenSSL", 'warning' if problems else 'ok',
                '; '.join(problems) or ('Media tools are executable and the AV1 software decoder is available' if inspect else 'Tool paths found'),
                action='Update media tools' if problems else '', target='/settings/maintenance' if problems else None, details=found)


def security(settings):
    policy = access.load(settings.access_path)
    try:
        loopback = settings.host == "localhost" or ipaddress.ip_address(settings.host).is_loopback
    except ValueError:
        loopback = False
    protected = policy["mode"] == "password" or (policy["mode"] == "legacy" and bool(settings.token))
    exposed = not loopback or settings.tunnel_enabled
    if policy["mode"] == "locked":
        return item("Access security", "failed", "Access password config could not be read", action="Check the access password config on this machine")
    if exposed and not protected:
        return item("Access security", "warning", "No access password is set for the LAN or public entry point",
                    action="Turn on the access password in settings", target="/settings/network", details={"exposed": True, "protected": False})
    return item("Access security", "ok", "Access password enabled" if protected else "Listening on this machine only",
                details={"exposed": exposed, "protected": protected})


def media_mounts(snapshot):
    if not snapshot["sources"]:
        return item("Media mounts", "disabled", "No local sources configured")
    states = {"ok": "ok", "degraded": "warning", "checking": "unknown"}
    reason = "Sources are readable" if snapshot["state"] == "ok" else "; ".join(snapshot["warnings"]) or "Mount check has not finished"
    return item("Media mounts", states[snapshot["state"]], reason,
                action="Check the media directories and mount status" if snapshot["state"] != "ok" else "", target="/settings/library",
                details=snapshot)


def component_checks(settings, snapshot, *, config=None, validate_config=True, inspect_tools=True):
    config = config or settings_file.active()
    database, schema = database_checks(settings)
    checks = {"database": database, "schema": schema, "configured": configuration(config, settings.configured, validate=validate_config),
              "media_mounts": media_mounts(snapshot), "security": security(settings)}
    checks["ffmpeg"] = tools(settings, inspect=inspect_tools)
    return checks


def writable_root(root):
    try:
        with tempfile.TemporaryFile(dir=root, prefix=".peach-doctor-") as probe:
            probe.write(b"peach")
            probe.flush()
    except PermissionError:
        return item("Data directory", "failed", "No permission to write to the data directory", action="Adjust write permissions on the data directory")
    except OSError:
        return item("Data directory", "failed", "The data directory is not writable", action="Check the data directory and free space")
    return item("Data directory", "ok", "Temporary write and cleanup passed")


def port_status(host, port):
    host = "127.0.0.1" if host == "localhost" else host
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return item("Service port", "unknown", "The listen address is not an IP, so port status is unavailable", details={"port": port})
    family = socket.AF_INET6 if address.version == 6 else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            probe.bind((host, port))
    except OSError as error:
        import errno
        if error.errno == errno.EADDRINUSE or getattr(error, "winerror", None) == 10048:
            return item("Service port", "ok", "Port is in use", details={"port": port, "state": "in_use"})
        return item("Service port", "unknown", "Port status unavailable", details={"port": port})
    return item("Service port", "ok", "Port is available", details={"port": port, "state": "available"})


def recent_failure(path):
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=1)) as connection:
            connection.execute("PRAGMA query_only=ON")
            row = connection.execute("SELECT id,finished_at FROM task_run WHERE status='failed' "
                                     "ORDER BY finished_at DESC,id DESC LIMIT 1").fetchone()
    except (sqlite3.Error, OSError):
        return item("Background tasks", "unknown", "Task failure records unavailable")
    if row is None:
        return item("Background tasks", "ok", "No task failures recorded")
    # 不公开任务 error、参数或结果原文，它们可能包含凭据和媒体路径。
    moment = str(row[1] or "")
    safe_time = moment if len(moment) <= 32 and all(c in "0123456789-:+.TZ " for c in moment) else None
    return item("后台任务", "warning", "存在已记录的任务失败", action="在任务中心查看失败任务",
                target="/tasks", details={"id": row[0], "finished_at": safe_time})


def probe_mounts(roots):
    monitor = MountReachability(roots)
    deadline = time.monotonic() + PROBE_TIMEOUT + 1.5
    try:
        while True:
            monitor.tick()
            snapshot = monitor.summary()
            if all(row["state"] != "checking" for row in snapshot["sources"]) or time.monotonic() >= deadline:
                return snapshot
            time.sleep(0.05)
    finally:
        monitor.stop()


def report(settings, snapshot, *, config=None):
    from . import library_diagnostics
    config = config or settings_file.active()
    checks = component_checks(settings, snapshot, config=config)
    checks.update(data_root=writable_root(config.data_root), port=port_status(settings.host, settings.port),
                  tasks=recent_failure(settings.db_path),
                  version=item("Version", "ok", f"Peach {__version__} · Python {platform.python_version()}",
                               details={"peach": __version__, "python": platform.python_version()}))
    statuses = {check["status"] for check in checks.values()}
    state = "failed" if "failed" in statuses else "warning" if statuses & {"warning", "unknown"} else "ok"
    return {"version": __version__, "status": state, "checks": checks,
            "library": library_diagnostics.library(settings, config),
            "sources": library_diagnostics.sources(settings, config)}


def health_components(settings, snapshot):
    checks = component_checks(settings, snapshot, validate_config=False, inspect_tools=False)
    # 公开健康检查只保留分项原因；工具路径与详细修法由本机诊断提供。
    return {key: {name: value[name] for name in ("status", "reason")} for key, value in checks.items()}
