# 本地附属媒体命名证据

核对日期：2026-10-23。本文件是人工取证笔记，记录网页命名事实与 Peach 的采用范围，不是上游原文，因此不登记进 `docs/reference-sources.json`。

## 公开约定

- **已核对**：[Plex 电影附属文件](https://support.plex.tv/articles/local-files-for-trailers-and-extras/)规定同目录末尾类型标记及 `Trailers`、`Interviews` 等专用目录；[剧集附属文件](https://support.plex.tv/articles/local-files-for-tv-show-trailers-and-extras/)还列出带数字编号的末尾标记。电影页面直接抓取返回 403，搜索服务取得官方页面索引正文；不声称完成该页面的浏览器访问。
- **已核对**：[Kodi 本地预告片](https://kodi.wiki/view/Trailers)使用与正片同名的 `-trailer`；[Video Extras](https://kodi.wiki/view/Video_extras)和 [Extras 插件](https://kodi.wiki/view/Add-on:Extras)使用影片目录下的 `Extras`，允许嵌套子目录。Kodi 的扫描配置会影响其实际展示；本次只兼容命名语义。
- **已核对**：[Emby 预告片](https://emby.media/support/articles/Trailers.html)规定 `-trailer` 和 `trailers/`；[电影命名](https://emby.media/support/articles/Movie-Naming.html#movie-extras)列出 `extras`、`specials`、`shorts` 等附属目录。Emby 文档不支持花絮嵌套，Peach 的嵌套支持来自 Kodi 的约定。
- **已核对**：[Jellyfin 附属媒体](https://jellyfin.org/docs/general/server/media/movies/#extras)列出裸名、文件名后缀、专用目录和主题媒体；网页以 CC-BY-ND-4.0 发布，仅参照命名事实，不复制网页正文。固定提交 [`c7ce6a1b56ee7dcc1896250df0f2f9deaa828a81`](https://github.com/jellyfin/jellyfin/tree/c7ce6a1b56ee7dcc1896250df0f2f9deaa828a81/Emby.Naming)的 `Common/NamingOptions.cs`、`Video/ExtraRuleResolver.cs` 与项目清单已通过 opensrc 阅读，并与该提交的原始文件逐字节核对；解析器去掉末尾 ASCII 数字，再匹配裸名或后缀，并排除媒体库根本身。

## Peach 的采用范围

| 形式 | 支持范围 |
| --- | --- |
| 视频裸名 | `trailer`、`sample`，包括 `trailer2.mp4`、`sample1.mkv` |
| 预告片和样片后缀 | `trailer`、`sample` 前使用连字符、点、下划线或空格；支持 `- trailer`、`- sample` 及末尾数字 |
| 其他视频后缀 | `-behindthescenes`、`-deleted`、`-deletedscene`、`-featurette`、`-interview`、`-scene`、`-clip`、`-short`、`-extra`、`-other`，支持末尾数字 |
| 视频专用目录 | `trailers`、`behind the scenes`、`deleted scenes`、`interviews`、`scenes`、`samples`、`sample`、`shorts`、`featurettes`、`clips`、`extras`、`extra`、`other`、`specials`、`backdrops` |
| 主题媒体 | 音频裸名 `theme` 及末尾数字；`theme-music/` 中的音频；`backdrops/` 中的视频 |

匹配不区分大小写，媒体扩展名沿用 Peach 的视频与音频集合。目录规则可以作用于嵌套内容，但只看最长声明媒体库根以下的路径。库根本身名为 `Extras` 或 `Shorts` 时不触发目录规则；明确裸名或文件后缀仍触发。普通短片、`Trailer Park.mp4`、`Interview.mp4` 和片名中间的关键词不参与猜测。命名明确时不依赖正片先到达，不读取视频内容。Plex 对 ISO、宽泛关键词和文件大小的扫描排除属于其扫描器策略，Peach 不据此屏蔽自身支持的媒体格式或普通片名。

附属媒体不作为独立正片卡片或后台处理工作量；已登记行、媒体、评分和播放记录保留，可继续通过单项详情访问。不新增花絮播放界面、预告片下载或社区刮削插件，不增加迁移或清理真实 ledger。临时目录与账本回归覆盖扫描、推送发现、预检、探测、采集、查询、版本组、实体数量和库存计数。未部署四家服务器，其完整服务、客户端及插件的端到端兼容性未验证。
