"""在构建目录安装固定的媒体编译工具，不安装系统运行组件。"""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys
import tarfile

from fetch_ffmpeg_sources import download_source

NASM = {"name": "nasm", "url": "https://www.nasm.us/pub/nasm/releasebuilds/3.02/nasm-3.02.tar.xz",
        "sha256": "87336eba53b4acfe917424ab5d500d2b0054d9f5148d35c2273ccf2cfb712f0d"}


def setup(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    environment = root / "env"
    subprocess.run(["uv", "venv", "--allow-existing", "--python", sys.executable, str(environment)], check=True)
    subprocess.run(["uv", "pip", "install", "--python", str(environment / "bin/python"),
                    "meson==1.12.1", "ninja==1.13.2", "pkgconf==3.0.7.post0"], check=True)
    archive = root / "nasm-3.02.tar.xz"
    download_source(NASM, archive)
    source = root / "nasm-3.02"
    if not source.exists():
        with tarfile.open(archive) as package:
            package.extractall(root, filter="data")
    for command in (["./configure", f"--prefix={environment}"], ["make", "-j8"], ["make", "install"]):
        subprocess.run(command, cwd=source, check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    args = parser.parse_args()
    setup(args.root.resolve())
