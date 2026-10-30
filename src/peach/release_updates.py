"""公开测试版查询；传输复用共享 HTTPX，发行包支持 R2 与 GitHub。"""
from __future__ import annotations

import json
import re
import httpx

from . import __version__, distribution
from .http import HttpRequest, HttpxTransport
from .update_packages import TOOL_PATHS

RELEASES_URL = "https://github.com/peach-mitao/peach/releases"
API_URL = "https://api.github.com/repos/peach-mitao/peach/releases?per_page=100"
DOWNLOADS_BASE = "https://downloads.peach.video"
DOWNLOADS_API = DOWNLOADS_BASE + "/releases.json"


def download_sources(url: str) -> tuple[str, ...]:
    """发行包保留同版本、同文件名的另一公开源；校验沿用原发布摘要。"""
    github = RELEASES_URL + "/download/"
    mirror = DOWNLOADS_BASE + "/"
    for primary, backup in ((github, mirror), (mirror, github)):
        if url.startswith(primary):
            return url, backup + url.removeprefix(primary)
    return (url,)


def snapshot() -> dict:
    return {"current_version": __version__, "latest_version": None,
            "channel": "Beta", "installation": "独立测试包" if distribution.standalone() else "Run from source",
            "state": "unchecked", "message": "Not checked yet", "release_url": RELEASES_URL}


def _version(value: object) -> tuple[int, ...] | None:
    if not isinstance(value, str) or not re.fullmatch(r"v?\d+\.\d+\.\d+", value):
        return None
    return tuple(map(int, value.removeprefix("v").split(".")))


def _release_candidates(rows: list, endpoint: str) -> list[tuple]:
    """从一个公开发行源选择完整包，并构造受信任的下载地址。"""
    releases = []
    for row in rows:
        if not isinstance(row, dict) or row.get("draft"):
            continue
        version = _version(row.get("tag_name"))
        if version is None:
            continue
        tag = row["tag_name"]
        assets = row.get("assets") or []
        prefix = f"Peach-{tag.removeprefix('v')}-windows-x64"
        uploaded = {a.get("name"): a for a in assets if isinstance(a, dict) and a.get("state") == "uploaded"}
        full = uploaded.get(prefix + ".zip")
        if full is None:
            continue
        complete_tools = all(prefix + f"-tools-{tool}.zip" in uploaded for tool in TOOL_PATHS)
        asset = uploaded.get(prefix + "-update.zip", full) if complete_tools else full
        if endpoint == DOWNLOADS_API:
            if not all(re.fullmatch(r"sha256:[0-9a-f]{64}", item.get("digest") or "") for item in (asset, full)):
                continue
            directory = f"{DOWNLOADS_BASE}/{tag}"
        else:
            directory = f"{RELEASES_URL}/download/{tag}"
        release_url = f"{RELEASES_URL}/tag/{tag}"
        releases.append((version, tag, asset, full, directory, release_url))
    return releases


def check(*, transport=None) -> dict:
    result = snapshot()
    client = transport or HttpxTransport()
    try:
        releases = []
        obtained = False
        for endpoint in (API_URL, DOWNLOADS_API):
            try:
                headers = {"Accept": "application/json"}
                if endpoint == API_URL:
                    headers.update(Accept="application/vnd.github+json", **{"X-GitHub-Api-Version": "2022-11-28"})
                response = client(HttpRequest("GET", endpoint, headers), 12.0, 2_000_000)
                if response.status != 200:
                    continue
                rows = json.loads(response.body)
                if not isinstance(rows, list):
                    continue
                obtained = True
                releases.extend(_release_candidates(rows, endpoint))
            except (OSError, ValueError, TypeError, TimeoutError, httpx.HTTPError):
                continue
        if not releases:
            return dict(result, state="empty" if obtained else "error",
                        message="暂未找到可下载的测试版。" if obtained else "未能取得版本信息，请重试。")
        version, tag, asset, full, directory, release_url = max(releases, key=lambda item: item[0])
        current = _version(result["current_version"])
        if current is None:
            raise ValueError("current version required")
        state = "available" if version > current else "ahead" if version < current else "current"
        message = {"available": "A new version is available to download.", "ahead": "The current version is newer than the published beta.", "current": "You are on the latest beta."}[state]
        return dict(result, latest_version=tag.removeprefix("v"), state=state, message=message,
                    asset_url=f"{directory}/{asset['name']}",
                    asset_size=asset.get("size", 0), asset_digest=asset.get("digest"),
                    package_kind="update" if asset is not full else "full",
                    # 应用更新包准备不下去（清单或工具包与本版更新器对不上）时改下的同版本完整包。
                    full_url=f"{directory}/{full['name']}", full_size=full.get("size", 0),
                    full_digest=full.get("digest"),
                    release_url=release_url)
    except (OSError, ValueError, TypeError, TimeoutError, httpx.HTTPError):
        return dict(result, state="error", message="Could not get version information; try again.")
    finally:
        if transport is None:
            client.close()
