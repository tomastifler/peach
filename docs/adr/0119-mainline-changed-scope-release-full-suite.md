# ADR-0119：主线推送按改动选测，版本标签跑三平台全量

- 状态：已采纳；第四条由 [ADR-0121](0121-release-rehearsal-and-atomic-publication.md) 修订：三平台全量移到版本提交的发布演练里跑，标签流水线只构建和发布
- 日期：2026-10-24
- 关系：补充 [ADR-0012](0012-version-and-update-boundary.md)「版本号跟发布走」修订里「Test 没绿绝不打标签」一句：主线 Test 绿表示改动域与平台敏感用例通过，三平台全量改由标签流水线把关，其余照旧

## 背景

GitGud 主线每次推送都在 Linux、Windows、macOS 上各跑一遍全量回归。Linux 平台 runner 约 13–20 分钟；Windows 与 macOS 跑在自建的常驻 runner 上，Windows 那台同时是开发机，和本机会话的全量测试抢 CPU 与磁盘，0.48.0 的主线流水线在 Windows 上跑满 1 小时被作业时限杀掉。一天几十次推送，每次都等三份全量，发版要排在这些全量后面。

本机早已按改动选测：`scripts/test_runner.py` 的 `auto` 把改动文件映射到功能域，映射不到任何域、或改到共享测试设施与依赖清单时退回全量。全量证明在本机由集成前的 `auto` 与记录复用承担，CI 再全量重跑一遍，大部分时间花在与本次改动无关的测试上。

## 决策

**一、分支与合并请求流水线：改动域加平台敏感集合。** `verify-linux`、`verify-windows`、`verify-macos` 三个平台用同一口径：先用正式测试入口跑 `auto --base <基线>`，范围是相对上一次已验证主线的改动域，选域与退回全量的规则就是本机 `auto` 的规则；再用 `-Focus` 跑本平台的平台敏感用例。预判会退回全量时只跑一次全量，不再追加平台集合。

**二、基线取最近一条成功的主线流水线里、作为本提交祖先的那个提交。** `scripts/ci_scope.py` 匿名读本项目主线的成功流水线（项目公开，作业不带凭据），从新到旧取第一个不是本提交、且 `git merge-base --is-ancestor` 成立的提交。差异用三点号 `base...HEAD`，一次推送多个提交时整段都算进来。上一轮流水线红了，那个提交不会被当成基线，下一次推送会把它的改动一起补测。取不到基线的情形一律退回全量：首次推送、接口不可达、强推后旧提交不再是祖先、克隆里没有那个提交。

**三、平台敏感集合按测试的实际依赖判定。** 只收代码路径按平台分叉、或调用平台专属程序与系统接口的测试；只是在某个平台下拼路径的不收。集合写在 `scripts/ci_scope.py` 的 `PLATFORM_TESTS`：

| 平台 | 用例 | 理由 |
| --- | --- | --- |
| 三个平台 | `test_platform`、`test_fsutil`、`test_folder_picker`、`test_certs`、`test_auth`、`test_onboarding` | 账本路径换算、文件系统与文件夹选择、证书与 OpenSSL、数据目录权限、首次设置拉起服务 |
| 三个平台 | `test_media`、`test_media_probe`、`test_frame_capture` | 调用本机 ffmpeg、ffprobe 的进程与参数 |
| 三个平台 | 浏览器 `setup`、`playback-resume`、`player-v10`、`http-configuration` | 本平台浏览器里的首次设置、播放链、续播与普通 HTTP 来源 |
| Windows | `test_tray` 与 `test_tray_detached`、`test_tray_diagnostics`、`test_tray_lifecycle`、`test_restart_windows_tray`、`test_process_job` | 托盘、监视器、Job 对象与重启 |
| Windows | `test_windows_update`、`test_standalone_update`、`test_desktop_installer`、`test_desktop_settings`、`test_data_storage` | 安装、更新、快捷方式 COM 与数据目录迁移 |
| Windows | `test_interaction`、`test_jobs`、`test_scan`、`test_media_tool_import`，浏览器 `external-playback` | Shell API、盘符路径、PowerShell 导入工具、外部播放器 |
| macOS | `test_tray`、`test_mount`、`test_netwatch`、`test_mdns`、`test_macos_standalone`、`test_macos_media`，浏览器 `external-playback` | 菜单栏、SMB 挂载与钥匙串、网络变化、Bonjour、独立应用与媒体工具、外部播放器 |
| Linux | `test_mdns` | 非 macOS 的 mDNS 发布实现 |

Docker 镜像在标签流水线的 `publish-docker` 里构建并冒烟，wheel 由 `wheel-smoke` 单独安装验证，都不进 Linux 的平台集合。新增按平台分叉的测试时同步登记到对应集合；`tests/test_scripts.py` 核对每个平台的选择器都能被定向入口解析。

**四、版本标签流水线：三平台全量是发布门槛。** `release-verify-linux`、`release-verify-windows`、`release-verify-macos` 在标签上各跑一次全量。`build-windows`、`build-macos`、`publish-docker` 与 `publish-release` 依赖对应的全量作业，任何一个平台红了都不出制品。`release_tag.py --ship` 仍等主线流水线的 `verify-linux`、`verify-windows`、`verify-macos` 与 `wheel-smoke` 全部成功才打标签，作业名不变。

**五、时限按全量定。** 主线作业随时可能退回全量，所以与标签上的全量作业用同一时限：Linux 45 分钟，Windows 1 小时 30 分钟，macOS 45 分钟。

## 已拒绝方案

- **用推送前的提交（`CI_COMMIT_BEFORE_SHA`）当基线**：上一轮红了、这一轮只改了无关文件时，红的那部分不会被重测；首次推送和强推还会给出全零或已不存在的提交。
- **Linux 跑得快就继续全量**：三个平台用不同口径，主线绿的含义就要按平台分别解释；Linux 同样有自己的平台面。
- **平台集合按功能域划**：`sync`、`packaging`、`core` 等域混着大量与平台无关的测试，按域取等于在 Windows 上跑掉大半全量。
- **改 `test_runner.py` 让一次调用同时收域和选择器**：测试设施另有负责人；现有入口分两次调用已经能表达。

## 后果

- 主线 Test 绿不再证明三平台全量通过，发布前的全量证明落在标签流水线上。标签流水线因此多出三份全量的时间，Windows 那份与构建、冒烟、Docker 发布共用一台 runner，依次排队。
- 平台集合用 `-Focus` 定向运行，单进程串行、不签发记录；Windows 集合 529 个用例，本机满载时实测约 5 分钟。若要与改动域合成一次并行运行，需要测试入口支持在同一次调用里同时给出域与选择器。
- `src/peach/` 下还有不少模块映射不到任何域，改到它们的推送仍会退回全量；补齐域登记后主线才会真正按改动选测。
- 基线接口匿名读取依赖项目保持公开；项目转为私有时接口取不到，三平台都退回全量，不会误判为无需测试。
