"""随应用提供的浏览器品牌标识与来源记录。"""
import json
from functools import lru_cache

from .settings_file import PROJECT_ROOT

ROOT = PROJECT_ROOT / 'resources' / 'browser-icons'


@lru_cache(maxsize=1)
def catalog():
    return {entry['id']: entry for entry in json.loads(
        (ROOT / 'manifest.json').read_text(encoding='utf-8'))['icons']}


def resolve(key):
    entry = catalog().get(key)
    return (ROOT / entry['file'], entry['content_type']) if entry else None
