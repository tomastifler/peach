"""CloudDrive2 cloud download: submit and track tasks through the official gRPC API.

Peach 不另申请 115 应用，复用 CloudDrive2 已有的 115open 授权：一个应用最多授权两次，第三次
会顶掉第一次。CloudDrive2 的 API 令牌由用户在设置页填一次，存本机 `CredentialStore`，
只放进 gRPC 的 `authorization` 元数据，不进 URL、日志与 ledger。

 The API subset is in `downloads_clouddrive.proto`. The flow follows JavBoss
`internal/clouddrive/client.go` 与 `internal/service/download.go`：提交前确认目标目录
`canOfflineDownload` 并查配额，提交时让 CloudDrive2 10 秒后自己看一眼目录，之后按 infohash
在目录的离线列表里对账；列表里找不到时看目录里有没有那个文件。

115 charges one offline quota per task (annual members get 1500 per month, monthly members 200, reset at month end). Check before submitting
目录里是否已有同一 infohash 的离线任务，有就接管，不再扣。

115 目标目录留空时，检查从推送发现的云端路径前缀里推一个（「检查」键、打开设置页与保存配置
都走这一套）：对每条前缀调 `FindFileByPath`，CloudDrive2 回的 `CloudAPI.name` 是 115 那一类
的才算 115 前缀，候选是 `<前缀>/云下载`。判据取 CloudDrive2 自报的云盘类型，不看前缀名字；`FindFileByPath` 只要
「列目录」权限，查目标目录本来就要它，不另要挂载点或云盘列表的权限。PikPak 根目录对应的
媒体目录同理：前缀是 PikPak 云盘根、对应的本机根是已声明的 PikPak 来源，就推它。
"""
from __future__ import annotations

import posixpath
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import grpc
from google.protobuf import empty_pb2

from . import downloads_clouddrive_pb2 as pb
from .downloads import (
    DONE, ERROR, MISSING, RUNNING, DownloadError, DownloadTask, Magnet, RemoteStatus,
    classify_remote_message, clean_address, magnet_info_hash,
)
from .push_discovery import CloudPrefix, normalise_prefix

SERVICE = "/clouddrive.CloudDriveFileSrv/"
#: 单次调用的上限。离线列表要强制刷新，115 那一侧偶尔要几秒。
CALL_TIMEOUT = 30.0
#: 提交后让 CloudDrive2 自己隔多久去目标目录看一眼。
CHECK_FOLDER_AFTER_SECS = 10
#: 地址留空时「检查」依次试的本机地址：独立版默认 19798，Windows 桌面版有用 29798 的。
LOCAL_ADDRESSES = ("http://127.0.0.1:19798", "http://127.0.0.1:29798")
#: 探测一个地址的上限。本机端口没人听时立刻被拒，这个上限只兜住听着却不应答的情况。
PROBE_TIMEOUT = 3.0

#: 「检查」要报的三项离线权限。取消要用到第三项，缺它只是不能取消。
OFFLINE_PERMISSIONS = {
    "allow_add_offline_download": "Submit offline tasks",
    "allow_list_offline_downloads": "View offline tasks and quota",
    "allow_modify_offline_downloads": "Cancel offline tasks",
}

#: CloudDrive2 自报的云盘类型（`CloudDriveFile.CloudAPI.name`），比对不分大小写。115 开放平台
#: 授权是 `115open`，cookie 或扫码登录的是 `115`。
CLOUDS_115 = frozenset({"115", "115open"})
CLOUDS_PIKPAK = frozenset({"pikpak"})
#: 115 目标目录留空时，在 115 前缀下建议的文件夹名。
SUGGESTED_FOLDER = "云下载"

_METHODS = {
    "GetSystemInfo": (empty_pb2.Empty, pb.CloudDriveSystemInfo),
    "GetApiTokenInfo": (pb.StringValue, pb.TokenInfo),
    "GetAllCloudApis": (empty_pb2.Empty, pb.CloudAPIList),
    "GetCloudAPIConfig": (pb.GetCloudAPIConfigRequest, pb.CloudAPIConfig),
    "SetCloudAPIConfig": (pb.SetCloudAPIConfigRequest, empty_pb2.Empty),
    "GetMountPoints": (empty_pb2.Empty, pb.GetMountPointsResult),
    "FindFileByPath": (pb.FindFileByPathRequest, pb.CloudDriveFile),
    "CreateFolder": (pb.CreateFolderRequest, pb.CreateFolderResult),
    "AddOfflineFiles": (pb.AddOfflineFileRequest, pb.FileOperationResult),
    "RemoveOfflineFiles": (pb.RemoveOfflineFilesRequest, pb.FileOperationResult),
    "ListOfflineFilesByPath": (pb.FileRequest, pb.OfflineFileListResult),
    "GetOfflineQuotaInfo": (pb.OfflineQuotaRequest, pb.OfflineQuotaInfo),
}

_NETWORK_CODES = {grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED,
                  grpc.StatusCode.RESOURCE_EXHAUSTED, grpc.StatusCode.ABORTED,
                  grpc.StatusCode.CANCELLED}
_AUTH_CODES = {grpc.StatusCode.UNAUTHENTICATED, grpc.StatusCode.PERMISSION_DENIED}


def channel_target(address: str) -> tuple[str, bool]:
    """Validate the service address and build the gRPC target; an illegal address uses the download-domain error."""
    try:
        address = clean_address(address)
    except ValueError as error:
        raise DownloadError("config", str(error)) from error
    parts = urlsplit(address)
    if not parts.hostname:
        raise DownloadError("config", "CloudDrive2 address is not set")
    port = parts.port or (443 if parts.scheme == "https" else 19798)
    host = parts.hostname if ":" not in parts.hostname else f"[{parts.hostname}]"
    return f"{host}:{port}", parts.scheme == "https"


def open_channel(address: str) -> grpc.Channel:
    target, secure = channel_target(address)
    return (grpc.secure_channel(target, grpc.ssl_channel_credentials())
            if secure else grpc.insecure_channel(target))


def answers(address: str, *, timeout: float = PROBE_TIMEOUT) -> bool:
    """不带令牌调 `GetSystemInfo`，正常应答才算这个地址上有 CloudDrive2。"""
    request_type, response_type = _METHODS["GetSystemInfo"]
    with open_channel(address) as channel:
        stub = channel.unary_unary(
            SERVICE + "GetSystemInfo", request_serializer=request_type.SerializeToString,
            response_deserializer=response_type.FromString)
        try:
            stub(request_type(), timeout=timeout)
        except grpc.RpcError:
            return False
    return True


def discover(addresses: tuple[str, ...] = LOCAL_ADDRESSES) -> str:
    """按顺序试，返回第一个应答的地址；都不应答时报错并原样列出试过的地址。"""
    for address in addresses:
        try:
            normalized = clean_address(address)
        except ValueError:
            continue
        if normalized and answers(normalized):
            return normalized
    tried = ", ".join(addresses)
    raise DownloadError("network", f"No CloudDrive2 address was entered, and on this machine {tried} none responded."
                                   "Confirm CloudDrive2 is running, or enter its actual address in the address field")


def _translate(error: grpc.RpcError, action: str) -> DownloadError:
    code = error.code() if hasattr(error, "code") else None
    details = (error.details() if hasattr(error, "details") else "") or ""
    if code in _NETWORK_CODES:
        return DownloadError("network", f"Could not reach CloudDrive2 while trying to {action}: {details or code}")
    if code in _AUTH_CODES:
        return DownloadError("config", f"CloudDrive2 rejected this API token ({action}): {details or code}")
    if code == grpc.StatusCode.NOT_FOUND:
        return DownloadError("config", f"{action}: no such path in CloudDrive2")
    return DownloadError("rejected", f"{action} failed: {details or code}")


def split_remote(path: str) -> tuple[str, str]:
    """`/115/云下载` → (`/115`, `云下载`)。`FindFileByPath` 要父目录与名字分开给。"""
    clean = posixpath.normpath("/" + str(path or "").strip().replace("\\", "/").lstrip("/"))
    return posixpath.dirname(clean) or "/", posixpath.basename(clean)


@dataclass(frozen=True)
class Folder:
    path: str
    can_offline: bool
    cloud_name: str
    cloud_account: str
    can_manage: bool = True


class CloudDriveClient:
    """Call the official gRPC API with the token."""

    def __init__(self, address: str, token: str, *, timeout: float = CALL_TIMEOUT):
        if not token:
            raise DownloadError("config", "The CloudDrive2 API token is not set")
        self.token = token
        self.address = address
        self.timeout = timeout
        self.channel = open_channel(address)

    def close(self) -> None:
        self.channel.close()

    def __enter__(self) -> "CloudDriveClient":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def call(self, method: str, request, action: str):
        request_type, response_type = _METHODS[method]
        stub = self.channel.unary_unary(
            SERVICE + method, request_serializer=request_type.SerializeToString,
            response_deserializer=response_type.FromString)
        try:
            return stub(request, timeout=self.timeout,
                        metadata=(("authorization", f"Bearer {self.token}"),))
        except grpc.RpcError as error:
            raise _translate(error, action) from None

    # -- 读

    def token_info(self) -> pb.TokenInfo:
        return self.call("GetApiTokenInfo", pb.StringValue(value=self.token), "verify the API token")

    def find(self, path: str, action: str = "look up the target directory") -> pb.CloudDriveFile | None:
        parent, name = split_remote(path)
        try:
            found = self.call("FindFileByPath", pb.FindFileByPathRequest(parentPath=parent, path=name),
                              action)
        except DownloadError as error:
            if error.failure == "config" and "no such path in CloudDrive2" in error.detail:
                return None
            raise
        return found if found.fullPathName or found.name else None

    def folder(self, path: str) -> Folder:
        found = self.find(path)
        if found is None or not found.isDirectory:
            raise DownloadError("config", f"CloudDrive2 has no folder {path}")
        return Folder(path, bool(found.canOfflineDownload), found.CloudAPI.name,
                      found.CloudAPI.userName, bool(found.supportOfflineDownloadManagement))

    def quota(self, folder: Folder) -> pb.OfflineQuotaInfo:
        return self.call("GetOfflineQuotaInfo", pb.OfflineQuotaRequest(
            cloudName=folder.cloud_name, cloudAccountId=folder.cloud_account, path=folder.path),
            "check the offline quota")

    def offline_files(self, path: str) -> list[pb.OfflineFile]:
        result = self.call("ListOfflineFilesByPath", pb.FileRequest(path=path, forceRefresh=True),
                           "check offline tasks")
        return list(result.offlineFiles)

    # -- 写

    def create_folder(self, path: str) -> None:
        """在父目录下建一层。父目录要已经存在；令牌要有「新建文件夹」权限。"""
        parent, name = split_remote(path)
        created = self.call("CreateFolder", pb.CreateFolderRequest(parentPath=parent, folderName=name),
                            "create the directory")
        if created.result.success or created.folderCreated.fullPathName or created.folderCreated.name:
            return
        reason = created.result.errorMessage or "no reason given"
        raise DownloadError("rejected", f"CloudDrive2 did not create {path}: {reason}")

    def add(self, magnet: str, path: str) -> None:
        result = self.call("AddOfflineFiles", pb.AddOfflineFileRequest(
            urls=magnet, toFolder=path, checkFolderAfterSecs=CHECK_FOLDER_AFTER_SECS),
            "submit the offline task")
        if not result.success:
            raise classify_remote_message(result.errorMessage)

    def remove(self, folder: Folder, info_hash: str) -> None:
        result = self.call("RemoveOfflineFiles", pb.RemoveOfflineFilesRequest(
            cloudName=folder.cloud_name, cloudAccountId=folder.cloud_account, deleteFiles=False,
            infoHashes=[info_hash], path=folder.path), "cancel the offline task")
        if not result.success:
            raise DownloadError("rejected", f"CloudDrive2 did not cancel this task: {result.errorMessage}")


def match_offline(files: list[pb.OfflineFile], info_hash: str) -> pb.OfflineFile | None:
    """按 infohash 对账。`infoHash` 为空时从原始链接里取，JavBoss 也是这样回退的。"""
    for item in files:
        candidate = (item.infoHash or "").strip().lower() or magnet_info_hash(item.url)
        if candidate == info_hash:
            return item
    return None


def offline_status(item: pb.OfflineFile | None) -> RemoteStatus:
    if item is None:
        return RemoteStatus(MISSING)
    progress = max(0.0, min(float(item.percendDone or 0.0) / 100.0, 1.0))
    if item.status == pb.OFFLINE_FINISHED:
        return RemoteStatus(DONE, item.fileId, item.name, 1.0)
    if item.status == pb.OFFLINE_ERROR:
        # 列表里的失败没有原文；拦截码只在提交那一下的 errorMessage 里出现。
        return RemoteStatus(ERROR, item.fileId, item.name, progress,
                            "115 reported an offline failure, most likely because nobody is seeding or the resource was rejected")
    return RemoteStatus(RUNNING, item.fileId, item.name, progress)


class CloudDriveProvider:
    """Query the task list or confirm file landing by cloud drive capability. Each call opens a new channel and closes it after use."""

    key = "115"

    def __init__(self, address: str, token: str):
        self.address = address
        self.token = token

    def client(self) -> CloudDriveClient:
        if not self.address:
            raise DownloadError("config", "The CloudDrive2 address is not set; click 'Check' on the settings page to probe local ports, then save")
        return CloudDriveClient(self.address, self.token)

    def submit(self, magnet: Magnet, target: str) -> RemoteStatus:
        with self.client() as client:
            folder = client.folder(target)
            if not folder.can_offline:
                raise DownloadError("config", f"{target} is on a cloud drive that does not support offline download")
            existing = match_offline(client.offline_files(target), magnet.info_hash) if folder.can_manage else None
            if existing is not None:
                status = offline_status(existing)
                return RemoteStatus(status.state, status.remote_id, status.name, status.progress,
                                    status.message, adopted=True)
            try:
                quota = client.quota(folder) if folder.can_manage else None
            except DownloadError as error:
                if error.failure != "rejected":
                    raise
                quota = None  # 这一侧不支持查配额时照常提交，由提交接口自己拒。
            if quota is not None and quota.total > 0 and quota.left <= 0:
                raise DownloadError("quota", f"Cloud download quota used up ({quota.used}/{quota.total})")
            client.add(magnet.uri, target)
        return RemoteStatus(RUNNING, name=magnet.name)

    def status(self, task: DownloadTask) -> RemoteStatus:
        with self.client() as client:
            if not client.folder(task.target).can_manage:
                return RemoteStatus(DONE if self._landed(client, task) else RUNNING, name=task.remote_name or task.display_name)
            return offline_status(match_offline(client.offline_files(task.target), task.info_hash or ""))

    def landed(self, task: DownloadTask) -> bool:
        with self.client() as client:
            return self._landed(client, task)

    @staticmethod
    def _landed(client: CloudDriveClient, task: DownloadTask) -> bool:
        names = [name for name in (task.remote_name, task.display_name) if name]
        return any(client.find(f"{task.target.rstrip('/')}/{name}", "look up files in the target directory")
                   is not None for name in names)

    def cancel(self, task: DownloadTask) -> None:
        with self.client() as client:
            folder = client.folder(task.target)
            if not folder.can_manage:
                raise DownloadError("config", "This cloud drive does not support cancelling cloud downloads from Peach; please handle it in the cloud drive")
            client.remove(folder, task.info_hash or "")


@dataclass(frozen=True)
class Hints:
    """「检查」推建议值用的本机配置：推送发现的前缀表、已声明的媒体根、表单上的 PikPak 根。

    `pikpak_account` 为假时用户没在用 PikPak，PikPak 根那一段整段不查也不报。
    """
    prefixes: tuple[CloudPrefix, ...] = ()
    declared_roots: dict = field(default_factory=dict)
    pikpak_root: str = ""
    pikpak_account: bool = False
    target_enabled: bool = True


def empty_report(address: str, problems: list[str] | None = None) -> dict:
    """「检查」报告的形状。每一项各自报，一项失败不挡住其余几项。"""
    return {"ok": not problems, "address": address, "permissions": [], "missing": [], "root": "",
            "folder": None, "quota": None, "suggested_target": None, "suggested_pikpak_root": "",
            "problems": list(problems or ())}


def check(address: str, token: str, target: str, *, hints: Hints = Hints(),
          local_addresses: tuple[str, ...] = LOCAL_ADDRESSES) -> dict:
    """设置页的「检查」：令牌有没有离线权限、目标目录能不能离线、115 还剩多少配额。

    地址留空时先按 `local_addresses` 的顺序探测，报告的 `address` 是实际查的那个，页面把它
    填回表单，用户保存后才落盘。目标目录与 PikPak 根留空时同样只给建议值（`suggested_*`），
    由页面填回。只读：不提交、不取消、不建目录。令牌一关过不去时 `ok` 为假；之后的目录与
    配额各自报进 `problems`。
    """
    report = empty_report(address or discover(local_addresses))
    try:
        _inspect(report, CloudDriveClient(report["address"], token), target, hints)
    except DownloadError as error:
        report["ok"] = False
        report["problems"].append(error.detail)
    return report


def create_folder(address: str, token: str, path: str, *, hints: Hints = Hints(),
                  local_addresses: tuple[str, ...] = LOCAL_ADDRESSES) -> dict:
    """用户点「新建这个目录」时才调。建好之后按这个目录再检查一遍，报告交给页面。"""
    address = address or discover(local_addresses)
    with CloudDriveClient(address, token) as client:
        client.create_folder(path)
    return check(address, token, path, hints=hints, local_addresses=local_addresses)


def _inspect(report: dict, client: CloudDriveClient, target: str, hints: Hints) -> None:
    with client:
        info = client.token_info()
        permissions = info.permissions
        report["root"] = info.rootDir
        for name, label in OFFLINE_PERMISSIONS.items():
            granted = bool(getattr(permissions, name))
            report["permissions"].append({"name": name, "label": label, "granted": granted})
            if not granted:
                report["missing"].append(label)
        probe = _PrefixProbe(client, hints.prefixes)
        if hints.target_enabled:
            _inspect_target(report, client, probe, target, hints)
        if hints.pikpak_account and not hints.pikpak_root:
            try:
                _suggest_pikpak_root(report, probe, hints)
            except DownloadError as error:
                report["problems"].append(error.detail)


def _inspect_target(report: dict, client: CloudDriveClient, probe: "_PrefixProbe", target: str,
                    hints: Hints) -> None:
    try:
        if not target:
            target = _suggest_target(report, client, probe, hints)
            if not target:
                return
        folder = client.folder(target)
    except DownloadError as error:
        report["problems"].append(error.detail)
        return
    report["folder"] = {"path": folder.path, "can_offline": folder.can_offline,
                        "cloud": folder.cloud_name}
    try:
        quota = client.quota(folder)
    except DownloadError as error:
        report["problems"].append(error.detail)
        return
    report["quota"] = {"total": quota.total, "used": quota.used, "left": quota.left}


class _PrefixProbe:
    """每条推送前缀在 CloudDrive2 里是什么，一次检查里只问一遍。"""

    def __init__(self, client: CloudDriveClient, prefixes: tuple[CloudPrefix, ...]):
        self.client = client
        self.prefixes = tuple(CloudPrefix(normalise_prefix(entry.prefix), entry.root)
                              for entry in prefixes)
        self.found: dict[str, pb.CloudDriveFile | None] = {}

    def lookup(self, prefix: str) -> pb.CloudDriveFile | None:
        if prefix not in self.found:
            self.found[prefix] = self.client.find(prefix, "check the cloud path prefix for Push discovery")
        return self.found[prefix]

    def of_cloud(self, clouds: frozenset[str]) -> list[tuple[CloudPrefix, pb.CloudDriveFile]]:
        hits = []
        for entry in self.prefixes:
            found = self.lookup(entry.prefix)
            if found is not None and found.isDirectory \
                    and (found.CloudAPI.name or "").strip().casefold() in clouds:
                hits.append((entry, found))
        return hits


def _roots(hints: Hints, location: str) -> dict[str, str]:
    return {str(root).casefold(): str(root) for root in hints.declared_roots.get(location, ())}


def _suggest_target(report: dict, client: CloudDriveClient, probe: _PrefixProbe,
                    hints: Hints) -> str:
    """推一个 115 目标目录。目录存在才返回它，接着查离线与配额；不存在只报建议值。"""
    declared = _roots(hints, "115")
    hits = sorted(probe.of_cloud(CLOUDS_115),
                  key=lambda hit: (hit[0].root.casefold() not in declared, len(hit[0].prefix)))
    if not hits:
        known = ", ".join(entry.prefix for entry in probe.prefixes)
        report["problems"].append(
            f"No 115 target directory is set, and none of the prefixes registered in 'Push discovery' ({known}) is on the 115 drive. "
            "Add the CloudDrive2 mount root for 115 in the 'Push discovery' card, then click Check; or fill in the target directory directly"
            if known else
            "No 115 target directory is set, and no cloud path prefix is registered in 'Push discovery'. Register "
            "the CloudDrive2 mount root for 115 and its matching media directory in the 'Push discovery' card, then click Check; or fill in the target directory directly")
        return ""
    candidate = f"{hits[0][0].prefix}/{SUGGESTED_FOLDER}"
    found = client.find(candidate)
    exists = found is not None and found.isDirectory
    report["suggested_target"] = {"path": candidate, "exists": exists}
    return candidate if exists else ""


def _suggest_pikpak_root(report: dict, probe: _PrefixProbe, hints: Hints) -> None:
    """PikPak 根目录对应的媒体目录：前缀必须就是 PikPak 云盘根，子目录前缀对不上根。"""
    declared = _roots(hints, "pikpak")
    if not declared:
        return
    for entry, found in probe.of_cloud(CLOUDS_PIKPAK):
        cloud_path = found.CloudAPI.path if found.CloudAPI.HasField("path") else ""
        at_root = found.isCloudRoot or (bool(cloud_path) and normalise_prefix(cloud_path) == entry.prefix)
        if at_root and entry.root.casefold() in declared:
            report["suggested_pikpak_root"] = declared[entry.root.casefold()]
            return
    report["problems"].append(
        "No media directory is chosen for the PikPak root, and 'Push discovery' has no prefix for the PikPak drive root to infer one from. "
        "Pick one in the dropdown, or register the PikPak mount root in the 'Push discovery' card")
