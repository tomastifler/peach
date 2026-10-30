from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

from scripts import run_gitlab_runner as launcher


class RunnerLauncherTests(unittest.TestCase):
    def test_child_has_no_console_and_preserves_existing_runner_entry(self):
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.object(launcher.shutil, "which", return_value="pwsh.exe"), \
                mock.patch.object(launcher.subprocess, "CREATE_NO_WINDOW", 0x08000000, create=True), \
                mock.patch.object(launcher.subprocess, "run", return_value=SimpleNamespace(returncode=7)) as run:
            root = Path(directory).resolve()
            for name in ("run-runner.ps1", "gitlab-runner.exe", "config.toml"):
                (root / name).write_bytes(b"fixture")
            self.assertEqual(launcher.run(root), 7)
            self.assertEqual(run.call_args.kwargs["creationflags"], 0x08000000)
            self.assertEqual(run.call_args.kwargs["stdin"], launcher.subprocess.DEVNULL)
            self.assertEqual(run.call_args.args[0][-1], str(root / "run-runner.ps1"))

    def test_missing_runner_files_prevent_launch(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(launcher.subprocess, "run") as run:
            with self.assertRaises(ValueError):
                launcher.run(Path(directory))
            run.assert_not_called()
