# External Players and VR

## 本地播放器

Windows 或 macOS 上，在运行 Peach 的电脑打开作品详情，在详情上方选择「系统默认播放器」或检测到的播放器，再点同一行的「打开」。Windows 检测 PATH 和常见安装目录中的 PotPlayer、VLC、mpv；macOS 检测系统与用户应用目录中的 IINA、VLC、mpv。选择保存在当前浏览器；播放器接收原始媒体文件，网页播放在请求成功后暂停。

播放器菜单只列出当前部署支持且检测到已安装的程序，以及系统默认播放器。同一选择器还提供网络播放地址和 M3U 播放列表，供 Docker 和远程访问使用。在 Windows 上下载 M3U 后，可用系统默认播放器打开，或通过系统的「打开方式」选择播放器。播放器需要支持对应媒体格式、网络地址及 Peach 证书。

本地打开接口只对本机直接连接开放，拒绝转发请求；Docker 和无桌面部署不启动宿主机或容器中的应用。接口接受账本资产 ID 和固定播放器 ID，经媒体根目录授权后打开文件，不接受客户端指定程序或文件路径。STRM 使用网络播放地址或 M3U。

## 网页画面旋转

播放器「设置 → 画面旋转」提供 0°、90°、180°、270°；0° 恢复原始方向。画面保持比例并适配播放器，控制条保持正向。切换清晰度、影院模式和全屏时继续适配。旋转只影响网页画面，不修改媒体文件或外部播放器设置。

旋转、播放速度、字幕选择与字幕外观按视频保存到服务端同一份记忆文件，详情、小窗和沉浸播放共用；刷新、重新打开或更换浏览器后恢复。设置 0°、正常速度或关闭字幕同样会保存，各部视频互不影响。WebVTT 内容与记忆文件放在数据目录的 `state/player-subtitles/<视频标识>/`，清单为 `subtitles.json`。Windows、macOS 和 Docker 共用此存储；Docker 需要持久挂载数据目录。已有字幕内容与选择直接沿用，浏览器已保存的字幕外观作为尚无外观记录的视频的初始值。播放记忆接口为 `GET/PUT /api/player/memory?video=…`，字幕接口共用同一份清单；更新仅合并提交的字段，不修改 ledger。

画中画入口在支持该 API 的浏览器中固定占位，媒体加载期间禁用。浏览器明确拒绝画中画时，入口保留不可用原因。浏览器声明 API 可用不能保证系统窗口可创建，限制及异常见 [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture)。

## 网络播放

本地或已挂载视频的作品详情共用一行播放器选择和「打开」按钮。选择网络播放方式后点击「打开」，
即可生成限时链接并下载 M3U。选择「网络播放地址 / VR」时，只显示可复制的地址。

| Option | How to use |
| --- | --- |
| M3U 播放列表 | 用支持网络地址的外部播放器打开下载的 `.m3u` |
| 网络播放地址 / VR | 生成地址并显示，供 VR 等播放器使用 |

The player choice is saved only in the current browser. Another device must be able to reach the current Peach address; a URL generated on the computer with `localhost`
cannot be used from a phone. When HTTPS uses the project certificate, external devices also need to trust that certificate.

A playback link is valid for 6 hours and expires when Peach restarts. The link only allows reading the selected asset and contains no local drive-letter path or
long-lived login credential. Requests support HTTP Range and transfer the original file; decoding capability and VR projection are decided by the external player.
Generating a link and opening a player do not count as watch records, and cannot prove the player has started playing.

## Protocol and Verification

The issuing endpoint `POST /api/external-playback?id=…` uses the existing login and same-origin checks. The stream and M3U endpoints verify
a single-asset time-limited ticket signed with an in-process key, and every read still goes through the existing media-root check.
The origin of the playback URL is signed too: the page Origin that passed the same-origin check is preferred; clients without an Origin use the configured
tunnel entry or the current service address. The M3U uses this signed address, so a local Host forwarded by a proxy does not rewrite the public entry in the playlist.

播放器实现不进入 Peach，无新增依赖。自动化验证覆盖票据、Range、
M3U 内容和页面交互，不替代真实设备的解码验收。

Windows 原生验证使用现有 ffplay、临时 HTTPS 服务与专用测试证书，播放 M3U 中的签名网络地址。
两秒 H.264 合成测试画面在关闭音频、隐藏输出时正常播放并退出，ffprobe 确认解码 20 帧；
TLS 校验保持开启。该验证不覆盖本机播放器唤起或 VR 投影。

本地打开复用 Python 标准库的 [Windows 文件关联](https://docs.python.org/3/library/os.html#os.startfile) 和 macOS 的 [`open`](https://support.apple.com/guide/terminal/apdb66b5242-0d18-49fc-9c47-a2498b7c91d5/mac)。进程参数以数组传递，不经 shell。跨平台自动化覆盖调用参数和权限边界；系统关联、应用唤起及真实媒体解码需要在对应桌面系统验证。
