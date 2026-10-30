"""Rules and source signatures for derived files; original images, media and manual selections are not subject to purging."""
import json
from pathlib import Path

from .fsutil import atomic_write_text
from .upgrade_rules import PREVIEWS


def fingerprint(source) -> dict:
    """Records source identity and file generation without reading the original image or media body."""
    info = source.stat()
    local = isinstance(source, Path)
    return {'kind': 'file' if local else 'resource',
            'path': str(source.absolute()) if local else str(source),
            'identity': '' if local else str(getattr(source, 'uri', source)),
            **{key: int(getattr(info, key, 0)) for key in
               ('st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_ino', 'st_dev')}}


def current(path: Path, rule: str = PREVIEWS, *, source=None, source_required: bool = False,
            allow_unavailable_source: bool = False, check_source: bool = True) -> bool:
    try:
        if not path.is_file():
            return False
        saved = Path(str(path) + '.rule').read_text(encoding='utf-8')
        if source is None and saved == rule:
            return not source_required
        record = json.loads(saved)
        if not isinstance(record, dict) or record.get('rule') != rule:
            return False
        expected = record.get('source')
        if not isinstance(expected, dict):
            return False
        if record.get('artifact') != fingerprint(path):
            return False
        if not check_source:
            return True
        if source is None:
            if expected.get('kind') != 'file' or not isinstance(expected.get('path'), str):
                return False
            source = Path(expected['path'])
        try:
            return expected == fingerprint(source)
        except OSError:
            return allow_unavailable_source
    except (OSError, ValueError, TypeError):
        return False


def remember(path: Path, rule: str = PREVIEWS, *, source=None, source_fingerprint=None) -> bool:
    """Register only if the source generation still matches the pre-generation record, so an old image is not mistaken for a new source's output."""
    if source is None:
        atomic_write_text(Path(str(path) + '.rule'), rule)
        return True
    expected = source_fingerprint if source_fingerprint is not None else fingerprint(source)
    if expected != fingerprint(source):
        return False
    atomic_write_text(Path(str(path) + '.rule'), json.dumps(
        {'rule': rule, 'source': expected, 'artifact': fingerprint(path)}, ensure_ascii=False))
    return True
