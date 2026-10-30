"""明确同意的馆藏与口味明细，与错误诊断使用独立接收项目。"""
from __future__ import annotations

import gzip
import io
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit

from . import __version__, remote_reporting
from .fsutil import atomic_write_text

SCHEMA = 4
MAX_BYTES = 18 * 1024 * 1024
MAX_RAW_BYTES = 100 * 1024 * 1024
FILENAME = "peach-library-taste.json.gz"
FIELDS = [
    "Deduplicated work codes, plus ratings, likes, dislikes, watched, watch-later, play counts, watch ratios and manually added tags",
    "Favorites, likes, dislikes, watch counts and rating distributions grouped by performer, creator, studio, series, manual tag, era and duration (coded works and uncoded entries kept separate), plus the names of entities actively favorited",
    "Library file count, coded work count and uncoded entry count",
    "Peach version, field version and UTC calendar week",
]
NOTICE = "Library and preference details are uploaded after anonymization."


def _path(config):
    return config.directory("state") / "library-sharing.json"


def _state_path(config):
    return config.directory("state") / "library-sharing-attempt.json"


def _state_lock(config):
    from filelock import FileLock
    path = _state_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    return FileLock(str(path) + ".lock", timeout=5)


def _period():
    return datetime.now(timezone.utc).strftime("%G-W%V")


def _used(value, period):
    return value.get("period") == period and (value.get("attempted") is True
        or ("attempted" not in value and value.get("status") in {"attempted", "failed"}))


def useful_payload(payload):
    """A public code or any preference group provides analyzable content."""
    return bool(payload["library"] or any(payload["preferences"].values()))


def consent(config):
    value = remote_reporting._read(_path(config))
    return value if value.get("enabled") is True and value.get("schema") == SCHEMA else {}


def save_choice(config, enabled):
    """保存设置页或安装器的主动选择，不读取馆藏或初始化上传。"""
    if type(enabled) is not bool:
        raise ValueError("Library and taste upload options must be booleans")
    value = {"enabled": enabled, "schema": SCHEMA, "revision": uuid.uuid4().hex,
             "selected_at": datetime.now(timezone.utc).isoformat()}
    with _state_lock(config):
        atomic_write_text(_path(config), json.dumps(value))
        state = remote_reporting._read(_state_path(config))
        if state.get("status") == "queued":
            status = "unknown" if state.get("attempted") else "blocked"
            atomic_write_text(_state_path(config), json.dumps({**state, "status": status, "reason": "consent"}))
    return snapshot(config)


def target():
    destination = remote_reporting.dsn("PEACH_LIBRARY_SENTRY_DSN", "library_dsn")
    diagnostic = remote_reporting.dsn()
    first, second = urlsplit(destination), urlsplit(diagnostic)
    if destination and diagnostic and (first.hostname, first.path) == (second.hostname, second.path):
        return ""
    return destination


def snapshot(config):
    attempt = remote_reporting._read(config.directory("state") / "library-sharing-attempt.json")
    if attempt.get("status") == "attempted":
        attempt = {**attempt, "status": "unknown", "attempted": True}
    return {"enabled": bool(consent(config)), "available": bool(target()),
            "schema": SCHEMA, "fields": FIELDS, "notice": NOTICE,
            "last_attempt": attempt if attempt.get("schema") == SCHEMA and attempt.get("period") == _period() else {}}


def collect(contract):
    """在本机生成群体分析投影，不读取浏览历史或写入缓存。"""
    from .library_research import project
    with contract.read_connection() as connection:
        connection.execute("BEGIN")
        projection = project(connection)
    payload = {"schema": SCHEMA, "peach": __version__, "period": datetime.now(timezone.utc).strftime("%G-W%V"),
               **projection}
    data = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    if len(data) > MAX_RAW_BYTES:
        raise ValueError("Library and taste details exceed 100 MiB; nothing was sent")
    return payload, data


def compressed(data):
    """使用无文件名和时间戳的 gzip 附件，保持全部 JSON 字段。"""
    wire = gzip.compress(data, mtime=0)
    if len(wire) > MAX_BYTES:
        raise ValueError("Library and taste details exceed 18 MiB after compression; nothing was sent")
    return wire


def valid_payload(payload):
    from .library_research import valid_projection
    if (not isinstance(payload, dict) or set(payload) != {"schema", "peach", "period", "library", "preferences", "coverage"}
            or payload["schema"] != SCHEMA or payload["peach"] != __version__
            or payload["period"] != datetime.now(timezone.utc).strftime("%G-W%V")
            or not isinstance(payload["library"], list) or not isinstance(payload["preferences"], dict)):
        return False
    return valid_projection(payload)


class Service:
    def __init__(self, config, contract):
        self.config, self.contract = config, contract
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = None
        self._preview = None
        self._lock = threading.RLock()

    def preview(self):
        payload, data = collect(self.contract)
        size = len(compressed(data))
        token = uuid.uuid4().hex
        with self._lock:
            self._preview = token, time.monotonic() + 600
        return {"data": payload, "bytes": len(data), "compressed_bytes": size, "token": token, "schema": SCHEMA}

    def save(self, body):
        if type(body.get("enabled")) is not bool:
            raise ValueError("Library and taste upload options must be booleans")
        with self._lock:
            if body["enabled"] and (not self._preview or body.get("preview_token") != self._preview[0]
                    or time.monotonic() > self._preview[1]
                    or body.get("consent") is not True or body.get("schema") != SCHEMA):
                raise ValueError("Review the fields and data preview first, then explicitly agree to the upload")
            save_choice(self.config, body["enabled"])
            self._preview = None
        self._wake.set()
        return snapshot(self.config)

    def _gate(self, revision, envelope, attempt_id=None):
        current = consent(self.config)
        if self._stop.is_set() or not current or current.get("revision") != revision:
            return False
        if len(envelope.items) != 2 or [item.type for item in envelope.items] != ["event", "attachment"]:
            return False
        attachment = envelope.items[1]
        if attachment.headers.get("filename") != FILENAME:
            return False
        data = attachment.payload.get_bytes()
        if len(data) > MAX_BYTES:
            return False
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(data)) as archive:
                raw = archive.read(MAX_RAW_BYTES + 1)
            if len(raw) > MAX_RAW_BYTES:
                return False
            payload = json.loads(raw)
            if not valid_payload(payload) or not useful_payload(payload):
                return False
        except (ValueError, KeyError, TypeError, OSError, EOFError):
            return False
        event = envelope.items[0].get_event()
        for key in tuple(event):
            if key not in {"event_id", "timestamp", "platform"}:
                del event[key]
        metadata = remote_reporting.event_metadata("research")
        event.update(**metadata, message="Peach library and taste research", level="info")
        event["tags"].update(schema=str(SCHEMA), period=payload["period"])
        for key in tuple(envelope.headers):
            if key not in {"event_id", "sent_at"}:
                del envelope.headers[key]
        if attempt_id is None:
            return True
        with _state_lock(self.config):
            current = consent(self.config)
            state = remote_reporting._read(_state_path(self.config))
            if (self._stop.is_set() or not current or current.get("revision") != revision
                    or state.get("attempt_id") != attempt_id or state.get("revision") != revision
                    or state.get("period") != _period() or state.get("status") != "queued"
                    or _used(state, _period())):
                return False
            atomic_write_text(_state_path(self.config), json.dumps({**state, "attempted": True}))
        return True

    def _delivery(self, identity, result):
        """Update only the redacted receipt of the current delivery; HTTP receipt is not interpreted as retention."""
        if result.get("status") not in {"accepted", "failed", "unknown", "blocked"}:
            return
        with _state_lock(self.config):
            state = remote_reporting._read(_state_path(self.config))
            if (any(state.get(key) != value for key, value in identity.items())
                    or consent(self.config).get("revision") != identity["revision"]
                    or state.get("status") not in {"queued", "unknown"}):
                return
            if state.get("status") == "unknown" and result["status"] == "unknown":
                return
            status = result["status"]
            if status == "unknown" and not state.get("attempted"):
                status = "failed"
            value = {key: value for key, value in state.items() if key not in {"reason", "status_code"}}
            value["status"] = status
            if type(result.get("status_code")) is int and 100 <= result["status_code"] <= 599:
                value["status_code"] = result["status_code"]
            if result.get("reason") in {"network", "http_status", "rate_limit", "queue_full", "consent", "disabled", "unknown"}:
                value["reason"] = result["reason"]
            atomic_write_text(_state_path(self.config), json.dumps(value))

    def attempt(self):
        current, destination = consent(self.config), target()
        if not current or not destination or self._stop.is_set():
            return
        period = _period()
        state = _state_path(self.config)
        with _state_lock(self.config):
            previous = remote_reporting._read(state)
            if _used(previous, period):
                return
        identity = {"schema": SCHEMA, "period": period, "revision": current["revision"], "attempt_id": uuid.uuid4().hex}
        value = {**identity, "attempted": False}
        stage = "collection"
        try:
            payload, data = collect(self.contract)
            if useful_payload(payload):
                stage = "compression"
                data = compressed(data)
                value["status"] = "queued"
            else:
                value["status"] = "waiting-data"
        except Exception:
            value.update(status="failed", reason=stage)
        with _state_lock(self.config):
            if (consent(self.config).get("revision") != identity["revision"] or _period() != period
                    or _used(remote_reporting._read(state), period)):
                return
            atomic_write_text(state, json.dumps(value))
        if value["status"] != "queued":
            return
        client = None
        try:
            from sentry_sdk.attachments import Attachment
            client = remote_reporting._new_client(destination,
                envelope_gate=lambda envelope: self._gate(current["revision"], envelope, identity["attempt_id"]),
                delivery_callback=lambda result: self._delivery(identity, result))
            client.capture_event({"message": "Peach library and taste research", "level": "info",
                                  **remote_reporting.event_metadata("research")},
                                 hint={"attachments": [Attachment(bytes=data, filename=FILENAME,
                                                                  content_type="application/gzip")]})
            client.flush(timeout=5)
        except Exception:
            pass
        finally:
            try:
                if client is not None:
                    client.close(timeout=0)
            finally:
                self._delivery(identity, {"status": "unknown", "reason": "unknown"})

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        def run():
            while not self._stop.is_set():
                try:
                    self.attempt()
                except Exception:
                    # 分享失败不把数据或错误原文转交诊断通道。
                    pass
                self._wake.wait(3600)
                self._wake.clear()
        self._thread = threading.Thread(target=run, name="PeachLibrarySharing", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=6)
