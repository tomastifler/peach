"""以无控制台进程运行现有 Windows runner 入口，避免创建终端窗口。"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess


def run(root: Path) -> int:
    root = root.resolve(strict=True)
    for name in ("run-runner.ps1", "gitlab-runner.exe", "config.toml"):
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("runner 目录缺少普通入口文件：" + name)
    powershell = shutil.which("pwsh.exe")
    if not powershell:
        raise ValueError("未找到 PowerShell 7")
    with (root / "runner-launcher.log").open("ab") as log:
        process = subprocess.run([powershell, "-NoProfile", "-NonInteractive", "-File", str(root / "run-runner.ps1")],
            cwd=root, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW, check=False)
    return process.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("无控制台 runner 启动器仅用于 Windows")
    return run(args.root)


if __name__ == "__main__":
    raise SystemExit(main())
