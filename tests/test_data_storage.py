"""数据目录的占用统计、缓存清理与整体迁移。"""
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from peach import data_storage, distribution, settings_file


def write(path: Path, size: int = 10) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    return path


def make_ledger(path: Path, *, snapshot: str | None = None, evidence: str | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE asset (id INTEGER PRIMARY KEY, snapshot_path TEXT)")
    connection.execute("CREATE TABLE follow_item (id INTEGER PRIMARY KEY, evidence_path TEXT)")
    connection.execute("INSERT INTO asset (snapshot_path) VALUES (?), (?), (NULL)", (snapshot, r"R:\elsewhere\a.jpg"))
    connection.execute("INSERT INTO follow_item (evidence_path) VALUES (?)", (evidence,))
    connection.commit()
    connection.close()
    return path


class DataStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.data = self.base / "old" / "peach-data"
        write(self.data / "config.toml", 0)
        self.program = self.base / "Peach"
        self.program.mkdir()

    def config(self, root: Path | None = None):
        return settings_file.load_config(environ={settings_file.DATA_ROOT_ENV: str(root or self.data)})

    def test_measure_sorts_files_into_categories_and_counts_what_cleaning_frees(self):
        make_ledger(self.data / "database" / "ledger.db")
        old = write(self.data / "database" / "ledger.pre-migrate-20260101-000000.db", 100)
        os.utime(old, (time.time() - 7200, time.time() - 7200))
        write(self.data / "database" / "ledger.pre-script-20260102-000000.db", 100)
        write(self.data / "generated" / "organize-backups" / "ledger.pre-download-1-20260101-000000.db", 50)
        write(self.data / "generated" / "transcodes" / "12-main.mp4", 30)
        write(self.data / "generated" / "transcodes" / "12-main.mp4hdr", 7)
        write(self.data / "generated" / "stream-segments" / "12" / "0001.ts", 20)
        write(self.data / "generated" / "cover-thumbs" / "ABC-001.jpg", 5)
        write(self.data / "generated" / "snapshots" / "local" / "aa" / "x.jpg", 40)
        write(self.data / "generated" / "covers" / "ABC-001.jpg", 60)
        write(self.data / "generated" / "review.csv", 3)
        write(self.data / "sources" / "taste-history" / "history.sqlite", 9)
        write(self.data / "logs" / "tray.log", 4)
        write(self.data / "logs" / "tray.until-20260101.log", 6)
        write(self.data / "logs" / "crash-123.log", 2)
        write(self.data / "state" / "job-recovery" / "scan.json", 11)
        write(self.data / "review" / "names.csv", 12)
        write(self.data / "archive" / "old.csv", 13)
        write(self.data / "tools" / "ffmpeg" / "ffmpeg.exe", 14)
        write(self.data / "secrets" / "auth-token", 15)
        reports = []

        with patch.object(data_storage, "REPORT_INTERVAL", 0):
            usage = data_storage.measure(self.config(), report=lambda files, size: reports.append((files, size)))
        groups = usage["categories"]

        self.assertEqual(groups["records"], {"bytes": 36, "files": 3, "reclaimable": 0})
        self.assertEqual(groups["tools"]["bytes"], 14)
        self.assertEqual(groups["accounts"]["bytes"], 15)
        self.assertTrue(reports)
        self.assertEqual(reports, sorted(reports))
        self.assertLessEqual(reports[-1][0], usage["total_files"])

        self.assertEqual(groups["backups"]["bytes"], 250)
        self.assertEqual(groups["backups"]["reclaimable"], 100)
        self.assertEqual(groups["playback"]["bytes"], 57)
        self.assertEqual(groups["playback"]["reclaimable"], 50)
        self.assertEqual(groups["thumbnails"], {"bytes": 5, "files": 1, "reclaimable": 5})
        self.assertEqual(groups["previews"]["bytes"], 40)
        self.assertEqual(groups["downloads"]["bytes"], 60)
        self.assertEqual(groups["sources"]["bytes"], 9)
        self.assertEqual(groups["logs"], {"bytes": 12, "files": 3, "reclaimable": 8})
        self.assertEqual(groups["downloads"]["reclaimable"], 0)
        self.assertEqual(usage["total_files"], sum(item["files"] for item in groups.values()))
        self.assertEqual(usage["root"], str(self.data))

    def test_cleaning_removes_only_rebuildable_files(self):
        config = self.config()
        write(self.data / "generated" / "transcodes" / "12-main.mp4", 30)
        header = write(self.data / "generated" / "transcodes" / "12-main.mp4hdr", 7)
        write(self.data / "generated" / "stream-segments" / "12" / "0001.ts", 20)
        live_log = write(self.data / "logs" / "tray.log", 4)
        write(self.data / "logs" / "tray.until-20260101.log", 6)

        self.assertEqual(data_storage.clean(config, "playback"), {"files": 2, "bytes": 50, "failed": 0})
        self.assertEqual(data_storage.clean(config, "logs"), {"files": 1, "bytes": 6, "failed": 0})
        self.assertTrue(header.is_file())
        self.assertTrue(live_log.is_file())
        self.assertEqual(list((self.data / "generated" / "stream-segments").iterdir()), [])
        with self.assertRaises(ValueError):
            data_storage.clean(config, "downloads")

    def test_cleaning_backups_keeps_the_newest_one_in_each_directory(self):
        make_ledger(self.data / "database" / "ledger.db")
        names = [("database", "ledger.pre-a-20260101-000000.db"), ("database", "ledger.pre-b-20260102-000000.db"),
                 ("generated/organize-backups", "ledger.pre-download-1-20260101-000000.db"),
                 ("generated/organize-backups", "ledger.pre-download-2-20260102-000000.db")]
        for index, (folder, name) in enumerate(names):
            path = write(self.data / folder / name, 10)
            os.utime(path, (time.time() - 1000 + index, time.time() - 1000 + index))

        result = data_storage.clean(self.config(), "backups")

        self.assertEqual(result["files"], 2)
        self.assertEqual(sorted(path.name for path in (self.data / "database").glob("ledger.pre-*")),
                         ["ledger.pre-b-20260102-000000.db"])
        self.assertEqual([path.name for path in (self.data / "generated/organize-backups").iterdir()],
                         ["ledger.pre-download-2-20260102-000000.db"])

    def test_target_must_be_a_separate_empty_folder(self):
        config = self.config()
        cases = {
            str(self.data): "相同或互相包含",
            str(self.data / "inner"): "相同或互相包含",
            str(self.program / "data"): "程序目录",
            str(Path(self.base.anchor)): "磁盘根目录",
            "relative\\path": "",
        }
        for raw, reason in cases.items():
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, reason):
                data_storage.check_target(config, raw, program=self.program)
        busy = write(self.base / "busy" / "file.txt").parent
        with self.assertRaisesRegex(ValueError, "空文件夹"):
            data_storage.check_target(config, str(busy), program=self.program)
        media = replace(config, locations={"local": (str(self.base / "media"),)})
        with self.assertRaisesRegex(ValueError, "媒体目录"):
            data_storage.check_target(media, str(self.base / "media" / "peach"), program=self.program)
        vacated = write(self.base / "vacated" / "state" / settings_file.DATA_ROOT_LOCATION).parents[1]
        self.assertEqual(data_storage.check_target(config, str(vacated), program=self.program), vacated)
        self.assertEqual(data_storage.check_target(config, str(self.base / "new" / "peach-data"), program=self.program),
                         self.base / "new" / "peach-data")

    def test_rename_moves_everything_rewrites_ledger_paths_and_points_both_locators(self):
        snapshot = str(self.data / "generated" / "snapshots" / "local" / "aa" / "x.jpg")
        evidence = str(self.data / "sources" / "follow" / "page.html")
        # 路径比较按本机 normcase：折叠大小写的系统上，账本里换了大小写的旧路径也要认出来。
        folds_case = os.path.normcase("A") == "a"
        make_ledger(self.data / "database" / "ledger.db",
                    snapshot=snapshot.upper() if folds_case else snapshot, evidence=evidence)
        write(self.data / "generated" / "covers" / "ABC-001.jpg")
        bootstrap = self.base / "default" / "peach-data"
        target = self.base / "new" / "peach-data"

        copied = data_storage.relocate(self.config(), target, bootstrap=bootstrap)

        self.assertFalse(copied)
        self.assertTrue((target / "generated" / "covers" / "ABC-001.jpg").is_file())
        for root in (bootstrap, self.data):
            self.assertEqual((root / "state" / settings_file.DATA_ROOT_LOCATION).read_text(encoding="utf-8"), str(target))
        self.assertEqual(settings_file.discover_data_root(environ={settings_file.DATA_ROOT_ENV: str(self.data)}),
                         (target, True))
        connection = sqlite3.connect(target / "database" / "ledger.db")
        paths = [row[0] for row in connection.execute("SELECT snapshot_path FROM asset ORDER BY id")]
        evidence_path = connection.execute("SELECT evidence_path FROM follow_item").fetchone()[0]
        connection.close()
        self.assertEqual(os.path.normcase(paths[0]),
                         os.path.normcase(str(target / "generated" / "snapshots" / "local" / "aa" / "x.jpg")))
        self.assertEqual(paths[1:], [r"R:\elsewhere\a.jpg", None])
        self.assertEqual(evidence_path, str(target / "sources" / "follow" / "page.html"))

    def test_moving_back_to_the_default_location_leaves_no_loop(self):
        bootstrap = self.base / "default" / "peach-data"
        write(bootstrap / "state" / settings_file.DATA_ROOT_LOCATION).write_text(str(self.data), encoding="utf-8")
        make_ledger(self.data / "database" / "ledger.db")

        data_storage.relocate(self.config(), bootstrap, bootstrap=bootstrap)

        self.assertFalse((bootstrap / "state" / settings_file.DATA_ROOT_LOCATION).exists())
        self.assertEqual(settings_file.discover_data_root(environ={settings_file.DATA_ROOT_ENV: str(bootstrap)}),
                         (bootstrap, True))
        self.assertEqual(settings_file.discover_data_root(environ={settings_file.DATA_ROOT_ENV: str(self.data)}),
                         (bootstrap, True))

    def test_incomplete_copy_is_discarded_and_the_source_stays_in_use(self):
        make_ledger(self.data / "database" / "ledger.db")
        write(self.data / "generated" / "covers" / "ABC-001.jpg")
        target = self.base / "other-disk" / "peach-data"

        def lossy(source, destination):
            shutil.copytree(source, destination, dirs_exist_ok=True)
            (destination / "generated" / "covers" / "ABC-001.jpg").unlink()

        with patch.object(data_storage, "_same_volume", return_value=False), \
                self.assertRaisesRegex(RuntimeError, "复制结果不完整"):
            data_storage.relocate(self.config(), target, bootstrap=self.base / "default", copy=lossy)

        self.assertFalse(target.exists())
        self.assertTrue((self.data / "generated" / "covers" / "ABC-001.jpg").is_file())
        self.assertFalse((self.data / "state" / settings_file.DATA_ROOT_LOCATION).exists())

    def test_copy_rechecks_free_space_with_the_actual_size(self):
        write(self.data / "generated" / "covers" / "ABC-001.jpg", 4096)
        target = self.base / "other-disk" / "peach-data"
        copy = Mock()
        with patch.object(data_storage, "_same_volume", return_value=False), \
                patch.object(data_storage.shutil, "disk_usage", return_value=SimpleNamespace(free=10)), \
                self.assertRaisesRegex(ValueError, "剩余"):
            data_storage.relocate(self.config(), target, bootstrap=self.base / "default", copy=copy)
        copy.assert_not_called()
        self.assertFalse(target.exists())

    def test_a_rename_that_cannot_be_undone_still_points_to_the_new_location(self):
        make_ledger(self.data / "database" / "ledger.db")
        target = self.base / "new" / "peach-data"
        calls = []

        def rename_once(source, destination):
            calls.append(destination)
            if len(calls) > 1:
                raise OSError("拒绝访问")
            os.rename(source, destination)

        with patch.object(data_storage, "rewrite_ledger_paths", side_effect=RuntimeError("数据库被占用")), \
                patch.object(data_storage, "_rename", side_effect=rename_once), \
                self.assertRaisesRegex(data_storage.MovedWithoutRewrite, "数据库被占用"):
            data_storage.relocate(self.config(), target, bootstrap=self.base / "default")
        self.assertTrue((target / "database" / "ledger.db").is_file())
        self.assertEqual((self.base / "default" / "state" / settings_file.DATA_ROOT_LOCATION).read_text(encoding="utf-8"),
                         str(target))

    def test_copied_source_is_emptied_except_its_locator(self):
        make_ledger(self.data / "database" / "ledger.db")
        write(self.data / "generated" / "covers" / "ABC-001.jpg")
        write(self.data / "state" / "follow.json")
        target = self.base / "other-disk" / "peach-data"
        with patch.object(data_storage, "_same_volume", return_value=False):
            copied = data_storage.relocate(self.config(), target, bootstrap=self.data,
                                           copy=lambda source, destination: shutil.copytree(
                                               source, destination, dirs_exist_ok=True))
        self.assertTrue(copied)
        self.assertEqual(data_storage.remove_source(self.data), 0)
        self.assertEqual([path.relative_to(self.data).as_posix() for path in self.data.rglob("*") if path.is_file()],
                         [f"state/{settings_file.DATA_ROOT_LOCATION}"])
        self.assertTrue((target / "state" / "follow.json").is_file())

    def request_file(self, target: Path) -> Path:
        path = self.data / "state" / data_storage.REQUEST_NAME
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"source": str(self.data), "target": str(target), "token": "",
                                    "requested_at": time.time()}), encoding="utf-8")
        return path

    def test_helper_moves_the_data_restarts_the_tray_on_the_new_location_and_records_it(self):
        make_ledger(self.data / "database" / "ledger.db")
        target = self.base / "new" / "peach-data"
        request = self.request_file(target)
        started = []
        with patch.object(data_storage, "_startup", return_value=None), \
                patch("peach.windows_restart.process_alive", return_value=False), \
                patch.object(data_storage, "_bootstrap", return_value=self.base / "default" / "peach-data"):
            code = data_storage.apply(request, 1, environ={}, start=lambda exe, env: started.append(env))

        self.assertEqual(code, 0)
        self.assertEqual(started[0][settings_file.DATA_ROOT_ENV], str(target))
        result = data_storage.read_result(self.config(target))
        self.assertEqual((result["state"], result["target"]), ("done", str(target)))
        self.assertFalse((target / "state" / data_storage.REQUEST_NAME).exists())

    def test_helper_failure_keeps_the_old_location_and_explains_why(self):
        make_ledger(self.data / "database" / "ledger.db")
        busy = write(self.base / "busy" / "file.txt").parent
        request = self.request_file(busy)
        started = []
        with patch.object(data_storage, "_startup", return_value=None), \
                patch("peach.windows_restart.process_alive", return_value=False), \
                patch.object(data_storage, "_bootstrap", return_value=self.base / "default" / "peach-data"):
            code = data_storage.apply(request, 1, environ={}, start=lambda exe, env: started.append(env))

        self.assertEqual(code, 1)
        self.assertEqual(started[0][settings_file.DATA_ROOT_ENV], str(self.data))
        result = data_storage.read_result(self.config())
        self.assertEqual(result["state"], "error")
        self.assertIn("仍在原位置", result["message"])
        self.assertFalse(request.exists())

    def test_request_needs_a_measurement_and_room_on_the_target_disk(self):
        config = self.config()
        target = self.base / "new" / "peach-data"
        with patch.object(data_storage, "availability", return_value=(True, "")), \
                patch("peach.standalone_update.public", return_value={"state": "idle"}):
            with self.assertRaisesRegex(ValueError, "请先统计"):
                data_storage.request(config, str(target))
            (self.data / "state").mkdir(exist_ok=True)
            (self.data / "state" / data_storage.USAGE_NAME).write_text(json.dumps(
                {"root": str(self.data), "total_bytes": 1 << 50}), encoding="utf-8")
            with patch.object(data_storage, "_same_volume", return_value=False), \
                    self.assertRaisesRegex(ValueError, "剩余"):
                data_storage.request(config, str(target))
            receipt = data_storage.request(config, str(target))
        self.assertTrue(receipt["accepted"])
        written = json.loads((self.data / "state" / data_storage.REQUEST_NAME).read_text(encoding="utf-8"))
        self.assertEqual((written["source"], written["target"]), (str(self.data), str(target)))

    def availability_with(self, **environ):
        names = ("PEACH_DISTRIBUTION", "PEACH_TRAY_MANAGED", "PEACH_HEADLESS_MANAGED")
        clean = {key: value for key, value in os.environ.items() if key not in names}
        with patch.object(distribution, "standalone", return_value=False), \
                patch.dict(os.environ, {**clean, **environ}, clear=True):
            return data_storage.availability(self.config()), data_storage.manual_steps()

    def test_tray_and_headless_services_can_relocate_from_the_settings_page(self):
        for marker in ("PEACH_TRAY_MANAGED", "PEACH_HEADLESS_MANAGED"):
            with self.subTest(marker):
                (available, message), steps = self.availability_with(**{marker: "1"})
                self.assertEqual((available, message, steps), (True, "", []))

    def test_a_directly_started_service_explains_how_to_relocate(self):
        (available, message), steps = self.availability_with()
        self.assertFalse(available)
        self.assertIn("PEACH_DATA_ROOT", message)
        self.assertEqual(steps, [])

    def test_containers_get_host_side_steps_instead_of_a_relocation(self):
        (available, message), steps = self.availability_with(PEACH_DISTRIBUTION="docker", PEACH_HEADLESS_MANAGED="1")
        self.assertFalse(available)
        self.assertIn("宿主机", message)
        self.assertEqual([step["command"] for step in steps][1:2], ["docker compose down"])
        self.assertIn("<新文件夹>:/data", steps[-1]["text"])

    def test_relocation_never_redirects_another_live_data_directory(self):
        make_ledger(self.data / "database" / "ledger.db")
        other = self.base / "default" / "peach-data"
        write(other / "config.toml", 0)
        target = self.base / "new" / "peach-data"

        data_storage.relocate(self.config(), target, bootstrap=other)

        self.assertFalse((other / "state" / settings_file.DATA_ROOT_LOCATION).exists())
        self.assertEqual((self.data / "state" / settings_file.DATA_ROOT_LOCATION).read_text(encoding="utf-8"),
                         str(target))

    def test_headless_supervisor_stops_the_service_moves_the_data_and_restarts_there(self):
        make_ledger(self.data / "database" / "ledger.db")
        target = self.base / "new" / "peach-data"
        request = self.request_file(target)
        stopped, restarted = [], []
        original = settings_file.load_config

        def load(environ=None):
            # 看守进程自己读设置时还在原位置；助手读新旧两处时给的是显式环境。
            return original(environ=environ if environ is not None else {settings_file.DATA_ROOT_ENV: str(self.data)})

        with patch.object(settings_file, "load_config", side_effect=load), \
                patch.object(data_storage, "_startup", return_value=None), \
                patch.object(data_storage, "_bootstrap", return_value=self.base / "default" / "peach-data"), \
                patch("peach.update_tasks.reserve", return_value="token-1"), \
                patch("peach.update_tasks.wait_quiescent", return_value=True), \
                patch("peach.update_tasks.release"):
            handled = data_storage.poll_headless(lambda: stopped.append(True), restarted.append)

        self.assertTrue(handled)
        self.assertEqual(stopped, [True])
        self.assertEqual(restarted[0][settings_file.DATA_ROOT_ENV], str(target))
        self.assertFalse(request.exists())
        self.assertEqual(data_storage.read_result(self.config(target))["state"], "done")

    def tray(self):
        return SimpleNamespace(_action_lock=threading.Lock(), icon=Mock(), exit=Mock())

    def poll_with(self, tray, popen):
        config = self.config()
        with patch.object(distribution, "standalone", return_value=True), \
                patch.object(settings_file, "load_config", return_value=config), \
                patch("peach.update_tasks.reserve", return_value="token-1"), \
                patch("peach.update_tasks.wait_quiescent", return_value=True), \
                patch("peach.update_tasks.transfer") as transfer, \
                patch("peach.update_tasks.release") as release, \
                patch.object(data_storage.subprocess, "Popen", popen):
            data_storage.poll(tray)
        return transfer, release

    @unittest.skipUnless(sys.platform == "win32", "安装版助手的命令按 Windows 的 Peach.exe 写")
    def test_tray_hands_the_request_to_the_helper_and_exits(self):
        target = self.base / "new" / "peach-data"
        request = self.request_file(target)
        tray = self.tray()
        popen = Mock(return_value=SimpleNamespace(pid=4321))

        transfer, release = self.poll_with(tray, popen)

        argv = popen.call_args.args[0]
        self.assertEqual(argv[1:], [data_storage.HELPER_FLAG, str(request), str(os.getpid())])
        self.assertTrue(argv[0].endswith("Peach.exe"))
        self.assertEqual(json.loads(request.read_text(encoding="utf-8"))["token"], "token-1")
        transfer.assert_called_once()
        self.assertEqual(transfer.call_args.args[1:], ("token-1", 4321))
        release.assert_not_called()
        tray.exit.assert_called_once_with(reason="data-relocation")
        self.assertFalse(tray._action_lock.locked())

    @unittest.skipUnless(sys.platform == "win32", "安装版助手的命令按 Windows 的 Peach.exe 写")
    def test_tray_failure_releases_the_reservation_and_keeps_running(self):
        request = self.request_file(self.base / "new" / "peach-data")
        tray = self.tray()

        _transfer, release = self.poll_with(tray, Mock(side_effect=OSError("找不到 Peach.exe")))

        release.assert_called_once()
        self.assertEqual(release.call_args.args[1], "token-1")
        self.assertFalse(request.exists())
        tray.exit.assert_not_called()
        result = data_storage.read_result(self.config())
        self.assertEqual(result["state"], "error")
        self.assertIn("找不到 Peach.exe", result["message"])

    def test_storage_routes_validate_categories_and_report_target_errors_by_field(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from peach import routes_configuration
        from peach.routes_auth import require_auth
        app = FastAPI()
        app.include_router(routes_configuration.router)
        app.dependency_overrides[require_auth] = lambda: None
        config = self.config()
        with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 123)) as client, \
                patch.object(settings_file, "load_config", return_value=config), \
                patch.object(data_storage, "availability", return_value=(True, "")), \
                patch("peach.standalone_update.public", return_value={"state": "idle"}):
            snapshot = client.get("/api/configuration/storage").json()
            self.assertEqual((snapshot["data_root"], snapshot["usage"]), (str(self.data), None))
            self.assertEqual(client.post("/api/configuration/storage/clean", json={"category": "downloads"}).status_code, 400)
            self.assertEqual(client.post("/api/configuration/storage/clean",
                                         json={"categories": ["logs", "previews"]}).status_code, 400)
            self.assertEqual(client.post("/api/configuration/storage/clean", json={"categories": []}).status_code, 400)
            self.assertEqual(client.post("/api/configuration/storage/measure",
                                         headers={"origin": "https://other.invalid"}).status_code, 403)
            refused = client.post("/api/configuration/storage/relocate", json={"target": str(self.data / "inner")})
            self.assertEqual(refused.status_code, 400)
            self.assertIn("互相包含", refused.json()["detail"]["errors"]["target"])

    def test_jobs_measure_in_the_background_and_report_cleaning(self):
        config = self.config()
        write(self.data / "logs" / "tray.until-20260101.log", 2048)
        jobs = data_storage.StorageJobs()
        release = threading.Event()
        measure = data_storage.measure

        def slow(*args, **kwargs):
            release.wait(10)
            return measure(*args, **kwargs)

        with patch.object(data_storage, "measure", side_effect=slow):
            jobs.start(config, "logs")
            with self.assertRaisesRegex(RuntimeError, "正在统计或清理"):
                jobs.start(config, "measure")
            release.set()
            jobs.join(10)
        state = jobs.snapshot()
        self.assertEqual(state["state"], "idle")
        self.assertIn("释放 2 KB", state["message"])
        self.assertIsNotNone(data_storage.read_usage(config))

    def test_jobs_clean_several_categories_in_one_pass_and_estimate_from_the_last_count(self):
        config = self.config()
        write(self.data / "logs" / "tray.until-20260101.log", 2048)
        write(self.data / "generated" / "stream-segments" / "1" / "0001.ts", 1024)
        jobs = data_storage.StorageJobs()
        jobs.start(config, "measure")
        jobs.join(10)
        counted = data_storage.read_usage(config)["total_files"]

        with patch.object(data_storage, "measure", wraps=data_storage.measure) as measured:
            started = jobs.start(config, ["logs", "playback"])
            jobs.join(10)

        # 按类别表的顺序依次清理，统计只在最后做一次；进度条按上次的文件数估。
        self.assertEqual((started["state"], started["categories"]), ("cleaning", ["playback", "logs"]))
        self.assertEqual(started["expected_files"], counted)
        measured.assert_called_once()
        message = jobs.snapshot()["message"]
        self.assertIn("播放缓存、日志", message)
        self.assertIn("释放 3 KB", message)
        with self.assertRaisesRegex(ValueError, "不能在这里清理"):
            jobs.start(config, ["logs", "downloads"])


if __name__ == "__main__":
    unittest.main()
