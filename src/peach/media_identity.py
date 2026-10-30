"""Persistent identity of media libraries and storage roots; the path table is a compatibility projection."""
from __future__ import annotations

import re
from dataclasses import replace
from pathlib import PureWindowsPath, PurePosixPath
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

#: Media library processing mode (ADR-0116). `auto` is the default and is not written in the configuration; `custom` stores the chosen steps separately.
POLICIES = ("auto", "local", "custom")
#: Processing steps: read video info, fetch metadata online, fetch covers online, fetch people images online, generate contact-sheet previews.
STAGES = ("probe", "metadata", "cover", "people", "preview")
_LOCAL_STAGES = frozenset({"probe", "preview"})
#: The source color takes the key name of the UI accent color; the UI resolves the actual color value by key name, and only the spelling is validated here.
_COLOR = re.compile(r"[a-z]{2,16}")


def path_key(path):
    return str(PureWindowsPath(path)).casefold()


def library_stages(library):
    """The steps a media library performs when processing. Automatic does everything, local-only uses only local metadata without going online, and custom follows the selection."""
    policy = library.get("policy") or "auto"
    if policy == "local":
        return _LOCAL_STAGES
    if policy == "custom":
        return frozenset(stage for stage in library.get("stages", "").split(",") if stage in STAGES)
    return frozenset(STAGES)


def stages_by_root(config):
    """`{normalized ledger prefix: allowed steps}`, the processing flow looks up by the root directory the work path belongs to."""
    libraries, roots = catalog(config)
    return {path_key(value["root"]): library_stages(libraries.get(value["library_id"], {}))
            for value in roots.values()}


def _legacy_value(mapping, root, default=""):
    return next((value for key, value in mapping.items() if path_key(key) == path_key(root)), default)


def catalog(config):
    """An existing identity is read directly; path configuration goes through a deterministic upgrade by same-name grouping."""
    if getattr(config, "storage_roots", None):
        return (dict(getattr(config, "library_catalog", {})),
                {key: dict(value) for key, value in config.storage_roots.items()})
    from .media_libraries import LIBRARY_ICONS
    groups, roots, libraries = {}, {}, {}
    for location, paths in config.locations.items():
        mounts = getattr(config, "mounts", {}).get(location, ())
        for index, path in enumerate(paths):
            root = str(path)
            name = _legacy_value(getattr(config, "library_names", {}), root) or PureWindowsPath(root).name or root
            groups.setdefault(name, []).append(root)
            root_id = str(uuid5(NAMESPACE_URL, "peach:storage-root:" + path_key(root)))
            roots[root_id] = dict(root=root, location=location,
                                  mount=str(mounts[index]) if index < len(mounts) else "",
                                  cost=_legacy_value(getattr(config, "media_costs", {}), root),
                                  library_id="")
    for name, paths in groups.items():
        library_id = str(uuid5(NAMESPACE_URL, "peach:library:" + "\0".join(sorted(path_key(p) for p in paths))))
        icon = next((_legacy_value(getattr(config, "library_icons", {}), p) for p in paths
                     if _legacy_value(getattr(config, "library_icons", {}), p)), "")
        libraries[library_id] = dict(name=name, icon=icon if icon in LIBRARY_ICONS else "")
        for value in roots.values():
            if value["root"] in paths:
                value["library_id"] = library_id
    return libraries, roots


def project(config, libraries=None, roots=None):
    """Generate scan, mount, name and cost compatibility projections from root directory identity."""
    if libraries is None:
        libraries, roots = catalog(config)
    locations, mounts, names, icons, costs = {}, {}, {}, {}, {}
    for value in roots.values():
        root, location = value["root"], value["location"]
        library = libraries[value["library_id"]]
        locations.setdefault(location, []).append(root)
        mounts.setdefault(location, []).append(value.get("mount", ""))
        names[root] = library["name"]
        if library.get("icon"):
            icons[root] = library["icon"]
        if value.get("cost"):
            costs[root] = value["cost"]
    return replace(config, library_catalog=libraries, storage_roots=roots,
                   locations={key: tuple(values) for key, values in locations.items()},
                   mounts={key: tuple(values) for key, values in mounts.items() if any(values)},
                   library_names=names, library_icons=icons, media_costs=costs)


def overlaps(first, second):
    """Two directories are the same or one contains the other."""
    return first == second or first.is_relative_to(second) or second.is_relative_to(first)


def _validate_library(value):
    """A media library name is 1 to 80 visible characters, and the icon is empty or from the built-in list."""
    from .media_libraries import LIBRARY_ICONS
    name = value.get("name", "")
    if not isinstance(name, str) or not name.strip() or len(name) > 80 or any(ord(c) < 32 for c in name):
        raise ValueError("Media library name must be 1 to 80 visible characters")
    if value.get("icon", "") not in ("", *LIBRARY_ICONS):
        raise ValueError("Please choose a media library icon from the list")
    color = value.get("color", "")
    if color and not _COLOR.fullmatch(color):
        raise ValueError("Please choose a source color from the list")
    policy = value.get("policy", "")
    if policy not in ("", *POLICIES):
        raise ValueError("Please choose a processing mode from the list")
    stages = [stage for stage in value.get("stages", "").split(",") if stage]
    if any(stage not in STAGES for stage in stages) or (stages and policy != "custom"):
        raise ValueError("Invalid processing steps")


def validate_catalog(libraries, roots):
    """Reject corrupt identities, dangling ownership and cross-library overlap."""
    from .platform import is_windows_path
    seen, mounted = [], []
    for key, value in libraries.items():
        UUID(key)
        _validate_library(value)
    for key, value in roots.items():
        UUID(key)
        if value.get("library_id") not in libraries:
            raise ValueError("The media library of the storage root does not exist")
        path = PureWindowsPath(value.get("root", ""))
        if not is_windows_path(str(path)) or not path.is_absolute() or ".." in path.parts:
            raise ValueError("Storage root must use a full Windows path")
        if not value.get("location") or value.get("cost", "") not in ("", "free", "metered"):
            raise ValueError("The storage root's source or read policy is invalid")
        if any(overlaps(path, other) for other in seen):
            raise ValueError("Media path duplicates or contains/is contained by another folder")
        seen.append(path)
        mount = value.get("mount", "")
        actual = (PureWindowsPath(mount) if len(mount) > 1 and mount[1] == ":" else PurePosixPath(mount)) if mount else path
        from .smb_media import canonical
        smb = value.get('transport') == 'smb'
        if value.get('transport', 'filesystem') not in {'filesystem', 'smb'}:
            raise ValueError('Invalid media connection method')
        if smb:
            canonical(mount)
        if not smb and (not actual.is_absolute() or ".." in actual.parts):
            raise ValueError("Mount directory must use a full path")
        if any(overlaps(actual, other) for other in mounted):
            raise ValueError("Media directory duplicates or contains/is contained by another row")
        mounted.append(actual)
    for index, actual in enumerate(mounted):
        if isinstance(actual, PureWindowsPath) and any(
                (index != other_index or actual != other) and overlaps(actual, other)
                for other_index, other in enumerate(seen)):
            raise ValueError("Mount directory overlaps with the ledger path; please use a separate directory")


def _match_root(row, root, previous, by_path, *, windows):
    """A form row recognizes an existing root: an explicit root_id takes priority, otherwise match by the ledger prefix of the same source; the recognized root has its source, prefix and relocation intent checked."""
    path = row["path"]
    supplied = str(row.get("root_id") or "")
    if supplied and supplied not in previous:
        raise ValueError("Storage root has changed; please refresh the configuration")
    matched = by_path.get(path_key(root))
    # Recognize a root of the same source by path only; the same prefix under a different source is another directory declaration and takes a new identity.
    if matched and previous[matched]["location"] != row["location"]:
        matched = None
    old = previous.get(supplied or matched or "")
    if old:
        if row["location"] != old["location"] or path_key(root) != path_key(old["root"]):
            raise ValueError("The source and ledger path of an existing root cannot be changed; please add another directory")
        old_path = old.get("mount") or (root if windows else "")
        equal = path_key(path) == path_key(old_path) if windows else path == old_path
        # A root that had no actual directory getting one filled in for the first time does not count as relocation.
        if old_path and not equal and row.get("change_mode") != "relocate":
            raise ValueError("Please choose to relocate this directory, or add another directory")
    return supplied or matched or str(uuid4()), old


def _library_value(row, known, name):
    """Fields at the media library level in a form row. Source color and processing mode are written to the configuration only when set; items the form does not carry keep their saved values."""
    value = dict(name=name, icon=str(row.get("library_icon", known.get("icon", ""))))
    color = str(row.get("library_color", known.get("color", "")))
    policy = str(row.get("library_policy", known.get("policy", "")))
    if color:
        value["color"] = color
    if policy and policy != "auto":
        value["policy"] = policy
    if policy == "custom":
        chosen = str(row.get("library_stages", known.get("stages", ""))).split(",")
        if any(stage and stage not in STAGES for stage in chosen):
            raise ValueError("Invalid processing steps")
        value["stages"] = ",".join(stage for stage in STAGES if stage in chosen)
    return value


def configure_sources(config, sources, *, windows):
    """Update roots and media libraries; the source and ledger prefix of an existing root stay stable."""
    from .media_sources import cost_for
    libraries, previous = catalog(config)
    libraries = {key: dict(value) for key, value in libraries.items()}
    by_path = {path_key(value["root"]): key for key, value in previous.items()}
    roots, declared_libraries = {}, {}
    for row in sources:
        path = row["path"]
        root = str(PureWindowsPath(row.get("root") or path))
        root_id, old = _match_root(row, root, previous, by_path, windows=windows)
        if root_id in roots:
            raise ValueError("The same storage root cannot be registered more than once")
        library_id = str(row.get("library_id") or (old or {}).get("library_id") or uuid4())
        UUID(library_id)
        name = str(row.get("library") or libraries.get(library_id, {}).get("name") or PureWindowsPath(root).name or root).strip()
        value = _library_value(row, libraries.get(library_id, {}), name)
        if library_id in declared_libraries and declared_libraries[library_id] != value:
            raise ValueError("The name, icon, source color and processing mode of the same media library must be consistent")
        declared_libraries[library_id] = value
        libraries[library_id] = value
        roots[root_id] = dict(root=root, location=row["location"], library_id=library_id,
                              mount=path if not windows or path_key(path) != path_key(root) else "",
                              cost=row.get("cost") or cost_for(row["location"], root, config))
        from .smb_media import is_address
        if is_address(path):
            roots[root_id]['transport'] = 'smb'
    # Extension connectors that are not in the form's source list are still maintained by their dedicated settings.
    from .media_sources import SOURCE_OPTIONS
    roots.update({key: value for key, value in previous.items() if value["location"] not in dict(SOURCE_OPTIONS)})
    libraries = {key: value for key, value in libraries.items() if any(root["library_id"] == key for root in roots.values())}
    validate_catalog(libraries, roots)
    return project(config, libraries, roots)


def sources_for_paths(config, paths, *, windows, keep_other_sources=False):
    """Path-style settings entry points map back to the root identity by the saved actual directory."""
    from . import media_configuration
    existing = media_configuration.rows(config, windows=windows)
    sources = [dict(row) for row in existing if row["location"] != "local"] if keep_other_sources else []
    for path in paths:
        text = str(path)
        key = path_key(text) if windows else text
        match = next((row for row in existing if row["location"] == "local" and
                      (path_key(row["path"]) if windows else row["path"]) == key), None)
        sources.append(dict(match) if match else {"location": "local", "path": text})
    return media_configuration.prepare_sources(sources, windows=windows, config=config)


def ownership(config, path):
    """Reuse platform path ownership to project ledger paths into stable root directory and media library identities."""
    from .platform import resolve_root
    location, index, _tail = resolve_root(path, config.locations)
    if location is None:
        return {}
    root = config.locations[location][index]
    _libraries, roots = catalog(config)
    return next((dict(root_id=key, library_id=value["library_id"]) for key, value in roots.items()
                 if path_key(value["root"]) == path_key(root)), {})
