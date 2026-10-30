# Docker deployment

Peach 的 Docker 镜像用于单人 VPS 与 NAS，通过浏览器管理，镜像仓库为 [longmeidao/peach](https://hub.docker.com/r/longmeidao/peach)。每次发布推送版本号标签，并把 `edge` 更新为同一镜像；版本号标签对应发布提交。当前镜像目标为 `linux/amd64`；ARM NAS 尚未验收。2026-10-15 在 WSL 的独立 Docker Engine 中，用正式锁定依赖通过空数据卷初始化、非 root、鉴权、配置保存、合成视频扫描、HTTP Range、配置重载与重启持久化验收。

Docker does not use the desktop tray. When adding a media directory in the web configuration, enter only the actual directory inside the container, such as `/media`; Peach saves the required path configuration automatically. The entry points for the Windows installer, macOS source run and Docker are described in the [README](../README.en.md#download-and-use).

## Data and media

NAS 的 SMB 共享也可作为[SMB 媒体来源](SMB.md)直接连接，按账号权限读写，无需挂入媒体目录；Peach 数据卷仍单独保留。

`/data` 保存配置、SQLite 数据库、凭据和图片缓存，必须使用数据卷保存，重建容器时保留该卷。媒体目录单独挂到 `/media`；默认只读，扫描和播放不需要媒体写权限。整理、移动与删除需要使用者明确提供可写挂载。

CloudDrive2 and Peach run separately. If the NAS already has CloudDrive2, reuse it; on a fresh machine, install it and bind your cloud drive following the [official CloudDrive2 Docker guide](https://www.clouddrive2.com/docker.html). For the Peach container to read cloud-drive directories that CloudDrive2 mounts later, the Linux host must support FUSE, and CloudDrive2's mount directory must be configured so that mount changes can be shared; `rslave` in Compose lets those changes propagate into the Peach container. This mechanism does not apply to Docker Desktop; see the [Docker bind propagation documentation](https://docs.docker.com/engine/storage/bind-mounts/#configure-bind-propagation). The Peach container does not need FUSE or privileged mode. Directory permissions must allow reads by the container user, UID 1000.

For cloud download or push discovery, set the CloudDrive2 API address in the Peach configuration to a service name on the same container network or a reachable host address; `127.0.0.1` inside the container points only to Peach itself.

The `compose.yaml` at the repository root uses `PEACH_MEDIA_ROOT` to specify the existing media root on the host; inside the container it is always `/media`. Finish the CloudDrive2 mount first, then start Peach. The named volume `peach-data` holds `/data`; do not run any operation that deletes this volume. To bind an existing data directory, make a full backup first and make sure UID 1000 can write to it; do not let another Peach write to this Peach database at the same time.

### 迁移数据目录

`/data` 的位置由宿主机上的挂载决定，容器里改不了，所以配置页「存储空间」不提供「更改位置」，改为列出下面几步。在宿主机上执行：

1. 查出数据卷的名字，以 `_peach-data` 结尾：`docker volume ls`。
2. 在 `compose.yaml` 所在目录停止 Peach：`docker compose down`。
3. 把数据卷复制到新文件夹，新文件夹要让 UID 1000 可写：`docker run --rm -v <数据卷名>:/from -v <新文件夹>:/to alpine cp -a /from/. /to/`。
4. 把 `compose.yaml` 里的 `peach-data:/data` 改成 `<新文件夹>:/data`，再启动：`docker compose up -d`。

确认新位置一切正常之前，不要删除旧数据卷。

## 首次运行与访问

### 飞牛、其他 NAS 与局域网访问

浏览器在另一台电脑上时，访问地址使用 NAS 的局域网 IP。Compose 默认的 `127.0.0.1` 只允许宿主机访问；容器显示运行成功不代表局域网端口已开放。

在 `compose.yaml` 同目录创建 `.env`，将下面的示例 IP 和目录换成 NAS 的实际值。`PEACH_PORT` 是浏览器使用的宿主机端口，可自行选择：

```dotenv
PEACH_BIND=192.0.2.10
PEACH_PORT=8900
PEACH_MEDIA_ROOT=/srv/videos
```

`192.0.2.10` 是文档示例地址，不能直接用于部署。NAS 管理界面支持 Compose 环境变量时，也可在那里填写这三个值。应用配置并重新创建容器后，打开 `http://<NAS 局域网 IP>:<PEACH_PORT>`。不要在另一台电脑上用 `127.0.0.1` 访问 NAS。

登录口令由 Peach 随机生成，没有通用初始密码。在 NAS 的容器管理界面打开 Peach 容器终端，运行 `peach token` 查看；通过宿主机 Compose 终端时运行 `docker compose exec peach peach token`。登录后设置访问密码。

### 初始化与管理

使用 Compose 启动后，Peach 会为全新数据卷创建配置、数据库和随机登录口令。已有配置保持原值；如果已有数据库但缺少配置文件，服务拒绝启动，需要恢复配置文件。初始化日志只显示口令文件位置。

Run `peach token` in the container terminal to get the login token, then log in from the browser and set an access password. The configuration page requires login, and the connection must come from the container itself or a private network; management requests carrying proxy forwarding headers are rejected. After saving through the configuration page, the service reloads the configuration automatically; if scanning is checked, metadata processing starts.

The HTTP port inside the container is fixed at 8900; the access port is set in Compose. By default it is published only to the host's `127.0.0.1`; use a private VPN or an SSH tunnel for remote access. For LAN access, bind the host's LAN address through `PEACH_BIND` and set an access password. The boundaries for public hosting are in the [security notes](../SECURITY.md). The Docker image does not provide multi-user accounts or tenant isolation.

## Configuration file and paths

The configuration file is `/data/config.toml` inside the data volume. In the "Media directories" section of the browser configuration page, add a directory: enter a container directory such as `/media` or `/media/115`, choose the media source and read policy, then save. When an existing directory has moved, change the media directory on that row; Peach manages how it maps to database paths.

Back up the configuration file before editing it by hand, and restart the container afterwards. Updating the image keeps this file, so comments in an existing file also stay as they are. Viewing the configuration notes does not require reinitializing the data volume.

After the container has been updated and restarted, run the following command in the directory containing `compose.yaml` to see the new comments and the current configuration values; the command only prints content and does not rewrite `/data/config.toml`:

```sh
docker compose exec peach python -c "from peach import settings_file as s; print(s.render(s.active()), end='')"
```

The default template contains only initial values, not the media directories and custom settings of an existing deployment. Replacing the whole file with the default template replaces those values too and may make existing videos unreadable. To update only the notes, replace the comments and keep the configuration values; to replace the whole file, back it up first and check the differences item by item.

The following is for reference when editing the configuration by hand or mapping existing media directories between multiple Peach instances. Saving from the web page handles `[media.locations]` and `[media.mounts]`: the former holds the path prefixes in the database, and the latter holds the directories from which files are actually read. The Peach database stores video paths in Windows format on every system; Linux does not need to create the same drive letter or directory.

全新配置不预设媒体目录。盘符不决定来源，115 与 PikPak 均可选择任意已挂载目录；容器内填写实际路径即可。文档中的盘符只是数据库路径示例。

以下三个路径各有用途。假设宿主机媒体目录为 `/srv/videos`，Compose 将它挂到容器 `/media`：

| Location | Example | Purpose |
| --- | --- | --- |
| Host directory | `/srv/videos` | Set as `PEACH_MEDIA_ROOT` in Compose; the directory must already exist |
| Directory inside the container | `/media` | Set in the media directories of the configuration page or in `[media.mounts]`; Peach actually reads from here |
| Directory prefix in the database | `R:\media` | Example value for `[media.locations]`, matching the start of video paths in the database; normally managed by Peach |

When configuring a fresh local library by hand, you can use the following mapping. The prefix generated automatically by the web page may differ, and you do not need to change it to the example value. Merge the entries of the two tables into the existing configuration; do not add tables with the same name twice:

```toml
[media.locations]
local = 'R:\media'

[media.mounts]
local = '/media'
```

After scanning `/media/a.mp4`, Peach stores `R:\media\a.mp4` in the video's `path` field in the database; at playback it replaces `R:\media` with `/media` and reads `/media/a.mp4` in the container. This Windows path in the database is a string, not a file name that actually exists on Linux.

When videos already exist, `[media.locations]` must keep matching the path prefixes in the database. Changing it to `/media` does not update the existing video records and instead breaks the path mapping. If you only move the actual media directory, keep `[media.locations]` and adjust `[media.mounts]` and the Compose directory mount. When one source has multiple directories, both tables use arrays, with matching count and order one to one.

To reuse the database of another Peach, enter in `[media.locations]` of the configuration file the directory prefixes matching the video paths in that database, and in `[media.mounts]` the directories this container can read, such as `/media/115`; existing deployments keep their own mapping. Compose must already mount these directories. CloudDrive2 is one of the media sources, and local directories can also be mounted directly into Peach.

The service in the container always listens on `0.0.0.0:8900`; the host access address and port use `PEACH_BIND` and `PEACH_PORT` in Compose; `host` and `port` in `[server]` apply when running `peach serve` directly. A standalone Docker deployment keeps `[replication] enabled = false`, and no desktop tray or SMB replication needs to be configured.

## Hardware transcoding (AMD / Intel VAAPI)

On the first re-encode, Linux probes which hardware encoders are actually available; whole-file MP4 and HLS segments share the probe result. AMD / Intel use VAAPI; when an NVIDIA device is present, NVENC is probed. A backend whose probe fails is not tried again within the current service process and is probed again after the service restarts. Container remuxing (stream copy) needs no hardware probe.

镜像自带 OpenCV（`vision` 依赖组）和头像取景与比对用的人脸模型（YuNet 为 MIT，SFace 为 Apache-2.0，许可证在同一目录），位于 `/app/tools/face-models`，由 `PEACH_FACE_MODELS` 指向，容器不联网也能用。构建镜像时按固定地址下载并校验 SHA-256。

镜像包含 Debian FFmpeg、Mesa VAAPI 驱动与 `vainfo`。AMD 宿主机需加载 `amdgpu` 和对应固件，并提供 `/dev/dri/renderD*`。Intel 需在自定义镜像内安装适配设备的 VAAPI 驱动；Mesa 驱动不代表已覆盖全部 Intel GPU。将下面的条目合入 Compose 的 `services.peach`，设备路径按宿主机调整：

```yaml
    devices:
      - /dev/dri/renderD128:/dev/dri/renderD128
    group_add:
      - "${PEACH_RENDER_GID}"
    environment:
      PEACH_TRANSCODE_BACKEND: auto
      PEACH_VAAPI_DEVICE: /dev/dri/renderD128
```

Set `PEACH_RENDER_GID` to the numeric GID of the group that owns the host's render node. The container runs as UID 1000 and needs read and write permission on that node; passing the device through without group permission still fails to initialize. On Unraid, add the same device mapping, environment variables and extra group in the container settings; privileged mode is not needed. The default Compose does not mount any device, so machines without a GPU can run it directly.

| Environment variable | Values and purpose |
| --- | --- |
| `PEACH_TRANSCODE_BACKEND` | Defaults to `auto`; can be set to `vaapi`, `nvenc` or `software`. A specified hardware backend is still verified for encoding ability and falls back to software on failure. |
| `PEACH_VAAPI_DEVICE` | Specifies the render node inside the container; when empty, `/dev/dri/renderD*` is probed in name order and the first usable node is used. |

The VAAPI attempt order is hardware decoding with `scale_vaapi` / `h264_vaapi`, then software decoding with `hwupload` / `h264_vaapi`, then `libx264`. Decoding ability is also limited by the GPU model and the source's codec and bit depth; working hardware encoding does not prove that every source can be hardware-decoded. NVIDIA passthrough additionally needs the host driver and the NVIDIA Container Toolkit; Mesa does not provide CUDA / NVENC.

When CPU usage is high, first check the log lines "转码硬件后端" (transcode hardware backend) and "转码硬件探测失败" (transcode hardware probe failed). After the completion log lines "整片转码完成" (whole-file transcode complete) or "HLS 分片完成" (HLS segment complete), `vaapi` means hardware decoding and encoding were used, `vaapi-encode` means software decoding plus hardware encoding, and `libx264` means software transcoding. Then check device permissions and the output of `vainfo --display drm --device /dev/dri/renderD128` in the same container as the same user. `No VA display found` has to be investigated together with the driver and device permissions; the existence of the node alone does not rule out a permission problem.

`ffmpeg -hwaccels` lists the hardware acceleration methods supported by the build, and `ffmpeg -h decoder=h264` and similar commands list the hardware devices supported by the corresponding decoder. VAAPI decoding is enabled through the hardware acceleration interface of the ordinary decoder, so the absence of a decoder named `vaapi` in `ffmpeg -decoders` does not mean VAAPI decoding is unsupported. For the meaning of the parameters see the [official FFmpeg documentation](https://ffmpeg.org/ffmpeg.html#Advanced-Video-options). The actual decoding, GPU usage and playback behavior on the target GPU must be verified on the deployment machine.

## amane 刮削站点

镜像随附按 `tools/amane-bridge/uv.lock` 构建的 amane `0.20.0` 独立环境，位于 `/app/amane-runtime`，通过 `PEACH_AMANE_RUNTIME` 定位。全新 `/data` 卷可直接调用刮削站点，无需在首次运行时安装依赖。桥通过独立子进程调用，站点请求仍使用所选连接方式。

运行环境与镜像一起更新，`manifest.json` 记录固定 revision、版本和解释器相对路径。镜像构建阶段与最终运行阶段都会执行 `bridge.py --self-check`，离线载入运行时与全部 Peach 开放站点类。此检查不发站点请求；来源网络是否可达需在部署环境验证。环境损坏时重新拉取并创建对应镜像，保留 `/data` 卷。

`/app/amane-runtime` 同时包含 GPL-3.0 许可证、来源说明和 `amane-corresponding-source.zip`；归档包含固定 revision 的完整 amane 源码、Peach 桥、锁文件、构建入口，以及 zhconv 和 certifi 的固定源码。依赖许可证保留在独立环境内。

## 导出诊断报告

Docker 部署使用网页「Peach 配置 → 系统诊断 → 下载诊断报告」，无需桌面托盘。已登录的私有网络客户端可以下载；通过反向代理或公网访问时，改用容器内导出。

网页不可用时，在 Compose 文件所在目录执行下面的命令，在正在运行的 `peach` 服务容器中生成脱敏 ZIP。目标文件已存在会拒绝覆盖；再次导出时同时更换两条命令中的文件名。

```text
docker compose exec peach python -m peach.support_bundle /tmp/peach-support.zip
```

将 ZIP 复制到当前目录：

```text
docker compose cp peach:/tmp/peach-support.zip ./peach-support.zip
```

报告包含版本、运行日志和任务状态，不包含数据库、媒体或配置原文。发送前检查内容，脱敏范围见 [日志与诊断](DIAGNOSTICS.md)。容器不连接宿主机桌面托盘；管理与诊断入口均在网页和 CLI 中提供。

## 更新与范围

Keep `/data` when updating the image and recreating the container. When the database has pending migrations, back it up first and follow the migration procedure in [Operation and configuration](OPERATIONS.md); the Docker entrypoint does not migrate an existing database automatically. The health check uses `/healthz?ready=1`.

A Linux container does not read the browsing history on the user's computer and does not include an interactive browser; sources that need a local browser for verification are unavailable in this environment. Real CloudDrive2 account login, cloud-drive traffic and the NAS mount on real hardware must be verified on the target machine.

## Image publishing

构建使用官方 Python `3.14.8-slim-trixie` 与 uv `0.13.1`，应用依赖与 amane 独立依赖分别由各自的 `uv.lock` 锁定。应用以非 editable 包安装，包含 Web 与迁移资源。镜像以 UID/GID 1000 运行，内置 FFmpeg、FFprobe、OpenSSL 和 amane 独立环境。uv 与 Git 只用于构建阶段。构建上下文只允许代码与资源，不包含工作树、媒体、真实 Peach 数据库或凭据。

GitHub Actions 的 `Docker` 工作流先构建并运行临时卷验收，通过后发布。仓库变量 `DOCKERHUB_USERNAME` 和机密 `DOCKERHUB_TOKEN` 用于 Docker Hub 发布；机密只保存在 GitHub，不进入项目文件。未配置发布身份时仍执行构建验收。ARM 镜像需通过同等运行验收后再加入发布。

Docker Hub 页面以英文为主，概览正文取自 [docs/dockerhub/README.md](dockerhub/README.md)，链接回 GitHub 的源码、本文和中文 README。简介填写 `Local-first video metadata scraper and media manager. Self-hosted web UI for VPS and NAS.`。发布流水线只推送镜像，概览与简介需要在 Docker Hub 仓库设置中手动更新；镜像、端口、目录或 Compose 示例变化时同批修改该文件。
