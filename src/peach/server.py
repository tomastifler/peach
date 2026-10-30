"""无桌面服务入口：维护 Web 进程，消费配置重载与资料处理请求。"""
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import threading

from . import onboarding, settings_file


def launch(*arguments: str) -> subprocess.Popen:
    environment = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", PEACH_HEADLESS_MANAGED="1")
    return subprocess.Popen(
        [sys.executable, "-m", "peach", *arguments],
        stdin=subprocess.DEVNULL, env=environment,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def stop_process(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=30)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def initialize() -> None:
    config = settings_file.load_config()
    if config.present:
        if not (config.directory('database') / 'ledger.db').is_file():
            raise RuntimeError('已有配置但缺少数据库，请恢复数据库后启动')
        from .runtime_prepare import configured_ledger_writer
        writer, _reason = configured_ledger_writer(config)
        if not writer:
            return
        migrate = launch("migrate", "upgrade", "--yes", "--db",
                         str(config.directory("database") / "ledger.db"))
        try:
            code = migrate.wait(timeout=180)
            if code:
                raise RuntimeError(f"数据库升级失败，退出码 {code}；服务未启动")
        finally:
            stop_process(migrate)
        return
    if config.directory("database").joinpath("ledger.db").exists():
        raise RuntimeError("A database exists but the configuration file is missing; restore config.toml and start again")
    process = launch("init", "--no-input")
    try:
        code = process.wait(timeout=120)
        if code:
            raise RuntimeError(f"Initialization failed, exit code {code}")
    finally:
        stop_process(process)


def supervise(host: str, port: int, stopping: threading.Event) -> int:
    service = scanner = None

    def serve() -> subprocess.Popen:
        return launch("serve", "--host", host, "--port", str(port), "--no-mdns", "--no-ledger-sync")

    def stop_all() -> None:
        nonlocal service, scanner
        stop_process(scanner)
        stop_process(service)
        service = scanner = None

    def restart(environment: dict[str, str]) -> None:
        # 看守进程之后读设置、拉起服务都按迁移后的位置；原位置留下的位置记录让以后的启动也跟过去。
        nonlocal service
        os.environ[settings_file.DATA_ROOT_ENV] = environment[settings_file.DATA_ROOT_ENV]
        service = serve()

    try:
        while not stopping.is_set():
            # 设置页「更改位置」写下的迁移请求：停服务、搬家、在新位置重新拉起，都在这一轮里做完。
            from .data_storage import poll_headless
            if poll_headless(stop_all, restart):
                continue
            config = settings_file.load_config()
            reload_path = config.directory("state") / onboarding.RELOAD_NAME
            if service is None or reload_path.exists():
                stop_process(service)
                service = serve()
                reload_path.unlink(missing_ok=True)
            code = service.poll()
            if code is not None:
                return code or 1
            if scanner is not None and scanner.poll() is not None:
                if scanner.returncode:
                    print(f"Metadata processing failed, exit code {scanner.returncode}", file=sys.stderr, flush=True)
                scanner = None
            if scanner is None:
                location = onboarding.take_first_scan_request(config)
                if location is not None:
                    scanner = launch("process", location)
            stopping.wait(1)
        return 0
    finally:
        stop_process(scanner)
        stop_process(service)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the browser-managed Peach service")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8900)
    args = parser.parse_args(argv)
    stopping = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stopping.set())
    initialize()
    print(f"Peach 服务监听：{args.host}:{args.port}。容器外部访问地址以宿主机端口映射为准。", flush=True)
    print("首次登录：在运行 Peach 的环境中执行 peach token 查看口令，登录后设置访问密码。", flush=True)
    if os.environ.get('PEACH_DISTRIBUTION') == 'docker':
        print("NAS / 局域网访问：Compose 的 PEACH_BIND 应为宿主机局域网 IP；127.0.0.1 只允许宿主机访问。", flush=True)
    return supervise(args.host, args.port, stopping)


if __name__ == "__main__":
    raise SystemExit(main())
