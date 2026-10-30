"""演示库的固定在线资料缓存，供离线采集与浏览器验收共用。"""
import hashlib
import json
from pathlib import Path

from peach.library_nfo import read_nfo
from peach.metadata_routes import route_for_code
from peach import artifact_rules, upgrade_rules
from peach.javdb_identity import RULE


def seed_metadata_cache(media: Path, sources: Path) -> None:
    """演示 NFO 的同一份固定资料作为来源快照，不访问网络。"""
    target = sources / 'library-metadata'
    target.mkdir(parents=True, exist_ok=True)
    for path in media.rglob('*.nfo'):
        payload, _ = read_nfo(path)
        code = payload.get('id')
        if not code:
            continue
        for source in route_for_code(code):
            snapshot = target / f'{code}-{source}.json'
            evidence = ({**payload, 'javdb_rule': RULE,
                         'source_id': 'Demo' + hashlib.sha256(code.encode()).hexdigest()[:12]}
                        if source == 'javdb' else payload)
            snapshot.write_text(
                json.dumps(evidence, ensure_ascii=False), encoding='utf-8')
            artifact_rules.remember(snapshot, str(upgrade_rules.PROVIDER_EVIDENCE))
