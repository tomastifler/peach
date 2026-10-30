"""浏览器 JAV 添加队列：按番号查磁力，交给现有云下载与入库链路。"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import re
import secrets
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

from .catalog_rules import is_jav_code, normalise_code_key, release_code_from_product, same_release_code
from .config import PROJECT_ROOT
from .downloads import (
    CLOUDDRIVE_CREDENTIAL, INGESTED, POSTPROCESS_LABELS, REMOTE_RUNNING, RESUBMITTABLE_STATES,
    STATE_LABELS, never_seen, submit_offline_download, parse_magnet,
)
from .follow_secrets import CredentialError
from .feeds import scan_code
from .fsutil import atomic_write_text
from .sources.dmm import code_from_cid

LOGGER = logging.getLogger(__name__)
CREDENTIAL = "jav-browser"
ACTIVE = {"queued", "searching"}
MESSAGES = {
    "idle": "可以加入 Peach 馆藏", "queued": "等待搜索磁力", "searching": "正在搜索磁力",
    "submitted": "云下载进行中", "ingested": "已加入 Peach 馆藏", "owned": "馆藏已有该番号影片",
    "failed": "添加失败，可重试", "no_match": "未找到可自动下载的磁力，可重试",
}
#: 下载失败按原因分给用户脚本：磁力本身的问题换一个磁力，网盘一侧的问题修好后重试同一个磁力。
MAGNET_FAILURES = frozenset({"rejected", "invalid_link", "no_source", "mismatch"})
CLOUD_FAILURES = frozenset({"config", "quota", "network", "not_landed", "duplicate", "not_accepted", "removed"})
NO_OTHER_MAGNET = "没有其他可用磁力，可在 Peach 手动选择资源"
#: 细分之前「列表里找不到」统一记为 no_source 的原文；这些旧任务从没被网盘列出过，按网盘问题处理。
LEGACY_MISSING = "远端任务列表里找不到这个任务"


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
        if site.get("identity") is not None and (site["identity"] != "peach" or site["mode"] != "automatic"
                or not isinstance(site.get("detail_pattern"), str) or not site["detail_pattern"].startswith("^")
                or len(site.get("query_keys", ())) > 1):
            raise ValueError("发行商品号识别配置无效")
        for host in site["domains"]:
            if not isinstance(host, str) or not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host) or host in domains:
                raise ValueError("The JAV site list contains an invalid domain")
            domains.add(host)
    return sites


def source_site(host: str) -> dict | None:
    return next((site for site in source_sites() if any(
        host == name or host.endswith("." + name) for name in site["domains"])), None)


def code_key(value: object) -> str:
    raw = str(value or "").strip()
    code = release_code_from_product(raw) if len(raw) <= 80 else None
    if not code or not is_jav_code(code) or normalise_code_key(raw) != normalise_code_key(code):
        raise ValueError("Provide an explicit JAV code")
    return normalise_code_key(code)


def source_page(value: object) -> str:
    raw = str(value or "")
    try:
        parsed = urlsplit(raw)
        host = (parsed.hostname or "").lower()
        site = source_site(host)
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


def identify_source(value: object, hint: str = "") -> str:
    """从已登记发行平台的详情地址提取商品号，复用编目规则确认番号。"""
    source = source_page(value)
    url = urlsplit(source)
    site = source_site(url.hostname or "")
    product = ""
    if site and site.get("identity") == "peach":
        match = re.fullmatch(site["detail_pattern"], url.path, re.IGNORECASE)
        if match:
            product = (match.group(1) if match.lastindex else "") or next(
                (dict(parse_qsl(url.query)).get(key, "") for key in site.get("query_keys", ())), "")
    if not product:
        raise ValueError("未识别到作品番号，请选中页面的完整番号后加入 Peach")
    code = code_key(code_from_cid(product) if site["id"] == "dmm" else product)
    if hint and not same_release_code(code, code_key(hint)):
        raise ValueError("页面番号与商品号不一致，请核对作品详情")
    return code


def _download_candidate(items, code, skip=frozenset()):
    """搜索结果里第一个番号相符的正片磁力；`skip` 是换磁力时排除的 infohash。"""
    for item in items:
        name = str(item.get("name") or "")
        matches = (same_release_code(scan_code(name), code)
                   or same_release_code(scan_code(name, product=True), code))
        if not matches or re.search(r"(?i)\b(?:sample|trailer|preview)\b|予告|预告|預告", name):
            continue
        try:
            magnet = parse_magnet(str(item.get("uri") or ""))
        except ValueError:
            continue
        if magnet.info_hash in skip:
            continue
        return item
    return None


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
        self._submitting = set()
        from .jav_browser_diagnostics import BrowserDiagnostics
        self.diagnostics = BrowserDiagnostics()
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
        release = json.loads((PROJECT_ROOT / "web/integrations/jav-userscript-release.json").read_text(encoding="utf-8"))
        catalog = self.downloads.channel_snapshot() if self.downloads.available else {"providers": [], "problems": []}
        providers = catalog["providers"]
        preferred = config.get("provider", "")
        selected = preferred if any(row["key"] == preferred for row in providers) else (
            providers[0]["key"] if providers else "")
        return {"enabled": bool(config.get("token_hash")), "provider": selected,
                "active_provider": preferred, "available": self.downloads.available, **catalog,
                "userscript": {"version": release["version"],
                               "minimum_version": release.get("bridge_min_version", release["version"]),
                               "install_url": release.get("install_url", "/integrations/peach-jav.user.js")},
                "sites": [{key: site[key] for key in ("id", "label", "kind", "domains", "mode")}
                          for site in source_sites()]}

    def configure(self, body: dict) -> dict:
        action = body.get("action")
        if action not in {"enable", "rotate", "disable"}:
            raise ValueError("Choose enable, renew token, or turn off")
        if not self.downloads.available:
            raise ValueError("浏览器添加只在允许修改数据库的设备上可用")
        provider = str(body.get("provider") or "")
        if action != "disable":
            self._ready(provider)
        token = None
        with self._lock:
            if action == "disable":
                self.credentials.clear(CREDENTIAL)
                for code, row in self.rows.items():
                    if row["state"] in ACTIVE and code not in self._submitting:
                        row.update(state="failed", message="浏览器添加已关闭")
                self._save()
            else:
                token = secrets.token_urlsafe(32)
                self.credentials.save(CREDENTIAL, {
                    "token_hash": hashlib.sha256(token.encode()).hexdigest(), "provider": provider})
        return {**self.settings(), **({"token": token} if token else {})}

    def authorized(self, supplied: str) -> bool:
        try:
            expected = self._config().get("token_hash", "")
        except CredentialError:
            return False
        return bool(expected and supplied and len(supplied) <= 256 and hmac.compare_digest(
            expected, hashlib.sha256(supplied.encode()).hexdigest()))

    def _ready(self, provider: str, *, remote=True):
        if not self.downloads.available:
            raise ValueError("浏览器添加只在允许修改数据库的设备上可用")
        if remote:
            state = next((row for row in self.downloads.channel_snapshot()["providers"] if row["key"] == provider), None)
        elif provider in {"115", "pikpak"}:
            state = self.downloads._provider_state(provider)
        else:
            state = {"target": provider.startswith("clouddrive:"), "configured": bool(
                self.downloads.config.clouddrive_address and "token" in
                self.credentials.describe(CLOUDDRIVE_CREDENTIAL)["fields"])}
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
            if not row.get("task_id") and code not in self._submitting:
                row.update(self._existing(code) or {})
            task = self.downloads.store.get(row["task_id"]) if row.get("task_id") else None
            detail = {}
            if task is not None:
                state = "ingested" if task.state == INGESTED else (
                    "failed" if task.state in RESUBMITTABLE_STATES or task.blocked_at else "submitted")
                row.update(state=state, message=task.failure_detail or MESSAGES[state])
                if state == "failed":
                    detail["failure"] = task.failure or ""
                    # 旧任务把「列表里找不到」记成 no_source；从没被网盘列出过的按网盘问题处理。
                    legacy_unseen = (task.failure == "no_source" and never_seen(task)
                                     and (task.failure_detail or "").startswith(LEGACY_MISSING))
                    detail["cause"] = ("magnet" if task.blocked_at
                                       else "cloud" if legacy_unseen or task.failure in CLOUD_FAILURES
                                       else "magnet" if task.failure in MAGNET_FAILURES else "")
                if task.asset_id:
                    row["asset_id"] = task.asset_id
                progress = task.progress
                detail["download"] = {"state": task.state, "label": STATE_LABELS.get(task.state, ""),
                    "phase": "organize" if task.state == INGESTED else "ingest" if task.remote_done_at
                        or task.state in {"remote_done", "landed"} else "download",
                    "progress": min(1.0, max(0.0, progress)) if task.state in {REMOTE_RUNNING, "remote_done", "landed", INGESTED}
                        and type(progress) in (int, float) and math.isfinite(progress) else None,
                    "postprocess_state": task.postprocess_state,
                    "postprocess_label": POSTPROCESS_LABELS.get(task.postprocess_state, ""),
                    "updated_at": task.updated_at}
            state = row.get("state", "idle")
            return {"ok": True, "code": code, **row, **detail, "state": state,
                    "stage": "submitting" if code in self._submitting else state,
                    "message": row.get("message") or MESSAGES[state]}

    def add(self, body: dict) -> dict:
        code = code_key(body.get("code"))
        if body.get("manual") is True:
            if body.get("source_url") not in (None, ""):
                raise ValueError("手动添加不接受来源网页地址")
            page = ""
        else:
            page = source_page(body.get("source_url"))
        with self._lock:
            config = self._config()
            if not config.get("token_hash"):
                raise ValueError("Enable browser add first")
            status = self.status(code)
            if status["state"] in ACTIVE | {"owned", "submitted", "ingested"}:
                return status
            if body.get("switch") not in (None, False, True):
                raise ValueError("换磁力参数无效")
            # 换磁力：把上一次提交的磁力记入跳过名单，重新搜索时取下一个。
            previous = self.rows.get(code, {})
            skip = list(previous.get("skip", ()))
            if body.get("switch") is True and previous.get("task_id"):
                task = self.downloads.store.get(previous["task_id"])
                if task is not None and task.info_hash and task.info_hash not in skip:
                    skip.append(task.info_hash)
            self._ready(config.get("provider", ""), remote=False)
            if code not in self.rows and len(self.rows) >= 200:
                completed = next((key for key, row in self.rows.items() if row["state"] not in ACTIVE), None)
                if completed is None:
                    raise ValueError("The add queue is full; wait for the current task to finish")
                del self.rows[completed]
            self.rows[code] = {"state": "queued", "provider": config["provider"], "source_url": page,
                               **({"skip": skip[-20:]} if skip else {})}
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
            skip = list(row.get("skip", ()))
            result = self.search(self.contract, {"code": code, "goal": "quality", **({"skip": skip} if skip else {})})
            candidate = _download_candidate(result.get("items", ()), code, frozenset(row.get("skip", ())))
            should_submit = False
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
                        "资源搜索暂不可用，请在 Peach 检查来源后重试" if failed
                        else NO_OTHER_MAGNET if row.get("skip") else MESSAGES["no_match"]))
                else:
                    self._submitting.add(code)
                    should_submit = True
                self._save()
            if should_submit:
                try:
                    submitted = submit_offline_download(
                        self.downloads, magnet=candidate["uri"], provider=provider, code=code,
                        origin="browser:" + (row["source_url"] or "manual"), dedupe_code=True)
                    task = submitted["task"]
                    with self._lock:
                        row.update(state="failed" if submitted["outcome"] in {"failed", "refused"} else "submitted",
                                   task_id=task["id"])
                        self._save()
                finally:
                    with self._lock:
                        self._submitting.discard(code)
        except Exception as error:
            LOGGER.error("JAV browser add failed: %s (%s)", code, type(error).__name__)
            with self._lock:
                self._submitting.discard(code)
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
