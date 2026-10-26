"""浏览器 JAV 添加队列：按番号查磁力，交给现有云下载与入库链路。"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

from .catalog_rules import is_jav_code, normalise_code_key, release_code_from_text, same_release_code
from .config import PROJECT_ROOT
from .downloads import INGESTED, RESUBMITTABLE_STATES, submit_offline_download, parse_magnet
from .follow_secrets import CredentialError
from .feeds import scan_code
from .fsutil import atomic_write_text

LOGGER = logging.getLogger(__name__)
CREDENTIAL = "jav-browser"
ACTIVE = {"queued", "searching"}
MESSAGES = {
    "idle": "Add to Peach", "queued": "Waiting to search magnets", "searching": "Searching magnets",
    "submitted": "Cloud download in progress", "ingested": "已入库", "owned": "The library already has this work",
    "failed": "Add failed; you can retry", "no_match": "No automatically downloadable magnet found; you can retry",
}


@lru_cache(maxsize=1)
def source_sites() -> list[dict]:
    payload = json.loads((PROJECT_ROOT / "web" / "integrations" / "jav-sites.json").read_text(encoding="utf-8"))
    sites = payload.get("sites")
    if payload.get("version") != 1 or not isinstance(sites, list) or not sites:
        raise ValueError("The JAV site list cannot be read")
    ids, domains = set(), set()
    for site in sites:
        if (not isinstance(site, dict) or not site.get("id") or site["id"] in ids
                or not site.get("label") or not site.get("kind")
                or site.get("mode") not in {"automatic", "selection"}
                or not isinstance(site.get("domains"), list) or not site["domains"]):
            raise ValueError("The JAV site list contains an invalid entry")
        ids.add(site["id"])
        for host in site["domains"]:
            if not isinstance(host, str) or not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host) or host in domains:
                raise ValueError("The JAV site list contains an invalid domain")
            domains.add(host)
    return sites


def code_key(value: object) -> str:
    raw = str(value or "").strip()
    code = release_code_from_text(raw) if len(raw) <= 80 else None
    if not code or not is_jav_code(code) or normalise_code_key(raw) != normalise_code_key(code):
        raise ValueError("Provide an explicit JAV code")
    return normalise_code_key(code)


def source_page(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = urlsplit(raw)
        host = (parsed.hostname or "").lower()
        site = next((site for site in source_sites() if any(
            host == name or host.endswith("." + name) for name in site["domains"])), None)
        if (len(raw) > 2048 or parsed.scheme != "https" or site is None or parsed.username
                or parsed.password or parsed.port not in {None, 443} or parsed.fragment):
            raise ValueError
        parameters = parse_qsl(parsed.query, keep_blank_values=True, max_num_fields=16)
        if (len({key for key, _value in parameters}) != len(parameters) or any(
                key not in site.get("query_keys", ()) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value)
                for key, value in parameters)):
            raise ValueError
    except ValueError:
        raise ValueError("Add from a supported JAV movie detail page") from None
    return parsed._replace(query=urlencode(parameters), fragment="").geturl()


class JavBrowser:
    """本机持久队列；搜索完成前退出时，下一次启动继续处理。"""

    def __init__(self, contract, *, search):
        self.contract = contract
        self.downloads = contract.downloads
        self.credentials = self.downloads.credentials
        self.path = Path(contract.follow_state_root) / "jav-browser-queue.json"
        self.search = search
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread = None
        self.rows = self._load()

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or len(payload) > 200:
            raise ValueError("The browser add queue cannot be read")
        for key, row in payload.items():
            if not isinstance(row, dict) or code_key(key) != key or row.get("state") not in MESSAGES:
                raise ValueError("The browser add queue cannot be read")
            if row["state"] == "searching":
                row["state"] = "queued"
        return payload

    def _save(self):
        atomic_write_text(self.path, json.dumps(self.rows, ensure_ascii=False, indent=2) + "\n")

    def _config(self) -> dict:
        credential = self.credentials.load(CREDENTIAL)
        return dict(credential.values) if credential else {}

    def settings(self) -> dict:
        config = self._config()
        providers = self.downloads.snapshot(1)["providers"] if self.downloads.available else []
        return {"enabled": bool(config.get("token_hash")), "provider": config.get("provider", "115"),
                "available": self.downloads.available, "providers": providers,
                "sites": [{key: site[key] for key in ("id", "label", "kind", "domains", "mode")}
                          for site in source_sites()]}

    def configure(self, body: dict) -> dict:
        action = body.get("action")
        if action not in {"enable", "rotate", "disable"}:
            raise ValueError("Choose enable, renew token, or turn off")
        if not self.downloads.available:
            raise ValueError("浏览器添加只在允许修改数据库的设备上可用")
        with self._lock:
            if action == "disable":
                self.credentials.clear(CREDENTIAL)
                for row in self.rows.values():
                    if row["state"] in ACTIVE:
                        row.update(state="failed", message="Browser add is turned off")
                self._save()
                return self.settings()
            provider = str(body.get("provider") or "")
            self._ready(provider)
            token = secrets.token_urlsafe(32)
            self.credentials.save(CREDENTIAL, {
                "token_hash": hashlib.sha256(token.encode()).hexdigest(), "provider": provider})
            return {**self.settings(), "token": token}

    def authorized(self, supplied: str) -> bool:
        try:
            expected = self._config().get("token_hash", "")
        except CredentialError:
            return False
        return bool(expected and supplied and len(supplied) <= 256 and hmac.compare_digest(
            expected, hashlib.sha256(supplied.encode()).hexdigest()))

    def _ready(self, provider: str):
        if not self.downloads.available:
            raise ValueError("浏览器添加只在允许修改数据库的设备上可用")
        state = next((row for row in self.downloads.snapshot(1)["providers"] if row["key"] == provider), None)
        if not state or not state["configured"] or not state["target"]:
            raise ValueError("Configure a cloud drive account and target folder under download channels first")

    def _existing(self, code: str) -> dict | None:
        with self.contract.database.read_connection() as connection:
            row = connection.execute(
                "SELECT id FROM asset WHERE normalise_code_key(code)=? AND medium='video' "
                "AND disposal IS NULL ORDER BY id LIMIT 1", (code,)).fetchone()
            if row:
                return {"state": "owned", "asset_id": row[0]}
            tasks = connection.execute(
                "SELECT id,state FROM download_task WHERE normalise_code_key(code)=? "
                "ORDER BY id DESC", (code,)).fetchall()
        for task in tasks:
            if task["state"] not in RESUBMITTABLE_STATES:
                return {"state": "ingested" if task["state"] == INGESTED else "submitted", "task_id": task["id"]}
        return None

    def status(self, value: object) -> dict:
        code = code_key(value)
        with self._lock:
            row = dict(self.rows.get(code, {}))
            task = self.downloads.store.get(row["task_id"]) if row.get("task_id") else None
            if task is not None:
                state = "ingested" if task.state == INGESTED else (
                    "failed" if task.state in RESUBMITTABLE_STATES or task.blocked_at else "submitted")
                row.update(state=state, message=task.failure_detail or MESSAGES[state])
                if task.asset_id:
                    row["asset_id"] = task.asset_id
            else:
                row.update(self._existing(code) or {})
            state = row.get("state", "idle")
            return {"ok": True, "code": code, **row, "state": state,
                    "message": row.get("message") or MESSAGES[state]}

    def add(self, body: dict) -> dict:
        code, page = code_key(body.get("code")), source_page(body.get("source_url"))
        with self._lock:
            config = self._config()
            if not config.get("token_hash"):
                raise ValueError("Enable browser add first")
            status = self.status(code)
            if status["state"] in ACTIVE | {"owned", "submitted", "ingested"}:
                return status
            self._ready(config.get("provider", ""))
            if code not in self.rows and len(self.rows) >= 200:
                completed = next((key for key, row in self.rows.items() if row["state"] not in ACTIVE), None)
                if completed is None:
                    raise ValueError("The add queue is full; wait for the current task to finish")
                del self.rows[completed]
            self.rows[code] = {"state": "queued", "provider": config["provider"], "source_url": page}
            self._save()
            self._wake.set()
            return self.status(code)

    def process_one(self) -> bool:
        with self._lock:
            if self._stop.is_set() or not self.downloads.available or not self._config().get("token_hash"):
                return False
            code = next((key for key, row in self.rows.items() if row["state"] == "queued"), None)
            if code is None:
                return False
            row = self.rows[code]
            existing = self._existing(code)
            if existing:
                row.update(existing)
                self._save()
                return True
            row["state"] = "searching"
            self._save()
            provider = row["provider"]
        try:
            self._ready(provider)
            result = self.search(self.contract, {"code": code, "goal": "quality"})
            candidate = None
            for item in result.get("items", ()):
                name = str(item.get("name") or "")
                if (not same_release_code(scan_code(name), code)
                        or re.search(r"(?i)\b(?:sample|trailer|preview)\b|予告|预告|預告", name)):
                    continue
                try:
                    parse_magnet(str(item.get("uri") or ""))
                except ValueError:
                    continue
                candidate = item
                break
            with self._lock:
                if row["state"] != "searching" or not self._config().get("token_hash"):
                    return True
                elif self._stop.is_set():
                    row["state"] = "queued"
                elif existing := self._existing(code):
                    row.update(existing)
                elif candidate is None:
                    failed = result.get("state") in {"error", "unavailable"} or bool(result.get("error"))
                    row.update(state="failed" if failed else "no_match", message=(
                        "Resource search is temporarily unavailable; check the sources in Peach and retry" if failed else MESSAGES["no_match"]))
                else:
                    submitted = submit_offline_download(
                        self.downloads, magnet=candidate["uri"], provider=provider, code=code,
                        origin="browser:" + row["source_url"], dedupe_code=True)
                    task = submitted["task"]
                    row.update(state="failed" if submitted["outcome"] in {"failed", "refused"} else "submitted",
                               task_id=task["id"])
                self._save()
        except Exception as error:
            LOGGER.error("JAV browser add failed: %s (%s)", code, type(error).__name__)
            with self._lock:
                if row["state"] == "searching":
                    row.update(state="failed", message="Search or cloud download submission failed; check the download channel in Peach and retry")
                    self._save()
        return True

    def start(self):
        if not self.downloads.available or self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="PeachJavBrowser", daemon=True)
        self._thread.start()

    def _loop(self):
        while not self._stop.is_set():
            self._wake.clear()
            if not self.process_one():
                self._wake.wait(30)

    def stop(self):
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join()
            self._thread = None
