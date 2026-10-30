"""独立更新包的工具清单与本机文件校验。"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import re

MANIFEST = "update-manifest.json"
TOOL_PATHS = {
    "ffmpeg": ("tools/ffmpeg", {"bin/ffmpeg.exe", "bin/ffprobe.exe", "manifest.json", "LICENSE.txt", "NOTICE.md", "buildconf.txt"}),
    "untrunc": ("tools/untrunc", {"untrunc.exe", "manifest.json", "LICENSE.txt", "NOTICE.md", "buildconf.txt"}),
    "cloudflared": ("", {"cloudflared.exe", "cloudflared-manifest.json"}),
    "face-models": ("tools/face-models", {"face_detection_yunet_2023mar.onnx", "face_recognition_sface_2021dec.onnx",
                                          "LICENSE-yunet.txt", "LICENSE-sface.txt", "manifest.json"}),
}
#: Tools the runtime can fill in itself: an old updater does not recognize them, and when one is missing from the installed new version it is downloaded by its own runtime
#: (for face models see `face_models`). a new version that adds to the manifest a tool old clients do not recognize must register it here,
#: otherwise `scripts/update_compat.py` refuses to publish (ADR-0120).
SELF_PROVISIONED = frozenset({"face-models"})


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked_path(root: Path, name: str) -> Path:
    parts = PurePosixPath(name).parts
    if (not parts or "\\" in name or ":" in name or ".." in parts or any(part.endswith((".", " ")) for part in parts)
            or name.startswith("/") or PurePosixPath(name).as_posix() != name):
        raise ValueError("Tool manifest path is invalid")
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root.resolve()) or any(
            parent.is_symlink() for parent in (path, *path.parents) if parent != root.parent):
        raise ValueError("Tool manifest path is out of bounds or contains links")
    return path


def matches(root: Path, files: dict[str, str]) -> bool:
    try:
        return all((path := checked_path(root, name)).is_file() and digest(path) == expected
                   for name, expected in files.items())
    except (OSError, ValueError):
        return False


def read_manifest(stage: Path, version: str) -> dict:
    """Read the update package's tool manifest, keeping only tools this version recognizes and that are also in the manifest.

    The tool set can change in both directions and neither side is rejected: a tool in the manifest that this version does not recognize is one newly added by the update version's
    tool package; this version does not download it, and after installation that tool's own runtime fills it in (`SELF_PROVISIONED`); if the manifest
    lacks a tool this version recognizes, the updated version no longer needs it, and it is neither prepared nor verified.
    """
    manifest = json.loads((stage / MANIFEST).read_text(encoding="utf-8"))
    if (not isinstance(manifest, dict) or manifest.get("format") != 1 or manifest.get("version") != version
            or not isinstance(manifest.get("tools"), dict)):
        raise ValueError("Invalid update package tool manifest")
    manifest["tools"] = {tool: manifest["tools"][tool] for tool in TOOL_PATHS if tool in manifest["tools"]}
    all_names: set[str] = set()
    for tool, bundle in manifest["tools"].items():
        if not isinstance(bundle, dict):
            raise ValueError("Update package tool manifest is invalid")
        prefix, required = TOOL_PATHS[tool]
        files = bundle.get("files")
        if not isinstance(files, dict) or not files or len(files) > 2000:
            raise ValueError("Update package tool file manifest is invalid")
        expected_names = {f"{prefix}/{name}" if prefix else name for name in required}
        if not expected_names.issubset(files):
            raise ValueError("Update package tool manifest is missing required files")
        for name, expected in files.items():
            checked_path(stage, name)
            if ((prefix and not name.startswith(prefix + "/")) or (not prefix and name not in required)
                    or not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected)
                    or name.casefold() in all_names):
                raise ValueError("Update package tool file manifest is invalid")
            all_names.add(name.casefold())
        asset = bundle.get("asset", {})
        if (not isinstance(asset, dict) or asset.get("name") != f"Peach-{version}-windows-x64-tools-{tool}.zip"
                or not isinstance(asset.get("size"), int) or not 0 < asset["size"] <= 512 * 1024 * 1024
                or not isinstance(asset.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", asset["sha256"])):
            raise ValueError("Update package tool download info is invalid")
    return manifest
