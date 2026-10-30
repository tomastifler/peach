"""后台服务此刻存在的问题：任务中心「需要处理」那一块的数据源。

每一项是一种持续状态（调度连续失败、公网入口断开、网络不通），不是跑过的一轮，所以
不写 `task_run`：那张表每类只留 20 条，持续状态写进去会被挤掉，修好以后还会剩下旧记录。
这里每次请求现读各服务自己的快照，问题消失这一项就不在了。

一项只说是什么、从什么时候开始、去哪儿处理；原因由 `href` 指向的那个设置位置自己讲，
这里不再复述一遍。高频逐条的失败（站点圆标、头像、单个推送文件）不进来：它们各自有
任务记录，汇总在这里只会刷屏。

动作按能不能原地修好分：网络、调度、amane 桥、人脸模型这类重跑一次就可能好的给 `retry`
（界面上一律叫「立即重试」）；要改设置、填凭据的只给链接。每项都带链接，`link_label` 写具体去处。

时间分两种：`since` 是服务自己记下的起点，两个调度（连续失败里第一轮的开始）和人脸模型
（那条失败记录的结束时刻）有；其余服务不记失败时刻，`noticed_at` 是这个进程第一次读到
这一项的时间，会晚于实际发生，重启后重新计。两者不互相顶替。

加一类问题就是往 `PROVIDERS` 里加一个函数：读 `(app_state, contract, config)`，
返回零到多条 `Issue`。服务没装配时 `getattr` 拿到 None，函数照样返回空。
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Iterable

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class Issue:
    key: str
    title: str
    href: str
    #: 链接文案写具体去处（「打开推送设置」），界面直接用。
    link_label: str
    since: str | None = None
    #: 能一键重试时的 POST 地址；只给自成一体、不需要表单与修订号的动作。
    retry: str | None = None
    #: 重试接口在只读端会被写入端闸门挡掉，界面据此把按钮置灰。
    retry_available: bool = False


def _stamp(moment: float) -> str:
    return datetime.fromtimestamp(moment, timezone.utc).isoformat().replace("+00:00", "Z")


def _push_discovery(state, _contract, _config) -> list[Issue]:
    service = getattr(state, "push_discovery", None)
    if service is None:
        return []
    snapshot = service.snapshot()
    if not snapshot.get("enabled"):
        return []
    href = "/settings/library#pushDiscovery"
    issues = []
    if snapshot["queue"].get("last_error"):
        issues.append(Issue("push-discovery", "自动发现新文件入库失败", href, "打开推送设置"))
    if snapshot.get("watch_local") and not snapshot.get("local_running") and snapshot.get("local_message"):
        issues.append(Issue("push-discovery-watch", "本机文件夹监视没有运行", href, "打开推送设置"))
    return issues


def _downloads(_state, contract, _config) -> list[Issue]:
    service = getattr(contract, "downloads", None)
    if service is None or not service.available:
        return []
    from .downloads import TRACKED_STATES
    marks = ",".join("?" * len(TRACKED_STATES))
    with contract.database.read_connection() as connection:
        (count,) = connection.execute(
            f"SELECT count(*) FROM download_task WHERE state IN ({marks}) "
            "AND coalesce(failure_detail, '') <> ''", tuple(TRACKED_STATES)).fetchone()
    if not count:
        return []
    return [Issue("downloads", f"{count} 个云下载任务对账暂时失败", "/tasks#cloudDownloads", "查看云下载")]


def _scheduler(attribute: str, key: str, title: str, href: str, link_label: str, retry: str):
    def provider(_state, contract, _config) -> list[Issue]:
        scheduler = getattr(contract, attribute, None)
        if scheduler is None:
            return []
        status = scheduler.status()
        if not status.get("enabled") or status.get("running") or not status.get("last_error"):
            return []
        return [Issue(key, title, href, link_label, since=status.get("failing_since"), retry=retry,
                      retry_available=bool(status.get("available")))]
    return provider


def _tunnel(state, _contract, config) -> list[Issue]:
    manager = getattr(state, "tunnel", None)
    # 残留的状态文件在停用后仍带着上一次的错误，所以先看是不是开着。
    if manager is None or config is None or not config.tunnel.enabled:
        return []
    if not manager.snapshot().error:
        return []
    return [Issue("tunnel", "公网入口连接失败", "/settings/network#tunnel", "打开公网入口设置")]


def _library_sharing(_state, _contract, config) -> list[Issue]:
    if config is None:
        return []
    from . import library_sharing
    if library_sharing.snapshot(config)["last_attempt"].get("status") != "failed":
        return []
    return [Issue("library-sharing", "馆藏分享上传失败", "/settings/maintenance#librarySharing", "打开数据上传设置")]


def _automatic_updates(state, _contract, _config) -> list[Issue]:
    service = getattr(state, "automatic_updates", None)
    if service is None or not service.snapshot().get("error"):
        return []
    return [Issue("automatic-updates", "自动更新出错", "/settings/maintenance#automaticUpdates", "打开自动更新设置")]


def _amane_bridge(state, contract, _config) -> list[Issue]:
    tools_root = getattr(contract, "tools_root", None)
    if tools_root is None:
        return []
    from .metadata_amane import installed
    if installed(tools_root):
        return []
    # 重建是后台任务，跑着的时候再点只会撞上 409；只读端的写入闸门同样会挡。
    job = getattr(contract, "amane_bridge_job", None)
    building = bool(job and (job.snapshot() or {}).get("status") == "running")
    sync = getattr(state, "sync", None)
    writer = sync is None or not sync.read_only
    return [Issue("amane-bridge", "amane 桥未安装", "/sources#amane", "打开 amane 设置",
                  retry="/api/scraping/amane-bridge/rebuild", retry_available=writer and not building)]


def _network(state, _contract, _config) -> list[Issue]:
    monitor = getattr(state, "network_reachability", None)
    # 只读快照，不在这里启动探测：探测线程由页面读 `/api/network-status` 时拉起。
    if monitor is None or monitor.summary().get("state") != "offline":
        return []
    return [Issue("network", "网络不通", "/settings/network#peachProxy", "打开 Peach 代理设置",
                  retry="/api/network-status/check", retry_available=True)]


def _face_models(_state, contract, _config) -> list[Issue]:
    runs = getattr(contract, "task_runs", None)
    # 账本还没迁移出任务记录表时任务中心整个是关着的，这一行跟着不报。
    if runs is None or not runs.available():
        return []
    from . import face_models
    status = face_models.status(runs)
    # 只有最新一条记录是失败才报：还没取过（`missing`）下次用到时会自己去取，不算问题；
    # 重新下载在跑时这一行先收起。失败原因只在那张任务卡上写，链接指过去。
    if status["state"] != "failed":
        return []
    # 模型存在本机工具目录、不碰账本，只读端同样可以重取。
    return [Issue("face-models", "人脸模型下载失败", f"/tasks#run-{status['run_id']}", "查看失败记录",
                  since=status["failed_at"], retry=status["retry_url"], retry_available=True)]


Provider = Callable[[Any, Any, Any], Iterable[Issue]]

PROVIDERS: tuple[Provider, ...] = (
    _network,
    _tunnel,
    _scheduler("follow_scheduler", "follow-schedule", "关注自动检查失败",
               "/settings/subscriptions#followScheduleSetting", "打开关注调度", "/api/follow/schedule/run"),
    _scheduler("feed_scheduler", "feed-schedule", "订阅源自动拉取失败",
               "/settings/subscriptions#feedScheduleSetting", "打开订阅源调度", "/api/feeds/schedule/run"),
    _push_discovery,
    _downloads,
    _automatic_updates,
    _library_sharing,
    _amane_bridge,
    _face_models,
)


class IssueLog:
    """记下每一项第一次被读到的时刻；那一项消失就忘掉，再出现时重新计。"""

    def __init__(self, clock: Callable[[], float] = time.time):
        self.clock = clock
        self._lock = threading.Lock()
        self._noticed: dict[str, str] = {}

    def collect(self, state, contract, config, providers: Iterable[Provider] = PROVIDERS) -> list[dict]:
        issues: list[Issue] = []
        for provider in providers:
            try:
                issues.extend(provider(state, contract, config))
            except Exception:  # 一个服务读坏了不该让整块消失
                LOGGER.exception("读取后台问题失败：%s", getattr(provider, "__name__", provider))
        now = _stamp(self.clock())
        with self._lock:
            current = {issue.key for issue in issues}
            for key in set(self._noticed) - current:
                del self._noticed[key]
            rows = []
            for issue in issues:
                noticed = self._noticed.setdefault(issue.key, now)
                rows.append({**asdict(issue), "noticed_at": noticed})
        return rows
