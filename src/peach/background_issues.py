"""Problems the background services have right now: the data source for the Task Center's "Needs attention" section.

 Each item is an ongoing state (consecutive scheduler failures, public entrance disconnected, network down), not a completed round, so it is
 not written to `task_run`: that table keeps only 20 entries per kind, so an ongoing state written into it would be squeezed out, and after the fix an old record would remain.
 Here every request reads each service's own snapshot live; when the problem goes away the item is gone.

 An item says only what it is, since when, and where to handle it; the reason is explained by the settings location that `href` points to,
 it is not repeated here. High-frequency per-item failures (site favicons, avatars, single pushed files) are not included: each has its own
 task record, and summarizing them here would only flood the screen.

 Actions are split by whether they can be fixed in place: network, scheduler, amane bridge and face model (the kind a single rerun may fix) get `retry`
(the UI always calls it "Retry now"); ones that need settings changed or credentials filled in get only a link. Every item carries a link, `link_label` spells out the specific destination.

 There are two kinds of time: `since` is the start point the service records itself; the two schedulers (the start of the first round in the consecutive failures) and the face model
(the end time of that failure record) have it; other services do not record a failure time, `noticed_at` is when this process first read
 the item, which is later than when it actually happened and is recounted after a restart. The two do not substitute for each other.

 Adding a kind of problem means adding a function to `PROVIDERS` that reads `(app_state, contract, config)`,
 returns zero or more `Issue`. When a service is not wired up `getattr` gets None, and the function still returns empty.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class Issue:
    key: str
    title: str
    href: str
    #: Link text names the specific destination ("Open push settings"), and the UI uses it as is.
    link_label: str
    since: str | None = None
    #: POST address when one-click retry is possible; only for self-contained actions that need no form or revision number.
    retry: str | None = None
    #: On a read-only node the retry endpoint is blocked by the writer gate, so the UI greys out the button accordingly.
    retry_available: bool = False


def _stamp(moment: float) -> str:
    return datetime.fromtimestamp(moment, timezone.utc).isoformat().replace("+00:00", "Z")


def _push_discovery(state, _contract, _config) -> list[Issue]:
    service = getattr(state, "push_discovery", None)
    if service is None:
        return []
    snapshot = service.snapshot()
    if not snapshot.get("enabled"):
        return []
    href = "/settings/library#pushDiscovery"
    issues = []
    if snapshot["queue"].get("last_error"):
        issues.append(Issue("push-discovery", "Automatic discovery of new files for import failed", href, "Open push settings"))
    if snapshot.get("watch_local") and not snapshot.get("local_running") and snapshot.get("local_message"):
        issues.append(Issue("push-discovery-watch", "Local folder watcher is not running", href, "Open push settings"))
    return issues


def _downloads(_state, contract, _config) -> list[Issue]:
    service = getattr(contract, "downloads", None)
    if service is None or not service.available:
        return []
    from .downloads import TRACKED_STATES
    marks = ",".join("?" * len(TRACKED_STATES))
    with contract.database.read_connection() as connection:
        (count,) = connection.execute(
            f"SELECT count(*) FROM download_task WHERE state IN ({marks}) "
            "AND coalesce(failure_detail, '') <> ''", tuple(TRACKED_STATES)).fetchone()
    if not count:
        return []
    return [Issue("downloads", f"{count} cloud download tasks failed reconciliation for now", "/tasks#cloudDownloads", "View cloud downloads")]


def _scheduler(attribute: str, key: str, title: str, href: str, link_label: str, retry: str):
    def provider(_state, contract, _config) -> list[Issue]:
        scheduler = getattr(contract, attribute, None)
        if scheduler is None:
            return []
        status = scheduler.status()
        if not status.get("enabled") or status.get("running") or not status.get("last_error"):
            return []
        return [Issue(key, title, href, link_label, since=status.get("failing_since"), retry=retry,
                      retry_available=bool(status.get("available")))]
    return provider


def _tunnel(state, _contract, config) -> list[Issue]:
    manager = getattr(state, "tunnel", None)
    # A leftover state file still carries the last error after deactivation, so first check whether it is enabled.
    if manager is None or config is None or not config.tunnel.enabled:
        return []
    if not manager.snapshot().error:
        return []
    return [Issue("tunnel", "Public entrance connection failed", "/settings/network#tunnel", "Open public entrance settings")]


def _library_sharing(_state, _contract, config) -> list[Issue]:
    if config is None:
        return []
    from . import library_sharing
    if library_sharing.snapshot(config)["last_attempt"].get("status") != "failed":
        return []
    return [Issue("library-sharing", "Library sharing upload failed", "/settings/maintenance#librarySharing", "Open data upload settings")]


def _automatic_updates(state, _contract, _config) -> list[Issue]:
    service = getattr(state, "automatic_updates", None)
    if service is None or not service.snapshot().get("error"):
        return []
    return [Issue("automatic-updates", "Automatic update error", "/settings/maintenance#automaticUpdates", "Open automatic update settings")]


def _amane_bridge(state, contract, _config) -> list[Issue]:
    tools_root = getattr(contract, "tools_root", None)
    if tools_root is None:
        return []
    from .metadata_amane import installed
    if installed(tools_root):
        return []
    # Rebuilding is a background task, and clicking again while it runs would only hit 409; the read-only node's writer gate blocks it as well.
    job = getattr(contract, "amane_bridge_job", None)
    building = bool(job and (job.snapshot() or {}).get("status") == "running")
    sync = getattr(state, "sync", None)
    writer = sync is None or not sync.read_only
    return [Issue("amane-bridge", "amane bridge not installed", "/sources#amane", "Open amane settings",
                  retry="/api/scraping/amane-bridge/rebuild", retry_available=writer and not building)]


def _network(state, _contract, _config) -> list[Issue]:
    monitor = getattr(state, "network_reachability", None)
    # Read-only snapshot; probing is not started here: the probe thread is started when the page reads `/api/network-status`.
    if monitor is None or monitor.summary().get("state") != "offline":
        return []
    return [Issue("network", "Network unreachable", "/settings/network#peachProxy", "Open Peach proxy settings",
                  retry="/api/network-status/check", retry_available=True)]


def _face_models(_state, contract, _config) -> list[Issue]:
    runs = getattr(contract, "task_runs", None)
    # While the ledger has not yet migrated out the task-run table, the whole Task Center is off, so this row does not report either.
    if runs is None or not runs.available():
        return []
    from . import face_models
    status = face_models.status(runs)
    # Report only when the latest record is a failure: not yet fetched (`missing`), it will fetch itself the next time it is needed and is not counted as a problem;
    # While a re-download is running this row stays collapsed. The failure reason is written only on that task card, and the link points there.
    if status["state"] != "failed":
        return []
    # The model is stored in the machine's tool directory and does not touch the ledger, so a read-only node can re-fetch it too.
    return [Issue("face-models", "Face model download failed", f"/tasks#run-{status['run_id']}", "View failure record",
                  since=status["failed_at"], retry=status["retry_url"], retry_available=True)]


Provider = Callable[[Any, Any, Any], Iterable[Issue]]

PROVIDERS: tuple[Provider, ...] = (
    _network,
    _tunnel,
    _scheduler("follow_scheduler", "follow-schedule", "Follow auto-check failed",
               "/settings/subscriptions#followScheduleSetting", "Open follow schedule", "/api/follow/schedule/run"),
    _scheduler("feed_scheduler", "feed-schedule", "Feed auto-fetch failed",
               "/settings/subscriptions#feedScheduleSetting", "Open feed schedule", "/api/feeds/schedule/run"),
    _push_discovery,
    _downloads,
    _automatic_updates,
    _library_sharing,
    _amane_bridge,
    _face_models,
)


class IssueLog:
    """Record the first time each item was read; forget it when the item disappears, and recount when it reappears."""

    def __init__(self, clock: Callable[[], float] = time.time):
        self.clock = clock
        self._lock = threading.Lock()
        self._noticed: dict[str, str] = {}

    def collect(self, state, contract, config, providers: Iterable[Provider] = PROVIDERS) -> list[dict]:
        issues: list[Issue] = []
        for provider in providers:
            try:
                issues.extend(provider(state, contract, config))
            except Exception:  # one service failing to read must not make the whole block disappear
                LOGGER.exception("Failed to read background issues: %s", getattr(provider, "__name__", provider))
        now = _stamp(self.clock())
        with self._lock:
            current = {issue.key for issue in issues}
            for key in set(self._noticed) - current:
                del self._noticed[key]
            rows = []
            for issue in issues:
                noticed = self._noticed.setdefault(issue.key, now)
                rows.append({**asdict(issue), "noticed_at": noticed})
        return rows
