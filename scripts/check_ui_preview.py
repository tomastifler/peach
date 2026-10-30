"""核验用户验收预览的数据清单、真实记录来源与独立缓存。"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

FACTS = {
    'asset': ('id', 'location', 'path', 'name', 'medium', 'code', 'catalog_title',
              'original_title', 'creator', 'studio', 'series', 'release_date'),
    'entity': ('id', 'kind', 'canonical_name', 'normalized_name'),
}
RELATION = ('asset_id', 'entity_id', 'role', 'source')
IMAGE_SUFFIXES = {'.img', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'}
SOURCE_IMAGE_FOLDERS = {'avatars', 'covers', 'posters', 'logos', 'studio-logos',
                        'link-marks', 'site-marks', 'photo-thumbs'}


def readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)


def source_rows(connection, table: str, columns: tuple[str, ...], ids: list[int]) -> list[tuple]:
    rows = []
    key = 'asset_id' if table == 'asset_entity' else 'id'
    for offset in range(0, len(ids), 500):
        chunk = ids[offset:offset + 500]
        marks = ','.join('?' for _ in chunk)
        rows.extend(connection.execute(
            f"SELECT {','.join(columns)} FROM {table} WHERE {key} IN ({marks})", chunk))
    return rows


def verify_image_cache(source_data: Path, sample_data: Path) -> int:
    """核对独立样本的缓存原图及其字节来源，返回已核验数量。"""
    cached = 0
    for path in (sample_data / 'generated').rglob('*'):
        if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        relative = path.relative_to(sample_data)
        # 头像与封面的响应式缩略图由应用从已核验的缓存原图派生。
        if relative.parts[1] not in SOURCE_IMAGE_FOLDERS:
            continue
        original = source_data / relative
        if not original.is_file():
            raise ValueError(f'图像缓存来源未取得：{relative}')
        if hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(original.read_bytes()).digest():
            raise ValueError(f'图像缓存与原数据不一致：{relative}')
        cached += 1
    if not cached:
        raise ValueError('真实样本图像缓存未取得；不能作为图像界面验收预览')
    return cached


def verify_sample(source_data: Path, sample_data: Path) -> dict:
    source_data, sample_data = source_data.resolve(), sample_data.resolve()
    if (source_data == sample_data or source_data in sample_data.parents
            or sample_data in source_data.parents):
        raise ValueError('预览副本必须独立于原数据根')
    source_db, sample_db = source_data / 'database/ledger.db', sample_data / 'database/ledger.db'
    manifest_file = sample_data / 'sample-manifest.json'
    if not manifest_file.is_file():
        raise ValueError('真实样本来源清单未取得；不能作为用户验收预览')
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    if not isinstance(manifest, dict) or not manifest.get('source'):
        raise ValueError('真实样本来源清单缺少原账本路径')
    if Path(manifest['source']).resolve() != source_db.resolve():
        raise ValueError('清单与指定原账本不一致')
    verified, values, asset_ids = {}, {}, []
    with closing(readonly(source_db)) as source, closing(readonly(sample_db)) as sample:
        for table, columns in FACTS.items():
            rows = list(sample.execute(f"SELECT {','.join(columns)} FROM {table} ORDER BY id"))
            if not rows:
                raise ValueError(f'真实样本缺少 {table} 记录')
            originals = {row[0]:row for row in source_rows(source, table, columns, [row[0] for row in rows])}
            for row in rows:
                original = originals.get(row[0])
                if original is None:
                    raise ValueError(f'{table} {row[0]} 的原始记录未取得')
                changed = [column for column, value, expected in zip(columns, row, original) if value != expected]
                if changed:
                    raise ValueError(f'{table} {row[0]} 与原账本不一致：{", ".join(changed)}')
            verified[table], values[table] = len(rows), rows
            if table == 'asset':
                asset_ids = [row[0] for row in rows]
        relations = list(sample.execute(f"SELECT {','.join(RELATION)} FROM asset_entity ORDER BY asset_id,entity_id,role,source"))
        originals = set(source_rows(source, 'asset_entity', RELATION, asset_ids))
        if any(row not in originals for row in relations):
            raise ValueError('样本存在原账本未取得的作品实体关联')
        verified['asset_entity'], values['asset_entity'] = len(relations), relations
        declared = manifest.get('counts', {})
        if not isinstance(declared, dict):
            raise ValueError('来源清单缺少有效计数')
        if any(declared.get(table) != count for table, count in verified.items()):
            raise ValueError('来源清单计数与实际样本不一致')
    cached = verify_image_cache(source_data, sample_data)
    digest = hashlib.sha256(json.dumps(values, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
    return {'ok':True, 'kind':'real-ledger-subset', 'source':str(source_db),
            'sample':str(sample_db), 'counts':verified, 'cached_images':cached,
            'sample_digest':digest, 'verified_at':datetime.now(timezone.utc).isoformat()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-data', type=Path, required=True)
    parser.add_argument('--sample-data', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        report = verify_sample(args.source_data, args.sample_data)
    except (ValueError, OSError, sqlite3.Error) as error:
        print(json.dumps({'ok':False, 'error':str(error)}, ensure_ascii=False))
        return 2
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + '\n', encoding='utf-8')
    print(text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
