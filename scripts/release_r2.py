"""将通过验收的发行包上传到 R2，并发布可公开校验的下载清单。"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import quote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from peach.user_agent import USER_AGENT
from peach.peach_proxy import http_client


def inventory(root: Path, version: str) -> list[dict]:
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("发布版本必须是三段数字")
    paths = sorted(path for path in root.iterdir() if path.is_file()
                   and path.suffix in {".zip", ".exe", ".dmg"})
    required = {f"Peach-{version}-windows-x64{suffix}" for suffix in (".zip", "-setup.exe", "-lite-setup.exe", "-update.zip")}
    required.update(f"Peach-{version}-macos-{arch}.dmg" for arch in ("arm64", "x86_64"))
    if not required.issubset(path.name for path in paths):
        raise ValueError("发布制品缺少 Windows 完整包、轻量包或 macOS 双架构 DMG")
    items = []
    for path in paths:
        if path.is_symlink() or not re.fullmatch(r"[A-Za-z0-9_.-]+", path.name) or not path.stat().st_size:
            raise ValueError(f"无效的发布制品：{path.name}")
        with path.open("rb") as source:
            checksum = hashlib.file_digest(source, "sha256").hexdigest()
        items.append({"name": path.name, "size": path.stat().st_size, "sha256": checksum})
    return items


def verify_download(url: str, item: dict) -> None:
    checksum = hashlib.sha256()
    size = 0
    with http_client(follow_redirects=True, timeout=120) as client, client.stream("GET", url, headers={"User-Agent": USER_AGENT}) as response:
        if response.status_code != 200:
            raise ValueError(f"公开下载未返回完整文件：{item['name']}")
        for chunk in response.iter_bytes(1024 * 1024):
            size += len(chunk)
            checksum.update(chunk)
    if size != item["size"] or checksum.hexdigest() != item["sha256"]:
        raise ValueError(f"公开下载的大小或 SHA-256 不符：{item['name']}")


def rclone_environment() -> dict:
    environment = os.environ.copy()
    for key in ("PEACH_R2_ACCESS_KEY_ID", "PEACH_R2_SECRET_ACCESS_KEY", "PEACH_R2_ENDPOINT", "PEACH_R2_BUCKET", "PEACH_R2_PUBLIC_BASE"):
        if not environment.get(key):
            raise ValueError(f"缺少发布变量：{key}")
    endpoint = urlsplit(environment["PEACH_R2_ENDPOINT"])
    public = urlsplit(environment["PEACH_R2_PUBLIC_BASE"])
    if endpoint.scheme != "https" or not endpoint.hostname or not endpoint.hostname.endswith(".r2.cloudflarestorage.com"):
        raise ValueError("上传端点必须是 Cloudflare R2 HTTPS 地址")
    if public.scheme != "https" or not public.hostname or public.username or public.password:
        raise ValueError("公开下载入口必须是无凭据的 HTTPS 地址")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", environment["PEACH_R2_BUCKET"]):
        raise ValueError("无效的 R2 桶名")
    environment.update({"RCLONE_CONFIG_PEACH_TYPE": "s3", "RCLONE_CONFIG_PEACH_PROVIDER": "Cloudflare",
                        "RCLONE_CONFIG_PEACH_ACCESS_KEY_ID": environment["PEACH_R2_ACCESS_KEY_ID"],
                        "RCLONE_CONFIG_PEACH_SECRET_ACCESS_KEY": environment["PEACH_R2_SECRET_ACCESS_KEY"],
                        "RCLONE_CONFIG_PEACH_ENDPOINT": environment["PEACH_R2_ENDPOINT"],
                        "RCLONE_CONFIG_PEACH_REGION": "auto", "RCLONE_CONFIG_PEACH_NO_CHECK_BUCKET": "true"})
    return environment


def require_capacity(existing: list[dict], items: list[dict], tag: str, limit: int) -> int:
    """保留已有版本，超出本桶发布预算时拒绝上传。"""
    current = {item["Path"]: item["Size"] for item in existing if not item.get("IsDir")}
    projected = sum(current.values()) + sum(item["size"] for item in items
                                          if f"{tag}/{item['name']}" not in current) + 1_000_000
    if limit <= 0 or projected > limit:
        raise ValueError(f"发布桶预计占用 {projected} 字节，超过上限 {limit}；保留已有制品并停止上传")
    return projected


def publish(root: Path, version: str, *, apply: bool = False) -> dict:
    items = inventory(root, version)
    result = {"version": version, "files": items, "applied": apply}
    if not apply:
        return result
    environment = rclone_environment()
    published_at = environment.get("CI_COMMIT_TIMESTAMP")
    if not published_at:
        raise ValueError("发布需要 CI_COMMIT_TIMESTAMP，以便相同提交可重复校验")
    sha = environment.get("CI_COMMIT_SHA", "")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("发布需要 CI_COMMIT_SHA")
    executable = environment.get("PEACH_RCLONE") or shutil.which("rclone")
    if not executable:
        raise ValueError("发布需要官方 rclone")
    tag = "v" + version
    prefix = f"peach:{environment['PEACH_R2_BUCKET']}/{tag}"
    base = environment["PEACH_R2_PUBLIC_BASE"].rstrip("/")

    def upload(path: Path, target: str, *, immutable: bool = True) -> None:
        command = [executable, "copyto", str(path), target, "--checksum", "--config", str(configuration),
                   "--header-upload", "Cache-Control: public, max-age=" + ("31536000, immutable" if immutable else "60")]
        if immutable:
            command.append("--immutable")
        subprocess.run(command, env=environment, check=True)

    with tempfile.TemporaryDirectory(prefix="peach-release-publish-") as directory:
        temporary = Path(directory)
        configuration = temporary / "rclone.conf"
        configuration.touch()
        listing = subprocess.check_output([executable, "lsjson", f"peach:{environment['PEACH_R2_BUCKET']}",
                                           "--recursive", "--files-only", "--config", str(configuration)],
                                          env=environment, text=True, encoding="utf-8")
        existing = json.loads(listing)
        result["projected_bucket_bytes"] = require_capacity(existing, items, tag,
                                                            int(environment.get("PEACH_R2_MAX_BYTES", "8000000000")))
        sums = temporary / "SHA256SUMS.txt"
        sums.write_text("".join(f"{item['sha256']}  {item['name']}\n" for item in items), encoding="utf-8")
        with sums.open("rb") as source:
            manifest = {"name": sums.name, "size": sums.stat().st_size,
                        "sha256": hashlib.file_digest(source, "sha256").hexdigest()}
        for item in [*items, manifest]:
            upload(sums if item is manifest else root / item["name"], f"{prefix}/{item['name']}")
            item["browser_download_url"] = f"{base}/{tag}/{quote(item['name'])}"
            verify_download(item["browser_download_url"], item)
            item["state"] = "uploaded"
            item["digest"] = "sha256:" + item["sha256"]
        release = {"tag_name": tag, "commit_sha": sha, "name": f"Peach {version}", "draft": False, "prerelease": True,
                   "html_url": f"https://gitgud.io/peach-mitao/peach/-/releases/{tag}",
                   "published_at": published_at, "assets": [*items, manifest]}
        release_file = temporary / "release.json"
        release_file.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        upload(release_file, f"{prefix}/release.json")
        releases = []
        if any(item["Path"] == "releases.json" for item in existing):
            releases = json.loads(subprocess.check_output(
                [executable, "cat", f"peach:{environment['PEACH_R2_BUCKET']}/releases.json",
                 "--config", str(configuration)], env=environment, text=True, encoding="utf-8"))
        if not isinstance(releases, list):
            raise ValueError("公开版本索引格式无效")
        index = temporary / "releases.json"
        index.write_text(json.dumps([release, *(item for item in releases if item["tag_name"] != tag)][:30],
                                    ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        upload(index, f"peach:{environment['PEACH_R2_BUCKET']}/releases.json", immutable=False)
        with index.open("rb") as source:
            index_info = {"name": index.name, "size": index.stat().st_size,
                          "sha256": hashlib.file_digest(source, "sha256").hexdigest()}
        verify_download(f"{base}/releases.json?release={tag}", index_info)
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(publish(args.root.resolve(), args.version, apply=args.apply), ensure_ascii=False, indent=2))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"R2 发布未完成：{error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
