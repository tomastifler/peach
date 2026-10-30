"""远程事件的有限用途、运行环境、分发方式与构建身份。"""
from __future__ import annotations

import math
import os
import platform
import re
import subprocess
import sys
from functools import lru_cache

from . import __version__
from .buildinfo import frozen_build

PURPOSES = {"usage": "version-statistics", "errors": "technical-diagnostics", "research": "population-research"}
# 内存按常见容量取最近一档，只说明机器量级，不上报精确字节数。
MEMORY_BUCKETS_GB = (2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256)


def distribution():
    """安装来源：桌面应用、Docker 镜像、wheel 安装或源码检出。"""
    if getattr(sys, "frozen", False):
        return {"Windows": "windows-app", "Darwin": "macos-app"}.get(platform.system(), "packaged")
    if os.environ.get("PEACH_DISTRIBUTION") == "docker":
        return "docker"
    from .settings_file import PROJECT_ROOT
    return "wheel" if PROJECT_ROOT.name == "_resources" else "source"


def _memory_bytes():
    if os.name == "nt":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                        *((name, ctypes.c_ulonglong) for name in (
                            "total", "available", "page_total", "page_available",
                            "virtual_total", "virtual_available", "extended_available"))]

        status = MemoryStatus()
        status.length = ctypes.sizeof(MemoryStatus)
        return status.total if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)) else None
    return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")


def memory_bucket(total):
    gigabytes = total / 2 ** 30
    if gigabytes >= MEMORY_BUCKETS_GB[-1] * 1.25:
        return f"{MEMORY_BUCKETS_GB[-1]}+"
    return str(min(MEMORY_BUCKETS_GB, key=lambda bucket: abs(math.log(gigabytes / bucket))))


def machine_facts():
    """版本统计附带的本机量级信息；Docker 内的系统版本是宿主内核。"""
    system = platform.system()
    version = (platform.mac_ver()[0] if system == "Darwin"
               else platform.version() if system == "Windows" else platform.release())
    facts = {"os_version": version, "architecture": platform.machine(),
             "python": platform.python_version(), "cpu_cores": str(os.cpu_count() or "")}
    try:
        total = _memory_bytes()
        if total:
            facts["memory_gb"] = memory_bucket(total)
    except (OSError, ValueError, AttributeError):
        pass
    return {key: value[:200] for key, value in facts.items() if value}


@lru_cache(maxsize=1)
def _source_commit():
    from .settings_file import PROJECT_ROOT
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT,
            capture_output=True, text=True, encoding="utf-8", timeout=2,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        commit = result.stdout.strip() if result.returncode == 0 else ""
        return commit if re.fullmatch(r"[a-f0-9]{40}", commit) else None
    except (OSError, subprocess.SubprocessError):
        return None


def event_metadata(kind):
    from .settings_file import PROJECT_ROOT
    runtime = "packaged" if getattr(sys, "frozen", False) else "source"
    environment = os.environ.get("PEACH_REPORTING_ENVIRONMENT", "")
    if environment not in {"production", "development", "test"}:
        environment = "development" if runtime == "source" and (PROJECT_ROOT / ".git").is_file() else "production"
    build = frozen_build() if runtime == "packaged" else None
    commit = build.commit if build else (_source_commit() if runtime == "source" else None)
    result = {"release": __version__, "environment": environment,
              "tags": {"purpose": PURPOSES[kind], "runtime": runtime, "distribution": distribution()}}
    if isinstance(commit, str) and re.fullmatch(r"[a-f0-9]{40}", commit):
        result["dist"] = commit
    return result
