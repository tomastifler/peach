# CloudDrive configuration and tuning

Peach supports file read and write on mounted 115, PikPak, Guangya (光鸭), and OneDrive drives, plus "Other mounted drive". First use CloudDrive2, an OpenList mount tool, or the system filesystem to attach the drive as a local directory, then let Peach scan it. The mount tool is responsible for platform accounts, write permissions, and the actual network connection; when a file operation fails, Peach shows the actual error.

Uploading, creating folders, renaming, and moving on Guangya cloud drive require CloudDrive2 v1.1.0 or later, application write permission, and an active membership; the delete and copy interfaces are not available yet, see the [CloudDrive release notes](https://www.clouddrive2.com/download.html). OneDrive and other mounted sources also need the corresponding write permission. Peach's file organizing supports preview, execution, and rollback; the range of cloud download support is described below.

To add resources to a drive, use "Cloud download" to hand a magnet to 115 or PikPak offline download, see the [Cloud download](#cloud-download-hand-magnets-to-the-drive-for-offline-download) section below.

Whether playback from a drive stutters depends almost entirely on CloudDrive2's cache and read settings. The "CloudDrive cache suggestions" on the configuration page list only starting values and where to enter them; this document adds the rationale, unit conversions, and troubleshooting.

## Setup steps

1. In CloudDrive2, sign in to the drive, create a mount point, and turn on "Mount at startup". For details see the [CloudDrive help](https://www.clouddrive2.com/help.html).
2. On Peach's first-run setup page, or in the media group of the configuration page, add a folder and pick the actual drive source. For drives not listed separately, choose "Other mounted drive". One source can have several folders, but folders cannot contain each other.
3. Enter the path:
   - Windows: enter the mounted drive-letter path directly, for example `B:\`.
   - macOS, Linux: enter only the directory Peach actually reads, for example `/Volumes/CloudDrive/115`. Peach saves the path mapping the database needs; to move an existing directory, just change the media directory on this row.
   - Docker: enter only the in-container directory, for example `/media/115`, not a host path the container cannot access. You also need to mount the real directory into the container in Compose, see [Docker deployment](DOCKER.md#configuration-file-and-paths).
4. For a new drive directory, choose the "media read policy": normal read, or proxy traffic protection. For PikPak the user also chooses; which proxy is actually used must be configured in the mount tool.
5. Click "Save configuration" and Peach reloads the settings. The right side of each folder row shows whether it is online or offline; refresh the page to reload.
6. Tick scan and save, and Peach scans all online folders in turn, skipping offline ones. After a drive is mounted again, tick scan and save once more.

On Windows, Peach and CloudDrive2 must run under the same normal user. A program started with "Run as administrator" may not see drives mounted by the normal user.

You only need to map the movie paths in a database to the local media directories in the settings file when reusing another Peach's database. Existing deployments keep their own mapping; if you only move the media directory, change that row's directory on the configuration page. For the meaning of fields when editing the settings by hand, see [Operations and configuration](OPERATIONS.md#mapping-windows-paths-on-macos-mediamounts).

When you choose a drive source, the first-run setup page and the configuration page check whether this computer has CloudDrive2 and the mount driver it needs (WinFsp on Windows, macFUSE on macOS), and give a download link if not. A portable CloudDrive2 on the PATH is also recognized. "Installed" and "mounted" are shown separately.

Other rules:

- When a drive is offline, its configuration is kept. If two folders' drive-letter roots or mount points overlap, an error is shown on the corresponding row.
- Saving the configuration does not change the source or path of files already in the library.
- The `peach init` prompts in the terminal can only add local folders. Add drive sources on the first-run setup page or the configuration page, or write them straight into the settings file.

macOS settings file example:

```toml
[media.locations]
"115" = ['B:\']
pikpak = ['A:\']

[media.mounts]
"115" = ['/Volumes/CloudDrive/115']
pikpak = ['/Volumes/CloudDrive/PikPak']
```

## Media read policy and video previews

"Proxy traffic protection" marks media reads from this mount directory as costly; batch processing and playback keep the confirmation boundary of protected sources. It does not change CloudDrive2 or OpenList proxies. Automatic probing of normal media skips protected directories. Existing configurations keep their current behavior and can be changed per directory in the Peach configuration.

The contact sheet and timeline are controlled separately by "Generate video previews". When it is off you can still register files, probe normal media that is allowed to be read, and collect local NFO and online metadata; the timeline is off by default and is generated only after you pick an interval. STRM and ISO do not take part in background probing or frame extraction; STRM reads its HTTP(S) target only during playback, and ISO is handed to an external player.

OneDrive account types and access paths differ, and being able to open the official site does not mean downloads connect directly. Choose the read policy according to the actual path on the machine running the mount tool; real-account compatibility for OneDrive and Guangya is still to be verified.

## Three caches, three settings

CloudDrive2 has three kinds of cache, each set separately; changing one does not affect the other two. This is where it is easiest to waste effort.

| Name | Uses | Purpose |
| --- | --- | --- |
| Buffer Cache | Memory | How long the blocks currently being read stay in memory |
| Disk cache | Disk | Blocks already read are stored on disk and read from disk next time |
| Folder cache | Disk | Downloads the contents of a whole directory ahead of time |

With only a spinning hard disk, use on-demand reading first; turn on the folder cache when you watch the same set of files repeatedly.

The cache size shown in the file manager is a logical size and does not equal the disk space actually used.

## Cache limit and cleanup

The cache limit and cleanup mode are set in CloudDrive2's "Settings". Choose LRU for the cleanup mode, so the least recently used cache is deleted first when space runs short.

**Do not set the limit to 0.** With 0 the cache once grew to about 911 GB; after setting 30 GiB it has also exceeded the limit, and the cause is not yet known.

Keep at least 40 GiB free on the system disk. After setting it:

1. Reopen the settings page and confirm the value was kept.
2. After a while, check how much disk space actually disappeared. The number on the settings page does not always equal actual usage, and that is often how an overrun goes unnoticed.

## Read length and threads

Read length and download threads are changed in each drive's own download settings.

- Start the read length at 256 / 128 KB, which suits scanning, frame extraction, and seeking.
- If a high-bitrate video still buffers, try 512 / 256 KB. If opening speed, seeking, traffic, and playback all fail to improve, set it back.
- Start download threads at 2. For 115 do not exceed the limit the client states; for PikPak and WebDAV use 4 only when there is spare bandwidth and 4 is actually faster.
- Turn on direct links if you can, and after turning them on play a video to confirm it still plays. When using WebDAV, first confirm the server allows direct links. 115's connection method cannot be copied to PikPak; configure PikPak by the access method CloudDrive2 currently provides.

Direct link and proxy are two independent switches. When the connection is slow, try each combination once and compare, rather than only looking at whether a switch is on.

There is currently no cold-cache comparison data on how much traffic a smaller read length saves. Judge by the actual traffic counter, and do not extrapolate from the ratio of read lengths.

## Bitrate and speed are different units

Video bitrate is in Mbps and download speed is in MB/s; they differ by a factor of 8:

    required MB/s = bitrate in Mbps ÷ 8

For example, an 80 Mbps video needs at least 10 MB/s. Leave headroom: only when download speed stays steadily above 15 MB/s can playback be called normal.

When watching a video, first pause batch frame extraction and close playback pages you are not using. Start Peach's concurrent video reads at 1–2.

## Auto-register new files from the drive

Peach 不实时监视网盘目录，因为每列一次目录都是一次网络请求。如果希望网盘里新存进去的文件立刻出现在 Peach，需要让 CloudDrive2 主动通知 Peach。目录与来源取自媒体库配置，不要求固定盘符。

This notification (webhook) is a CloudDrive2 membership feature. Leaving it unconfigured does not affect other features; new files are still found by the periodic full scan. For the design see [ADR-0041](adr/0041-new-files-are-pushed-in-scanning-is-the-backstop.md).

1. 在 Peach 配置页「媒体」分组里，打开「发现新文件后自动入库」和「接收 CloudDrive2 通知」。
2. 在「云端路径前缀」里，把 CloudDrive2 里看到的目录和媒体目录对应起来，例如 `/115` 对应 `B:\`。
3. 点「保存配置」。页面会生成一整段 CloudDrive2 配置，地址、端点和密钥都已经填好。
4. 点「复制配置」，到 CloudDrive2 的「设置 → Webhooks」里新增一条，粘贴后保存。

Notes:

- 配置里的地址是 Peach 所在电脑的局域网地址，协议和端口与应用服务一致：独立版局域网模式使用 HTTP，启用 TLS 的服务使用 HTTPS。Peach 只接受本机和私有网络发来的通知，来自公网的请求一律忽略。
- Windows 版 CloudDrive2 的编辑框会把换行存坏，列表里显示「无效」。解决办法：把这段配置存成一个 `.toml` 文件，放进 `%LOCALAPPDATA%\CloudDrive.WinUI\webhooks\`，然后重启 CloudDrive2。Webhooks 页的「刷新」不会重新读取这个文件夹。
- CloudDrive2 发通知时也走它自己的代理设置，代理要让局域网地址直连。

To verify: put a video into the drive, and a few seconds later it should appear in Peach. If it does not, check the status on the configuration page:

- The "Registered" count does not move: the notification did not reach Peach; check the address or key.
- The count moves but the file does not appear: the "Cloud path prefix" does not match.
- The CloudDrive2 list shows valid but no notification is sent at all: first confirm the CloudDrive2 account is a member.

If the key leaks or you want a new one, click "Rotate key" in the same place, then copy the configuration again and paste it once more.

## Cloud download: hand magnets to the drive for offline download

Cloud download hands a magnet to 115 or PikPak to download on the drive side, and the files do not pass through this computer. Finished files land in a mounted directory and are found and registered by the push discovery in the previous section; if push is not configured, they are found by the next scan.

Configuration is in the two cards "Cloud download" and "PikPak account" in the "Download" group of the configuration page:

- **115**: submitted through CloudDrive2's gRPC interface. In CloudDrive2 "Settings → API tokens" generate a token and tick at least "Submit offline tasks" and "View offline tasks and quota"; to cancel tasks from Peach also tick "Cancel offline tasks", and to create the target directory from Peach also tick the create-folder permission (`allow_create_folder`). The check reports which permission is missing, whether the target directory can be used for offline download, and how many quota entries remain this month; it is read-only and submits no task. When the address and token are both saved, the card runs the check against the saved configuration as soon as it opens; after you click "Save configuration" the response carries one too and shows it directly on the card; if you changed the form and want to see the result before saving, click "Check" to re-check with the values currently entered. When CloudDrive2 runs on this computer the address can be left empty, and the check tries `http://127.0.0.1:19798` (the standalone default) and `http://127.0.0.1:29798` (common for the Windows desktop version) in turn, uses `GetSystemInfo`, which needs no token, to see which one answers, and fills the first responder back into the form; it is only remembered after you click "Save configuration". If neither answers, it reports an error listing the two addresses it tried; confirm CloudDrive2 is started, or enter its actual address.
- **PikPak**: PikPak has no open interface, so Peach connects directly following the web client's protocol. Sign in once with account and password to get a login token; with "Save password" ticked, an expired login is renewed automatically, otherwise you must come back to this card and sign in again. When sign-in triggers human verification, the card gives a link to the verification page; complete it in a browser and click "Sign in" again, and Peach does not pass the verification for you.
- **Target directory**: for 115, enter a path in CloudDrive2's mount tree, and this directory must fall under one of the push discovery "cloud path prefixes"; for PikPak, enter a directory that already exists on the drive, and then choose which media directory the PikPak root corresponds to.
- **Filled from push discovery when empty**: when the 115 target directory is empty, the check calls `FindFileByPath` for every prefix in push discovery; if CloudDrive2 reports the prefix is on a 115 drive (drive type `115open` or `115`, based on the type CloudDrive2 reports itself, not the prefix name), it suggests `<prefix>/云下载`; with several, it prefers the one whose media directory is declared as a 115 source. When the directory is empty and you click "Save configuration", if the directory exists it is saved directly and the card goes on to report whether it can be used offline and how much quota is left; if it does not exist, the other fields are saved as usual, the directory is filled back into the form, the input is highlighted red, and a "Create this directory" button is offered; only clicking it calls `CreateFolder` to create it in CloudDrive2, and after it is created click "Save configuration" again to remember it; if you click "Save configuration" without creating it or changing the path, it is blocked with a prompt on this field to create it or change the path first. The directory suggested by the check when the card opens and by the "Check" button is only filled back into the form, and is remembered only when you click "Save configuration". If push discovery has no 115 prefix, the check prompts you to register the 115 mount root on that card first. The same applies when the media directory for the PikPak root is empty and PikPak is signed in or an account is entered in the account box: if the prefix is the PikPak drive root and the corresponding local root is a declared PikPak source, it is selected; if it cannot be inferred, it prompts you to choose from the dropdown or register in push discovery. If you only use 115, PikPak is neither checked nor mentioned. The detected address and inferred PikPak root are only filled back into the form and are remembered only when you click "Save configuration".
- **Wait limit**: if the remote has not finished after this long it is marked "Stalled", usually because nobody is seeding.

Tokens, refresh tokens, and saved passwords live only in the credentials file on this computer; they do not go into the settings file, are not synced with settings, and are not written to logs or the Peach database.

Submission happens in the cloud download dialog: "Search resources" on each item of the JAV intake page, "Submit magnet" on the page, and "Search resources" on the HD-version target card all open it in place, carrying the product code and title; search by product code or paste a magnet, choose 115 or PikPak, confirm the target directory, and submit. Submitted tasks show progress in the "Cloud download" section of the Activity page (`/activity`). When the same magnet (judged by infohash) already has a task, Peach keeps following that one rather than submitting again.

Task cards show status and failure reason; ones running remotely can be cancelled, failed, cancelled, and stalled ones can be resubmitted, and every card can copy its magnet. A few rules:

- 115 每提交一次扣一条离线配额，年费会员每月 1500 条、月费 200 条，重新提交也算。
- 115 判为违规的资源（错误码 50038）不重试，以后再贴同一个磁力会直接拒绝。
- 提交前丢掉解不开或不像地址的 tracker，其余参数原样保留。资源站给出的磁力偶尔带乱码 tracker，115 对这种磁力报 10004「错误的链接」，有时不报错也不建任务。
- 提交后 15 分钟内离线列表一直看不到这个任务、目标目录里也没有文件，报「网盘没有收下任务」；列表里出现过、后来不见了，报「网盘任务被删除」。两种都算网盘问题，可以原样重新提交。
- PikPak 免费与会员账号的离线任务上限：未取得。
- 接口失效时任务报错，复制磁力到网盘客户端里手动添加即可。

## Where the starting values come from

The capacities and concurrency numbers in the table are suggested values estimated from capacity, not measured fastest settings. Adjust them by actual space usage and playback results.

- The group of 256／128 KB read length, direct links on, and a 30 GiB limit comes from the local configuration of 2026-08-13, and has shown no problems in long-term use since.
- A single 115 download was measured at about 2.02 MB/s on 2026-08-15, when an old playback connection was still competing for bandwidth. That is only the result for that line at that time; it changes with time and line and cannot serve as a baseline.
- The values currently entered on this machine are whatever the CloudDrive2 settings page says; a copy is not kept here.

The [official help](https://www.clouddrive2.com/help.html), [cache description](https://www.clouddrive2.com/features.html), and [release notes](https://www.clouddrive2.com/download.html) were checked on 2026-09-06. Direct link and thread options depend on the installed version and server capability.
