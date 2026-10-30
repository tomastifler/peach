"""Periodic snapshot of external connectivity: probes go out per the Peach proxy settings, and the endpoint only reads the latest conclusion.

 Cadence and re-checks follow `mount_reachability`: ten minutes when normal, one minute when abnormal, and a single negative is confirmed only after a re-check one second later.
 The probe targets are the operating system's own connectivity-check addresses, reachable directly both inside and outside China, with fixed response bodies that will not match when hijacked by a captive portal.
"""
from __future__ import annotations

import threading
import time

import httpx

from . import peach_proxy

HEALTHY_INTERVAL = 600.0
DEGRADED_INTERVAL = 60.0
PROBE_TIMEOUT = 5.0
#: (address, bytes the body must contain). any one matching counts as online.
TARGETS = (
    ("http://www.msftconnecttest.com/connecttest.txt", b"Microsoft Connect Test"),
    ("http://captive.apple.com/hotspot-detect.html", b"Success"),
)


def probe(timeout: float = PROBE_TIMEOUT) -> bool | None:
    """Online returns True, unreachable returns False; Peach when the proxy setting itself is still to be chosen, returns None."""
    try:
        client = peach_proxy.http_client(timeout=timeout, follow_redirects=False)
    except ValueError:
        return None
    with client:
        for url, marker in TARGETS:
            try:
                response = client.get(url)
            except httpx.HTTPError:
                continue
            if response.status_code == 200 and marker in response.content[:4096]:
                return True
    return False


class NetworkReachability:
    """A background thread probes at its cadence; `refresh()` makes the next round start immediately, used right after proxy settings are saved."""

    def __init__(self, *, check=probe, wall_clock=time.time, retry_delay=1.0):
        self.check, self.wall_clock, self.retry_delay = check, wall_clock, retry_delay
        self._state, self._checked_at = "checking", None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread is not None or self._stop.is_set():
                return
            self._thread = threading.Thread(target=self._loop, name="PeachNetworkStatus", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=2)

    def refresh(self) -> None:
        self._wake.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            self._wake.clear()
            state = self.tick()
            self._wake.wait(HEALTHY_INTERVAL if state == "online" else DEGRADED_INTERVAL)

    def tick(self) -> str:
        try:
            result = self.check()
            if result is False and not self._stop.wait(self.retry_delay):
                result = self.check()
        except Exception:
            # An unknown exception must not count as evidence of two failed attempts.
            result = None
        state = {True: "online", False: "offline"}.get(result, "unknown")
        with self._lock:
            self._state, self._checked_at = state, self.wall_clock()
        return state

    def summary(self) -> dict:
        with self._lock:
            return {"state": self._state, "checked_at": self._checked_at}
