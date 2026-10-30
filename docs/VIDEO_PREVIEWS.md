---
kind: reference
---

# Existing Timeline Previews

The player progress bar prefers an existing preview paired exactly with the video, then Peach's timeline cache, then falls back to the nine-grid. Reading an existing preview touches only the index and images and does not start FFmpeg. When timeline collection finds a usable existing preview, it counts as skipped and does not extract frames again.

## Formats and Pairing

Taking `movie.mp4` as an example, pairing keeps the full file stem, including version and part suffixes, and does not merge different videos by product code.

| Format | Entry next to the video | Read scope |
| --- | --- | --- |
| WebVTT image index | `movie.vtt`, `movie.mp4.vtt`, `movie.thumbnails.vtt`, `movie-thumbs.vtt`, `movie.storyboard.vtt` | Cue time ranges with separate images, or JPEG, PNG and WebP sprite sheets carrying `#xywh=x,y,w,h`; uneven intervals and time gaps are supported |
| HLS image playlist | `.m3u8` files with the same stem | VOD `EXT-X-IMAGES-ONLY`, `EXT-X-TILES` and separate image segments; the master playlist points to the image playlist through `EXT-X-IMAGE-STREAM-INF` |
| DASH image track | `.mpd` files with the same stem | The image AdaptationSet, `thumbnail_tile`, `SegmentTemplate`, `SegmentTimeline`, timescale, start number, time offset and multiple Periods of a static MPD; templates support `$Number$`, `$Time$`, `$RepresentationID$`, `$Bandwidth$` and zero padding |
| BIF v0 | `movie.bif`, `movie-320-10.bif`, `movie-sd.bif`, `movie-hd.bif`, `movie-fhd.bif` | Reads the real timestamps, time multiplier and JPEG offsets inside the file; Emby, Roku and BIF exported from Plex share this reader |
| Jellyfin Trickplay | `movie.trickplay/320 - 10x10/0.jpg`, `1.jpg`... | Reads the grids from the directory; numeric indexes must be consecutive from 0; the last sheet keeps the full grid, and the selection range is limited by the valid frame count |

When a video has several usable formats, they are chosen in table order, and missing or corrupt candidates are skipped. Images and sub-playlists referenced by an index must stay in the video's directory or its subdirectories. Absolute paths, remote URLs, references escaping the directory, encrypted or byte-range HLS and live manifests do not take part in local reading. DASH SegmentList, SegmentBase and dynamic manifests are out of scope.

Plex's internal `index-sd.bif` must first be exported and paired by video stem. Peach does not automatically scan Plex's internal metadata directory, and does not guess a BIF's owner from a unique video in the same directory. Kodi's `.tbn` is a single piece of artwork with no time index, and is not used as a timeline preview.

## Jellyfin Timing Information

`320 - 10x10` expresses only the single-frame width and the grid, and cannot record the sampling interval or the number of valid frames in the last sheet. Only the Jellyfin database and API's TrickplayInfo contain fields such as `Interval` and `ThumbnailCount`.

TrickplayInfo exported from Jellyfin can be saved as `trickplay.json` in the resolution directory, for Peach to read exactly. This is an export sidecar Peach accepts, not a file Jellyfin generates natively. The fields are `Width`, `TileWidth`, `TileHeight`, `Interval` (milliseconds) and `ThumbnailCount`, and must agree with the directory dimensions and the number of sheets.

With JPGs only, Peach offers an estimated preview when the duration, sheet count and the default 10-second interval agree, and the endpoint marks `estimated: true`. A custom interval cannot be reliably recovered from the directory name; when the counts disagree, the default is not adopted. A black frame can be real content, and the black ratio is not used to guess the valid frame count.

## Endpoints and Cache

`GET /api/timeline?id=<asset ID>` returns `source`, `frames`, `estimated` and `cues` for an existing preview. Each item in `cues` is `[start seconds, end seconds]`, `interval` is 0, and `columns` and `rows` are 1. Peach's own cache continues to return a fixed interval and sheet dimensions.

For an existing preview, `GET /timeline?id=<asset ID>&s=<frame number>&source=<source>` returns a cropped JPEG; for Peach's own cache, `source` is `peach` and `s` is the sheet number. The frontend determines the meaning of the number from the index. When Peach's own cache exists, the existing preview's index also includes `fallback`; when the target moment is not covered or the image was not obtained, Peach's own cache is read first, then the nine-grid. Images support HEAD, ETag and private-cache revalidation.

Indexes and crop results use a bounded short-lived in-app cache, do not write to the ledger, do not expand whole BIFs or copy sprite sheets on disk, and keep the original indexes and images read-only. For format forensics and dependency choices see [Preview format forensics](reference-snapshots/video-preview-formats.md).
