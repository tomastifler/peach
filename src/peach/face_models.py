"""Face model records in the Task Center, current status, and "Retry now".

 Task cards record only history: when it cannot be fetched, a failure record and its reason are left. Whether it is usable right now is answered by `status` the line at the top of the Activity Center page
"Needs attention" row reads it, and "Retry now" calls `RETRY_URL`.

YuNet and SFace are two models shared by the whole process as a one-time capability: the full installer, macOS app and Docker image ship them bundled
 ship it bundled; if it is not bundled or the copy does not match, it is fetched online once at first use and the local copy is used from then on. A failed fetch does not stop any task round (`avatar_face.FaceProbe`, `face_match.FaceMatcher` both fall back to
 the old criteria that ignore faces), at the cost that this has no place in the UI - the avatar-backfill successor still shows as finished.

 This fills in that place. There is only one reporting point: `face_detect.fetch_model` the result of every online model fetch goes through
`face_detect.observer` reports to `Reporter`, it writes the two transitions "from usable to unavailable" and "from unavailable back to usable"
 each as one `face-models` terminal record. The same failure hit repeatedly is not written again: when offline every avatar-backfill successor would
 try once, and recording each would fill the screen with the same card.

 Retry now is an ordinary round of `BackgroundJob` (`WebContract.face_models_job`), the row it opens itself
 is the record; while it runs, reports are all skipped, so the same thing is not written twice.
"""
from __future__ import annotations

import logging
import threading

from . import face_detect

LOGGER = logging.getLogger(__name__)

TASK_KEY = "face-models"


class Reporter:
    """`face_detect.observer` server-side implementation: writes per transition to `task_run`, not per occurrence."""

    def __init__(self, runs):
        self.runs = runs
        #: No other thread may slip in between checking the latest record and writing the next: when two successors fail to get the model at the same time, only one row should remain.
        self._lock = threading.Lock()

    def __call__(self, label: str, error: Exception | None) -> None:
        try:
            self._record(label, error)
        except Exception:                       # a recording failure must not drag down the side that fetches the model
            LOGGER.warning("Face model task record was not written", exc_info=True)

    def _record(self, label: str, error: Exception | None) -> None:
        if not self.runs.enabled:
            return
        with self._lock:
            latest = self.runs.query(task_key=TASK_KEY, limit=1)
            last = latest[0] if latest else None
            if last is not None and last.active:
                return                          # the Retry now round settles itself
            if error is None:
                if last is None or last.status != "failed":
                    return
                status, summary, message = "succeeded", {"outcome": f"Fetched {label}"}, ""
            else:
                if last is not None and last.status == "failed":
                    return
                status, summary, message = "failed", {}, str(error)
            run = self.runs.start(TASK_KEY, trigger="scheduled")
            if run is None:
                return
            self.runs.finish(run.id, status, summary=summary, error=message)
            self.runs.prune(TASK_KEY)


def attach(runs) -> None:
    """Hook the result of online model fetches in this process into the Task Center. Called once when the service is assembled."""
    face_detect.observer = Reporter(runs)


def detach(runs) -> None:
    """Release the model task recorder belonging to this ledger after the service shuts down."""
    observer = face_detect.observer
    if isinstance(observer, Reporter) and observer.runs is runs:
        face_detect.observer = None


#: "Retry now" address: the "Needs attention" row at the top of the Activity Center page calls it, with request body `{}`.
RETRY_URL = "/api/face-models"


def status(runs) -> dict:
    """The face model's current status, read by the "Needs attention" row at the top of the Activity Center page. It does not go online; one read is one query.

    Same source of truth as the task card: the latest `face-models` record. `state` takes four values:

    - `downloading`: the Retry now round is running.
    - `failed`: the latest one is a failure, `failed_at`/`error`/`run_id` point to that card.
    - `ready`: both models are on this machine, either the bundled copy or the one in the data directory. The bundled copy's hash is verified via `bundled_model`
      only once per process; the hash of the data-directory copy is left until use, when `fetch_model` verifies it.
    - `missing`: not fetched yet and fetched automatically on next use; this is not a problem and needs no notice.

    The detailed reason is written only on the task card; here `error` is for the "Needs attention" row to judge and troubleshoot with, without inventing a second wording.
    """
    from . import face_match

    latest = runs.query(task_key=TASK_KEY, limit=1)
    last = latest[0] if latest else None
    present = all(face_detect.bundled_model(module.MODEL_PATH.name, module.MODEL_SHA256) is not None
                  or module.MODEL_PATH.is_file() for module in (face_detect, face_match))
    if last is not None and last.active:
        state = "downloading"
    elif last is not None and last.status == "failed":
        state = "failed"
    else:
        state = "ready" if present else "missing"
    failed = state == "failed"
    return {
        "task_key": TASK_KEY,
        "state": state,
        "available": state == "ready",
        "failed_at": last.finished_at if failed else None,
        "error": last.error if failed else "",
        "run_id": last.id if last is not None and state in ("failed", "downloading") else None,
        "retry_url": RETRY_URL,
    }


def download_all() -> dict:
    """The Retry now round: fetch each of the two models once; one already present locally and passing verification counts as fetched directly.

    One failing does not block the other: once the detection model is fetched, the framing of genre badges can recover first.
    """
    from . import face_match

    failures = []
    for ensure in (face_detect.ensure_model, face_match.ensure_model):
        try:
            ensure()
        except face_detect.FaceModelUnavailable as error:
            failures.append(str(error))
    if failures:
        return {"ok": False, "error": "; ".join(failures)}
    return {"ok": True, "outcome": "Face models ready"}
