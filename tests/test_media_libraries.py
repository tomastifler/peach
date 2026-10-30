"""媒体库分组、路径边界与配置往返。"""
import sqlite3
import tomllib
import unittest
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from peach import media_configuration, media_identity, media_libraries, settings_file


class MediaLibraryTests(unittest.TestCase):
    def config(self):
        return SimpleNamespace(locations={"local": ("R:\\Media", "S:\\Other")},
                               library_names={"R:\\Media": "电影", "S:\\Other": "电影"})

    def test_named_roots_share_one_library(self):
        rows = media_libraries.libraries(self.config())
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]["roots"]), 2)

    def test_library_icons_follow_source_or_explicit_selection(self):
        config = self.config()
        config.locations = {"pikpak": ("A:\\",)}
        self.assertEqual(media_libraries.libraries(config)[0]["icon"], "pikpak")
        config.library_icons = {"A:\\": "heart"}
        self.assertEqual(media_libraries.libraries(config)[0]["icon"], "heart")
        config.library_icons = {"A:\\": "<script>"}
        self.assertEqual(media_libraries.libraries(config)[0]["icon"], "pikpak")

    def test_filter_observes_source_and_directory_boundary(self):
        with sqlite3.connect(":memory:") as db:
            db.execute("CREATE TABLE asset (location TEXT, path TEXT)")
            db.executemany("INSERT INTO asset VALUES (?,?)", [
                ("local", "r:\\media\\one.mp4"), ("local", "R:\\MediaExtra\\two.mp4"),
                ("online", "R:\\Media\\three.mp4"), ("local", "s:/Other/four.mp4")])
            clause, args = media_libraries.predicate(self.config(), media_libraries.libraries(self.config())[0]["id"])
            self.assertEqual(db.execute("SELECT count(*) FROM asset a WHERE " + clause, args).fetchone()[0], 2)
            clause, args = media_libraries.predicate(self.config(), "不存在")
            self.assertEqual(db.execute("SELECT count(*) FROM asset a WHERE " + clause, args).fetchone()[0], 0)

    def test_library_names_round_trip_toml(self):
        root, name = "R:\\Media", '电影 "精选"'
        line = f"{settings_file._render_value(root)} = {settings_file._render_value(name)}"
        self.assertEqual(tomllib.loads(line), {root: name})
        with TemporaryDirectory() as directory:
            config = settings_file.load_config(environ={"PEACH_DATA_ROOT": directory})
            config = replace(config, locations={"local": (root,)}, library_names={root: name}, library_icons={root: "star"})
            config.path.parent.mkdir(parents=True, exist_ok=True)
            config.path.write_text(settings_file.render(config), encoding="utf-8")
            loaded = settings_file.load_config(environ={"PEACH_DATA_ROOT": directory})
            self.assertEqual(loaded.library_names, {root: name})
            self.assertEqual(loaded.library_icons, {root: "star"})


class MediaIdentityTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.env = {"PEACH_DATA_ROOT": str(self.root)}
        self.path = self.root / "config.toml"
        self.path.write_text("[media.locations]\nlocal = ['D:\\JAV', 'E:\\收藏\\JAV']\n"
                             "[media.libraries]\n'D:\\JAV' = 'JAV'\n'E:\\收藏\\JAV' = 'JAV'\n", encoding="utf-8")
        self.config = settings_file.load_config(environ=self.env)

    def test_upgrade_preserves_group_and_persists_ids_without_opening_ledger(self):
        original = self.path.read_bytes()
        projected = settings_file.upgrade_media_identity(self.config)
        self.assertEqual(self.path.read_bytes(), original)
        group = media_libraries.libraries(projected)
        self.assertEqual((len(group), len(group[0]["roots"])), (1, 2))
        settings_file.upgrade_media_identity(self.config, apply=True)
        loaded = settings_file.load_config(environ=self.env)
        self.assertEqual(loaded.storage_roots, projected.storage_roots)
        self.assertEqual(self.path.with_suffix(".pre-media-identity.toml").read_bytes(), original)
        before = self.path.read_bytes()
        settings_file.upgrade_media_identity(loaded, apply=True)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse((self.root / "database").exists())

    def test_first_save_with_ids_keeps_the_pre_identity_file_once(self):
        original = self.path.read_bytes()
        backup = self.path.with_suffix(".pre-media-identity.toml")
        settings_file.write(self.config, force=True)
        self.assertEqual(backup.read_bytes(), original)
        loaded = settings_file.load_config(environ=self.env)
        self.assertTrue(loaded.storage_roots)
        settings_file.write(replace(loaded, library_names={"D:\\JAV": "改名"}), force=True)
        self.assertEqual(backup.read_bytes(), original)

    def test_legacy_upgrade_is_independent_of_order_and_path_spelling(self):
        expected = media_identity.catalog(self.config)
        reordered = replace(self.config, locations={"local": ("e:/收藏/JAV/", "d:/jav/")})
        actual = media_identity.catalog(reordered)
        self.assertEqual(set(expected[0]), set(actual[0]))
        self.assertEqual(set(expected[1]), set(actual[1]))

    def test_rename_reorder_and_reload_preserve_all_ids(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        for row in rows:
            row.update(library="私人馆藏", library_icon="star")
        changed = media_identity.configure_sources(config, list(reversed(rows)), windows=True)
        settings_file.write(changed, force=True)
        loaded = settings_file.load_config(environ=self.env)
        self.assertEqual(set(loaded.storage_roots), set(config.storage_roots))
        self.assertEqual(set(loaded.library_catalog), set(config.library_catalog))
        self.assertEqual(media_libraries.libraries(loaded)[0]["name"], "私人馆藏")
        self.assertEqual(media_libraries.libraries(loaded)[0]["icon"], "star")

    def test_color_and_policy_persist_per_library_and_defaults_stay_out_of_the_file(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        self.assertEqual({(row["library_color"], row["library_policy"]) for row in rows}, {("", "auto")})
        for row in rows:
            row.update(library_color="sky", library_policy="custom", library_stages="preview,metadata")
        settings_file.write(media_identity.configure_sources(config, rows, windows=True), force=True)
        loaded = settings_file.load_config(environ=self.env)
        [library] = media_libraries.libraries(loaded)
        self.assertEqual((library["color"], library["policy"], library["stages"]), ("sky", "custom", ["metadata", "preview"]))
        self.assertEqual(media_identity.stages_by_root(loaded),
                         {media_identity.path_key(root): frozenset({"metadata", "preview"}) for root in ("D:\\JAV", "E:\\收藏\\JAV")})
        rows = media_configuration.rows(loaded, windows=True)
        for row in rows:
            row.update(library_color="", library_policy="auto", library_stages="")
        settings_file.write(media_identity.configure_sources(loaded, rows, windows=True), force=True)
        text = self.path.read_text(encoding="utf-8")
        self.assertNotIn("policy", text)
        self.assertNotIn("color", text)
        self.assertEqual(media_libraries.libraries(settings_file.load_config(environ=self.env))[0]["policy"], "auto")

    def test_local_policy_keeps_probe_and_previews_and_drops_network_steps(self):
        self.assertEqual(media_identity.library_stages({"policy": "local"}), frozenset({"probe", "preview"}))
        self.assertEqual(media_identity.library_stages({}), frozenset(media_identity.STAGES))
        self.assertEqual(media_identity.library_stages({"policy": "custom", "stages": ""}), frozenset())

    def test_invalid_color_policy_or_stages_are_rejected(self):
        config = settings_file.upgrade_media_identity(self.config)
        for change in ({"library_color": "#ff0000"}, {"library_policy": "sometimes"},
                       {"library_policy": "custom", "library_stages": "download"}):
            rows = media_configuration.rows(config, windows=True)
            for row in rows:
                row.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                media_identity.configure_sources(config, rows, windows=True)
        with self.assertRaises(ValueError):
            media_identity.validate_catalog({str(uuid4()): {"name": "JAV", "stages": "probe"}}, {})

    def test_same_names_are_independent_and_assignment_uses_library_id(self):
        empty = replace(self.config, locations={}, library_names={})
        first, second = str(uuid4()), str(uuid4())
        sources = [{"location": "local", "path": "D:\\JAV", "library": "JAV", "library_id": first},
                   {"location": "local", "path": "E:\\JAV", "library": "JAV", "library_id": second}]
        config = media_identity.configure_sources(empty, sources, windows=True)
        self.assertEqual(len(media_libraries.libraries(config)), 2)
        rows = media_configuration.rows(config, windows=True)
        rows[1]["library_id"] = first
        joined = media_identity.configure_sources(config, rows, windows=True)
        self.assertEqual(set(joined.storage_roots), set(config.storage_roots))
        self.assertEqual(len(media_libraries.libraries(joined)), 1)
        with sqlite3.connect(":memory:") as db:
            db.execute("CREATE TABLE asset(location TEXT,path TEXT)")
            db.executemany("INSERT INTO asset VALUES('local',?)", [("D:\\JAV\\one.mp4",), ("E:\\JAV\\one.mp4",)])
            clause, values = media_libraries.predicate(joined, first)
            self.assertEqual(db.execute("SELECT count(*) FROM asset a WHERE " + clause, values).fetchone()[0], 2)

    def test_relocation_requires_intent_and_keeps_ledger_prefix(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        rows[0]["path"] = "F:\\移动收藏"
        with self.assertRaisesRegex(ValueError, "重定位"):
            media_identity.configure_sources(config, rows, windows=True)
        rows[0]["change_mode"] = "relocate"
        relocated = media_identity.configure_sources(config, rows, windows=True)
        self.assertEqual(relocated.locations, config.locations)
        self.assertEqual(set(relocated.storage_roots), set(config.storage_roots))
        self.assertEqual(media_configuration.rows(relocated, windows=True)[0]["path"], "F:\\移动收藏")
        settings_file.write(relocated, force=True)
        loaded = settings_file.load_config(environ=self.env)
        self.assertEqual(loaded.storage_roots, relocated.storage_roots)
        self.assertEqual(loaded.mounts, relocated.mounts)
        rows[0]["location"] = "115"
        with self.assertRaisesRegex(ValueError, "来源"):
            media_identity.configure_sources(config, rows, windows=True)

    def test_overlaps_and_duplicate_root_ids_are_rejected_across_libraries(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        with self.assertRaisesRegex(ValueError, "不能登记多次"):
            media_identity.configure_sources(config, [rows[0], rows[0]], windows=True)
        rows.append({"location": "local", "path": "d:/jav/子目录", "library": "独立"})
        self.assertTrue(media_configuration.validate(rows, windows=True)[2])
        with self.assertRaisesRegex(ValueError, "包含"):
            media_identity.configure_sources(config, rows, windows=True)

    def test_removal_keeps_remaining_root_identity(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        reduced = media_identity.configure_sources(config, rows[1:], windows=True)
        self.assertEqual(list(reduced.storage_roots), [rows[1]["root_id"]])
        self.assertEqual(reduced.library_catalog, config.library_catalog)

    def test_path_form_preserves_independent_same_name_libraries(self):
        first, second = str(uuid4()), str(uuid4())
        config = media_identity.configure_sources(replace(self.config, locations={}), [
            dict(location='local', path='D:\\JAV', library='JAV', library_id=first),
            dict(location='local', path='E:\\JAV', library='JAV', library_id=second),
        ], windows=True)
        sources = media_identity.sources_for_paths(config, ['E:\\JAV', 'D:\\JAV'], windows=True)
        prepared = media_identity.configure_sources(config, sources, windows=True)
        self.assertEqual(prepared.library_catalog, config.library_catalog)
        self.assertEqual(set(prepared.storage_roots), set(config.storage_roots))

    def test_nested_relocation_is_rejected(self):
        config = settings_file.upgrade_media_identity(self.config)
        rows = media_configuration.rows(config, windows=True)
        rows[0].update(path='D:\\JAV\\moved', change_mode='relocate')
        with self.assertRaisesRegex(ValueError, '重叠'):
            media_identity.configure_sources(config, rows, windows=True)
