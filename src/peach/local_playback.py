"""Open authorized media through the system file association or an installed player."""
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
    """Fixed player list; paths come only from the system and known install directories."""
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
        raise ValueError('For this deployment, use the network playback URL or an M3U playlist')
    path = normalized_path(path)
    if not path.is_file() or path.suffix.lower() not in {
        '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.ts', '.mts', '.m2ts',
        '.mpg', '.mpeg', '.vob', '.iso', '.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus',
    }:
        raise ValueError('For this file, use the network playback URL or an M3U playlist')
    chosen = installed().get(player) if player != 'default' else None
    if player != 'default' and chosen is None:
        raise ValueError('Player not installed; please choose again')
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
