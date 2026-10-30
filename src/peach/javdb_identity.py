"""JavDB 原题与同番号来源身份的证据版本。"""
from __future__ import annotations

import re

RULE = 2


def current_evidence(payload: object) -> bool:
    return (isinstance(payload, dict) and type(payload.get('javdb_rule')) is int
            and payload['javdb_rule'] == RULE)


def current_candidate(payload: object) -> bool:
    return (current_evidence(payload) and isinstance(payload.get('source_id'), str)
            and re.fullmatch(r'[A-Za-z0-9]+', payload['source_id']) is not None)


def cache_key(key: str) -> str:
    """只隔离旧的番号身份与作品详情，明确来源ID的资源缓存继续复用。"""
    return f'javdb-{RULE}:{key}' if key.startswith(('movie-id:', 'movie:')) else key
