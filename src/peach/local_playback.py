"""通过系统文件关联或已安装的播放器打开已授权媒体。"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from .media import normalized_path


def available() -> bool:
    return sys.platform in {'win32', 'darwin'} and os.environ.get('PEACH_HEADLESS_MANAGED') != '1'


def installed() -> dict[str, tuple[str, str]]:
    """固定播放器名单；路径只来自系统与已知安装目录。"""
    if not available():
        return {}
    result = {}
    if sys.platform == 'darwin':
        for key, name in [('iina', 'IINA'), ('vlc', 'VLC'), ('mpv', 'mpv')]:
            for root in [Path('/Applications'), Path.home() / 'Applications']:
                app = root / f'{name}.app'
                if app.is_dir():
                    result[key] = (name, str(app))
                    break
    else:
        for key, name, relatives in [
            ('vlc', 'VLC', ('VideoLAN/VLC/vlc.exe',)),
            ('mpv', 'mpv', ('mpv/mpv.exe',)),
            ('potplayer', 'PotPlayer', ('DAUM/PotPlayer/PotPlayerMini64.exe', 'DAUM/PotPlayer/PotPlayerMini.exe',
                                      'PotPlayer/PotPlayerMini64.exe', 'PotPlayer/PotPlayerMini.exe')),
        ]:
            candidates = [shutil.which(Path(relative).name) for relative in relatives]
            candidates.extend(str(Path(os.environ[root]) / relative) for relative in relatives
                              for root in ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'] if os.environ.get(root))
            found = next((path for path in candidates if path and Path(path).is_file()), None)
            if found:
                result[key] = (name, found)
    return result


def open_media(path: Path, player: str = 'default') -> None:
    if not available():
        raise ValueError('此部署请使用网络播放地址或 M3U 播放列表')
    path = normalized_path(path)
    if not path.is_file() or path.suffix.lower() not in {
        '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.ts', '.mts', '.m2ts',
        '.mpg', '.mpeg', '.vob', '.iso', '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus',
    }:
        raise ValueError('此文件请使用网络播放地址或 M3U 播放列表')
    chosen = installed().get(player) if player != 'default' else None
    if player != 'default' and chosen is None:
        raise ValueError('播放器未安装，请重新选择')
    if sys.platform == 'darwin':
        command = ['/usr/bin/open']
        if chosen:
            command.extend(['-a', chosen[1]])
        subprocess.run([*command, str(path)], check=True, timeout=10, capture_output=True)
    elif chosen:
        subprocess.Popen([chosen[1], str(path)], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         cwd=str(Path(chosen[1]).parent))
    else:
        os.startfile(str(path), 'open')
