"""Local transport receipt for the diagnostics channel; payloads and server error bodies are not saved."""
from datetime import datetime, timezone
import json
from pathlib import Path

from filelock import FileLock

from .fsutil import atomic_write_text

STATUSES = {"queued", "accepted", "failed", "unknown", "blocked"}
REASONS = {"network", "http_status", "rate_limit", "queue_full", "consent", "disabled", "unknown"}


def record(permit, event_id, result):
    try:
        _record(permit, event_id, result)
    except Exception:
        # A local receipt that cannot be written must not block a diagnostic that was otherwise allowed, nor trigger the error hook.
        pass


def _record(permit, event_id, result):
    from .remote_reporting import _consent, _read
    if not isinstance(permit, dict) or permit.get("kind") not in {"usage", "errors"}:
        return
    path = Path(permit["consent"])
    current = _consent(path)
    if current["revision"] != permit.get("revision") or not current[permit["kind"]]:
        return
    status = result.get("status")
    if status not in STATUSES:
        return
    state_path = path.with_name("remote-reporting-delivery.json")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with FileLock(str(state_path) + ".lock", timeout=.1):
        current = _consent(path)
        if current["revision"] != permit.get("revision") or not current[permit["kind"]]:
            return
        state = _read(state_path)
        if state.get("revision") != current["revision"]:
            state = {"revision": current["revision"]}
        previous = state.get(permit["kind"], {})
        previous = previous if isinstance(previous, dict) else {}
        if status != "queued" and previous.get("event_id") != event_id:
            return
        row = {"status": status, "event_id": event_id, "at": datetime.now(timezone.utc).isoformat()}
        if result.get("reason") in REASONS:
            row["reason"] = result["reason"]
        code = result.get("status_code")
        if type(code) is int and 100 <= code <= 599:
            row["status_code"] = code
        state[permit["kind"]] = row
        atomic_write_text(state_path, json.dumps(state))


def snapshot(config):
    from .remote_reporting import _read, consent
    state = _read(config.directory("state") / "remote-reporting-delivery.json")
    if state.get("revision") != consent(config)["revision"]:
        return {}
    return {kind: {key: row[key] for key in ("status", "reason", "status_code", "at") if key in row}
            for kind in ("usage", "errors") if isinstance(row := state.get(kind), dict)}
