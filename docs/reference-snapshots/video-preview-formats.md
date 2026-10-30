---
kind: reference
---

# 时间轴预览格式取证

核对日期：2026-10-23。本文件是多个来源的人工取证笔记，不是可按单一 URL 重抓的上游原文，因此不登记进 `docs/reference-sources.json`，不复制上游应用实现。

| 来源 | 已取得的证据与使用方式 |
| --- | --- |
| [Roku BIF 规范](https://developer.roku.com/dev/docs/bif-file-creation) | BIF v0 的 64 字节头、little-endian 索引、毫秒乘数、N+1 个索引项与末端标记；标准库 `struct` 读取，Pillow 验证 JPEG |
| [Emby 团队命名说明](https://emby.media/community/topic/142962-video-preview-thumbnails-dont-seem-to-work-on-the-web-app/) | 支持文件主名 `.bif`，并使用带分辨率和频率的 `-320-10.bif`；按完整主名配对，以文件内时间戳为准 |
| [Plex 官方说明](https://support.plex.tv/articles/201725267-what-are-video-preview-thumbnails-in-plex/) | 官方搜索摘要确认 BIF 用于低分辨率时间预览；直连返回 403，全文未取得。支持导出的 BIF，不宣称验证内部目录映射 |
| [JW Player 图片预览](https://docs.jwplayer.com/players/docs/android-add-preview-thumbnails) | WebVTT cue 引用独立图片或带 `xywh` 的拼图；保留真实时间范围，解析本地相对引用 |
| [Roku HLS／DASH 图片轨](https://developer.roku.com/dev/docs/hls-and-dash) | HLS 图片播放列表与 tiles 标签；DASH 图片 AdaptationSet 与 `thumbnail_tile`；归一为图片区域与时间范围 |
| [Jellyfin TrickplayManager](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Server.Implementations/Trickplay/TrickplayManager.cs)、[TrickplayInfoDto](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Model/Dto/TrickplayInfoDto.cs) | 网格目录、数字 JPEG、末张补齐及独立存储的间隔和有效帧数；默认间隔推算标记为估算 |
| [Kodi 单张缩略图说明](https://kodi.wiki/view/Archive%3ACreate_video-preview_thumbnails_manually) | `.tbn` 是单张图片，不带时间索引，不按时间轴处理 |

BIF 是图片索引容器，WebVTT 是时间文本格式配图片引用的播放器约定，HLS／DASH 是流媒体图片轨，Trickplay 是 Jellyfin 的文件组织约定。

## 复用判断

- 当前树、`docs/REUSE.md` 和 Git 历史已有固定间隔时间轴、FFmpeg 抽帧拼图与 Pillow。本次扩展实际消费者，无新增运行依赖，不新增独立生成任务。
- HLS 复用 `m3u8==6.0.0`，MIT 许可证，平台无关，无新增安装体积。经 `opensrc path pypi:m3u8@6.0.0` 读取其 `image_playlists`、`is_images_only` 和 `tiles` 实现，不另写标签解析器。
- BIF 按官方 v0 协议做有界二进制读取，标准库和现有 Pillow 覆盖索引、seek 与 JPEG 验证。`bifserver` 是 Python 2.7 生成服务，`bifgen` 是生成工具，不承担只读适配；后者源码请求失败，版本和许可证未取得，没有引用其实现。
- WebVTT 图片 cue 与 DASH 图片轨使用标准库解析。Peach 保留视频配对、本地路径边界、无覆盖时刻回退和缓存策略。前端专用 `videojs-vtt-thumbnails`／`videojs-sprite-thumbnails` 不能承担 BIF、磁盘路径和现有 API，不引入。

## 验证边界

隔离用例构造有效 JPEG、BIF、WebVTT、HLS 与 DASH，核对实际裁切像素、非均匀时刻、末张、缺号、路径边界、损坏和超大索引、图片 GET／HEAD／ETag 与采集跳过。播放器索引查找走行为用例。

用户截图未包含实际 JPG、BIF 或生成配置。这些真实产物的跨产品实测未取得，不把隔离夹具称为 Emby、Plex 或 Jellyfin 服务器联调。
