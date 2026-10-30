# Running and Configuration

This page covers what you need to know when running Peach on your own computer: how to do first-time setup, where the configuration page is, how to reach it from other devices, how to install FFmpeg, and which operations really delete files.

If you use the Windows test build, read [Windows Test Build](TESTING_DESKTOP.md) first; if you run from source, follow the installation steps below. The "Maintainer Reference" section at the end is for people who develop, package and release from source; regular users can skip it.

## Running from Source (Windows, macOS)

You need Git and [uv](https://docs.astral.sh/uv/getting-started/installation/). The minimum Python version is 3.14, the project pins the runtime version through `.python-version`, and uv downloads any missing interpreter automatically.

In PowerShell 7 (Windows) or zsh (macOS), run these in order:

1. Clone the repository: `git clone https://github.com/peach-mitao/peach.git peach-app`.
2. Enter the project directory: `cd peach-app`. All later commands run in this directory.

Install dependencies on Windows: `uv sync --locked --python 3.14`. Then start the tray: `& .\.venv\Scripts\peach-tray.exe`.

Install dependencies on macOS: `uv sync --locked --python 3.14 --extra macos`. Then start the tray: `./.venv/bin/peach-tray`.

The tray opens the first-run setup page in your browser. Running from source does not require downloading the Windows installer.

## Standalone macOS Test Build

On macOS, install the build dependencies in the project directory:

```sh
MACOSX_DEPLOYMENT_TARGET=11.0 uv sync --locked --extra build --extra macos
```

先在构建目录安装固定工具链；下面以 Apple Silicon 为例，Intel 将 `arm64` 换成 `x86_64`：

```sh
./.venv/bin/python -X utf8 scripts/setup_macos_media_tools.py --root "$PWD/build/macos-media-toolchain"
export PATH="$PWD/build/macos-media-toolchain/env/bin:$PATH"
./.venv/bin/python -X utf8 scripts/build_macos_media.py --tool ffmpeg --arch arm64 --output build/media-macos/arm64/ffmpeg
./.venv/bin/python -X utf8 scripts/build_macos_media.py --tool untrunc --arch arm64 --output build/media-macos/arm64/untrunc
./.venv/bin/python -X utf8 scripts/fetch_cloudflared_macos.py --arch arm64 --destination build/media-macos/arm64/cloudflared
```

构建包含 Python、页面、迁移、资源和自包含工具的应用与 DMG：

```sh
./.venv/bin/python -X utf8 scripts/build_macos_standalone.py
```

Artifacts are in `dist/macos.noindex/<arch>/`; the build copy avoids Spotlight indexing. For day-to-day use, keep only the app in Applications, and unmount the mounted installer image after testing. Apple Silicon uses `arm64` and Intel uses `x86_64`; build each with the Python and dependencies of the matching architecture. `--target-arch` sets the target explicitly, and a mismatched interpreter architecture stops the build. The two packages do not mix native extensions and are not merged into a universal2 build. The Intel build can be done on an Intel Mac or in an x86_64 Python environment under Rosetta; Rosetta acceptance cannot replace acceptance on real Intel hardware and older macOS versions.

随包工具与许可证位于 `Contents/Resources/tools/ffmpeg/bin`、`Contents/Resources/tools/untrunc`，人脸检出与比对模型位于 `Contents/Resources/tools/face-models`，cloudflared 位于 `Contents/MacOS`。构建时 `scripts/fetch_face_models.py` 按固定提交下载两个模型与许可证并逐个校验 SHA-256，缓存在 `build/face-models`。工具先独立签名，再签整个应用，资源目录允许同时保存工具清单和说明。它们不依赖 Homebrew；FFmpeg、x264、dav1d 和修复用 FFmpeg 库静态链接，动态依赖仅允许 macOS 系统库。`scripts/smoke_macos_media.py` 在系统 PATH 下使用合成 H.264/AAC 与 AV1 样片验证工具查找、探测、抽帧、转码、缺 `moov` 修复和完整解码。该修复验收覆盖同编码参照样片，不代表任意损坏媒体都能恢复。

每种架构同时生成 `ffmpeg-macos-<架构>-corresponding-source.zip` 与 `untrunc-macos-<架构>-corresponding-source.zip`，必须与 DMG 同版本发布；归档包含完整上游源码、固定哈希、许可证、构建脚本、配置和环境记录。构建拒绝缺失、哈希不符、架构不符或依赖开发机动态库的工具。cloudflared 固定官方 2026.9.0，归档 SHA-256 采用 GitHub Release 资产 API 的 `digest`，来源登记在 `scripts/cloudflared-macos.json`；发布正文的旧校验值不作为这两个 macOS 归档的锁。

源码开发外壳 `build_macos_app.py` 默认输出到 `dist/macos-source.noindex/`，依赖本机 venv 与 LaunchAgent；不要把它当作独立应用安装。

The build script reads the system-version floor of the bundled Mach-O files, fills it into `LSMinimumSystemVersion`, and re-signs. The build interpreter must also support the target system; a Homebrew Python may require the build machine's system version. If locally compiled extensions such as `watchdog` hit an old cache, rebuild with the deployment target and the matching `ARCHFLAGS` via `uv sync --locked --extra build --extra macos --no-cache --reinstall-package watchdog --no-binary-package watchdog`, then check the `minimum_macos` reported by the artifact.

Open the DMG for the matching architecture, drag `Peach.app` into Applications, then open the app to complete first-run setup. The menu bar offers entries to open the page, restart and quit; data is stored by default in `~/Library/Application Support/Peach/peach-data`, and `PEACH_DATA_ROOT` can point to a separate directory.

测试包没有公证，从浏览器或聊天软件下载后带有隔离属性，较新的 macOS 会提示「Peach 已损坏，无法打开」，「隐私与安全性」里也不出现「仍要打开」。拖入 Applications 后在终端执行下面的命令，再打开应用：

```sh
sudo /usr/bin/xattr -rd com.apple.quarantine "/Applications/Peach.app"
```

提示输入密码时，输入这台 Mac 的登录密码；输入过程中屏幕不显示字符。这条命令只移除 Peach 的隔离标记；安装新版本后需要再运行一次。命令写全路径 `/usr/bin/xattr`，避开 Python 包装的同名命令；`sudo` 覆盖应用不归当前用户所有的情况。

首次设置页只在数据目录里没有 `config.toml` 时出现。这台 Mac 之前装过 Peach 时，应用会沿用原有设置直接打开首页；要重新设置，先退出 Peach，把整个 `peach-data` 目录移到别处再打开。

安装镜像使用 APFS 文件系统，保留已签名资源的 Unicode 文件名及应用扩展属性。浅桃色背景固定左侧 Peach、右侧 Applications 的拖放布局，隐藏工具栏与边栏，背景同时提供标准与 Retina 分辨率。许可证保留在应用的 `Contents/Resources/LICENSE`，安装窗口只显示两个入口。

版本提交触发 Release 演练，在 Apple Silicon 与 Intel 原生 runner 分别构建，再由干净 runner 下载并挂载 DMG，验证签名、架构和独立运行。标签核对同一提交的成功演练与摘要，发布已验收的相同文件。两种 DMG 与 Windows 安装包全部通过后，才一同上传到 GitHub 预发布，统一生成 SHA-256 清单。手动运行工作流只验收候选制品，不创建 Release；推送普通提交不会触发安装包构建。发版从只读审阅和依赖检查开始，重型验证前完成复核并冻结输入；集成、运行核验与定版按[发版检查](TESTING.md#每次发版检查)执行，打标签统一使用 `scripts/release_tag.py`。

### GitLab 发布与下载后端

GitLab 兼容平台使用 `.gitlab-ci.yml`。唯一版本入口支持 `--gitlab-host` 指定主机，默认入口使用 GitHub。主线发布判据要求同一提交最新的 push 流水线成功，且 Linux、Windows、macOS 和 wheel 验收任务全部成功；缺少原生系统任务时拒绝打标签。主线上的三个平台验收只跑改动域与平台敏感用例（[ADR-0119](adr/0119-mainline-changed-scope-release-full-suite.md)）。版本提交 `chore(release): 版本 X` 的主线流水线同时是发布演练：三平台全量、媒体工具、Windows 与 macOS 构建、Windows 冒烟和 Docker 镜像都跑一遍，只是不发布。`--ship` 等演练全部成功才打标签；标签流水线核对同一提交的演练已通过，只重新构建并发布（[ADR-0121](adr/0121-release-rehearsal-and-atomic-publication.md)）。GitHub 的 `release.yml` 用同一套判据，迁回 GitHub 时不用改流程。CLI 传输复用官方 glab，不在仓库或命令参数里存访问令牌。

平台共享 Runner 的系统由管理员提供。注册页面列出 Windows 和 macOS，表示可以接入这些系统上的 Runner；不能据此判断平台提供相应云主机。临时原生 Runner 只接入受保护主线和版本标签，使用项目专属标签，验收后停止并注销。Mac 的 Intel 构建需要真实 x86_64 Python 和依赖；在 Apple Silicon 上通过 Rosetta 验收时，应明确记录未覆盖 Intel 真机。

Windows 原生 Runner 在深目录中检出项目时，需为 Git 启用 `core.longpaths=true`，供检出与清理阶段处理 npm 缓存。设置可限定到 Runner 的任务环境，通过 `GIT_CONFIG_COUNT` 与对应的 `GIT_CONFIG_KEY_<索引>`、`GIT_CONFIG_VALUE_<索引>` 条目传递；已有条目按索引追加。宿主系统的长路径开关与 Git 设置分别核对。

用计划任务常驻 Windows 原生 Runner 时，任务设置的 `Priority` 取 `4`，例如 `New-ScheduledTaskSettingsSet -Priority 4`；已注册的任务可以读出对象，把 `Settings.Priority` 改成 `4`，再用 `Set-ScheduledTask -InputObject` 写回。省略时默认 `7`，`gitlab-runner` 与所有作业子进程以 BelowNormal 的 CPU 优先级、Low 的 I/O 优先级和 2 级内存优先级运行。Runner 与开发会话共用这台机器，别的会话跑全量测试时，作业里的 vitest 工作进程、首次设置后的服务就绪探测和快捷方式 COM 调用拿不到 CPU 与磁盘，因等待超时失败，全量回归也会超过作业时限。设置只对新启动的进程生效：在没有作业运行时重启该任务，再核对 `gitlab-runner` 进程的优先级类为 `Normal`。

计划任务的「失败后重启」（`RestartCount`、`RestartInterval`）只在任务启动失败时生效，`gitlab-runner` 进程自己退出后不会被拉起，主线的 Windows 作业就一直排着没人接。所以任务的动作是 runner 目录里的入口脚本 `run-runner.ps1`：它按可执行文件路径查找本目录的 `gitlab-runner.exe`，已经在跑就直接退出，没在跑才拉起，这样不会让同一个 token 跑两个 runner。触发器保留「登录时」，另加一个每 5 分钟重复、不设结束时间的时间触发器，`MultipleInstances` 设为 `IgnoreNew`。runner 退出后最多 5 分钟就会被拉回来。

计划任务使用 `pythonw.exe` 调用 `scripts/run_gitlab_runner.py --root <runner目录>`，由启动器通过 `CREATE_NO_WINDOW` 运行原有 `run-runner.ps1`。PowerShell 的 `-WindowStyle Hidden` 不能保证不触发 Windows Terminal 托管，后台入口不直接以控制台程序作为计划任务动作。启动器日志保存在 runner 目录的 `runner-launcher.log`，runner 输出仍沿用 `runner.log`。

版本标签须受保护。版本提交的演练完成三平台回归、固定来源媒体工具、Windows 完整包与拆分包、macOS 双架构 DMG、安装升级和镜像验收，再登记候选。标签核对相同提交、验证任务与文件摘要后发布已验收产物，不重新构建。`publish-release` 上传 R2 并创建 GitLab Release，`publish-docker` 排在它成功之后推送同一 image ID 的镜像；最终回收演练暂存。发布作业失败时重试同一作业，标签不动。项目流水线使用 `PEACH_DOWNLOAD_BACKEND=both`，同一份制品分别保存在 R2 与 GitGud Generic Package Registry；不把会过期的 job artifacts 当作永久下载地址。独立部署可明确选择 `r2` 或 `gitgud` 单后端。候选和发布顺序见 [ADR-0127](adr/0127-verified-release-artifact-promotion.md)。

Linux 发布任务使用官方 uv Python 3.14 容器，并在获取制品工具前核对解释器版本；源码归档使用 `tarfile` 的 `data` 过滤器解压。CI 的 `.npm/` 与 `.uv-cache/` 属于生成缓存，不计入源码工作区变化。

Windows 安装覆盖与任务恢复验收允许 GitHub Actions，以及受保护版本标签或版本提交演练上的 GitLab `smoke-windows` 作业；主机已有 Peach 安装登记时拒绝执行。所有程序、账本与任务夹具均放在临时目录，安装与卸载完成后核对登记清理。`fetch_cloudflared.ps1` 的相对输出路径按 PowerShell 当前工作位置解析，下载仍须通过固定 SHA-256 校验。

GitGud 的 Linux 平台 Runner 不提供 Docker 守护进程，Docker 镜像由 `docker-build` 作业在 Windows 原生 Runner 构建，宿主须运行 Docker Desktop。作业核对标签与版本，用 `smoke_docker.py` 验收临时容器，镜像留在本机；演练里验收完就删除。标签流水线上，`publish-docker` 等 `publish-release` 成功后才推送版本号与 `edge` 两个标签，所以 `edge` 只会指向已经完整发布的版本。`DOCKERHUB_USERNAME` 与 `DOCKERHUB_TOKEN` 放入受保护且隐藏的 CI 变量，环境作用域为 `release`；令牌只授予仓库读写。登录写入作业专用的临时 `DOCKER_CONFIG`，结束时登出并删除，不改动宿主用户的 Docker 登录。

媒体工具源码可通过 `PEACH_SOURCE_CACHE_BASE` 指定 HTTPS 缓存入口，按 `<SHA-256>/<归档名>` 定位文件。标签流水线使用发布桶的 `_sources/` 前缀；维护者填充缓存前须核对锁文件的原始 SHA-256，缓存同样计入桶容量预算。下载缓存失败时尝试锁定的上游地址；任一来源的哈希不符立即拒绝，不能放宽清单。未配置缓存的对应源码包直接使用上游。

可选的 `r2` 后端使用独立 Standard 桶与 HTTPS 自定义域名。`PEACH_R2_ACCESS_KEY_ID`、`PEACH_R2_SECRET_ACCESS_KEY`、`PEACH_R2_ENDPOINT` 放入受保护且隐藏的 CI 变量，环境作用域为 `release`；`PEACH_R2_BUCKET` 和 `PEACH_R2_PUBLIC_BASE` 指定发布目标。S3 传输复用 rclone，版本文件禁止覆盖；每份文件必须从公开入口完整下载并核对大小及 SHA-256 后，才更新公开版本索引和 Release 链接。

GitLab 演练通过 R2 暂存传递媒体工具、Windows 发行目录、macOS 镜像和 Docker 验收回执，job artifacts 保存 JSON 清单。中转需要上述 R2 变量；构建与验收任务使用 `release` 环境的 `prepare` 或 `verify` 动作，只有受保护版本标签与受保护 master 上的版本提交演练能取得凭据。候选保留到桌面与镜像都发布成功，由 `publication-cleanup` 回收；失败时保留供重试。构建期 rclone 按当前操作系统和 CPU 架构从官方固定版本归档安装并核对 SHA-256。

暂存对象位于 `_ci/<项目 ID>/<流水线 ID>/<提交 SHA>/<产物组>/<作业 ID>/`，纳入同一桶预算。完整上传后在同一前缀的 `completed/` 登记不可变完成清单；重试优先恢复已经完成的同流水线产物，传输失败不当作未构建。`seal-release` 登记版本、提交、成功任务与文件摘要。标签通过 GitLab API 核对同一提交的成功主线演练，再下载其相同文件；路径限定在对应输出目录，不接收软链接或路径穿越。macOS 仅传两种架构的 DMG、对应源码、`build-info.json` 与 `SHA256SUMS.txt`，不传展开应用。所有构建和独立制品验收成功后才写正式版本目录和公开索引；桌面与镜像都发布成功后只回收该演练前缀。失败候选保留供重试，不覆盖已有公开版本。

上传期间的完成构建保存在 `CI_BUILDS_DIR/.peach-upload-resume/` 的独立身份目录。R2 部分上传失败后，同机重试核对备份大小与 SHA-256，继续传到原作业前缀；完整上传清单登记后回收本组备份。机器更换且没有完整远端清单时需重新构建，不拼接未知来源文件。

Windows 轻量安装器缺少本地工具包时，先从 R2 下载当前版本的工具；连接失败或内容校验失败时，尝试 GitHub 的同版本文件。两个来源均须匹配安装器内置清单的大小与 SHA-256，不能混用其他版本。发布完成后，用 `scripts/smoke_split_update.py` 的 `--prepare-with-app --online` 在空缓存中运行实际制品，核对联网取得的工具能否重建完整程序。GitLab Release 的下载表使用 R2，资产区另列 GitGud 副本，文档链接指向对应版本标签。

已装的独立包用自己的代码读新版本的发布条目与更新包，发版时改不了。`build-windows` 拆包后运行 `scripts/update_compat.py`，用 0.48.0 起每个已发布版本标签里的更新代码原样读这一版：选不中新版本、读不了工具清单，或清单里有旧版不认得、运行时又补不齐的工具时，作业失败，不上传任何文件。本机测试用合成制品跑同一道核对，检出须带发布标签。客户端只准备自己认得、清单里也有的工具；应用更新包用不了时改下同版本完整包。0.47.3 及更早的版本读不了 0.48 起的清单，需手动运行一次完整安装包。依据见 [ADR-0120](adr/0120-standalone-update-client-compatibility.md)。

双后端发布复用官方 `glab packages upload`，将安装包、工具包、对应源码与 SHA-256 清单保存在 `peach-release/<版本标签>/`。上传前验证本地文件与 R2 发行清单一致，上传后检查 GitGud 服务端记录的大小与 SHA-256；同版本同名同内容直接复用，内容不同则保留原文件并停止。R2 保留原下载路径，GitGud Release 的备用直链使用 `/gitgud/<文件名>`，避免与主要下载入口冲突。两份存储均就绪后才登记 Release；官网继续优先从 Cloudflare 下载。

R2 公网下载流量免费，存储与请求按账户共享额度计费。预算告警只通知，不会停止服务；R2 后端不提供零费用硬封顶。要求绝不产生按量费用的部署应使用不绑定按量计费的下载服务，不启用 R2 自动发布。

演练入口读取本桶真实占用和暂存范围，构建清单齐备后、安装冒烟前计算暂存与公开副本的精确峰值，候选登记和上传时仍复查；默认超过 8 GB 时停止，保留已有文件。未知新版体积在构建前不视为已知容量。`PEACH_R2_MAX_BYTES` 可明确调整该桶预算；此检查不能限制同账户其他桶，也不代替请求量计费保护。版本文件设置长期缓存，公开版本索引只缓存一分钟。

At the top level, the Mac and Windows trays show only a short status and the number of alerts; expand the status submenu to see services and media sources row by row. Long addresses and paths are abbreviated, and "View full configuration" in the submenu keeps the full settings entry; once an alert disappears, it is updated with the next health-check round.

Single-machine setup turns ledger replication off by default and needs no Windows, SMB, LaunchAgent or system port forwarding. Each computer keeps its own data; a shared library is still configured according to [two-computer replication](#replication-between-two-computers) below, and offline edits cannot be merged automatically. Existing data directories are not imported automatically.

这条构建路径使用本地 ad-hoc 签名，未完成 Developer ID 签名和 Apple 公证，不作为已签名发行包发布。DMG 只分发应用，不安装系统服务；需要集中部署系统组件时再评估 PKG。独立包内含媒体工具与 cloudflared，工具位置与验证见「macOS 独立测试包」；源码开发外壳使用本机环境。macOS 在线更新安装器不包含在本测试包中。

## First Run and the Settings File

在网页设置的「JAV 与新作」中，可将女优名称显示为中文或日文原文。偏好保存在数据库，其他设备读取同一份设置；保存失败时保留原选择。切换只调整当前所选艺名的写法，缺少对应时保留当前名称，不更改人物名称、别名原文或作品署名。

第一次打开 Peach 有两种方式，结果相同：

- **Tray (recommended)**: after you run the tray program, the browser opens the first-run setup page.
- **Terminal**: run `peach init` and complete the setup through the Q&A.

Either way creates the data directory, prepares the database, generates the local certificate and the access token, and writes the settings file.

### First-Run Setup Page

首次设置分为欢迎、媒体目录、访问范围和确认四步。返回上一步会保留填写内容；提交校验失败时回到对应步骤。欢迎页可选择「使用已有数据」，恢复流程和完成页使用同一套分栏框架。

首次设置页会问：

1. 媒体目录：按媒体库分组，每个媒体库可设置名称、图标、来源色和处理方式，并添加多个文件夹。旁边的「选择文件夹」会弹出系统的文件夹选择框；也可以选择稍后添加媒体库。
2. 数据目录：数据库、封面、预览图和缓存都放在这里，馆藏较大时会占用数十 GB。Windows 版默认在系统盘的 `%LOCALAPPDATA%\Peach\peach-data`，系统盘空间紧张时请选其他磁盘上的文件夹；装好以后也可以在配置页迁移。
3. 谁可以访问：「只有这台电脑」或「同一局域网的设备」。
4. Peach 代理，以及高级设置中的端口和局域网名称。
5. 访问密码（可选）：留空时，能连到 Peach 的设备不用登录就能进入。
6. 是否立即扫描和诊断反馈；稍后添加媒体库时不触发扫描。

After submitting you enter Peach, and an installation guide appears at the lower right, listing library, collection credentials, browser history, follow, follow credentials and review. Each item can be skipped (and undone shortly afterwards); once all are completed or skipped, the guide disappears automatically. Guide progress is saved only in the current browser. If you chose to import browser history, the taste page opens first.

The first-run setup page is served by a temporary service that listens only on the local loopback address (default port 8900); after a successful submission the tray switches to the regular service automatically, with no tray restart. For its port, return codes and the switching process, see "Internals of First-Run Setup" under "Maintainer Reference".

### Terminal `peach init`

Running `peach init` directly in a terminal (with no arguments) starts the Q&A:

1. Data directory.
2. One or more local media directories: after you answer one it asks "Add another", and pressing Enter ends it. Duplicate folders or folders that contain each other are rejected.
3. Who can access (only this computer / devices on the same LAN).
4. Port.
5. LAN access address.

Pressing Enter on any question uses the default. Three invalid inputs in a row exit without writing any file. After answering, it asks "Scan <directory> now?" (default yes), and finally prints the next steps and a scan summary.

The terminal Q&A can only add local folders. Add 115 and PikPak cloud drives on the first-run setup page or the configuration page; see "CloudDrive Configuration" below.

When given any argument, with `--no-input`, or when not run in a terminal, `peach init` asks no questions and generates directly from defaults and arguments such as `--data-root`, `--host`, `--port`, `--mdns-name` and `--mount local=/mnt/media`. The settings file written this way carries three example sources: `local`, `115` and `pikpak`. When a database already exists it is not rebuilt, and the command suggests `--from-existing` instead.

### Where the Settings File Lives

The settings file is always `<Peach data directory>/config.toml`. The Peach data directory (where Peach keeps its data) is found in this order:

1. The environment variable `PEACH_DATA_ROOT`.
2. `peach-data/` next to the project directory (searching up to four levels up, so the main checkout, worktrees and the packaged `dist/Peach` all find the same one).
3. If neither exists, it is "not configured".

The Windows test build uses `%LOCALAPPDATA%\Peach\peach-data` by default. When first-run setup selects a different data directory, `state/data-root.txt` in the default data directory records the chosen absolute path; the tray, child services and later launches all read settings along this record. This file stores only the local path; the Peach database and media stay in their own directories. An unreadable record, an invalid path or a loop causes an error.

已有配置却出现首次设置页时，选择「使用已有数据」，填入原数据目录，例如 `E:\Peach\peach-data`。此目录须包含有效的 `config.toml` 和 Peach 数据库；连接成功后，普通启动也沿用该位置。没有位置记录的任意自选目录无法在升级时自动发现，需要选择一次；不必重新初始化或删除数据。

For deployments that already entered the library through `--data-root`, the new version installed by online update records the directory in use into the empty default data directory, after which ordinary launch works. When the default data directory already has a configuration, a Peach database or a directory record, its choice is kept.

The restore endpoint `POST /api/setup/restore` accepts `{"data_root":"absolute path"}` and reuses the first-run local and same-origin guards. On success it returns the completion-page fields plus `restored=true`; on failure it returns 400 with the reason in `errors.data_root`.

For the same setting, precedence is: environment variable > settings file > built-in default.

### 升级后的自动处理

升级并启动 Peach 后，已配置的写入端自动完成数据库迁移、本地确定性资料修复与后台补全，无需手动启动补修。结构和资料处理前保留数据库备份；人工填写、复核结果与人工规范名受保护，存在身份冲突的项目保留复核记录。只读设备不执行这些写入。

本版更新器允许读取端安装结构兼容的程序；若提示结构待迁移，先升级写入端并同步账本，再安装读取端更新，安装及失败恢复均不回写账本。仍使用旧更新器的读取端须先完成写入端升级及同步；旧助手在迁移被拒后仍可能写回自己的账本备份，当前程序无法追溯修改已经运行的旧助手。

资料和图片缓存按规则版本与来源变化失效。需要重新读取媒体的项目遵守媒体库处理方式、预览设置和读取成本：免费来源可自动处理，额外流量项目延后。处理会保存进度；失败可在「应用与维护 → 自动修复」重试，用户取消的任务保持取消。正常升级无需打开该面板。

应用提供新版本、更新准备完成及页面需要刷新的提示。首次未设置自动更新时，每天检查版本；明确关闭过的设置继续保留。下载、重启安装与页面刷新分别沿用用户选择，不因提示自动打断当前操作。独立包在新程序通过启动检查后才恢复后台任务；安装失败恢复程序、数据库、配置与任务检查点。

「自动修复」可下载本地复核记录。`GET /api/client-updates` 只读取本机快照，不触发外部版本检查；接口与权限见[路由清单](ROUTES.md)。设计与规则版本边界见 [ADR-0126](adr/0126-upgrade-effective-repairs.md)。

### 设置文件出问题时

- **A settings file already exists**: `peach init` refuses to run and returns 3; adding `--force` overwrites it. Before overwriting it copies `config.toml.bak`, which is the only file recording this computer's configuration.
- **The settings file has a syntax error**: `peach serve`, `peach migrate` and `peach status` refuse to run and report the file path and the offending line, rather than quietly running with defaults and ending up in a wrong state. `peach init --force` still works then and is the only self-rescue entry.
- **No settings file**: `peach serve` starts as usual, the page prompts you to run `peach init` first, and `/healthz` returns `configured=false`.
- **Drive-letter keys written directly under `[media]`** (for example `R = '...'`): `peach serve` refuses to start and tells you to rewrite them as `[media.mounts]`.

### Scanning a Directory

`peach scan <source ID> [root directory]` registers the files in a directory into the database. It only adds records and refreshes size and modification time; it does not change manually confirmed information and deletes no records.

When a directory has an assigned purpose and "New files follow this rule" is on, newly registered files are associated by the nearest rule level; existing conflicts are kept, see [Directory Browsing](DIRECTORY_BROWSING.md).

- Without a root directory, it scans all the directories this source declares in `[media.locations]`.
- With a root directory, it must be inside a declared directory (inside the mount point on macOS), otherwise it is rejected, because the registered path could not be converted back to a local path.
- The scan skips `#recycle` and NAS system directories whose names start with `@`; ordinary files with the same name prefix are still handled by file type.

### Long-Task Checkpoint Resume

Background tasks save the task identifier, processing range, completed set and counts locally. When the service restarts it reattaches to the same task record and continues the unfinished part. Tasks the user paused stay paused; an explicit stop cancels resumption. Failed, rate-limited or unobtained results keep the existing retry and cooldown rules and are not skipped as successful items.

「停止任务」先显示正在停止，等当前在途步骤退出后结算。已登记影片、资料、预览和候选保留，停止的任务不会在重启后自动继续；可以重新发起一趟任务。命令行发起的馆藏处理被停止时返回退出码 130。

日常使用「同步新增文件」：枚举目录发现尚未登记的文件，仅补全新增及待处理影片的资料和预览。已知路径跳过逐文件属性读取，不重复刮削已有影片；它仍需枚举目录，不能替代文件删除检查。「更多同步方式」分为日常同步和独立的「全库维护」，后者检查全部文件并复用已有资料和预览，可单独执行扫描、资料或预览步骤。

待补全数量汇总首次登记、尚未完成处理的视频，目录扫描、文件监控和云下载完成后的登记共用此集合；图片、附属文件和重复登记不计入。日常菜单的「补全待处理影片」只处理已登记的这一组。每趟范围保存到断点，后来入库的影片留到下一趟；失败项仍可从原任务定向重试。来源离线不等同于删除。

没有保存过推送发现设置时，本地文件监控默认开启，CloudDrive 通知需另行配置；已明确关闭的设置保留。监控使用系统文件事件和去抖队列，空闲时等待事件，不定期遍历媒体目录；网络盘不递归监控。未收到通知或服务停机期间新增的文件可由「同步新增文件」补齐。

本机移动事件和已记录的系统文件身份可保留改名、同卷移动后的影片 ID、人工资料和个人记录。文件身份随本地扫描和登记积累；升级前没有身份记录、停机时已经发生的移动，以及跨卷复制，不能仅凭同名或同大小自动认作原片。旧路径仍存在的副本与硬链接分别登记。

结束的任务可「导出完整问题清单」，下载包含全部分页记录的 JSON。导出期间任务或记录变化会停止导出，取消或失败不会下载半份文件；缺少原始问题记录时提示导出诊断日志。「归档提示」只收起旧问题提示，完整记录和任务历史仍保留。

| 任务 | 保存与恢复的单位 |
| --- | --- |
| Scan files | Source roots, directories still to traverse, and committed file batches within directories; file counts, byte counts and subtitle pairing data are kept |
| Read companion data, collect metadata and previews | Local evidence already read, candidates already written to disk, and previews already registered; finished videos and problem records are kept |
| Fetch follow updates, backfill history | A fixed set of sources, successful sources and committed page numbers; a from-scratch backfill task reuses the page numbers saved this time |
| New-release subscription, want-list data, discovery-card data | Completed sources or codes, saved data and covers; discovery cards also keep the consumed request and traffic budget |
| Follow-up tasks, post-download processing | The existing persistent queue and the same task record; batch data and samples save the original code set and successful items |
| Timeline thumbnails, media repair | Verified artifacts, file-identity-bound check conclusions and cumulative counts |
| Link check, follow-source lookup, taste reading | Completed links, search rows or browser data; results and processing range are kept |
| File organizing and rollback | A fixed organizing plan, the per-item log of the same batch, and pending rollback records |
| Resource check, resource cleanup, link cleanup | Completed sources, processed records and cleanup receipts; the current state is still reviewed before deletion |
| amane bridge environment preparation | The `uv` cache and installed dependencies; an interrupted install command re-checks the lock file |

A checkpoint is committed after the result is saved successfully. On interruption, file batches, source pages, single videos or write transactions not yet committed can be redone, while committed results continue to be reused. An external request itself cannot be resumed from a half response. A damaged checkpoint or an unobtained result file is reported as a problem; progress that was never saved cannot be recovered retroactively.

After a command-line scan is interrupted, run it again with the same source and root directory to pick up the checkpoint; finishing a full scan clears the checkpoint, and the next scan re-checks the directory. `scripts/scrape_codes.py` resumes the same batch by default, and the candidate CSV is kept together with the adjacent `.resume.json`; when `--out` is specified, the original output path is reused. Batch arguments must be identical, and `--no-resume` starts a new batch. Other probing, montage and cover batch jobs keep selecting their to-do items from saved measurements, artifacts or success logs.

### Media Source Status

The service reads the first entry of each mount directory in the background; an empty readable directory also counts as online. Healthy sources are probed every 600 seconds and failing sources every 60 seconds; after a first failure it re-checks one second later, and a fault is confirmed only after two consecutive failures. The messages respectively say no permission to read, directory does not exist, target is not a directory, or directory read failed.

`/api/sources` returns a periodic snapshot and the probe time; while probing or when a probe has not returned, `online` is `null` and the page keeps the source's availability state. "Refresh status" in the fault panel reads the latest snapshot, and the background re-probes at the intervals above. Actual playback and scanning still check the directory immediately. The `media_mounts` summary of `/healthz` and the tray show source names and fault reasons; a mount fault does not trigger a normal service restart. There are at most four probe threads, and a directory with an unreturned probe is not probed again.

### 媒体库与存储根目录

媒体库保存名称和图标，可以包含多个存储根目录。配置页与首次设置中的「目录所属媒体库」明确指定归属；名称相同的媒体库保持独立。修改同一库的名称或图标会同步到其全部目录，调整目录顺序不会改变身份。

`media.library_catalog.<library_id>` 和 `media.storage_roots.<root_id>` 持久保存身份。路径、挂载、来源及读取策略归根目录，名称与图标归媒体库。`media.locations` 等路径表是兼容投影，手动配置以身份表为准，字段与升级依据见 [ADR-0115](adr/0115-library-and-storage-root-identity.md)。

每个媒体库还可以设来源色和处理方式。来源色给这个库的卡片和列表行铺一层淡色，默认不上色。处理方式有三档：「自动补全」缺什么联网补什么；「仅使用本地资料」只读本地 NFO 和同目录图片，仍读取视频信息、生成九宫格，不联网补资料、封面和人物图片；「自定义」逐项选择步骤。配置里写作 `color`、`policy`（`auto` 不写）和自定义时的 `stages`，定时扫描、增量入库和重试都按作品所属媒体库遵守，依据见 [ADR-0116](adr/0116-library-processing-policy.md)。

路径配置首次保存时按原同名分组写入稳定身份，写入前把原文件留成 `config.pre-media-identity.toml`，以后的保存不覆盖它。也可用 `scripts/upgrade_media_identity.py --data-root <数据根>` 预演，核对后加 `--apply` 显式升级；脚本备份配置并原子写入，不打开 ledger。重复执行保留身份。真实配置升级按部署授权执行，先在隔离配置验证。

已有目录更换位置时，选择「重定位此目录，保留文件记录」；它保留账本前缀并更新本机挂载位置。选择「添加另一目录」创建独立根目录。移除目录声明保留文件及个人记录，文件删除仍使用各自的确认入口。目录重定位应指向同一批文件，不能用已有 ID 接管另一批内容。

每个根目录的离线状态按 `root_id` 返回。多目录媒体库中的一项目录离线，只影响该目录中的作品；来源筛选仅在所有根目录离线时禁用该来源。资源清理继续保留现有在线保护条件。

### 在 macOS 上对应 Windows 路径：`[media.mounts]`

在首次设置或配置页中添加媒体目录，填写这台设备能读取的目录，例如 macOS 的 `/Volumes/Media`、Linux 的 `/mnt/media` 或 Docker 容器内的 `/media`。Peach 自动保存数据库所需的路径配置。已有目录改位置时，修改这一行的媒体目录并选择重定位；内部路径的对应关系由 Peach 保留。

The field descriptions below are for editing the configuration by hand or for mapping existing media directories across multiple Peach installs.

In the Peach database, every video's `path` field uses Windows format, for example `R:\media\x`, even when the service runs on macOS or Linux. This value is a string in the database; when this machine has no matching drive letter, Peach needs the two settings below to find the actual file. For Docker configuration see [Docker Deployment](DOCKER.md#configuration-file-and-paths).

- Both use the same media source key, for example `local`, `115`.
- `[media.locations] local = 'R:\media'` means that file paths in the database start with `R:\media`; it does not require this directory to exist on macOS or Linux.
- `[media.mounts] local = '/Volumes/<volume name>/media'` is the directory actually read on this machine. `R:\media\x` in the database is converted to `/Volumes/<volume name>/media/x`.
- When a source has several directories, write both as arrays; the number and order of directories must be the same.

Windows 的 `[media.mounts]` 可以留空，此时直接使用账本前缀；重定位目录时同样执行挂载映射。macOS 和 Linux 仍然使用两项配置；缺少对应实际目录时，该根目录显示离线，媒体记录保留，但无法读取文件。把 `[media.locations]` 的值改成 POSIX 路径不会同步修改已有影片记录，也无法替代这一步转换。媒体来源键写错或写成盘符时，配置会被拒绝。

For temporary diagnosis you can override with an environment variable, for example `PEACH_MEDIA_MOUNTS=local=/mnt/res,115=/mnt/115`.

### Replication Between Two Computers

`[replication] enabled` decides whether this computer takes part in database replication between two computers; the default is `false`. With only one computer, keep it off; then every feature is writable and `ledger_sync` in `/healthz` shows `disabled`. For behavior once enabled, see "Synchronization Between Two Machines" under "Maintainer Reference".

### Writing a Settings File on a Machine Already Running

For a computer that is already running but has no settings file yet, use `peach init --from-existing`:

- It writes only the settings file, builds no database, and touches none of the files already in `peach-data/`.
- It writes the currently effective configuration into the settings file. Items it cannot infer (the LAN writer address, the SMB host and account) are left blank and printed one by one; supply them all at once in the same command with arguments such as `--writer-origin`, `--smb-host` and `--smb-user`, rather than hand-editing afterwards.
- The replication switch written by `--from-existing` is `true`, while a fresh `init` writes `false`.
- When `init --from-existing --force` rewrites an unreadable settings file, it writes the built-in defaults plus environment variables and does not inherit the old file's content. The command prints this first; a custom mDNS name, writer address and SMB information from the old file must be given again in the same command.

If you do not run `--from-existing`, built-in defaults are used, and at least these change: the mDNS name, the macOS source mount table, the reader's writer address and proxy, the SMB host and account, and the replication switch (off by default). The Peach data directory, database path, Windows drive letters and listening port stay the same.

### Configuration Page

「网络与访问」显示本机地址、手机连接地址及可用的备用 IP 地址。地址协议来自实际服务；HTTPS 使用配置的名称地址。独立桌面部署可选择本机或局域网访问，并修改局域网名称；文件管理的部署按启动配置显示。勾选关闭访问密码时，新密码与确认输入框收起，保存时仍验证当前密码。

馆藏处理等待外部资料或封面较久时，卡片与常驻任务浮窗提供「跳过这部」。指令核对当前任务与资产，当前请求结束后在安全点继续下一部；已取得的结果保留，跳过项进入可重试清单。任务浮窗用关闭键隐藏，拖动不会收起；提示与操作在宽度足够时同行。

Peach 配置页地址是 `/configuration`。从管理菜单或设置弹窗的「Peach 配置」，或托盘菜单「配置 Peach」进入。页面分成「媒体库与入库」「来源与订阅」「下载渠道」「网络与访问」「应用与维护」五组。来源凭据、作品资料站点与资源搜索索引器放在「来源与订阅」，该分区也可进入采集来源与登录状态；本机端口放在「网络与访问」。

- It can be changed only on the computer running Peach and only when the service is managed by the tray. The admin menu on other devices has no such entry, and the settings say which computer to go to.
- This computer can open the configuration page with the configured `.local` name, the loopback address or the IP the service is bound to. Peach decides whether a connection is local by the IPs at both ends.
- "Choose folder" opens the system folder picker (Windows Explorer, macOS Finder) on the computer running Peach, again open to the local machine only.
- After saving, the tray reloads the settings and the local service restarts.
- A source-deployed tray service keeps a fixed HTTPS address and port; the Windows test build can change its port on the configuration page.

Media repair is on the "Data Management" page, and subscription sources are on the "Subscription Sources" tab of the "Follow Management" page (for the division of work see [ADR-0050](adr/0050-settings-modal-holds-values-pages-hold-work.md)).

扫描与采集逐项保留结果。文件抽帧失败、资料请求超时等单项问题记入清单，继续处理其余文件与后续阶段；所有阶段结束后，有问题的任务显示「处理已结束，部分项目需处理」，可查看全部内容或仅重试未完成项。状态保存、数据库等公共环节异常导致的中断单独显示。未取得发行资料的视频仍可在「全部内容」浏览；JAV 分类按番号和发行资料筛选。需要选择处理范围时，使用「更多同步方式」中的仅扫描、仅补资料或仅补预览图。

同一 Windows 规范路径存在多条历史记录时，扫描在问题清单中列出路径和记录编号，其他文件继续入库。冲突记录的身份、资料、个人记录和处置状态分别保留；枚举确认文件仍在时只刷新这些记录的观测时间。自动发现可登记同目录的其他文件，直接登记冲突文件则报告具体冲突。重复记录需复核，重新扫描不会自动合并或删除它们。

媒体目录、NFO 与配套图片的单次读取限时 20 秒，超时会结束读取子进程并记录问题；本趟任务不反复读取已失败的目录。单个视频的九宫格共用 120 秒处理时限，失败后继续下一部影片与外部资料采集。用户暂停、磁盘空间不足、账本或结果保存失败会中断任务并保留检查点。未登记成功的目录需要重新扫描；已登记影片的问题可按清单重试。

文件在磁盘上被移除后，可到数据管理页下方的「资源同步」检查账本记录。该分区要求至少一个可扫描来源配置了根目录；清理前核对检查结果并确认。带个人记录的失联作品保留为已消失，其余清理规则见资源同步的确认说明。

采集预估同时显示资料与预览产物的预计新增磁盘占用、临时文件峰值，以及各输出盘的可用空间。封面按番号去重，资料快照和九宫格按待执行范围估算；缓存命中和已完成工作不重复计入。占用依据本地缓存大小中位数估算，没有样本时使用计划值。各盘分别保留 1 GiB 运行余量，空间不足显示差额；容量读取失败显示未取得。网盘挂载缓存与预读无法准确测量时单独提示，不能据此认定网盘缓存也可容纳。

应用资料采集器每次会话最多 6,000 次请求、1 GiB 下载和 4 小时，另有来源限速、冷却及单项截止时间。应用采集流水线运行期检查数据盘 1 GiB 底线；独立封面、探测和九宫格脚本采用各自的磁盘参数，封面与九宫格默认 40 GiB。流量和磁盘预估本身不改变这些限制。

右下角的扫描与采集进度浮窗可收起详情，也可点「隐藏任务提示」关闭；隐藏后后台任务继续执行。当前页签会记住这趟任务的隐藏选择，刷新、换页及暂停后继续均保持隐藏。在「管理 → 数据管理 → 扫描与采集」卡片点击「显示进度浮窗」即可恢复。新任务自动显示，隐藏期间任务完成仍有一次完成提示；失败详情保留在数据管理页。

「扫描与采集」启动前按待处理项显示流量约值；运行中的任务面显示已用流量与预计总流量，可展开查看带网盘图标的各盘明细。资料下载按番号去重，扣除已齐全的字段、可用封面、有效缓存和来源近期确认无结果的请求，并采用现有 HTTP 下载预算；外部采集器另行估算。配套文件检查完毕后，按实际取得的字段和核查范围更新预估，完成的工作从待下载量中扣除。网盘读取按对应 CloudDrive 账号的数据代理配置分别汇总；跟随系统或尚未匹配账号的目录单独保留连接状态，不计入已确认代理合计。“代理保护”限制自动读取视频，不决定网盘的连接方式。本地磁盘读取不计入网络流量；资料站下载按来源连接设置另列。挂载读取量受缓存和预读影响，浏览器与外部采集器的流量也无法完整统计，读数作估算参考。新目录尚未登记的文件在扫描后更新预估，暂停和应用重启保留同一任务的累计值。

媒体库设置中的「CloudDrive 代理」只显示已添加媒体库对应的账号，按精确挂载点或推送路径前缀绑定；多个媒体库共用同一账号时放在同组。API 代理用于列目录和查询文件信息，数据代理用于读取视频及配套文件。先在下载设置中保存 CloudDrive2 地址与 API 令牌；令牌需要“查看云盘”权限，保存还需要“修改云盘”权限，自动识别挂载点需要“查看挂载点”权限。页面进入、重新聚焦和点击「重新读取」时取得 CD 当前配置；有未保存编辑时，聚焦不覆盖表单。保存会立即写入 CloudDrive 并读回确认，影响该账号的其他消费者。代理密码不回显，留空保留，勾选后可清除。保存前检查整个账号配置的修订号；官方接口没有原子条件写入，其他客户端恰好在检查与保存之间修改仍有竞争窗口。请求超时或回读失败时，先重新读取核对，不自动重发。HTTP／SOCKS5 表示配置了代理入口，具体节点计费仍取决于代理工具的规则和 TUN。更多接口的适用性见 [CloudDrive 官方 API 接入](CLOUDDRIVE_API.md)。

启动弹窗同时显示视频文件数、文件名或已有资料可识别的 JAV 文件数与去重后的部数。尚无登记视频的目录分批列出，只识别名称、不打开媒体内容、不写入账本；统计过程中可直接开始扫描，关闭弹窗后不再请求后续批次。新任务沿用同进程 5 分钟内该范围的预检结果，随后用实际扫描更新；账本中已有的记录优先。首次网盘预检的耗时取决于挂载工具列目录的速度；文件名没有番号的 JAV 要在读取配套资料后补充识别。明细里的每部平均预估只针对本次待补资料，缓存齐全的影片不进入这个均值。右下「管理媒体库」链接关闭弹窗并进入媒体库设置，可在那里调整各目录的读取选项。

文件名不必只写番号。番号后面跟片名、女优或字幕说明（`CAWD-987 片名`、`GVH-520【中文字幕】片名`）时，取文件名里第一段「厂牌-至少三位序号」；FC2 商品号（`+++ FC2-PPV-1234567 片名 前編`）写在文件名任意位置都能识别。内置规则认不出的命名，在「媒体库与入库 → 番号识别规则」里每行写一条正则表达式：对完整文件名搜索、不分大小写，番号写在命名组 `(?<code>…)` 里，没有命名组时取第一个括号；取出的部分仍须符合番号格式。规则保存在账本里，各设备共用，保存时检查语法。「处理」时对还没有番号的视频先按这些规则识别，再按内置规则识别；已有番号不会被改写。启动弹窗的预检只按内置规则统计。

本机的 `state/library-processing-traffic.json` 保存近期同类用量。视频探测和单帧读取按媒体目录分开积累；资料采集按待访问来源、封面需求和直连／代理分组。至少取得 3 个有效样本后采用最近 50 次的平均值，后续同类工作随之校准；失败、零下载及计量不完整的资料采集不作为正常样本。首次使用无历史时仍采用默认计划值。

常用的本机设置：

- 「通用 → 开机自启」：开机后启动 Peach、静默启动（开机后只显示托盘图标，不打开网页）、在桌面创建快捷方式。
- 「网络与访问 → Peach 代理」：选系统代理、直连或自定义地址。默认外网 HTTP 请求与采集来源选「Peach 代理」时共用这里的设置，来源选「直接连接」则使用直连。保存后新建客户端按新设置运行，已有任务与长连接沿用创建时的配置。覆盖范围及本机、网盘和独立工具边界见[来源连接设置](SOURCING.md)。

### CloudDrive Configuration

115 and PikPak cloud drives are mounted as local drives by CloudDrive2, and Peach reads them as ordinary folders. Mount steps, source IDs, path mapping on macOS, cache and read settings, and automatic ingestion of new files are all in [CloudDrive Configuration and Tuning](CLOUDDRIVE.md). "CloudDrive cache suggestions" in the configuration page is its summary.

### 存储空间与迁移数据目录

配置页「应用与维护 → 存储空间」列出数据目录、所在磁盘的剩余空间，以及「统计占用」后各类数据的大小。统计在后台进行，几十 GB 的数据目录要一两分钟，进度条按上次统计的文件数估算。统计结果是一张环形图（各类占比）、一根磁盘占用条（Peach、其他文件、可用）和逐类列表，每类都写明是什么、能否清理以及原因。

可以清理的几类行首有勾选框，勾选后点「清理所选」，或点「全部清理」：

| 类别 | 清理什么 | 之后 |
| --- | --- | --- |
| 数据库备份 | `database/` 与 `generated/organize-backups/` 里的 `ledger.pre-*.db`，每处保留最近一份 | 无法恢复，当前数据库校验不通过时拒绝清理 |
| 播放缓存 | `generated/transcodes/` 里的整片转码与 `generated/stream-segments/` | 再次播放时重新生成；重建的文件头（`.mp4hdr`）保留 |
| 缩略图 | `generated/cover-thumbs/` 与 `generated/avatar-thumbs/` | 浏览时重新生成 |
| 日志 | `logs/` 里已归档的 `*.until-*.log` 与 `crash-*.log` | 正在写入的日志保留 |

缩略图是封面与头像的小尺寸副本，由本机已有的原图缩小而来；预览图是从视频抽帧生成的九宫格、海报与进度条预览，重建要重新读取整部影片，网盘里的影片会重新下载，所以只统计不清理。封面与网络资料要重新联网下载，导入资料、任务与复核记录、媒体工具和登录状态都无法由 Peach 重建，同样只统计不清理。

「更改位置」把整个数据目录迁到别的文件夹。安装版、从托盘启动的源码运行（Windows、macOS）和无桌面服务（`python -m peach.server`）都支持：

1. 先统计占用，再选一个空文件夹（或新建一个）。不能选磁盘根目录、程序目录、媒体目录，或与当前数据目录互相包含的位置；跨磁盘迁移时，目标磁盘要比数据目录多出 1 GB 余量。
2. 确认后 Peach 暂停后台任务、停止服务并退出托盘；无桌面服务只停网页服务，看守进程留着做迁移。同一磁盘内直接改名；跨磁盘时 Windows 用资源管理器的复制（带进度和取消），macOS 逐个复制，复制完逐项核对文件数与大小。
3. 数据库里指向数据目录的预览图与追更证据路径改到新位置；默认位置与原位置各留一份 `state/data-root.txt` 指向新位置，开机自启与桌面图标按新位置重写。
4. Peach 在新位置重新打开（无桌面服务在新位置重新拉起网页服务），原位置的数据随后删除。暂停的任务自动继续。

任一步失败都留在原位置继续使用，原因显示在「存储空间」里；跨磁盘复制失败时，新位置已复制的部分会删掉。原位置有文件删不掉时会列出路径，确认新位置正常后手动删除。

源码运行时，默认位置是项目旁边的 `peach-data`；原位置留下的 `state/data-root.txt` 让默认位置和显式的 `PEACH_DATA_ROOT` 都跟到新位置。直接运行 `peach serve` 时没有看守进程接手，不能在设置页迁移：改用托盘或无桌面服务启动，或退出 Peach，手动移动数据目录，再把 `PEACH_DATA_ROOT` 指向新位置。

容器的数据目录是宿主机挂载的卷，在容器里迁移会离开卷，重建容器时数据丢失，所以设置页不提供迁移，改为列出在宿主机上迁移的步骤和命令，见 [Docker 部署](DOCKER.md#迁移数据目录)。

### 卸载

Uninstall the Windows test build from Peach Configuration "App and Maintenance → Uninstall Peach":

1. First choose the scope. By default data is kept; ticking "Full uninstall" also deletes settings, the local database, watch records, credentials and caches.
2. After confirmation, Peach exits the tray, shuts down its own services, ends leftover processes still running in the program directory, then removes the launch-at-login entry and the whole program directory. Deletion is retried three times and an error is reported only if it still fails.

What is kept:

- 原始媒体文件，任何情况下都保留。
- 手工复制的 `config.toml.bak` 和其他 Peach 不认识的文件。
- 完全卸载删除的是设置文件、Peach 自己生成的设置备份（`config.previous.toml`、`config.pre-media-identity.toml`，以及 `config.toml.<说明>-<日期>-<时刻>` 形式的备份）和列出的数据库、缓存、凭据等目录。数据目录放在别处、用了目录链接，或者和媒体目录重叠时，需要自己手动检查和清理。

When deletion fails because a file is in use, the dialog gives the log location: `peach-uninstall.log` in the temp directory, which records the reason and the failing path.

A source install cannot be uninstalled automatically: first turn off launch-at-login on the configuration page and quit the tray, then delete the paths the page lists by hand. The Git working tree is not deleted automatically.

### Health Check

`/healthz` confirms whether the service is running:

- With no parameters it reports that the service is alive and provides per-item status for the database, migrations, configuration, tools, mounts and access security; mount anomalies are warnings and the service still returns 200.
- `/healthz?ready=1` also checks the configuration, pages, database queries and database migration validation, and returns 503 when not ready.
- In the response, `configured` says whether this computer has a settings file, and `ledger_sync` says this computer's role in two-machine replication (`writer`, `reader` or `disabled`).

A source-deployed tray (Windows, and macOS with TLS configured) runs an HTTP service and an HTTPS service at the same time. The HTTP one only redirects the browser to the HTTPS address, so a healthy `/healthz` on the HTTP port only shows that it itself is alive.

The status line of the tray menu lists each service one by one, for example `HTTP OK · HTTPS error (status code 503)`, with the most recent failure reason appended when abnormal.

### Local Diagnostics

The tray's "Export diagnostic report" and the system diagnostics page's "Download diagnostic report" provide a redacted ZIP. After the tray export completes you can open the folder, open the file or close the window; when startup fails, the dialog gives the location of the automatically saved report. The report contains the version, system information, the tail of selected logs and system checks that could be obtained; configuration files, credentials, the Peach database and media do not enter the report. URLs, local paths, IPs, emails and common credential fields in logs are redacted, but you should still check the report before sending it.

The standalone package supports `Peach.exe --diagnostic-report`, which saves a report without starting the service; when specifying a target file, put it after this argument, and an existing file is not overwritten. A source environment can get the same kind of report with `python -m peach.support_bundle`. By default reports and error logs are saved in the data directory's `logs`, and when that directory is not writable, `Peach/logs` under the system temp directory is used.

Errors from the main thread, background threads, unhandled coroutines and the local browser are written to `errors-<PID>.log`; native crash stacks that Python can capture go to `crash-<PID>.log`. Windows standalone launch-failure records include the failing API name and the system error code. When the operating system blocks the program before Python starts, the process is killed directly, or the disk is entirely unwritable, the program itself may be unable to leave evidence; keep the system prompt and the full dialog.

The local download endpoint is `/api/diagnostics/bundle` and must pass the existing login check; the browser-error endpoint `/api/diagnostics/client-error` accepts only local same-origin requests, supports first-run and the login page, records at most 20 times per minute, and at most 16 KiB per request.

Run `peach doctor` on the computer where Peach is installed to review, item by item, the version, configuration, Peach database migrations, tool paths, data directory writability, media mounts, ports and the most recent task failure. `peach doctor --json` outputs the same redacted report, for use by the local diagnostics API `/api/diagnostics`.

Peach Configuration "App and Maintenance → Runtime Info" opens `/diagnostics`. Library health provides counts of recognition failures, metadata-fetch failures, missing covers and missing durations; expand to open the works and copy the current list. Each category returns at most 500 items and keeps the total; works with no code use their number. Failures come from the problem records of recent processing tasks; paused and no-match records are not counted as failures; when a record is damaged it shows as unobtained.

minnano-av and javdb use records that were actually parsed, identity-checked and written to the database, and show the last success time and cooldown deadline. With success evidence within one day and not in cooldown they show as normal; old records keep their time and the current state is unobtained. Opening diagnostics does not trigger any source fetch.

The standalone package diagnoses the configured port by default; a source environment with complete TLS material diagnoses the tray's HTTPS entry (Windows 443, macOS 8443). When starting the service directly, `--host` and `--port` can specify the actual listening address.

`failed` means attention is needed and the command exits with 1; `warning` or `unknown` keeps the specific reason and exits with 0. Diagnostics only create and clean up a temporary write probe in the data directory and run no migration or repair. When a port is in use, only the occupied state is reported, and process ownership must be checked separately. The public `/healthz` provides only status and reason; full tool paths appear only in local diagnostics.

## Access Address, Password and Certificates

### Which Address to Open

- **Windows test build**: with "Only this computer" selected, open `http://127.0.0.1:<port>`; with "Devices on the same LAN" selected, other devices open `http://<mdns_name>.local:<port>`. The test build uses HTTP, unencrypted.
- **Source deployment**: the tray serves HTTP on port 80 and HTTPS on port 443 of this machine's LAN IPv4 address; open `https://<mdns_name>.local` in the browser. The LAN address is chosen automatically by default and can also be set with a startup argument or `PEACH_LAN_ADDRESS`.

`<mdns_name>` is the value of `[server].mdns_name` in the settings file, and Peach announces this name on the LAN.

### Access Password and Login

- The access password is set on the first-run setup page or in the configuration page under "Network and Access → Access Password", and can be left blank. If blank, any device that can reach Peach gets in without logging in. Terminal `peach init` sets no access password by default.
- If an existing deployment has no access-password setting, the login page keeps using the access token. A logged-in local browser can set its own password on the configuration page, or explicitly turn off the login requirement.
- Changing the password requires the current password; turning it off also requires ticking a confirmation of the access scope. Changing or turning off takes effect immediately, logins in other browsers become invalid, and the current device stays logged in for 30 days.
- Ticking "Stay signed in" on the login page keeps you logged in for 30 days; unticked, it is valid only for this browser session, at most 12 hours. Refreshing the page does not extend the validity.
- The password is stored on this machine as a scrypt hash in `<Peach data directory>/secrets/access.json`, not in the database and not synchronized.

For the full description of the security model see [Security Notes](../SECURITY.md).

### Access Token

Scripts and API calls use the access token, placed in the `X-Token` request header.

- A service started on a non-loopback address must have an access token, which is generated automatically at first initialization.
- `peach token` shows the token (the file is `<Peach data directory>/secrets/auth-token`), and `peach token --rotate` replaces it with a new one; restart the service after replacing.
- Replacing the token invalidates the old token and sessions logged in with it; browsers logged in with the access password are unaffected. Changing the access password does not affect the access token either.
- Login exchanges the token for an HttpOnly cookie through the `/login` form. The `?t=<token>` query parameter is only for one-off use, because it leaves the token in access logs and browsing history.

### Making Other Devices Trust the HTTPS Certificate

A source deployment issues the HTTPS certificate with a locally self-signed CA (a `.local` name cannot use a public certificate such as Let's Encrypt). The certificate and private key are both in `<Peach data directory>/secrets/tls/` on this machine.

托盘启动或本机地址变化时检查叶子证书的覆盖范围、到期时间及颁发者密钥标识（AKI）。缺少 AKI 的存量叶子会使用原 CA 补签并保留备份，已安装的 CA 信任继续有效，无需手动重建 CA 或重装信任；符合条件的叶子不会重复补签。运行期和 TLS 设置脚本均显式签入 SKI、AKI，以满足严格 TLS 校验。

1. 把 `peach-local-ca.crt` 复制到要访问的设备上。只复制这一个文件，任何私钥都不要外发。
2. 在设备上安装并信任它。iPhone／iPad 装好描述文件后，还要在「设置 → 通用 → 关于本机 → 证书信任设置」里打开完全信任。
3. 用 `openssl x509 -noout -fingerprint` 核对设备上的证书指纹与本机一致。

Each computer running Peach has its own independent CA. If a different computer starts serving, the device needs that computer's `peach-local-ca.crt` installed.

On Windows the TLS private key has permission inheritance disabled and is readable only by the account actually running the service, SYSTEM and Administrators.

### macOS Cannot Open the `.local` Address

When opening a `.local` address in the browser returns 503 while connecting directly from the terminal works, a system proxy has usually intercepted the request: the proxy cannot resolve mDNS names.

In the macOS system proxy exception list, add `*.local`, `localhost`, `127.0.0.1` and this machine's LAN subnet:

- Set: `networksetup -setproxybypassdomains`
- Check: `ExceptionsList` in the output of `scutil --proxy`

After a proxy client resets the system proxy, this list may be cleared and you need to add it again.

## Access from the Internet: Cloudflare Public Entry

"Cloudflare Public Entry" under "Network and Access" on the configuration page is off by default. **You must set an access password before you can start it**; without a password it is stopped and kept off.

### Temporary Link

1. After setting the access password, click "Start public entry".
2. The page shows a random address `https://<id>.trycloudflare.com` generated by cloudflared; use it to access. `https://try.cloudflare.com/` is only an introduction page.
3. After you stop the public entry or quit Peach, this address stops working; the next start gives a new address.

Notes:

- This is only for temporary preview; it is not a stable domain and has no team account or Cloudflare Access layer.
- The random address is stored only in the state file in the data directory. Do not save it in bookmarks, documents or public configuration.
- cloudflared needs outbound access to TCP/UDP port `7844`. When it is blocked by a firewall or proxy, the page shows a failure; a displayed random address does not mean the connection has succeeded.
- The Windows test build ships a SHA-256-verified `cloudflared.exe`. Running from source requires installing the official cloudflared yourself, and Peach looks for it in the order of `tunnel.binary` in the settings file, the environment variable `PEACH_CLOUDFLARED`, then PATH.
- In a source deployment, Cloudflare connects to the actual local HTTPS service and validates with the project CA and the mDNS name; the test build connects to the local loopback HTTP port.

### Named Tunnel (Source Deployment Only)

A named tunnel has a fixed address that does not change after restart. The Windows test build does not support this method, and the configuration page does not show this block.

1. In Cloudflare Zero Trust under Networks → Tunnels, create a new Cloudflared tunnel and copy its tunnel token.
2. Add a Public hostname to the tunnel, using your own domain as the hostname. For Service enter this machine's HTTPS address: for a source deployment `https://<LAN IP>:443` (on macOS, use the actual TLS port). Then, under Additional settings, set Origin Server Name to `<mdns_name>.local` and put the project CA in the CA Pool; otherwise the locally self-signed certificate fails validation.
3. On the configuration page under "Cloudflare Public Entry", switch to "Named tunnel", fill in the public hostname and the tunnel token, and click "Save configuration". The token is written only to `[tunnel] token` in the settings file; the page never shows it again, and it does not appear in the database, logs or `/healthz`. When replacing the token, enter the new one; leaving it blank means keep the saved one.
4. It is recommended to configure an identity policy for this hostname in Cloudflare Access. This layer is configured entirely in the Cloudflare dashboard; Peach neither reads nor manages it. Peach's own access password is still a precondition for starting the tunnel, so both gates exist at once.

The whole site refuses search-engine indexing: every response carries `X-Robots-Tag: noindex, nofollow, noarchive`, `/robots.txt` is readable without login and gives `Disallow: /`, and the main page and login page additionally carry `<meta name="robots">`. This cannot be turned off.

## Playback and Transcoding

Formats the browser can play directly (for example common MP4) need no extra software. The Windows installer and portable builds ship FFmpeg, ffprobe and untrunc, which repairs damaged MP4 indexes. A source deployment must supply these tools itself; when they are missing, "Runtime Info" on the configuration page gives a download entry. First-run setup also gives a download entry when OpenSSL is missing.

Peach looks for FFmpeg and ffprobe in this order:

1. 显式设置的环境变量。
2. Windows 独立程序目录下的 `tools/ffmpeg/bin`，或 macOS 应用的 `Contents/Resources/tools/ffmpeg/bin`。
3. 数据目录下的 `tools/ffmpeg/bin`。
4. PATH。

untrunc is looked up in the same order, with the directory `tools/untrunc`. The standalone program prefers the version verified with the package; an environment variable can still specify the tool path explicitly.

人脸检出（YuNet）与比对（SFace）模型随 Windows 完整安装包、完整免安装 ZIP、macOS 应用和 Docker 镜像分发，离线即可用。Peach 先读 `PEACH_FACE_MODELS` 指向的目录（Docker 镜像设为 `/app/tools/face-models`），再读独立程序的 `tools/face-models`，两处都按 SHA-256 校验；不在或校验不符时改用数据目录 `tools/yunet`、`tools/sface` 里的那份，再没有才联网下载。随包那份不会复制到数据目录。轻量安装包和应用更新包不带模型，由安装器或更新器按需下载 `tools-face-models.zip`。

播放时：

- 浏览器不支持的 AVI、MKV 等格式，Peach 会转成兼容的 MP4 缓存起来再播放，**不会改动原始文件**。第一次播放前会先探测文件，最长 20 秒。
- 能保留的码流尽量保留：H.264（`yuv420p`／`yuvj420p`）视频不重新编码，AAC 音频直接复制，其他音频转成 AAC。需要重新编码视频时，自动模式依次尝试硬解加硬编、软解加硬编、全软件；Windows 使用 NVIDIA（`scale_cuda` + NVENC），Linux 使用可用 VAAPI 节点，macOS 使用 VideoToolbox。macOS 硬件编码通过实际合成帧探测，并禁止系统软件编码冒充硬件；H.264 输出采用 6 Mbit/s。AV1 硬解显式使用 FFmpeg 原生 `av1` 解码器，设备不支持时回退 dav1d 软件解码。
- 同时最多进行 2 个转码或探测，单次最长 1 小时，关掉播放页会取消对应的任务。
- 115 和 PikPak 的视频通过媒体库配置中声明的挂载目录播放。能不能播，以在 Peach 里实际打开一个已知视频为准。

Peach 配置「媒体库与入库 → 视频预览」中的「抽帧解码方式」与「应用与维护 → 视频播放」中的「转码方式」分别保存为运行 Peach 那台电脑的偏好，两者互不影响，均可选择「自动（硬件优先）」或软件。抽帧设置控制封面、九宫格与时间轴；扫描、读 NFO 和时长探测不依赖 GPU。播放设置只控制 Peach 服务端的整片与 HLS 转码，浏览器直接播放时自行选择解码方式。保存无需重启，对新任务生效；已生成的有效缓存继续使用，运行中的 FFmpeg 不被强行中断。macOS 抽帧在同一超时预算内尝试 VideoToolbox，Windows 抽帧对 H.264、HEVC、VP9、AV1 尝试 D3D11VA，失败后都回退软件；视频编码格式探测按文件大小和修改时间缓存。Windows 播放的自动档依次探测 NVENC、AMF、QSV 编码，三者都不可用时用 D3D11VA 解码再交给 libx264；AMF 只接受 AMD 显卡上的 D3D11 设备，Peach 按显卡序号逐个探测。偏好通过 `/api/media-processing` 的 GET/POST 读写，`preview_acceleration` 和 `playback_acceleration` 分别接受 `auto/software`；省略的字段保持现值。这个接口与时间轴缩略图的 `/api/thumbnail-jobs` 和 `/api/configuration/*` 一样只接受运行 Peach 的电脑发来的请求，其他设备即使已登录或处于开放访问也返回 403。`PEACH_TRANSCODE_BACKEND` 可用于管理员诊断，支持 `auto/software/nvenc/amf/qsv/vaapi/videotoolbox`，显式 `software` 会保持禁用硬件。

卡片悬停预览请求的 `/stream` 不带流会话，取消不了，也看不到浏览器断开。片源需要整片转码且没有现成缓存时，这条请求直接回 415，不启动 FFmpeg；详情与沉浸模式带会话播放，关闭时按会话结束转码。

播放器进度条可以复用视频旁的 Jellyfin Trickplay、Emby／Roku／Plex 导出的 BIF、WebVTT 图片索引、HLS 和 DASH 图片轨。已有产物只读，时间轴采集遇到可用预览会跳过。命名、读取范围和缺少时间索引时的处理见[已有时间轴预览](VIDEO_PREVIEWS.md)。

## 文件整理

在「数据管理 → 整理」选择来源。右侧路径框可直接输入目录，旁边的文件夹按钮在运行 Peach 的电脑上打开目录选择窗口；远程访问或系统选择窗口不可用时，直接输入路径。路径留空表示整个来源，指定目录时包含其子目录。路径须属于所选来源；切换来源会清空路径。

整理会清除文件名中的装饰符号、emoji、替代字符 `�`、私用区字符和不可见噪声，保留正常文字、常用标点、单位、序号和扩展名。不能形成有效名称的条目保留原名；整段乱码文字不猜测还原。两份模板都留空时只清理名称，填写模板时同时按模板改名或归入目录。目录模板以指定路径为起点，路径留空时以来源根为起点。

先点「预览」核对范围和逐文件变化，再确认执行。修改路径、来源或模板后须重新预览。目标已存在的条目跳过，已执行批次可用「回滚上一批」恢复名称、位置和账本路径。PikPak 界面仅提供预览，改名仍需官方核验通道。

PikPak 官方核验通道使用「推送发现」中该媒体根对应的唯一 CloudDrive 路径前缀，支持自定义盘符与子目录。缺少映射或同一媒体根对应多条映射时拒绝执行。WebDAV 账号根由 CloudDrive 返回，认证直链须匹配 PikPak 官方域名和账号内路径；每批操作限于样本所属的媒体根。

## Resource Sync and Deletion

Please read carefully which operations delete files and which do not before acting.

### Resource Sync

After organizing a cloud-drive directory in CloudDrive2 or a file manager, reconcile manually once under "Manage → Resource Sync". Peach never quietly deletes any record in the background.

- 对账分两步：先「检查文件」，再「清理失效条目」。检查只读盘、不改任何东西，每个来源报出文件已不在盘上的记录、空文件夹和读不了的目录，另外报出不再被引用的缓存。
- 对账会核对已配置的本地和网盘来源。离线的来源整个跳过；某个目录读不了时，保留它的记录并在结果里报告。
- 馆藏很大时扫描要很久，所以它作为后台任务运行，并逐个来源报告进度。
- **确认清理后，文件已不在盘上的记录分两档。** 在库条目里带个人记录（喜欢、打分、稍后看、播放列表、观看历史、寻找更好版本）的标「已消失」并保留，新版本入库时按位置、番号或「创作者 + 文件名 + 时长」接回这些记录；**其余的永久删除，含回收站里的，不进回收站，无法恢复。** 检查报告分开报两档计数，确认框写明哪一档不可撤销（ADR-0087）。删除前逐条重新确认文件确实不在，文件又出现了的记录保留并在结果里列出。
- 数据管理页的「文件已丢失的记录」列表列出全部已消失条目和它们带的个人记录，可以手动接到某个文件，也可以彻底删除；彻底删除不可撤销。
- 清理只认最近一次检查的结果：之后又检查过一次，或者服务重启过，就要重新检查。
- 空文件夹自底向上删除，每个来源的根目录保留；CloudDrive 上列不出内容的空目录同样算空。
- 对账只清理没有馆藏再引用的生成文件：快照、海报、照片缩略图、转码缓存、播放分段、按文件生成的头像，以及共享的番号封面。演员等资料的头像和 Logo、采集证据、复核用的 CSV 不在自动清理范围内。
- 只清理当前数据库所在数据目录里的缓存，范围之外的一律跳过。
- 每次清理在任务中心留下一条「资源同步清理」记录。
- 条目详情里的「同步删除」只核对这一个目录：缺失的记录里带个人记录的标为已消失，其余移入回收站，两档都能在 8 秒内撤销。

### Trash

- 移入回收站的条目可以在回收站里「还原」。
- **在回收站里「彻底删除」选中项，或者「清空回收站」，都会永久删除媒体文件和对应的馆藏记录，无法恢复。**
- rclone FUSE 挂载上的媒体会直接删除，避免部分后端的远端改名退化为复制。若媒体已删但账本事务失败，回收站记录会保留；再次清空可移除这条残留记录，无法回滚已完成的远端文件删除。
- 飞牛 OS 文件管理器的原生 115 远程挂载可在 Linux 挂载表中表现为 `fuse.rclone`；此时适用上述行为。这里的 rclone 是该环境的底层文件系统类型，不表示用户另外部署了 rclone、CloudDrive2 或 OpenList，也不代表其他挂载方式已经验证。

### Junk Files

「垃圾文件」复核覆盖已配置物理媒体来源的各种文件类型，在线网址不在其中。检查复用同一套评分，先核对原文件名、目录、时长、体积与相邻正片，再决定是否隔离。

| 流程 | 检查与处理顺序 |
| --- | --- |
| 添加媒体库、全量扫描 | 登记与配套文件识别 → 按本次目录检查 → 允许自动读取的媒体探测 → 重判 |
| 推送发现、单文件登记 | 登记与配套文件识别 → 检查该资产 → 允许自动读取的媒体探测 → 重判 |
| 云下载 | 落地并绑定正片 → 检查下载范围 → 探测并重判 → 采集资料与预览 → 重判 → 按模板整理 → 派发后继任务 |
| 补全资料、补全预览 | 检查当前范围 → 探测并重判 → 读取本地资料与生成预览 → 刷新活动资产 → 联网采集适用资料 |
| 仅采集资料 | 检查已有证据 → 读取配套资料 → 重判 → 联网采集；不读取视频或抽帧 |
| 手动整理、维护脚本 | 执行整理和生成九宫格前检查；独立探测脚本在探测前后检查；整理预览与只读盘点保持只读 |

探测沿用来源的计费与代理保护，不为垃圾检查额外读取媒体。探测后先接回能确定归属的个人记录，再重判垃圾。没有有效时长的视频只进复核。仅补预览限定本地来源；完整处理在关闭视频预览时跳过抽帧。失败任务保留检查点与问题记录，重试复用已登记资产、测量值与整理日志；资料或整理失败时不派发该下载的后继任务。

- 判断为垃圾的文件只会被移入回收站，不会直接删除。
- 点「不是垃圾」会记下这个文件的判断（可以撤销），它会出现在「已排除」视图里。这个判断只针对这一个文件，不会把整个域名或来源列入白名单。
- 自动隔离要求达到自动线，并保护人工保留、喜欢、观看或播放列表等个人记录、已配对字幕、文件自身的作品番号和本次绑定的下载正片。写入前再次核对当前资产；已离开馆藏的条目不进入后续采集或整理。
- 无关键词的极短附件可凭同目录长正片、数量及跨目录测量值进入复核；这类结构证据与「域名加序号」命名不能单独触发自动隔离。还原后确认要保留的文件，可同时标记「不是垃圾」。

The maintenance script `scripts/trash_junk.py` generates a candidate list by default; permanent deletion uses `--purge --review-csv`,
and each row of the review CSV contains `id`, `path`, `size`, `decision`, `confidence`, `why`.
Only rows with `decision=delete` and confidence of at least 0.95 enter deletion, and execution also needs `--apply --backup`.
The score only decides review order and cannot by itself decide permanent deletion; if a file's path or size changes, the whole batch is rejected.
Installation attachments, web scripts and promotional clips whose duration was not probed also enter review; subtitles and NFO files do not enter the junk queue.
Plot words are not evidence of advertising; torrents, work galleries and creator profiles must be judged by file content.

### Cache Directory

`generated/avatar-thumbs` holds reduced avatars (long side 640), generated by each computer itself, not synchronized and needing no backup. Deleting the whole directory only makes the next opening of the index page slower, and when missing the page shows the original image. After importing a batch of new avatars, you can run `scripts/build_entity_thumbs.py` to generate them in advance.

人物资料页的「更换头像」支持本机图片、图片地址和已有候选。输入支持 JPEG、PNG、WebP、AVIF、GIF、BMP、TIFF、ICO 与 JPEG 2000；动图及多页图片使用第一帧，EXIF 方向在服务端转正，透明区域保留。图片完整解码后转换为静态 JPEG 或 PNG，框选预览与安装使用相同的转换规则。单张原图及转换结果均不超过 16 MiB；未支持的格式、无法识别的内容、损坏数据和像素尺寸过大分别提示原因。原文件保持不动；本机图片的转换预览留在候选缓存，点击「用这一块」或「整张使用」才安装为头像。

## 维护者参考

The following is for people who develop, package, release and maintain two machines from source.

### Internals of First-Run Setup

- 首次设置的「Peach 代理」支持跟随环境、直连和自定义 HTTP／SOCKS 代理。自定义地址与端口沿用配置页校验，凭据存于所选数据目录的本机 secrets；读题接口只返回连接方式和是否已保存地址。Docker 中填写回环代理地址时提示改用容器可访问的宿主机地址。配置页「网络与访问」可随时修改。
- `GET /api/setup/questions` 的 `peach_proxy` 包含 `mode`、`proxy_saved`、`needs_selection`；`docker` 表示部署是否为 Docker。`POST /api/setup` 的 `peach_proxy` 接收 `{mode, proxy}`，`mode` 为 `environment`、`direct` 或 `proxy`，缺省为 `environment`。校验错误放在 `errors.peach_proxy`。代理先于 `config.toml` 和首扫请求落盘，保证托盘切换后使用所选连接方式。
- 托盘启动时读一次设置文件，由 `tray.needs_setup()` 判断：**没有 `config.toml` 且没有数据库**才算需要首次设置。不用 `PeachConfig.configured` 判断：托盘的单实例锁一启动就会在 Peach 数据目录下建出 `state/`，一次失败的启动就可能让下一次误判成已配置；反过来，没有 `config.toml` 的老部署数据库还在，不能被拖进首次设置。
- 需要设置时，托盘不构建正常的服务规格（全新机器上 `build_service_specs()` 会因为缺 TLS 材料抛 `FileNotFoundError`），而是启动 `peach serve --setup --host 127.0.0.1 --port <设置里的端口，默认 8900> --no-mdns --no-ledger-sync`，再把浏览器打开到 `http://127.0.0.1:<端口>/`。这条引导服务没有 TLS，口令强制为空，安全边界就是回环绑定地址。
- 首页是首次设置表单：`GET /` 回一张薄壳（`routes_pages.setup_shell()`），表单由页面包 `/dist/peach-pages.js` 画出，题目与提交都走下面两条 JSON 接口。完成态的入口带 `/?onboarding=1`；选了导入浏览器历史则先去 `/taste?onboarding=1`。安装教程通过专用状态接口读取各项的实际状态。
- 两条接口共用守卫（`routes_pages._setup_guard`）：已配置 404，非回环来源 403，独立包地址栏主机名不是回环写法 403；提交另查 Origin（403）与设置文件已存在（409）。两条都在 `/api/` 下，错误一律回 JSON。
  - `GET /api/setup/questions` 给出画表单要的数据：`questions` 按 `onboarding.questions()` 的顺序列出每题的 `key`、`label`、`help`（说明行列表）、`default`、`required`、`advanced`（是否折进「高级设置」）、`input`（`text`、`number`、`choice`、`folders`）、`prefix`、`suffix`，`host` 另带按页面顺序排好的 `options`，`mdns_name` 另带 `visible_when: {"host": "2"}`；另有 `media_sources`、`media_source_default`、`media_root`（非 Windows 的对应路径格，Windows 为 `null`）、`cloud`（提示、帮助链接与缺失的挂载软件 `dependencies`）、`windows`、`standalone`，以及三个开关的初始值 `access_enabled`（host 默认是局域网就开）、`scan_now`、`history_guide`。
  - `POST /api/setup` 收同名字段：`media_dir` 是 `{path, location, root}` 行列表（`location` 缺省为 `local`），`access_enabled`、`scan_now`、`history_guide` 是布尔，选了「只有这台电脑」可不传 `mdns_name`。400 回 `{"error", "errors"}`：`errors` 按题目 key，访问密码在 `access_password`，`media_dir` 与提交的行一一对应、没错的行是空串；整表不成立（超过 100 行）时只有一句，长度与行数不等。`apply` 失败回 400，错误在 `data_root`。200 回 `url`、`scan_requested`、`history_guide`、`standalone`、`redirect`（独立包为入口地址，其余为 `null`，跳转时长由前端定）与运行信息 `facts`（同 `/api/configuration` 的 `facts`）。
- 建目录（`database`、`generated`、`sources`、`state`、`secrets`、`logs`、`tools`、`review`）、迁移数据库、生成 CA 与口令、写设置文件，都由 `onboarding.apply()` 完成；CLI 和设置页调用同一个函数，只是输出方式不同。问答的题目、默认值和写文件逻辑在 `src/peach/onboarding.py`。
- 网页不展示数据库路径输入，`media_root` 为 `null`。`media_dir` 行中的 `root` 可省略或留空，服务端按媒体目录补齐；已有行提交原 `root` 时保留它。媒体目录与已有配置唯一匹配时复用原前缀，新目录自动生成前缀，并用目录名作为媒体库名称。
- Windows 上 `peach init` 写出的 `[media.locations] local` 直接是那些目录，`[media.mounts]` 为空；macOS 上配置的目录是 `R:\media`（第二个起 `R:\media2`……），本机目录按同样顺序写进 `[media.mounts] local`。复制、writer 镜像、SMB 一律不问，保持关闭或留空。
- 切换由 `tray.SetupGate` 负责，Windows 托盘与 macOS 菜单栏共用。它挂在健康轮询里（Windows 10 秒、macOS 5 秒），每轮重新 `settings_file.load_config()`；不再需要设置时，停掉引导服务，按新 Peach 数据目录构建正常规格并启动，托盘进程本身不重启。
- 独立测试包按设置在高位端口提供 HTTP：本机模式绑定 `127.0.0.1` 且不发布 mDNS，局域网模式绑定 `0.0.0.0` 并发布 `<mdns_name>.local:<端口>`；托盘打开页面和健康检查始终走回环。源码部署由 `build_service_specs(tls_dir=..., mdns_hostname=...)` 构建 HTTP 跳转与 HTTPS 入口，TLS 材料没齐就等下一轮。mDNS 名由这里传进规格，不读 import 时的值。
- 首次扫描不在引导服务里跑，因为那个进程在切换时就会被停掉。表单勾了「现在扫描」只写一个一次性标记 `<Peach 数据目录>/state/first-scan.request`（内容是来源 ID），托盘切换完成后读取并删除它，用子进程跑 `peach scan <来源>`，输出在 `<Peach 数据目录>/logs/tray-scan.out.log`。配置页保存时勾选扫描也走这个标记。
- 配置页的数据走 `/api/configuration`，保存时先把旧文件复制成 `config.previous.toml`，再写入并留重载标记，由托盘接手。文件夹选择走 `/api/pick-folder`。
- wheel 把 `web`、`migrations`、`resources` 装进 `peach/_resources`。`scripts/smoke_wheel.py` 在仓库外用安装了 wheel 的解释器运行；CI 的消费任务只下载制品，不检出源码。测试只用临时 Peach 数据目录。
- Win32 窗口创建前必须启用 Per-Monitor V2 DPI；正常操作不弹模态 MessageBox，更新检查在后台线程执行，并用 pystray 原生的非模态通知反馈。

### Desktop Entry and Release

- The everyday Windows entry is the single `Peach.lnk` in the current user's Startup folder, pointing to `dist\Peach\Peach.exe` inside the project. The desktop shortcut and launch-at-login are toggled in the "Launch at Login" group of the configuration page and written by `src/peach/desktop_startup.py`; `scripts/manage_tray_startup.ps1` is only for troubleshooting release packages.
- `dist/Peach/Peach.exe` is the local packaged entry, not a standalone distribution you can copy away: only the tray itself is packaged, and the service process is still run by the project venv's `peach.exe` (`_peach_executable()` searches upward from the exe's location for `.venv\Scripts\peach.exe`); do not describe it as a portable build.
- The everyday macOS entry is the LaunchAgent `io.github.longmeidao.peach.tray`, managed by `python scripts/install_macos_agent.py` (`install`/`status`/`uninstall`). The `.app` shell's bundle ID is `io.github.longmeidao.peach.app`, and the 80/443 forwarding is in the pf anchor `io.github.longmeidao.peach`. All three identifiers come from `src/peach/appid.py`; the shell literals in `setup_macos_port80.sh` are kept consistent by `tests/test_tray.py`. The build entry of the macOS source menu bar is `build_macos_app.py`.
- An identifier change takes effect only after the commands below are run on the Mac; the legacy LaunchAgent and pf anchor are cleaned up by `install` itself:

```bash
launchctl bootout gui/$(id -u)/gg.lmd.peach.tray || true
python scripts/install_macos_agent.py install
sudo sh scripts/setup_macos_port80.sh install
python scripts/install_macos_agent.py status
launchctl print gui/$(id -u)/io.github.longmeidao.peach.tray | grep -E '^\s+pid'
launchctl print gui/$(id -u)/gg.lmd.peach.tray            # expect "Could not find service"
sudo pfctl -a io.github.longmeidao.peach -s nat
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' http://peach.local/healthz
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' https://peach.local/healthz
```

  Four acceptance checks: the menu bar has only one Peach icon and `status` reports "loaded" (the literal output is in Chinese); the pid from `launchctl print` is that menu-bar process; `pfctl -s nat` lists two rdr rules, 80 → 8900 and 443 → 8443; both `/healthz` return 200. Replace `peach.local` with the value of this machine's `[server].mdns_name`.

- The build entry is `scripts/build_windows.ps1`: it first generates the square logo and multi-size `.ico` with `scripts/generate_brand_assets.py`, then builds the single `dist/Peach/Peach.exe`. Run with no arguments it is the tray; `serve`/`migrate` run the CLI.
- The public test build is built by `.github/workflows/release.yml`: `build_windows.ps1 -Standalone` produces the complete Windows program directory with PyInstaller onedir, and after compression a consumer job that does not check out the source runs `scripts/smoke_desktop.py`. The smoke test completes first-run setup, restarts with `0.0.0.0`, reads `/healthz` from the local LAN address, confirms mDNS is wired up, and logs in with the access password. A mismatch between the `v<__version__>` tag and the version fails; only after artifact acceptance passes is the GitHub pre-release created with SHA256 attached. `workflow_dispatch` only produces and validates artifacts.
- The installer is compiled by `build_windows.ps1 -Installer` on the same program directory by invoking Inno Setup 6's `ISCC` on `scripts/installer/peach.iss`, producing `dist/Peach-<version>-windows-x64-setup.exe`; `ISCC` is searched in the order `PEACH_ISCC`, `PATH`, and two default install locations. It installs by default to the current user's `%LOCALAPPDATA%\Programs\Peach`, and you can choose a standalone, writable program directory that does not overlap the data directory. Before an in-place install, the bundled temporary runtime runs `--installer-prepare`, which tells collection tasks to save progress and pause; then it stops the tray, overwrites the program and migrates the existing Peach database in the actual data directory, and finally releases the installation guard. New collection requests during installation wait; after installation completes or is cancelled, a still-running Peach resumes, and an exited one recovers at next start. Uninstall goes through `--installer-uninstall`, which revokes the startup entry and the desktop icon and keeps data. The conventions and `AppId` are in `src/peach/desktop_installer.py`.
- The standalone build puts the pinned-version official `cloudflared-windows-amd64.exe` next to `Peach.exe` and verifies it with the SHA-256 in `scripts/cloudflared-windows.json`. Run `scripts/fetch_cloudflared.ps1` before building, or give `build_windows.ps1 -CloudflaredPath` a file with the same hash. A source run does not carry this binary.
- Every package carries a build identity: before calling PyInstaller, `build_windows.ps1` writes `{commit, version, built_at}` into `build/windows/build-info.json`, then places it at the package root with `--add-data`, shared by the local tray and the standalone test build. When the build machine has no git or the source is not a checkout, `commit` is `null` and the build proceeds as usual. `peach.buildinfo.frozen_build()` reads it only when `sys.frozen`; a missing or malformed file returns `None`, and the tray starts as usual, only treating its own identity as unobtained.
- PyInstaller resources sit directly under `sys._MEIPASS`, without the `src/` level of the source tree; after packaging, `migrate`, web and brand resources must all be resolved from here, and `parents[2]` must not be hard-coded in `config.py`.
- The local tray discovers by itself that it is "older than the checkout" and rebuilds. The criterion is the gap between the build commit and the local checkout, not the gap to GitHub: on this machine commits land locally first and are then pushed to the remote, so "behind the remote" can never hold.
  - `VersionManager.build_age()` counts how far behind with `rev-list --count <build commit>..HEAD`, and the version menu shows `master@<HEAD> · tray build <build commit>, N commits behind`. When it cannot be counted (identity unobtained, commit not in this checkout's history) it is treated as stale and the rebuild scope narrows to `src/peach/`.
  - "Sync development progress" takes the local rebuild path under `ahead`/`current`/`error`/`unconfigured`; the health poll additionally reads the local HEAD every 5 minutes to trigger automatically, tries automatically only once per HEAD, and does not trigger when first-run setup is not finished.
  - The rebuild flow is: full tests → staged build → check the packaged migration resources → backup → replace. If any step fails, only a notification is sent, the old tray and services keep running, the notification says which step it stuck at, and the log is at `<Peach data directory>/logs/windows-source-sync.log`.
  - The standalone test build and a source-run tray do not take this path: the test build uses the online update on the configuration page, and the source entry says the source is already up to date.
- For the release flow (versioning, changelog, tagging and when to release) see "Versions, Updates and Self-Restart".

#### Refreshing the Source Runtime: `restart_windows_tray.py`

The Windows tray runs independently of the terminal and agent that started it. Startup, restart and abnormal recovery take their parent identity from the current session's Windows desktop process; closing Codex, Claude or the terminal does not stop the tray. The entry first read-only probes the single-instance lock of the current Peach data directory; if a tray already exists, it opens the page or exits silently according to the startup arguments. On first launch handed over from a Job, the parent process does not hold the single-instance lock, and the new tray starts the child services after acquiring the lock. The Peach data directory, source path and startup arguments stay consistent; when the desktop process cannot be obtained or Windows refuses creation, it errors clearly and does not continue running inside the launcher's private Job.

The desktop process and tray may keep the system-managed shared Job. The child process gets its Job inheritance from the desktop process designated by `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`, and independence is accepted by surviving after the launcher's private Job is closed. The one-time handover marker is consumed by the tray entry and applies to source, directory-package and onefile bootstrap processes; child services do not inherit the marker. When creation is refused it retries explicit breakaway only once, and the error keeps the API and the system error code. Exiting the Windows session and the system Job itself ending belong to the system lifecycle.

Standalone launch forensics record the caller, the desktop and child PIDs and the Job membership state, the raw limit values of the calling process's direct Job and the recognized flags. Failure context enters the redacted diagnostic report; Job handle chains and ownership that cannot be obtained are clearly marked unobtained, the Job owner is not inferred, and administrator rights are not required to enumerate system handles.

After acquiring the single-instance lock, the Windows tray starts an independent watcher. The watcher waits for the tray to exit using a Win32 process handle and checks the process creation time to avoid PID reuse; an unexpected exit (including a zero exit code with no registered exit intent) is recovered with delays of 2, 5 and 10 seconds, at most 3 times within 5 minutes. Recovery keeps the current Peach data directory and source entry and starts in silent mode. Handover completes once the new tray's watcher is ready; import or startup failures count against the same retry budget. A manually started new instance cancels the old instance's recovery that has not yet run. After the limit is reached it stays stopped, and you must check the logs and start it manually.

Menu exit, update, uninstall, external stop messages and system session end all register an exit intent and stop the watcher. A normal restart is brought up by the restart script, and the watcher takes no part in dependency sync or package swap. Each line of `tray-lifecycle.log` is one JSON record containing UTC time, instance identifier, tray and watcher PIDs, launching parent process, exit intent, external-message sender PID, abnormal exit code and recovery result. When a process is force-killed, the recorded actor is `unknown`, and you cannot tell from the exit code who closed it.

The watcher and tray share the current user's privileges and register no scheduled task or Windows service. When the watcher itself is killed, the whole process tree is killed, or the system shuts down, automatic recovery is not possible. A watcher startup failure is written to `tray.log`; when the log is not writable, exit and service-cleanup behavior is kept. macOS keeps the LaunchAgent startup behavior.

Use this when the code is already in the checkout and only the running tray needs to reload, without swapping the binary.

- Do not click the tray with Computer Use. `python scripts/restart_windows_tray.py` finds the pystray hidden window by the exact EXE path, sends a normal stop message, waits for the tray to shut down its child services itself, then starts a new tray silently and confirms the new tray has taken over both services.
- If a unique window cannot be found or exit times out, it refuses to proceed, and never force-kills then starts another. After the old tray exits, it waits until the child services under it have fully exited before starting the new tray. When the port is held by a `serve` process the old tray does not own, it refuses before starting work and reports their PIDs, because swapping the tray cannot replace them.
- The tray puts the child services it launches into a kill-on-close Job: when the tray is force-killed by something like `Stop-Process -Force`, the whole `serve` subtree exits with it, leaving no orphan process holding 80/443 and running old code. If a round of the tray's health check finds a port unresponsive, it re-launches; a service seen healthy but not its own is only logged as a warning and not taken over. Startups and re-launches are logged at `<Peach data directory>/logs/tray.log`.
- `--swap-from <staged package>` swaps the binary after the old tray exits and before the new tray starts, the only moment in the whole package swap when the target file is not held by a process. To swap the production binary use `deploy_windows_tray.py`; do not call it on its own.
- When the packaged tray's window cannot be found, the command automatically switches to the source tray: `find_source_tray_windows()` recognizes the source tray by the same window class name plus "command line contains `peach.tray`", and `restart_source_tray()` relaunches with the same command line (including `--show`/Peach data directory) after the tray exits, without swapping the package or making a backup. `--source` explicitly skips the packaged entry.
- Restart prepares the runtime environment automatically (ADR-0091), with no need to fix dependencies or run migrations by hand:
  - **Task gate**: before starting, it read-only checks the rows still running in this machine's `task_run`. Follow-up tasks (`followup_key` non-empty) and scheduled tasks resume after restart and are let through; tasks that cannot resume, such as manual and CLI ones, make the restart refuse while running, and `--force` overrides. Rows whose process is dead are only listed and do not block.
  - **Dependencies**: a source deployment (with `uv.lock` and `.venv`, and uv found) runs `uv sync --locked --all-extras --inexact --no-install-project` after the old tray and child services have fully exited and before the new tray starts, and does nothing when already consistent. If another process is still using the project venv before the sync (for example an 8099 debug serve), it refuses the restart and reports the PID: on Windows a loaded `.pyd` cannot be replaced.
  - **Migrations**: before the first child-service launch, the new tray runs `peach migrate upgrade --yes` on the local writer's Peach database, and `migrate` itself first leaves `ledger.pre-migrate-<time>.db`. No migration is done for readers, when the Peach database does not exist, or when first-run setup is not finished.
  - **Readiness**: after the child services come up, the tray asks `/healthz?ready=1`, and not-ready items such as a Peach database schema inconsistent with migrations are written to the log and the startup notification.
  - The new tray writes these steps into `<Peach data directory>/state/runtime-prepare.json`, and the command reads it back to report together. stdout is one line of JSON, and when `ok` is false the exit code is 1: rejection by the gate, dependency sync failure, migration failure or services not ready all count.
- The tray menu's "Restart service": when dependencies are consistent it restarts only the child services, migrating while they are stopped; when dependencies are inconsistent with `uv.lock` it launches `restart_windows_tray.py --source --force` detached to restart the whole tray, with output appended to `<Peach data directory>/logs/tray-restart.out.log`. When the script refuses or does not start, the notification states the reason and it falls back to restarting only the child services.

#### Editing Text in a Source Environment

页面地址加 `?edit` 开启文字编辑，悬停文字显示编辑范围，点文字在原位修改，回车或点别处保存、Esc 取消。
按钮和链接的文字使用贴在文字位置的输入框。切换控件正常响应点击，Alt 点击修改文字；「暂停编辑」可继续操作页面。
静态文案写回 `web/index.html`、`frontend/src` 或馆藏上传与处理模块中选定的来源；同一文字有多个位置时需选择来源。清空静态文字即可删除这段文案。
馆藏处理的动态句子显示 `{problems}` 等占位符，只修改周围文字，保留每个占位符。数量随任务变化，不能借此修改馆藏数据。
保存直接写回源码，无需导出。React 文案自动构建，Python 文案由源码托盘重载服务，完成后自动刷新当前地址并保留 `?edit`。浮条显示保存、构建与重载状态；生效失败时保留源码修改，提供「重试生效」。服务重载前检查任务是否可续跑，无法续跑的任务仍在运行时拒绝重载。
保存前校验源文件摘要，备份位于 `build/copy-editor/backups/`。前端在临时目录构建，产物齐全才替换页面资源；构建日志位于 `build/copy-editor/build.log`。Python 自动重载要求运行源码托盘。
「导出修改」提供一份额外的修改记录，不承担源码保存。

The tool scripts are in `scripts/dev/` and are not distributed as web assets; frozen release packages provide no copy-editing endpoint.
On the demo site, `?edit` saves only a copy draft in the current browser, which can be exported, and ordinary visits do not apply the draft.

#### Replacing the Production Tray Binary: `deploy_windows_tray.py`

Use this when the EXE of the production entry itself must be replaced with a newly built one. Replacing the production entry is a release action that needs manual confirmation beforehand, and the script does not stand in for that confirmation.

- Run `python scripts/deploy_windows_tray.py` in the main checkout with the project venv's Python. Steps: refuse a dirty checkout → build by HEAD commit in `<Peach data directory>/state/source-sync-build/<commit>/` → have the staged package itself run `migrate status` once → stop the old tray, replace `dist/Peach/Peach.exe` in place (the old file is kept as `Peach.pre-source-sync-<time>.exe`), start the new tray → read `/healthz` on the production HTTPS port with strict validation against the project CA.
- Acceptance depends on who answers. A standalone distribution is answered by the frozen process; check that `build_commit` equals the packaged commit. A source deployment is answered by a project-venv process (`_peach_executable()` in `src/peach/tray.py` picks the child-service entry), with `build_commit` None; then check that the sha256 of the production entry file equals the staged package.
- Neither acceptance looks at the version number: the version number advances one notch per release, and one version number covers many builds.
- The result is printed as one JSON, and `step` says where it stopped. When the new tray cannot start or cannot take over both services, it automatically swaps back the backup and reopens the old tray. `--staged <path>` reuses an already built package and skips the build.
- Do not build `dist/Peach/` in place: the running tray holds that file, and PyInstaller clearing the directory hits WinError 5.

### Synchronization Between Two Machines

- "Sync development progress" goes through GitHub and "Sync database" goes through an SMB share; the two cannot be merged into one button: neither side being unreachable should hold up the other. The HTTP/HTTPS services only observe the role and do not replicate automatically.
- When `replication.enabled` is on: a sync watcher is built, SMB is probed and mounted, two Ledger menu items appear in the tray, and follow credentials are written to the shared replica. When off, none of this happens, `ledger_sync` in `/healthz` is `disabled`, and all write endpoints are open.
- Manual sync first uses `sync.resolve()` to judge read-only whether this run would really copy. `offline` is not a conclusion: after a macOS reboot the SMB share does not remount automatically, and the tray remounts once according to `SHARED_SMB_HOST`/`SHARED_SMB_SHARE`/`SHARED_SMB_USER` before judging, reporting only if it truly cannot mount.
- Remounting uses `osascript`'s `mount volume`, and the keychain must be checked first: without a matching entry NetFS raises no error but pops up an authentication dialog and waits forever, so the background operation both hangs until timeout and shows a password box in front of the user. Keychain entries are stored by hostname, and the same machine's IP and mDNS name are two different entries.
- If it is still `offline` after remounting, and for `conflict`/`in-sync`, the result is reported directly without stopping services; only when copying is certain are the services it created stopped, copying with the SQLite backup API plus atomic replacement, and finally services are restored.
- "Take over database writes on this machine" takes the shortcut only when the shared disk is unreachable: a shared source on macOS smbfs must be read as an immutable closed snapshot, a shared target cannot be opened by SQLite as a transactional connection, and takeover is refused when the health port does not belong to this tray.
- Generated images are synchronized one-way with Syncthing; it is a separate channel from the database and from Git, and none replaces another: Windows send-only, Mac receive-only, five folders `snapshots`/`posters`/`avatars`/`logos`/`covers`. The Mac-side root is under `peach-data/artifacts/` (do not make a symlink pointing to it the sync directory), and Trash Can versions are kept for 30 days.
- `.stignore` is not synchronized across devices, so put one in each directory on both ends. The direction is fixed, and images generated on the Mac never return to Windows.
- The access tokens of the two machines must match: when the reader fetches the writer's review results it sends its own token.
- The local CAs of the two machines are independent, and `secrets` is not shared by design.
- The broadcast names of the two machines are each machine's `server.mdns_name` and must differ; read `mdns` from `/healthz` to check the actual name. `PEACH_MDNS_NAME` is only a temporary override.

### Versions, Updates and Self-Restart

- 独立包的版本检查读取 GitHub 公开发行记录与 R2 公开清单，选择可下载的最高版本；同版本优先 GitHub。R2 制品必须具有 SHA-256，发行说明统一指向 GitHub。任一来源不可用时仍检查另一来源，两个来源都未取得时显示检查失败。
- 更新包、完整包和轻量安装器的工具包下载失败或校验不符时，尝试另一公开源的同版本、同文件名；每次都按原发布记录的大小与 SHA-256 校验。备源不能替换为其他版本或放宽校验，两个来源都失败时保留错误状态。

- 版本号只在 `src/peach/__init__.py::__version__` 里定义，采用 pre-1.0 SemVer。Git 提交是构建标识，`vX.Y.Z` 标签是发布点，推到 GitHub 就触发 Release 工作流（见「桌面入口与发布」）。
- 版本号在发布时才动，一次发布加一格，所以每个 `X.Y.Z` 都有一份能下载的制品。
- **依赖升级**：定版前完成[每次发版检查](TESTING.md#每次发版检查)的依赖升级批次，包括适用的兼容修改、派生产物、完整验证与本地集成；暂不能升级的保留具体原因和失败证据。定版后发现需要改依赖时，先保存发行说明草稿，撤回本轮尚未提交的版本修改，完成升级后重新定版。
- **定版**：在干净的 master 主检出上运行 `python scripts/release_tag.py --bump auto --apply`。它按上一个版本标签到 HEAD 的区间定档（`bump_part_for()`：主题以 `feat` 开头、带破坏性标记 `!`，或 `migrations/` 有新文件时推 minor，其余推 patch；1.0 要手工 `--bump major` 并另立 ADR，见 ADR-0012），写入 `__version__`，并把 `CHANGELOG.md` 的未发布一节定成这个版本号。区间只改了文档、技能和测试时直接拒绝，因为那样打出的包和上一个标签完全相同。`--bump` 只写文件不提交，并打印定版的那一节供人检查；不带 `--apply` 只打印计划。
- **发布**：确认之后运行 `python scripts/release_tag.py --ship --apply`，一次完成剩下四步：提交 `src/peach/__init__.py` 与 `CHANGELOG.md`（消息 `chore(release): 版本 <新版本>`）、推送 master、每 30 秒查一次这个提交的 Test 工作流、变绿后创建并推送 annotated tag。默认最多等 30 分钟，用 `--timeout` 修改。不带 `--apply` 只打印步骤。
- `--ship` 在动手前检查：不在 master、变更日志缺这一节、标签已被占用、工作区除了那两份定版文件还有别的改动，任何一条成立就拒绝（标签指向发布提交，夹带什么就等于发布什么）。Test 结束不是绿色就立刻停，这时标签还没打。
- 标签流水线第一步就跑仓库根与 `frontend` 两份 npm 审计；新公布的高危漏洞会让已打出的标签什么也发不了。所以 `--bump --apply` 写文件前、`--ship` 在 Test 转绿之后打标签之前，都先用 `scripts/npm_audit.py` 的同一判据复查一次，有高危漏洞就停，版本文件与标签都不动。
- 等 Test 期间能确定等不到结果的也立刻停，不耗到超时：GitLab 必需任务（`verify-linux`、`verify-windows`、`verify-macos`、`wheel-smoke`）已失败；任务排着队没人接，且带这些 tags 的 runner 都不在线或已暂停（读 runner 列表要维护者权限；读不到，或列表里查不到带这些 tags 的 runner 时，按排队满 5 分钟仍未开始判停）；推送 5 分钟后仍没有 Test 记录。报错写明任务名、tags 和已等时长。GitHub 只对自建 runner 任务做同样判断，托管 runner 排队照常等。处理好之后再跑一次 `--ship --apply` 接着走。
- 中途停下（断网、CI 还在跑、超时）就再运行一次同一条命令：每一步都先看当前状态，已提交的不重复提交，已推送的不重复推送，Test 没绿绝不打标签。
- 单独补打标签用 `python scripts/release_tag.py`：默认只检查本地与 GitHub master 一致、这个提交最新的 Test 全绿、`CHANGELOG.md` 有这个版本的一节、标签不存在；加 `--apply` 才创建 annotated tag 并只推送这个标签。适用于发布提交已推送、只差标签的情况。变更日志那一节是硬性要求，缺了先用 `--bump` 起草。版本标签不覆盖，下一版先改 `__version__`。推送失败留下本地标签时，先确认归属再人工处理，不强推。Release 工作流会再检查标签提交在 master 历史里、同一提交的 Test 已通过，然后核对成功演练的产物并创建预发布。打标签代表公开预发布，不等于替换本机生产入口。
- 已确认的发布提交推送后，若 master 继续推进，用 `python scripts/release_tag.py --release-sha <完整提交 SHA>` 核对固定提交的发布计划，确认输出后加 `--apply` 补打标签。这个模式从选定提交读取版本与变更日志，并在创建标签前再次核对主线归属、同一提交最新的绿色 Test 和标签占用；只推送标签，保留当前 master。它不能与 `--bump`、`--ship` 或 `--verify-sha` 合用。
- **什么时候该发**：`scripts/agent_worktree.py integrate` 不改版本号，只报当前值，并输出 `release` 字段（`scripts/changelog.py` 的 `due()`）。`due` 为真时提出发布，理由在 `why`。节奏是每周一次、条目攒够提前、破坏性变化和安全修复不等周期（`DUE_DAYS = 7`、`DUE_ENTRIES = 10`）。只数使用者看得见的变更条目，不数提交。`DUE_ENTRIES` 是没有样本时的保守起点，`due()` 每次都报出实际条目数与分组，积累几次真实发布后再校准。
- **会话收尾提醒**：`scripts/release_due.py --hook-event` 挂在 Claude 的 `.claude/settings.json` 与 Codex 的 `.codex/hooks.json` 的 `Stop` 钩子上（两边约定一致：stdin 收 JSON、stdout 回 `systemMessage`、退出码 0）。只有在主检出、在 master、工作区干净、这个 master sha 还没问过，并且 `due` 为真时才输出一句，其余情况什么都不打印。已问记录在 `<Peach 数据目录>/state/release-due.json`，master 前进后才会再问。手工查看用不带参数的 `python scripts/release_due.py`，它只读，不改记录。
- 钩子用 `uv run --no-project` 找解释器，同一条命令在两个平台都能用。`--no-project` 不能省：`release_due.py` 只用标准库；如果让 uv 识别项目，它会在一个有 `pyproject.toml` 但还没建 venv 的检出里建一个空 venv，`scripts/test.ps1` 随后会优先选中它，测试连 `filelock` 都导入不了。`tests/test_release_due.py` 会把配置里的命令原样执行一遍，并检查工作目录没有多出 `.venv`。需要 `uv` 在 PATH 上，推荐 `winget install --id astral-sh.uv`，不要把远端脚本直接管道进 shell。
- 「检查更新」只 fetch 和比较；「同步开发进度」只做 `merge --ff-only`，不 stash、不 rebase、不 `--force`：并行工作树和主检出共用同一个对象库与 reflog，任何改写历史的操作都会波及其他分支。工作区有改动或两边分叉时，原样报告交给人处理。本地不落后远端或连不上远端时，按构建身份判断打包托盘要不要重建（见「桌面入口与发布」）；这条路径不拦有改动的工作区，因为构建用的就是检出里的代码。
- 快进涉及 `tray.py`／`menubar.py`／`versioning.py`／`certs.py`／`netwatch.py`／`config.py`／`pyproject.toml` 时，只重启子服务不够，托盘要用 `launchctl kickstart -k` 重启自己：先 `stop_owned()` 再 kickstart，前提是 launchd 报的 pid 等于自己的 pid。

### Network and Service Details

- HTTP probes of local services must set `trust_env=False`: proxy clients set a system-level HTTP proxy that httpx reads by default through `urllib.getproxies()`, so a probe to `127.0.0.1` is sent into the proxy, which returns 503, and a live service is judged "not running". The implementation is in `peach.tray.ServiceManager.healthy`, guarded by `test_health_check_never_goes_through_a_proxy`, and newly written health checks must do the same.
- `peach serve` publishes a fixed mDNS hostname per platform, hard-codes no home IP in source, and keeps `Zeroconf()` listening on all eligible network cards. mDNS acceptance must include unit tests, runtime health, DNS-SD, hostname resolution and a real LAN client.
- FastAPI is the only web server; do not restore a parallel `http.server` or a dynamic legacy loader.
- Before switching services, check ports 80, 443 and 8900 and the actual process ownership.
- Long tasks may stop only the Python/FFmpeg process trees they own and whose command lines match; ending all FFmpeg on the machine is forbidden.
- FFmpeg resolution does not fall back to Stash's private directory. Transcoding is handled by `TranscodeService`, going through the same Range endpoint as ordinary playback; probing and every transcode are protected by a 2-slot concurrency gate, a 1-hour total limit and stream session cancellation.
- The visibility of the `B:`/`A:` drive letters of 115/PikPak differs across Windows tokens, and the final word is Peach's measured `/stream` result on a known work.

### Migrations, Backups and Ops Scripts

- 真实迁移前依次执行：SQLite 备份、asset/tag 计数、`PRAGMA integrity_check`、迁移版本检查、服务冒烟测试。已应用与待应用的迁移只认 `peach migrate status` 的输出。
- 已应用的迁移文件不能修改，任何后续变更都要新增一个版本。已应用的迁移被改写会造成校验和漂移，只能用迁移前备份重放、逐条比对差异为 0 后再校正 `schema_migration`。
- 数据库备份自动清退：`ledger.pre-*.db` 由 `peach.ledger_backups` 管理，「最近 5 份」「24 小时内」「比 `ledger.db` 新」三类全部保留，其余连同 `-wal`／`-shm` 删除。Windows 托盘每次启动自动执行；`scripts/prune_ledger_backups.py` 手动运行时默认只列计划，`--apply` 才删除；数据库 `integrity_check` 不是 ok 时拒绝清退，退出码 2。每份备份一百多 MB，5 天不清就是 7 GB。
- 整理备份自动清退：下载后整理与手动整理写入前各留一份整库备份，放在 `<Peach 数据目录>/generated/organize-backups/`，文件名是 `ledger.pre-download-<任务>-<时间>.db` 与 `ledger.pre-organize-<时间>-<任务>.db`。每次写备份后按同一套规则清退这个目录，只留最近 5 份（`ORGANIZE_KEEP_RECENT`），不按年龄保留（`ORGANIZE_MIN_AGE` 为零）：一波下载一小时能整理四十个文件，24 小时窗口会攒下几十 GB。正在被整理引用的那份由 `ledger_backups.holding` 登记，Web 服务进程里的清退都跳过；目录里的其他文件名不动。手动查看或清理用 `scripts/prune_ledger_backups.py --organize`，同样默认只列计划，`--apply` 才删除；登记不跨进程，整理进行中不要给 `--keep 0`。
- `<Peach 数据目录>/logs` 里的 `*.log` 统一保留半年，不限大小（`peach.log_retention.sweep`，托盘在启动任何子进程之前运行）：半年没写过的文件整份删除；还在写的文件按自然月分段，上次写入在更早月份的改名成 `<名字>.until-<最后写入日期>.log`，再过半年删除。子进程直接追加 stdout，不经过 `logging`，所以按文件处理，不按行处理。
- 更新与打包产物自动清退：托盘每次启动只保留最近 2 份 `dist/Peach/Peach.pre-source-sync-*.exe` 备份，并删掉 `<Peach 数据目录>/state/source-sync-build/` 里不属于待应用记录的暂存构建（`WindowsUpdateInstaller.sweep_artifacts`）；`build_windows.ps1` 成功后删掉 PyInstaller 工作目录 `build/windows/app`；单文件托盘每次启动删掉 `%TEMP%` 里超过一天、不属于自己的 `_MEI*` 解压残留（`sweep_onefile_extractions`，托盘被结束进程时 PyInstaller 不会自己清理，每份 40–80 MB）。自动清理只认这几种命名：`Peach.exe` 本体、手工放进 `dist/` 的目录、`build/release-*`、`attic/` 都不碰，手工构建的残留要自己删。
- 可重建缓存的删除范围由当前数据库路径决定：生产库只能清理同一个 `peach-data` 下的缓存，临时库只能清理它的临时目录，范围之外一律跳过。测试里的清空回收站必须用临时 Peach 数据目录，漏配会删到真实封面。
- 资源同步使用后台作业并逐来源报告进度，避免同步全库扫描阻塞请求；同一目录只枚举一次，目录元数据并发固定为 8，不重跑全库，也不盲信旧结果。
- 运维脚本被导入时不能产生文件、网络或数据库副作用。`scrape_codes.py` 默认写可续跑的复核 CSV；`clean_names.py` 先预览，`--apply` 必须同时给出 `--backup <路径>`，备份写完后当场校验完整性（`peach.scripting.open_for_write`）。
- 追更的合集判据只作用于新抓到的候选。收紧阈值后用 `scripts/prune_follow_compilations.py` 扫描存量：默认只列清单并写一份复核 CSV，`--apply` 先备份成 `ledger.pre-follow-compilations-*.db` 再删除，已保存成 asset 的条目一律不动。没探过详情页的旧行拿不到署名，判据数不到它们。
- 文件名只按数据库里已确认的番号规范化，不从文件名重新猜番号。只改大小写时经同目录临时名中转；去广告后重名的，用 `(2)` 起的后缀两份都保留。
- `generated/cover-fetch-log.csv` 是来源、尺寸和结果的证据，不随图片一起清理。图片丢失时用 `scripts/fetch_jav_covers.py --restore-successes` 按成功记录里的原 URL 恢复并原子替换；失败的仍记为失败，不拿缩略图顶替封面。
- 封面候选必须限定在当前作品的主封面节点：作品页混有数百张关联作品、剧照和演员头像，禁止对整页图片 URL 逐张量尺寸。
- FC2CMADB 的文章存档只作为官方商品页的镜像证据：标题与保守翻译后的标签写进候选 CSV，和最新的 JAV 元数据批次一起进入 `/review`，不自动写入数据库。封面把列表的 `w276` 换成确认存在的 `w1200`，再走 `fetch_jav_covers.py --fc2-only` 的解码、宽度、磁盘和原子写入检查，失败的逐条记日志。
- 批准官方标签时必须用 `(asset_id, tag)` 冲突更新来源与置信度：`asset_tag` 的唯一约束会让 `INSERT OR IGNORE` 保留旧来源，结果值已存在却不显示「官方」。
- 「不是垃圾」写入的是按 asset 的可撤销 `junk_file` 复核决定。垃圾判断里推广名、目录与创作者位置的证据跨类型共用，视频另外参考时长、体积和同番号长版。

### Frontend and Verification Standards

- Metadata from the database must not be interpolated into inline JavaScript event attributes: an apostrophe in a real studio name causes a Firefox syntax error directly.
- The frontend API wrapper must check the HTTP status before returning JSON: on a read-only conflict the write endpoint returns `409` and error JSON, and treating that as ordinary success clears the selection and reloads, so the user just sees the entry come back unchanged. Batch handling and detail feedback must keep the current selection and show the failure reason.
- Report verification results separately: static/unit/API, desktop browser, 390×844 phone, and whether the production service has been restarted.
