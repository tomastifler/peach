"""按字段归属和同番号来源证据补修已损坏的机器文字。"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from .field_owners import auto_owner, owner_of
from . import artifact_rules, upgrade_rules
from .javdb_identity import current_evidence
from .metadata import extract_peach_fields, identifies_code, source_text_is_valid, validate_provider_code
from .metadata_auto_apply import _apply_metadata_candidate, metadata_auto_apply_candidate
from .metadata_policy import SOURCE_SPECS

FIELDS = {'title': 'catalog_title', 'original_title': 'original_title',
          'studio': 'studio', 'series': 'series'}


def _damaged_snapshots(connection, root: Path) -> tuple[list[dict], list[int]]:
    """失效损坏文字或旧 JavDB 绑定快照，保留原文并选择对应资产重采。"""
    snapshots, affected = [], []
    for path in root.glob('*.json'):
        code, separator, source = path.stem.rpartition('-')
        if not separator or source not in SOURCE_SPECS or path.is_symlink():
            continue
        try:
            code = validate_provider_code(code)
            before = artifact_rules.fingerprint(path)
            payload = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(payload, dict) or (source_text_is_valid(payload)
                and (source != 'javdb' or current_evidence(payload))):
            continue
        snapshots.append({'path': str(path), 'fingerprint': before})
        affected.extend(row[0] for row in connection.execute(
            "SELECT id FROM asset WHERE code=? AND medium='video' AND disposal IS NULL", (code,)))
    return snapshots, affected


def _invalidate_snapshots(snapshots: list[dict]) -> int:
    count = 0
    for item in snapshots:
        path = Path(item['path'])
        try:
            if artifact_rules.fingerprint(path) != item['fingerprint']:
                continue
            artifact_rules.remember(path, f'invalid:provider-text-{upgrade_rules.PROVIDER_TEXT}')
            count += 1
        except FileNotFoundError:
            continue
    return count


def _candidates(root: Path, code: str, field: str) -> list[dict]:
    candidates = []
    for source in SOURCE_SPECS:
        path = root / f'{code}-{source}.json'
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            continue
        except (ValueError, UnicodeError):
            continue
        if (not isinstance(payload, dict) or not identifies_code(code, payload)
                or source == 'javdb' and not current_evidence(payload)):
            continue
        value = extract_peach_fields(payload).get(field)
        if not value:
            continue
        key = hashlib.sha256(json.dumps([source, value['value']], ensure_ascii=False,
                                       sort_keys=True).encode()).hexdigest()
        candidate = {**value, 'candidate_key': key, 'source': source,
                     'provider_id': payload.get('id'), 'content_id': payload.get('content_id'),
                     'source_url': payload.get('source_url'), 'raw_snapshot': str(path),
                     'confidence': .75}
        if source == 'javdb':
            candidate.update(javdb_rule=payload['javdb_rule'], source_id=payload.get('source_id'))
        candidates.append(candidate)
    return candidates


def collect(connection, snapshots: Path) -> dict:
    """选中损坏文字与失效来源快照的资产；人物规范名保留给复核。"""
    marker = '\ufffd'
    tests = ' OR '.join(f'instr(COALESCE(a.{column},\'\'),?)>0' for column in FIELDS.values())
    assets = connection.execute(
        f"SELECT a.* FROM asset a WHERE a.medium='video' AND a.disposal IS NULL AND ({tests} "
        "OR EXISTS(SELECT 1 FROM asset_entity ae JOIN entity e ON e.id=ae.entity_id "
        "WHERE ae.asset_id=a.id AND ae.source LIKE 'javinizer:%' AND instr(e.canonical_name,?)>0))",
        [marker] * (len(FIELDS) + 1)).fetchall()
    rows, affected = [], []
    for asset in assets:
        try:
            code = validate_provider_code(str(asset['code'] or ''))
        except ValueError:
            continue
        selected = False
        for field, column in FIELDS.items():
            current, owner = asset[column] or '', owner_of(asset['field_owners'], column)
            if marker not in current or not owner.startswith('auto:') or owner[5:] not in SOURCE_SPECS:
                continue
            selected = True
            group = {'item_key': f'asset:{asset["id"]}:{field}', 'asset_id': asset['id'],
                     'asset_path': asset['path'], 'field': field, 'code': code,
                     'current_value': current, 'candidates': _candidates(snapshots, code, field)}
            candidate = metadata_auto_apply_candidate(connection, group)
            rows.append({'asset_id': asset['id'], 'field': field, 'column': column,
                         'current': current, 'owner': owner, 'group': group,
                         'candidate': candidate, 'action': 'replace' if candidate else 'review'})
        damaged_roles = connection.execute(
            "SELECT ae.role,e.id FROM asset_entity ae JOIN entity e ON e.id=ae.entity_id "
            "WHERE ae.asset_id=? AND ae.source LIKE 'javinizer:%' AND instr(e.canonical_name,?)>0",
            (asset['id'], marker)).fetchall()
        if selected or damaged_roles:
            affected.append(asset['id'])
        for role, entity_id in damaged_roles:
            rows.append({'asset_id':asset['id'], 'field':role, 'entity_id':entity_id,
                         'action':'review', 'reason':'entity-identity-requires-review'})
    invalid_snapshots, snapshot_assets = _damaged_snapshots(connection, snapshots)
    return {'rows':rows, 'asset_ids':sorted(set(affected + snapshot_assets)), 'snapshots':invalid_snapshots}


def apply(connection, plan: dict) -> dict:
    changed = 0
    stamp = datetime.now(timezone.utc).isoformat()
    for row in plan['rows']:
        if row['action'] != 'replace':
            continue
        current = connection.execute(
            f'SELECT {row["column"]},field_owners FROM asset WHERE id=?', (row['asset_id'],)).fetchone()
        if (current is None or current[0] != row['current']
                or owner_of(current[1], row['column']) != row['owner']):
            continue
        candidate = row['candidate']
        changed += bool(_apply_metadata_candidate(connection, row['group'], candidate, stamp,
                                                 auto_owner(candidate['source'])))
    return {'text_fields':changed, 'text_review':sum(r['action']=='review' for r in plan['rows']),
            'text_snapshots_invalidated':_invalidate_snapshots(plan.get('snapshots', []))}
