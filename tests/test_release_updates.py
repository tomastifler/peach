"""发行通道、故障状态和独立托盘检查的隔离回归。"""
import json
import unittest
from unittest.mock import Mock, patch

import httpx

from peach import release_updates
from peach.http import HttpResponse
from peach.versioning import VersionManager


def release(version, **extra):
    return dict(tag_name=f"v{version}", prerelease=True, draft=False,
                assets=[{"name": f"Peach-{version}-windows-x64.zip", "state": "uploaded"}], **extra)


class ReleaseUpdateTests(unittest.TestCase):
    def test_r2_release_is_available_when_github_is_unavailable_and_uses_verified_digest(self):
        row = release("1.0.0")
        row["assets"][0].update(size=123, digest="sha256:" + "a" * 64,
                                browser_download_url="https://untrusted.invalid/package.zip")

        def transport(request, *_args):
            if request.url == release_updates.API_URL:
                raise httpx.ConnectError("GitHub unavailable")
            return HttpResponse(200, {}, json.dumps([row]).encode())

        with patch.object(release_updates, "__version__", "0.9.0"):
            result = release_updates.check(transport=transport)
        self.assertEqual(result["state"], "available")
        self.assertEqual(result["asset_url"], "https://downloads.peach.video/v1.0.0/Peach-1.0.0-windows-x64.zip")
        self.assertEqual(result["asset_digest"], "sha256:" + "a" * 64)
        self.assertEqual(result["release_url"], release_updates.RELEASES_URL + "/tag/v1.0.0")

    def test_latest_version_can_come_from_either_source_and_r2_requires_a_digest(self):
        r2 = release("1.0.0")
        github = release("2.0.0")

        def transport(request, *_args):
            row = r2 if request.url == release_updates.DOWNLOADS_API else github
            return HttpResponse(200, {}, json.dumps([row]).encode())

        self.assertEqual(release_updates.check(transport=transport)["latest_version"], "2.0.0")
        r2["assets"][0]["digest"] = "sha256:" + "a" * 64
        r2["tag_name"] = "v3.0.0"
        r2["assets"][0]["name"] = "Peach-3.0.0-windows-x64.zip"
        self.assertEqual(release_updates.check(transport=transport)["latest_version"], "3.0.0")

    def check(self, rows, status=200):
        transport = Mock(return_value=HttpResponse(status, {}, json.dumps(rows).encode()))
        with patch.object(release_updates, "__version__", "0.9.0"):
            return release_updates.check(transport=transport)

    def test_channel_includes_prereleases_and_orders_versions_numerically(self):
        result = self.check([release("0.9.0"), release("0.10.0")])
        self.assertEqual((result["state"], result["latest_version"]), ("available", "0.10.0"))
        self.assertEqual(result["release_url"], release_updates.RELEASES_URL + "/tag/v0.10.0")

    def test_unpublished_or_incomplete_packages_are_not_offered(self):
        draft = release("8.0.0"); draft["draft"] = True
        incomplete = release("9.0.0"); incomplete["assets"] = []
        result = self.check([draft, incomplete, {"tag_name": "invalid"}, release("0.9.0")])
        self.assertEqual(result["state"], "current")
        self.assertEqual(self.check([release("0.8.0")])["state"], "ahead")
        self.assertEqual(self.check([])["state"], "empty")

    def test_prefers_app_update_when_all_tool_assets_are_uploaded(self):
        row = release("1.0.0")
        row["assets"] += [
            {"name": "Peach-1.0.0-windows-x64-update.zip", "state": "uploaded", "size": 123, "digest": "sha256:" + "a" * 64},
            {"name": "Peach-1.0.0-windows-x64-setup.exe", "state": "uploaded"},
        ]
        self.assertEqual(self.check([row])["package_kind"], "full")
        row["assets"] += [{"name": f"Peach-1.0.0-windows-x64-tools-{tool}.zip", "state": "uploaded"}
                          for tool in ("ffmpeg", "untrunc", "cloudflared")]
        self.assertEqual(self.check([row])["package_kind"], "full", "缺人脸模型工具包时不能只下应用更新包")
        row["assets"].append({"name": "Peach-1.0.0-windows-x64-tools-face-models.zip", "state": "uploaded"})
        result = self.check([row])
        self.assertEqual(result["package_kind"], "update")
        self.assertTrue(result["asset_url"].endswith("-update.zip"))
        self.assertEqual(result["asset_size"], 123)
        self.assertEqual(result["full_url"], release_updates.RELEASES_URL + "/download/v1.0.0/Peach-1.0.0-windows-x64.zip",
                         "应用更新包准备不下去时改下的同版本完整包")
        row["assets"][1]["state"] = "new"
        self.assertEqual(self.check([row])["package_kind"], "full")
        row["assets"].pop(0)
        self.assertEqual(self.check([row])["state"], "empty")

    def test_failures_do_not_claim_current_or_keep_a_latest_version(self):
        self.assertEqual(self.check({}, status=429)["state"], "error")
        self.assertEqual(self.check({})["state"], "error")
        for cause in (httpx.ConnectError("offline"), httpx.ReadTimeout("timeout")):
            result = release_updates.check(transport=Mock(side_effect=cause))
            self.assertEqual(result["state"], "error")
            self.assertIsNone(result["latest_version"])

    def test_github_can_report_current_and_ahead_when_r2_is_unavailable(self):
        def transport(github_version):
            def answer(request, *_args):
                if request.url == release_updates.DOWNLOADS_API:
                    raise httpx.ConnectError("R2 unreachable")
                return HttpResponse(200, {}, json.dumps([release(github_version)]).encode())
            return answer

        with patch.object(release_updates, "__version__", "0.48.2"):
            for version, state in (("0.46.1", "ahead"), ("0.48.2", "current")):
                with self.subTest(github=version):
                    result = release_updates.check(transport=transport(version))
                    self.assertEqual(result["state"], state)
            self.assertEqual(release_updates.check(transport=transport("0.49.0"))["state"], "available",
                             "GitHub 上真有更新的版本时照样可以升")

    def test_identical_versions_prefer_github_downloads(self):
        row = release("1.0.0")
        row["assets"][0].update(size=123, digest="sha256:" + "a" * 64)
        calls = []

        def transport(request, *_args):
            calls.append(request.url)
            return HttpResponse(200, {}, json.dumps([row]).encode())

        result = release_updates.check(transport=transport)
        self.assertEqual(calls, [release_updates.API_URL, release_updates.DOWNLOADS_API])
        self.assertEqual(result["asset_url"], release_updates.RELEASES_URL + "/download/v1.0.0/Peach-1.0.0-windows-x64.zip")

    def test_standalone_tray_checks_releases_without_git(self):
        execute = Mock(side_effect=AssertionError("Git must not run"))
        with patch("peach.distribution.standalone", return_value=True), patch.object(
                release_updates, "check", return_value=dict(state="available", latest_version="1.0.0", message="有新版本可下载。")) as check:
            result = VersionManager(execute=execute).check()
        check.assert_called_once()
        self.assertEqual(result.state, "available")
        self.assertIn("1.0.0", result.message)
        execute.assert_not_called()
