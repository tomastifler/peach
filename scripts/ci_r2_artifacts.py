"""通过 R2 传递演练大产物并晋级至标签，GitLab 只保存带 SHA-256 的清单。"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "scripts"
from .release_r2 import rclone_environment, require_capacity

GROUPS = {
    "windows-media": ("build/ffmpeg-windows/ffmpeg", "build/ffmpeg-windows/ffmpeg-corresponding-source.zip",
                      "build/untrunc-windows/untrunc", "build/untrunc-windows/untrunc-corresponding-source.zip"),
    "windows-release": ("release",),
    "macos-release": ("dist/macos.noindex/arm64", "dist/macos.noindex/x86_64"),
    "docker-release": ("build/ci-artifacts/docker-image.json",),
}


def rehearsal_tag() -> str:
    """版本提交演练（ADR-0121）还没有标签：用提交里的版本号代替，流水线规则保证它是版本提交。"""
    source = (Path(__file__).resolve().parents[1] / "src/peach/__init__.py").read_text(encoding="utf-8")
    found = re.search(r'^__version__ = "([0-9]+\.[0-9]+\.[0-9]+)"$', source, re.M)
    return "v" + found.group(1) if found else ""


def identity() -> dict:
    result = {key: os.environ.get("CI_" + variable, "") for key, variable in
              (("project", "PROJECT_ID"), ("pipeline", "PIPELINE_ID"), ("commit", "COMMIT_SHA"), ("tag", "COMMIT_TAG"))}
    if os.environ.get("PEACH_RELEASE_REHEARSAL") == "1" and not result["tag"]:
        result["tag"] = rehearsal_tag()
    if (not all(re.fullmatch(r"[1-9][0-9]*", result[key]) for key in ("project", "pipeline"))
            or not re.fullmatch(r"[0-9a-f]{40}", result["commit"])
            or not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", result["tag"])
            or os.environ.get("CI_COMMIT_REF_PROTECTED") != "true"):
        raise ValueError("R2 暂存仅允许受保护版本标签与明确的项目、流水线和提交")
    return result


def prefix(build: dict, group: str | None = None, producer_job: str | None = None) -> str:
    value = f"_ci/{build['project']}/{build['pipeline']}/{build['commit']}"
    if group is not None:
        if group not in GROUPS or not isinstance(producer_job, str) or not re.fullmatch(r"[1-9][0-9]*", producer_job):
            raise ValueError("产物暂存需要明确的生成作业 ID")
        return value + "/" + group + "/" + producer_job
    return value


def allowed_path(name: str, group: str) -> bool:
    parts = PurePosixPath(name).parts
    if (not parts or any(part in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in parts)
            or PurePosixPath(name).is_absolute() or str(PurePosixPath(name)) != name):
        return False
    if group == "macos-release":
        return (len(parts) == 4 and "/".join(parts[:3]) in GROUPS[group]
                and (parts[-1] in {"build-info.json", "SHA256SUMS.txt"} or parts[-1].endswith(".dmg")
                     or bool(re.fullmatch(r"(?:ffmpeg|untrunc)-macos-(?:arm64|x86_64)-corresponding-source.zip", parts[-1]))))
    if group == "windows-release":
        return len(parts) == 2 and parts[0] == "release" and (
            bool(re.fullmatch(r"Peach-[0-9]+\.[0-9]+\.[0-9]+-windows-x64[-A-Za-z0-9.]*\.(zip|exe)", parts[-1]))
            or parts[-1] in {"ffmpeg-corresponding-source.zip", "untrunc-corresponding-source.zip",
                              "RELEASE_NOTES.md", "DOWNLOADS.md", "version.txt", "ci_windows.ps1",
                              "smoke_desktop.py", "smoke_update_tasks.py", "smoke_split_update.py"})
    if group == "docker-release":
        return name == "build/ci-artifacts/docker-image.json"
    return any(name == base or name.startswith(base + "/") for base in GROUPS[group])


def local_path(root: Path, name: str, group: str) -> Path:
    if not allowed_path(name, group):
        raise ValueError("产物路径不属于本任务输出目录")
    path = root / name
    if not path.resolve().is_relative_to(root) or any(parent.is_symlink() for parent in (path, *path.parents) if parent != root and parent.is_relative_to(root)):
        raise ValueError("产物路径包含软链接或越出工作目录")
    return path


def checksum(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def rclone_executable(root: Path) -> str:
    suffix = ".exe" if os.name == "nt" else ""
    path = root / "build/release-tools" / ("rclone" + suffix)
    if not path.is_file() or path.is_symlink():
        raise ValueError("CI 中转仅使用项目内已核对官方 SHA-256 的 rclone")
    return str(path)


def inventory(root: Path, group: str) -> list[dict]:
    paths = []
    for base in GROUPS[group]:
        source = root / base
        if not source.exists():
            raise ValueError(f"缺少构建产物目录或文件：{base}")
        paths.extend(source.rglob("*") if source.is_dir() else [source])
    items = []
    for path in sorted(paths):
        name = path.relative_to(root).as_posix()
        if group == "macos-release" and not allowed_path(name, group):
            continue
        if path.is_symlink():
            raise ValueError("CI 产物不允许软链接")
        if not path.is_file():
            continue
        local_path(root, name, group)
        items.append({"path": name, "size": path.stat().st_size, "sha256": checksum(path)})
    if not items or len({item["path"].casefold() for item in items}) != len(items):
        raise ValueError("产物清单为空或包含跨平台同名文件")
    if group == "macos-release":
        build = identity()
        for arch in ("arm64", "x86_64"):
            folder = root / "dist/macos.noindex" / arch
            image = folder / f"Peach-{build['tag'][1:]}-macos-{arch}.dmg"
            # 镜像随包带 FFmpeg 与 untrunc，许可证要求同时提供对应源码；清单逐个列出这三份。
            listed = {image.name} | {f"{tool}-macos-{arch}-corresponding-source.zip" for tool in ("ffmpeg", "untrunc")}
            present = {PurePosixPath(item["path"]).name for item in items
                       if item["path"].startswith(f"dist/macos.noindex/{arch}/")}
            if present != listed | {"build-info.json", "SHA256SUMS.txt"}:
                raise ValueError("每种 macOS 架构须包含 DMG、两份对应源码、构建身份与 SHA-256 清单")
            info = json.loads((folder / "build-info.json").read_text(encoding="utf-8"))
            sums = {}
            for line in (folder / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
                digest, _, name = line.partition("  ")
                sums[name] = digest
            if (info.get("commit") != build["commit"] or info.get("version") != build["tag"][1:]
                    or info.get("architecture") != arch or info.get("dirty") is not False
                    or set(sums) != listed
                    or any(sums[name] != checksum(folder / name) for name in listed)):
                raise ValueError("macOS 构建身份或镜像 SHA-256 不符")
    return items


def validate_manifest(manifest: dict, group: str, build: dict) -> list[dict]:
    if manifest.get("format") != 1 or manifest.get("identity") != build or manifest.get("group") != group:
        raise ValueError("产物清单不属于当前版本、提交或流水线")
    prefix(build, group, manifest.get("producer_job"))
    items = manifest.get("files")
    if not isinstance(items, list) or not items:
        raise ValueError("产物清单缺少文件")
    names = set()
    for item in items:
        name = item.get("path", "")
        if (not allowed_path(name, group) or name.casefold() in names
                or type(item.get("size")) is not int or item["size"] < 0
                or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", ""))):
            raise ValueError("产物清单的路径、大小或 SHA-256 无效")
        names.add(name.casefold())
    return items


def checkpoint(build: dict, group: str) -> str:
    if group not in GROUPS:
        raise ValueError("未知的产物组")
    return prefix(build) + "/completed/" + group + ".json"


def upload_backup(root: Path, build: dict, group: str) -> Path | None:
    value = os.environ.get("CI_BUILDS_DIR")
    if not value:
        return None
    if group not in GROUPS or any(not re.fullmatch(r"[1-9][0-9]*", build[key]) for key in ("project", "pipeline")):
        raise ValueError("无效的构建续传身份")
    base = Path(value).resolve() / ".peach-upload-resume"
    path = base / build["project"] / build["pipeline"] / build["commit"] / group
    if not path.resolve().is_relative_to(base.resolve()) or path.resolve().is_relative_to(root.resolve()):
        raise ValueError("续传目录必须位于 CI 构建根的独立命名空间")
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(base)):
        raise ValueError("续传目录不能包含软链接")
    return path


def preserve_upload(root: Path, manifest: dict) -> None:
    group, build = manifest["group"], manifest["identity"]
    destination = upload_backup(root, build, group)
    if destination is None:
        return
    destination.mkdir(parents=True, exist_ok=True)
    for item in manifest["files"]:
        source = local_path(root, item["path"], group)
        target = local_path(destination, item["path"], group)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    temporary = destination / "upload.json.tmp"
    temporary.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination / "upload.json")


def discard_upload(root: Path, build: dict, group: str) -> None:
    path = upload_backup(root, build, group)
    if path is not None and path.exists():
        shutil.rmtree(path)


def remote_json(root: Path, key: str, payload: dict | None = None) -> dict | None:
    """只在受保护 CI 的暂存命名空间读取或登记完整对象；网络失败不当作不存在。"""
    if not re.fullmatch(r"_ci/[1-9][0-9]*/[1-9][0-9]*/[0-9a-f]{40}/(?:completed/[a-z-]+|release-candidate)\.json", key):
        raise ValueError("无效的 CI 元数据路径")
    environment = rclone_environment()
    executable = rclone_executable(root.resolve(strict=True))
    bucket = f"peach:{environment['PEACH_R2_BUCKET']}"
    with tempfile.TemporaryDirectory(prefix="peach-ci-metadata-") as directory:
        temporary = Path(directory)
        configuration = temporary / "rclone.conf"
        configuration.touch()
        common = {"env": environment, "text": True, "encoding": "utf-8"}
        if payload is None:
            listing = json.loads(subprocess.check_output([executable, "lsjson", bucket, "--recursive", "--files-only",
                "--config", str(configuration)], **common))
            if not any(row["Path"] == key for row in listing):
                return None
            return json.loads(subprocess.check_output([executable, "cat", bucket + "/" + key,
                "--config", str(configuration)], **common))
        source = temporary / "metadata.json"
        source.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        subprocess.run([executable, "copyto", str(source), bucket + "/" + key,
            "--checksum", "--immutable", "--config", str(configuration)], env=environment, check=True)
        return payload


def restore(root: Path, group: str) -> dict:
    """恢复同一受保护提交与流水线已完整上传的构建，供失败作业重试复用。"""
    build = identity()
    manifest = remote_json(root, checkpoint(build, group))
    result = {"restored": manifest is not None, "uploaded": manifest is not None, "group": group}
    destination = root / "build/ci-artifacts"
    destination.mkdir(parents=True, exist_ok=True)
    if manifest is not None:
        validate_manifest(manifest, group, build)
        (destination / (group + ".json")).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        result.update(transfer(root, group, "pull"))
        discard_upload(root, build, group)
    else:
        backup = upload_backup(root, build, group)
        if backup is not None and (backup / "upload.json").is_file():
            manifest = json.loads((backup / "upload.json").read_text(encoding="utf-8"))
            items = validate_manifest(manifest, group, build)
            for item in items:
                path = local_path(backup, item["path"], group)
                if not path.is_file() or path.stat().st_size != item["size"] or checksum(path) != item["sha256"]:
                    raise ValueError("本机续传文件的大小或 SHA-256 不符")
            for item in items:
                target = local_path(root, item["path"], group)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(local_path(backup, item["path"], group), target)
            (destination / (group + ".json")).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            result["restored"] = True
    (destination / (group + "-resume.json")).write_text(json.dumps(result) + "\n", encoding="utf-8")
    return result


def transfer(root: Path, group: str, mode: str, *, source: dict | None = None) -> dict:
    root = root.resolve(strict=True)
    current = identity()
    build = current if source is None else source
    if source is not None and (mode != "pull" or any(build[key] != current[key] for key in ("project", "commit", "tag"))):
        raise ValueError("晋级产物必须属于同一项目、版本与提交")
    environment = rclone_environment()
    executable = rclone_executable(root)
    manifest_path = root / "build/ci-artifacts" / (group + ".json")
    if mode == "push":
        producer_job = os.environ.get("CI_JOB_ID", "")
        if manifest_path.exists():
            previous = json.loads(manifest_path.read_text(encoding="utf-8"))
            validate_manifest(previous, group, build)
            if previous["files"] == inventory(root, group):
                producer_job = previous["producer_job"]
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        items = validate_manifest(manifest, group, build)
        producer_job = manifest["producer_job"]
    storage_prefix = prefix(build, group, producer_job)
    remote = f"peach:{environment['PEACH_R2_BUCKET']}/{storage_prefix}"
    with tempfile.TemporaryDirectory(prefix="peach-ci-r2-") as directory:
        temporary = Path(directory).resolve()
        configuration = temporary / "rclone.conf"
        configuration.touch()

        def command(*args, read=False):
            args = [executable, *args, "--config", str(configuration)]
            if read:
                return subprocess.check_output(args, env=environment, text=True, encoding="utf-8")
            subprocess.run(args, env=environment, check=True)

        if mode == "push":
            actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True, encoding="utf-8").strip()
            dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True, encoding="utf-8").strip()
            if actual != build["commit"] or dirty:
                raise ValueError("暂存需要当前提交的干净构建目录")
            items = inventory(root, group)
            manifest = {"format": 1, "identity": build, "group": group, "producer_job": producer_job, "files": items}
            preserve_upload(root, manifest)
            existing = json.loads(command("lsjson", f"peach:{environment['PEACH_R2_BUCKET']}", "--recursive", "--files-only", read=True))
            require_capacity(existing, [{"name": item["path"], "size": item["size"]} for item in items],
                             storage_prefix, int(environment.get("PEACH_R2_MAX_BYTES", "8000000000")))
            listing = temporary / "files.txt"
            listing.write_text("".join(item["path"] + "\n" for item in items), encoding="utf-8")
            command("copy", str(root), remote, "--files-from-raw", str(listing), "--checksum", "--immutable")
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            remote_json(root, checkpoint(build, group), manifest)
            discard_upload(root, build, group)
        else:
            for item in items:
                local_path(root, item["path"], group)
            listing = temporary / "files.txt"
            listing.write_text("".join(item["path"] + "\n" for item in items), encoding="utf-8")
            command("copy", remote, str(temporary / "download"), "--files-from-raw", str(listing), "--checksum")
            for item in items:
                source = temporary / "download" / item["path"]
                if not source.is_file() or source.stat().st_size != item["size"] or checksum(source) != item["sha256"]:
                    raise ValueError(f"R2 暂存产物的大小或 SHA-256 不符：{item['path']}")
            for item in items:
                target = local_path(root, item["path"], group)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(temporary / "download" / item["path"], target)
    return {"group": group, "mode": mode, "files": len(items), "bytes": sum(item["size"] for item in items), "commit": build["commit"]}


def cleanup(root: Path, *, source: dict | None = None) -> dict:
    """回收指定流水线的暂存前缀；晋级入口在全部发布成功后选择来源演练。"""
    current = identity()
    build = current if source is None else source
    if source is not None and any(build[key] != current[key] for key in ("project", "commit", "tag")):
        raise ValueError("回收范围必须属于同一项目、版本与提交")
    rehearsal = os.environ.get("PEACH_RELEASE_REHEARSAL") == "1" and not os.environ.get("CI_COMMIT_TAG")
    environment = rclone_environment()
    executable = rclone_executable(root.resolve(strict=True))
    remote = f"peach:{environment['PEACH_R2_BUCKET']}/{prefix(build)}"
    with tempfile.TemporaryDirectory(prefix="peach-ci-r2-cleanup-") as directory:
        configuration = Path(directory) / "rclone.conf"
        configuration.touch()
        if not rehearsal:
            index = json.loads(subprocess.check_output(
                [executable, "cat", f"peach:{environment['PEACH_R2_BUCKET']}/releases.json", "--config", str(configuration)],
                env=environment, text=True, encoding="utf-8"))
            if not any(item.get("tag_name") == build["tag"] and item.get("commit_sha") == build["commit"]
                       for item in index):
                raise ValueError("公开版本索引尚未登记当前提交，保留暂存产物")
        subprocess.run([executable, "purge", remote, "--config", str(configuration)], env=environment, check=True)
    return {"cleaned_pipeline": build["pipeline"], "commit": build["commit"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("push", "pull", "restore", "cleanup"))
    parser.add_argument("group", nargs="?", choices=tuple(GROUPS))
    args = parser.parse_args()
    if args.mode != "cleanup" and not args.group:
        parser.error("上传和下载须指定产物组")
    result = (cleanup(Path.cwd()) if args.mode == "cleanup" else restore(Path.cwd(), args.group)
              if args.mode == "restore" else transfer(Path.cwd(), args.group, args.mode))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
