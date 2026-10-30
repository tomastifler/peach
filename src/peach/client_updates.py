"""浏览器与用户脚本的本机版本快照；读取不触发外部更新检查。"""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

from . import __version__, release_updates
from .buildinfo import frozen_build
from .config import PROJECT_ROOT


def runtime_identity() -> dict:
    paths = list(sorted(Path(__file__).parent.glob('*.py')))
    paths += sorted((PROJECT_ROOT / 'web/dist').glob('*'))
    signature = tuple((str(path), path.stat().st_mtime_ns, path.stat().st_size)
                      for path in paths if path.is_file())
    return _identity(signature)


@lru_cache(maxsize=1)
def _identity(signature) -> dict:
    digest = hashlib.sha256(__version__.encode())
    build = frozen_build()
    if build is not None:
        digest.update(str(build).encode())
    for name, _, _ in signature:
        path = Path(name)
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return {'version': __version__, 'build_id': digest.hexdigest()[:24]}


def userscript_release() -> dict:
    data = json.loads((PROJECT_ROOT / 'web/integrations/jav-userscript-release.json').read_text(encoding='utf-8'))
    return {'version': data['version'], 'minimum_version': data.get('bridge_min_version', data['version']),
            'install_url': data.get('install_url', '/integrations/peach-jav.user.js'),
            'release_url': 'https://sleazyfork.org/zh-CN/scripts/600821'}


def snapshot(automatic=None) -> dict:
    saved = automatic.snapshot().get('result') if automatic is not None else None
    return {'runtime': runtime_identity(), 'release': saved or release_updates.snapshot(),
            'userscript': userscript_release()}
