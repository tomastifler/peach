"""为测试准备与当前锁文件一致的 amane 安装元数据。"""
from __future__ import annotations

import json

from peach import metadata_amane


def write_amane_metadata(tools, version=None, *, ready=False):
    version = version or metadata_amane.locked_version()
    home = metadata_amane.bridge_home(tools)
    package = home / ".venv" / "Lib" / "site-packages" / f"amane-{version}.dist-info"
    package.mkdir(parents=True, exist_ok=True)
    (package / "METADATA").write_text(
        f"Metadata-Version: 2.1\nName: amane\nVersion: {version}\n", encoding="utf-8")
    (package / "direct_url.json").write_text(json.dumps({
        "vcs_info": {"commit_id": metadata_amane.pinned_revision()}}), encoding="utf-8")
    if ready:
        (home / "installed.json").write_text(json.dumps({
            "revision": metadata_amane.pinned_revision(), "version": version,
            "lock_sha256": metadata_amane.lock_fingerprint(metadata_amane.BRIDGE_ROOT)}), encoding="utf-8")
