# Media Cache

The remote media cache lives in the local data directory `peach-data/generated/remote-media/` and does not enter Git. DMM samples continue to use `generated/sample-cache/`, and installed covers, avatars, and favicons continue to reuse their own directories.

| Content | Storage and refresh |
| --- | --- |
| Follow images, work covers, and preview images | Persisted after the first actual read; successful content does not expire automatically |
| Follow videos | The fully retrieved response is saved during playback; a complete file can be read locally for any Range, and a partial response is reused for its original Range |
| JAV preview HLS | Manifests and nested manifests are stored by source address and refreshed on the next read after 5 minutes; the browser rechecks the local manifest on every read. Keys, init segments, and already-played segments are persisted |
| Remote avatars | Refreshed on the next read after 90 days; on failure the existing image is kept and not refetched within 1 hour |
| Favicons, source icons, and external-link round icons | Refreshed on the next read after 365 days; on failure the existing image is kept |

Unread media is not downloaded in full ahead of time. If playback is interrupted or the response length is incomplete, that response is not installed, and the parts not yet retrieved must still go back to the origin. The cache takes priority over remote playback URL resolution, and fully saved media does not depend on temporary signed URLs.

The browser only gets the item ID and cache object ID; the server keeps public HTTPS validation, per-hop target checks, and source credential isolation. Cache source information is local private data and does not enter logs or public artifacts. After the user hides an image, the card uses that image's versioned address.

When a public preview hits a TLS connection error, streaming reuses the installed `curl_cffi` browser transport. An HTTP rejection status does not switch transports; both transports share the per-hop target check. Leaving playback closes the upstream response and this connection pool.

Follow management shows "Failed checks" when there are enabled sources whose check failed; the button submits the IDs of those sources, and is hidden when no failed source can be retried. A single-source check and "Check all" continue to use the same task entry.
