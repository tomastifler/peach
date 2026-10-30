"""媒体库按持久身份分组，来源与挂载归存储根目录。"""
from . import media_identity

LIBRARY_ICONS = frozenset({"hard-drive", "database", "heart", "star", "tags", "115", "pikpak",
                         "heart-hand", "flame", "cherry", "gem", "crown", "shirt", "footprints",
                         "flower", "venetian-mask", "hand", "bed-double", "moon", "sparkles", "camera", "video",
                         "lollipop", "candy", "banana", "droplets", "venus", "mars", "venus-and-mars",
                         "ribbon", "graduation-cap", "stethoscope", "glasses", "rabbit", "paw-print", "dumbbell",
                         "bath", "key-round", "wine", "cigarette", "film", "image", "gamepad-2"})


def libraries(config):
    catalog, stored = media_identity.catalog(config)
    groups = {}
    for root_id, root in stored.items():
        groups.setdefault(root["library_id"], []).append({**root, "root_id": root_id})
    return [{"id": key, "name": catalog[key]["name"], "roots": roots,
             "icon": catalog[key].get("icon") if catalog[key].get("icon") in LIBRARY_ICONS else (
                 roots[0]["location"] if len({item["location"] for item in roots}) == 1 else "database"),
             "color": catalog[key].get("color", ""), "policy": catalog[key].get("policy", "") or "auto",
             "stages": sorted(media_identity.library_stages(catalog[key]), key=media_identity.STAGES.index)}
            for key, roots in groups.items()]


def predicate(config, library):
    """路径边界精确匹配；未知库返回空集。"""
    from .media_folders import path_predicate
    roots = next((row["roots"] for row in libraries(config) if row["id"] == library), [])
    terms, params = [], []
    for item in roots:
        clause, values = path_predicate(item["location"], item["root"])
        terms.append(clause)
        params.extend(values)
    return "(" + " OR ".join(terms) + ")" if terms else "0", params
