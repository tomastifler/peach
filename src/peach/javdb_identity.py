"""JavDB evidence version of the original title and same-code source identity."""
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
    """Isolate only old code identity and work details; resource caches with an explicit source ID continue to be reused."""
    return f'javdb-{RULE}:{key}' if key.startswith(('movie-id:', 'movie:')) else key
