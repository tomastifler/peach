"""macOS 媒体分发的清单、架构及源码校验。"""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from scripts import media_tool_bundle

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


class MacMediaBundleTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()

    def fixture(self, tool, architecture="arm64"):
        root = self.root / tool
        root.mkdir()
        required, sources, license_name = media_tool_bundle.POLICIES[tool]
        for name in required:
            path = root / name.removesuffix(".exe")
            path.parent.mkdir(exist_ok=True, parents=True)
            path.write_bytes(b"fixture")
        archive = self.root / f"{tool}-macos-{architecture}-corresponding-source.zip"
        archive.write_bytes(b"source")
        manifest = {"version": "fixed", "platform": "darwin", "architecture": architecture,
                    "license": license_name,
                    "files": {path.relative_to(root).as_posix(): media_tool_bundle.digest(path)
                              for path in root.rglob("*") if path.is_file()},
                    "sources": [{"name": name, "revision": "fixed", "url": "https://example.org/source",
                                 "sha256": "1" * 64} for name in sources],
                    "source_archive": {"name": archive.name, "sha256": media_tool_bundle.digest(archive)}}
        (root / "manifest.json").write_text(json.dumps(manifest))
        return root, archive

    def test_both_tools_require_matching_architecture_and_complete_sources(self):
        for tool in ("ffmpeg", "untrunc"):
            with self.subTest(tool=tool):
                root, archive = self.fixture(tool)
                manifest, source = media_tool_bundle.validate(root, tool, architecture="arm64")
                self.assertEqual(source, archive)
                self.assertEqual(manifest["architecture"], "arm64")
                with self.assertRaisesRegex(ValueError, "架构"):
                    media_tool_bundle.validate(root, tool, architecture="x86_64")
                with self.assertRaises(ValueError):
                    media_tool_bundle.validate(root, tool)
                archive.write_bytes(b"modified")
                with self.assertRaisesRegex(ValueError, "SHA-256"):
                    media_tool_bundle.validate(root, tool, architecture="arm64")

    def test_binary_audit_rejects_non_system_libraries(self):
        with patch.object(sys, "path", [str(SCRIPTS), *sys.path]):
            from scripts import build_macos_media
        for dependency, valid in (("/usr/lib/libSystem.B.dylib", True),
                                   ("/System/Library/Frameworks/CoreMedia.framework/Versions/A/CoreMedia", True),
                                   ("/opt/homebrew/opt/x264/lib/libx264.dylib", False),
                                   ("@rpath/libavcodec.dylib", False)):
            with self.subTest(dependency=dependency), patch.object(build_macos_media.subprocess, "run"), \
                    patch.object(build_macos_media.subprocess, "check_output",
                                 return_value=f"binary:\n\t{dependency} (compatibility version 1.0.0)\n"):
                if valid:
                    build_macos_media.audit_binary(self.root / "binary", "arm64")
                else:
                    with self.assertRaisesRegex(ValueError, "非系统"):
                        build_macos_media.audit_binary(self.root / "binary", "arm64")

    def test_cloudflared_validation_checks_archive_and_binary_hashes(self):
        with patch.object(sys, "path", [str(SCRIPTS), *sys.path]):
            from scripts import fetch_cloudflared_macos
        source = {"url": "https://example.org/cloudflared.tgz", "sha256": ""}
        files = ("cloudflared", "LICENSE-cloudflared.txt", "NOTICE-cloudflared.md")
        for name in (*files, "cloudflared.tgz"):
            (self.root / name).write_bytes(b"fixture")
        source["sha256"] = media_tool_bundle.digest(self.root / "cloudflared.tgz")
        manifest = {"version": "fixed", "architecture": "arm64", "source": source,
                    "files": {name: media_tool_bundle.digest(self.root / name) for name in files}}
        (self.root / "manifest.json").write_text(json.dumps(manifest))
        lock = {"version": "fixed", "assets": {"arm64": source}}
        load = fetch_cloudflared_macos.json.loads
        def loads(text):
            return lock if '"assets"' in text else load(text)
        with patch.object(fetch_cloudflared_macos.json, "loads", side_effect=loads), \
                patch.object(fetch_cloudflared_macos, "audit_binary"):
            self.assertEqual(fetch_cloudflared_macos.validate(self.root, "arm64"), manifest)
            (self.root / "cloudflared").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                fetch_cloudflared_macos.validate(self.root, "arm64")

    @unittest.skipIf(sys.platform == "win32", "macOS 工具使用 POSIX 文件名")
    def test_macos_resolvers_find_the_executable_siblings_without_path_tools(self):
        from peach.ffmpeg import FFmpegResolver
        from peach.mp4recover import untrunc_path
        from peach.tunnel import resolve_binary
        executable = self.root / "Peach.app/Contents/MacOS/Peach"
        for name in ("tools/ffmpeg/bin/ffmpeg", "tools/ffmpeg/bin/ffprobe", "tools/untrunc/untrunc", "cloudflared"):
            path = (executable.parent.parent / "Resources" / name if name.startswith("tools/")
                    else executable.parent / name)
            path.parent.mkdir(exist_ok=True, parents=True)
            path.write_bytes(b"fixture")
        # 应用包布局只在 macOS 生效，Linux runner 上按 macOS 解析同一套 POSIX 文件名。
        with patch.object(sys, "executable", str(executable)), patch.object(sys, "frozen", True, create=True), \
                patch.object(sys, "platform", "darwin"), patch.dict("os.environ", {"PATH": ""}, clear=True):
            resolver = FFmpegResolver(self.root / "missing")
            self.assertEqual(resolver.ffmpeg().source, "peach-bundled")
            self.assertEqual(resolver.ffprobe().path, executable.parent.parent / "Resources/tools/ffmpeg/bin/ffprobe")
            self.assertEqual(untrunc_path(self.root / "missing"), executable.parent.parent / "Resources/tools/untrunc/untrunc")
            self.assertEqual(resolve_binary(), executable.parent / "cloudflared")
