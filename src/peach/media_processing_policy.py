"""本机视频预览偏好；资料管理模式保留媒体探测、关闭视频抽帧。"""
from __future__ import annotations

import json
from pathlib import Path
from filelock import FileLock

from .fsutil import atomic_write_text

FILENAME = 'media-processing.json'


def metadata_only(state_root: Path | None = None) -> bool:
    if state_root is None:
        from .settings_file import active
        state_root = active().directory('state')
    try:
        payload = json.loads((Path(state_root) / FILENAME).read_text(encoding='utf-8'))
    except FileNotFoundError:
        return False
    except (OSError, ValueError):
        return True
    return not isinstance(payload, dict) or payload.get('metadata_only') is not False


def save(state_root: Path, value: bool) -> None:
    if not isinstance(value, bool):
        raise ValueError('请选择视频预览生成状态')
    save_preferences(state_root, {'metadata_only': value})


def acceleration(state_root: Path | None = None, *, purpose: str = 'playback') -> str:
    if purpose not in ('preview', 'playback'):
        raise ValueError('媒体加速用途无效')
    if state_root is None:
        from .settings_file import active
        state_root = active().directory('state')
    try:
        payload = json.loads((Path(state_root) / FILENAME).read_text(encoding='utf-8'))
        return 'software' if isinstance(payload, dict) and payload.get(f'{purpose}_acceleration') == 'software' else 'auto'
    except (OSError, ValueError):
        return 'auto'


def save_preferences(state_root: Path, body: dict) -> None:
    patch = {}
    if 'metadata_only' in body:
        if not isinstance(body['metadata_only'], bool):
            raise ValueError('请选择视频预览生成状态')
        patch['metadata_only'] = body['metadata_only']
    for key in ('preview_acceleration', 'playback_acceleration'):
        if key in body:
            if body[key] not in ('auto', 'software'):
                raise ValueError('请选择自动或仅软件模式')
            patch[key] = body[key]
    if not patch:
        raise ValueError('请选择媒体处理方式')
    path = Path(state_root) / FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    with FileLock(str(path) + '.lock', timeout=5):
        try:
            existing = json.loads(path.read_text(encoding='utf-8'))
            existing = existing if isinstance(existing, dict) else {'metadata_only': True}
        except FileNotFoundError:
            existing = {'metadata_only': False}
        except (OSError, ValueError):
            existing = {'metadata_only': True}
        atomic_write_text(path, json.dumps({**existing, **patch}) + '\n')
