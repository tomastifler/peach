"""Save playback preferences and subtitles per video; file locking and atomic replacement reuse the local state store."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from filelock import FileLock

from .fsutil import atomic_write_bytes, atomic_write_text

MAX_BYTES = 8 * 1024 * 1024
VIDEO_KEY = re.compile(r"(?:item:[1-9][0-9]*|follow:[1-9][0-9]*:(?:main|[0-9]+))")
COLORS = {"white", "yellow", "green", "cyan", "blue", "magenta", "red", "black"}
CAPTION_VALUES = {
    "font": {"sans", "mono", "serif", "mono-serif", "casual", "cursive", "small-caps"},
    "size": {"50", "75", "100", "150", "200", "300", "400"},
    "color": COLORS, "opacity": {"25", "50", "75", "100"},
    "background": COLORS, "backgroundOpacity": {"0", "25", "50", "75", "100"},
    "window": COLORS, "windowOpacity": {"0", "25", "50", "75", "100"},
    "edge": {"none", "raised", "depressed", "outline", "shadow"},
}
PREFERENCES = {"rotation", "rate", "caption_style"}


def _validate_patch(patch: dict) -> None:
    """Validate patch fields and playback setting values; subtitle content is checked separately."""
    if not isinstance(patch, dict) or not patch or patch.keys() - (PREFERENCES | {"selected", "track"}):
        raise ValueError("Invalid playback memory field")
    if "track" in patch and "selected" not in patch:
        raise ValueError("Please choose a subtitle or turn subtitles off")
    if "rotation" in patch and (type(patch["rotation"]) is not int or patch["rotation"] not in (0, 90, 180, 270)):
        raise ValueError("Invalid rotation angle")
    if "rate" in patch and (type(patch["rate"]) not in (int, float) or not .25 <= patch["rate"] <= 3):
        raise ValueError("Invalid playback speed")
    if "caption_style" in patch:
        style = patch["caption_style"]
        if not isinstance(style, dict) or any(
                key not in CAPTION_VALUES or not isinstance(value, str) or value not in CAPTION_VALUES[key]
                for key, value in style.items()):
            raise ValueError("Invalid subtitle appearance")
    selected = patch.get("selected")
    if selected is not None and (not isinstance(selected, str) or len(selected) > 1024):
        raise ValueError("Invalid subtitle selection")


class SubtitleMemory:
    """Preferences are isolated per video, and subtitle content and playback settings share one manifest committed atomically."""

    def __init__(self, root: Path, video: str):
        if not VIDEO_KEY.fullmatch(video):
            raise ValueError("Invalid video identifier")
        self.root = root / video.replace(":", "-")
        self.manifest = self.root / "subtitles.json"

    def read(self) -> dict:
        if not self.manifest.exists():
            return {"selected": None, "tracks": []}
        value = json.loads(self.manifest.read_text(encoding="utf-8"))
        return {"selected": value["selected"], "tracks": value["tracks"],
                **{key: value[key] for key in PREFERENCES if key in value}}

    def update(self, selected: str | None, track: dict | None = None) -> dict:
        return self.patch({"selected": selected, **({"track": track} if track is not None else {})})

    def patch(self, patch: dict) -> dict:
        _validate_patch(patch)
        selected, track = patch.get("selected"), patch.get("track")
        if track is not None:
            if not isinstance(track, dict):
                raise ValueError("Invalid subtitle track")
            key, name, text = (track.get(field) for field in ("key", "name", "text"))
            if (not isinstance(key, str) or not key or len(key) > 1024
                    or not isinstance(name, str) or not name or len(name) > 512
                    or not isinstance(text, str) or not text.startswith("WEBVTT")
                    or len(text.encode("utf-8")) > MAX_BYTES):
                raise ValueError("Invalid subtitle content or name")
        self.root.mkdir(parents=True, exist_ok=True)
        with FileLock(str(self.manifest) + ".lock"):
            value = self.read()
            if selected is not None and not selected.startswith("native:") and not re.fullmatch(r"sidecar:[1-9][0-9]*", selected) and not (
                    track is not None and selected == key) and not any(
                    row["key"] == selected for row in value["tracks"]):
                raise ValueError("The selected subtitle has not been saved")
            if track is not None:
                filename = hashlib.sha256(key.encode()).hexdigest() + ".vtt"
                atomic_write_bytes(self.root / filename, text.encode("utf-8"))
                value["tracks"] = [row for row in value["tracks"] if row["key"] != key]
                value["tracks"].append({"key": key, "name": name, "file": filename})
            if "selected" in patch:
                value["selected"] = selected
            for field in PREFERENCES & patch.keys():
                if field == "caption_style":
                    value[field] = {**value.get(field, {}), **patch[field]}
                else:
                    value[field] = patch[field]
            atomic_write_text(self.manifest, json.dumps(value, ensure_ascii=False))
            return value

    def track_path(self, filename: str) -> Path | None:
        if not re.fullmatch(r"[a-f0-9]{64}\.vtt", filename):
            return None
        if not any(row["file"] == filename for row in self.read()["tracks"]):
            return None
        path = self.root / filename
        return path if path.is_file() else None
