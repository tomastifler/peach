"""个人实体与在线标签收藏的规范身份和只读快照。"""
from .entities import resolve_entity, resolve_entity_id
from .profiles import read_settings
from .online_tag_management import OnlineTagPolicy

KEY = "libraryShortcuts"
KINDS = frozenset({"performer", "creator", "studio", "series", "agency", "tag"})


def favorite_entry(connection, entry, online_policy=None):
    """将实体或在线标签选择解析为当前规范身份。"""
    if not isinstance(entry, dict):
        return None
    if entry.get('scope') == 'online':
        tag_id, name = entry.get('tag_id'), entry.get('name')
        if entry.get('kind') != 'tag' or not isinstance(tag_id, str) or not 0 < len(tag_id) <= 1000 or not isinstance(name, str) or not 0 < len(name) <= 1000:
            return None
        policy = online_policy or OnlineTagPolicy(connection)
        canonical, label, _hidden = policy.identity(tag_id)
        return {'key': 'online-tag:' + canonical, 'kind': 'tag', 'scope': 'online',
                'tag_id': canonical, 'name': label if canonical in policy.groups else name}
    if entry.get("kind") == "tag" and not entry.get("entity_id"):
        tag = entry.get("name")
        if isinstance(tag, str) and 0 < len(tag.strip()) <= 120:
            entity = resolve_entity(connection, "tag", tag.strip())
            if entity:
                return favorite_entry(connection, {"entity_id": entity["id"]})
        return None
    value = entry.get("entity_id")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    resolved = resolve_entity_id(connection, value)
    row = connection.execute("SELECT id,kind,canonical_name FROM entity WHERE id=?", (resolved,)).fetchone() if resolved else None
    if row is None or row[1] not in KINDS:
        return None
    return {"key": "entity:" + str(row[0]), "entity_id": row[0], "kind": row[1], "name": row[2]}


def favorite_entries(connection, settings=None):
    """读取有界收藏清单并折叠规范身份相同的条目。"""
    settings = read_settings(connection) if settings is None else settings
    stored = settings.get(KEY)
    stored = stored if isinstance(stored, dict) else {}
    raw = stored.get("favorites", [])
    favorites = {}
    policy = OnlineTagPolicy(connection)
    for item in (raw if isinstance(raw, list) else [])[:1000]:
        current = favorite_entry(connection, item, policy)
        if current:
            favorites[current["key"]] = current
    return list(favorites.values())


def favorite_entities(connection, settings=None):
    """读取已解析为馆藏实体的收藏，供实体标注和馆藏研究使用。"""
    return [row for row in favorite_entries(connection, settings) if 'entity_id' in row]


def online_tag_ids(connection):
    """在线收藏以归类后的稳定来源词键匹配。"""
    return {row['tag_id'] for row in favorite_entries(connection) if row.get('scope') == 'online'}
