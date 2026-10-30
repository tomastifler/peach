"""外部播放器票据只授权单资产、限时读取。"""
import unittest
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from peach.external_playback import TTL_SECONDS, issue, valid
from peach import local_playback


class ExternalPlaybackTests(unittest.TestCase):
    def test_ticket_is_scoped_expiring_and_tamper_evident(self):
        key = b'one-instance-key'
        ticket = issue(key, 42, now=100)
        self.assertTrue(valid(key, 42, ticket, now=101))
        self.assertFalse(valid(key, 43, ticket, now=101))
        self.assertFalse(valid(b'another-instance', 42, ticket, now=101))
        self.assertFalse(valid(key, 42, ticket, now=100 + TTL_SECONDS))
        self.assertFalse(valid(key, 42, ticket + '0', now=101))
        self.assertFalse(valid(key, 42, '../../media.mp4', now=101))

    def test_ticket_binds_origin(self):
        ticket = issue(b'key', 1, origin='https://public.example', now=100)
        self.assertTrue(valid(b'key', 1, ticket, origin='https://public.example', now=101))
        self.assertFalse(valid(b'key', 1, ticket, origin='https://other.example', now=101))
        self.assertFalse(valid(b'key', 1, ticket, now=101))

    def test_default_player_uses_windows_file_association(self):
        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory).resolve() / '测试 movie.mp4'
            media.write_bytes(b'video')
            with patch.object(local_playback.sys, 'platform', 'win32'), \
                    patch.dict(os.environ, {'PEACH_HEADLESS_MANAGED': '0'}), \
                    patch.object(os, 'startfile', create=True) as launch:
                local_playback.open_media(media)
                launch.assert_called_once_with(str(media), 'open')

    def test_mac_selected_player_uses_open_without_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory).resolve() / 'movie.mp4'
            media.write_bytes(b'video')
            with patch.object(local_playback.sys, 'platform', 'darwin'), \
                    patch.dict(os.environ, {'PEACH_HEADLESS_MANAGED': '0'}), \
                    patch.object(local_playback, 'installed', return_value={'iina': ('IINA', '/Applications/IINA.app')}), \
                    patch.object(local_playback.subprocess, 'run') as launch:
                local_playback.open_media(media, 'iina')
                self.assertEqual(launch.call_args.args[0], ['/usr/bin/open', '-a', '/Applications/IINA.app', str(media)])
                local_playback.open_media(media)
                self.assertEqual(launch.call_args.args[0], ['/usr/bin/open', str(media)])

    def test_mounted_media_path_supports_file_access_without_final_path_resolution(self):
        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory).resolve() / 'mounted.mp4'
            media.touch()
            with patch.object(local_playback.sys, 'platform', 'win32'), \
                    patch.dict(os.environ, {'PEACH_HEADLESS_MANAGED': '0'}), \
                    patch.object(Path, 'resolve', side_effect=OSError(1005, '挂载卷不支持最终路径解析')), \
                    patch.object(os, 'startfile', create=True) as launch, \
                    patch.object(local_playback, 'installed', return_value={'potplayer': ('PotPlayer', 'player.exe')}), \
                    patch.object(local_playback.subprocess, 'Popen') as selected:
                local_playback.open_media(media)
                launch.assert_called_once_with(str(media), 'open')
                local_playback.open_media(media, 'potplayer')
                self.assertEqual(selected.call_args.args[0], ['player.exe', str(media)])

    def test_headless_deployment_and_unknown_player_cannot_launch(self):
        with patch.dict(os.environ, {'PEACH_HEADLESS_MANAGED': '1'}):
            self.assertFalse(local_playback.available())
            self.assertEqual(local_playback.installed(), {})
            with self.assertRaises(ValueError):
                local_playback.open_media(Path('movie.mp4'))
        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory).resolve() / 'movie.mp4'
            media.touch()
            with patch.object(local_playback, 'available', return_value=True), \
                    patch.object(local_playback, 'installed', return_value={}):
                with self.assertRaises(ValueError):
                    local_playback.open_media(media, 'cmd.exe')
                script = media.with_suffix('.exe')
                script.touch()
                with self.assertRaises(ValueError):
                    local_playback.open_media(script)
