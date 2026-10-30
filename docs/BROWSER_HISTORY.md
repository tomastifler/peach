# Browser History Import

Taste reads web visit history. Auto-discovery covers the default profile directories; portable builds, custom installs, and custom Firefox profiles can be added in "Browsers" as a profile directory or a history file. The file format is identified by its SQLite table structure, not by browser name or file name.

## Directory Coverage

| Platform | Auto-discovery |
| --- | --- |
| Windows | Chrome, Chromium, Edge, Firefox, Zen, Aside, Brave, Vivaldi, Opera, Opera GX, 115, QQ, 360 Safe, 360 Speed, 360 Speed X, new Sogou, 2345, Maxthon |
| macOS | Chrome, Edge, Firefox, Zen, Aside, Brave, Vivaldi, Opera, Opera GX, Safari |
| Linux | Chrome, Chromium, Edge, Firefox, Brave, Vivaldi, Opera; also the default directories for Chrome Flatpak, Firefox Flatpak, and Snap |

Windows uses the current device's `APPDATA` and `LOCALAPPDATA`; Linux uses `XDG_CONFIG_HOME`. A profile directory can contain the history file directly, or one level of profile subdirectories. A browser configuration can stop and resume reading; already-imported records are managed separately.

## 115 and Chinese Browsers

- **115**: the default profile directory is `%LOCALAPPDATA%\115Chrome\User Data`, and web history may be stored in `HistoryEx`. The parser checks web visit tables such as `urls` and `visits`; the download table itself does not count toward Taste. The [115 official download troubleshooting note](https://115.com/115115/T344887.html) also references this file, but that does not mean the whole file contains only download records.
- **QQ, 360 Speed, 360 Speed X, new Sogou**: read as Chromium web history. Default directories follow the maintained project [HackBrowserData's Windows browser directories](https://github.com/moonD4rk/HackBrowserData/blob/master/browser/browser_windows.go); the 360 Safe directory also has an [official community note](https://bbs.360.cn/archiver/tid-15857311.html). Custom install paths must be added manually.
- **Old Sogou**: the proprietary `HistoryUrl3.db` format is not supported and cannot be read as Chromium format. The table structure recorded in a [forensic study](https://www.huorong.cn/document/tech/vir_report/805) differs from the standard web visit tables; the full semantics of the time fields are not known.
- **2345**: `%LOCALAPPDATA%\2345Explorer\User Data`; the profile directory is confirmed by the [official help](https://ie.2345.cc/help/v7/help_scj.htm). The history file must still match a supported SQLite table structure.
- **Maxthon**: looks in both `%LOCALAPPDATA%\Maxthon\User Data` and `%LOCALAPPDATA%\Maxthon\Application\User Data`. The former appears in the [Winapp2 maintained source](https://github.com/MoscaDotTo/Winapp2/blob/master/Non-CCleaner/Winapp2.ini), the latter in the [official community's actual directory](https://forum.maxthon.com/d/6744-aimax--cant-turn-off/5); an [official reply](https://forum.maxthon.com/d/3314-restore-last-visit-page-after-update-) confirms `History` is the history file in the profile. Old proprietary `.dat` files are outside the standard SQLite parsing scope.
- **Opera**: the exact profile directory can be seen at `opera:about/`; see the [official help](https://help.opera.com/en/latest/crashes-and-issues/).

Chrome and Chromium profile paths follow the [official documentation](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md) and the `Profile Path` in `chrome://version`; any location specified with `--user-data-dir` must be added manually.

Custom Firefox profiles can be added manually after finding the root directory in `about:profiles`. In the official source, relative paths in [`profiles.ini`](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/profile/nsToolkitProfileService.cpp) are based on the Firefox root directory; newer [Profile Groups](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/profile/ProfilesDatastoreService.sys.mjs) are recorded in a separate SQLite configuration. Peach auto-discovers default profile locations and does not parse external locations from these two kinds of configuration. UC's [Autopsy directory rules](https://github.com/sleuthkit/autopsy/blob/develop/RecentActivity/src/org/sleuthkit/autopsy/recentactivity/Chromium.java) include `UCBrowser/User Data%`, with differences in profile directory and file name suffix, so it is not part of the auto-discovery commitment; the history file can be selected manually and is validated against its actual format.

## Validation and Limits

The browser database first gets a consistent snapshot through SQLite backup, then the pinned `browserexport==0.4.4` converts visit times and records. Chrome's optional visit duration and Firefox's optional description and preview image can be missing and the file is still readable; one corrupted profile does not block the others. Raw URLs and titles are stored only in the private history database and never enter the ledger.

Temporary SQLite regression tests cover directory discovery, manual addition, stop and resume, incremental deduplication, optional columns, wrong formats, special path characters, and isolation of a single source failure. Acceptance records for real browser files are kept outside the repository; directory support does not mean every browser's current version has been verified on a real machine.

数据源卡片按浏览器名称显示品牌图标，覆盖全部自动发现的浏览器及常见手动来源。图标随应用分发，来源和摘要记录在 `resources/browser-icons/manifest.json`，页面不向第三方请求图标。名称未匹配或图像加载失败时显示通用浏览器图标；图标覆盖不代表新增历史格式支持。
