# Page Routes

`POST /api/library-processing` for library processing supports pausing, resuming, cancelling and archiving the finished notice by `job_id`; `stopping` still occupies the current scope, and `cancelled` does not resume automatically. `scope=new` is resolved at start into a fixed asset set, and is not mixed with `asset_ids` or failure retries. The status returns only the count of newly ingested items and does not send internal processing paths.

`GET /api/library-processing/issues` returns the task ID, the content digest `revision`, the total, the offset and the records. Later export pages pass the first digest; when the same task appends, recovers or replaces records, mixed reading is rejected. The old complete issue array can be read in pages, and original records that are missing or corrupt are returned as failures.

Lists use a one-level path and details use a two-level path. Query parameters express filtering, sorting and playback context; names are used only for display and search.

## Detail Objects

| Object | Canonical address | Identity |
| --- | --- | --- |
| Asset | `/assets/:id` | A media record in the ledger; different file versions have their own IDs |
| Work | `/works/:code` | Canonical code; one work can map to multiple library assets |
| Follow item | `/posts/:id` | A post from a followed source, containing video or images |
| Performer | `/performers/:id` | `performer` entity, including female performers and other artists |
| Studio, maker | `/studios/:id` | `studio` entity; the profile is shown by studio and parent-maker relationship |
| Creator | `/creators/:id` | `creator` entity, including FC2 sellers and animation authors |
| Agency | `/agencies/:id` | `agency` entity |
| Series | `/series/:id` | `series` entity |
| Local tag | `/tags/:id` | `tag` entity; aggregates related assets and images |

Numeric IDs do not contain names. An entity rename keeps the same address; a merged ID redirects to the final identity. A person or studio from a source with no local identity shows only the name.

The code in a work path uses the canonical form, for example `/works/ABP-968`. Assets and posts use positive integer IDs. A nonexistent entity ID, or one of the wrong kind, returns 404.

In-site detail links open an overlay on the current page; closing returns to the source address, keeping query parameters and in-page anchors. Ordinary detail links not taken over by a control also use this entry, and modifier keys, new windows and download links keep browser behavior.

Player subtitle memory is read (GET) and saved (PUT) through `/api/subtitles/memory?video=`, using the in-site authorization. `video` uses `item:<asset ID>` or `follow:<post ID>:<main or media index>`. The PUT `selected` is a track key or `null` meaning off; `track: {key, name, text}` can be attached to save the converted WebVTT. Reading returns `selected` and `tracks: [{key, name, src}]`; subtitle content is read through the returned `src`. An invalid video identifier returns 400, and a nonexistent video or subtitle returns 404. Loaded subtitles and the selection state are saved on the server and restored on the next playback.

`GET /api/assets/:id/subtitles` merges registered subtitles with paired subtitles discovered on the fly in the video's directory, deduplicated by path, without entering subdirectories or writing the ledger. The returned `id` stays stable by file name, and `legacy_id` is used to restore saved selections of registered tracks. Subtitle content uses the returned `src`: the `track` parameter binds the file identity, so changes in the directory listing do not change the subtitle fetched; a vanished file or invalid identity returns 404. SRT, ASS, SSA and VTT reuse the existing WebVTT conversion and the 4 MiB read limit; unauthorized media directories do not take part in discovery.

Management-area anchor links reuse in-site navigation, scrolling smoothly after the target page's content and fonts are ready; with reduced motion enabled they jump directly. Closing a detail keeps the background page's scroll position.

## Browse Entry Points

The `library` parameter of library queries uses the persistent `library_id`. `GET /api/libraries` returns `id`, `name`, `icon`, `folders`, `metered` and the list of root directory identities; names are used only for display. Filtering by an unknown ID gives an empty set. Attributable assets of `GET /api/items` and `/api/item` carry `root_id` and `library_id`, while versions and parts still use their own asset IDs.

`GET /api/sources` provides `root_id`, `library_id`, root directory state and detection time in the source row's `roots`; `offline_roots` lists the IDs of root directories confirmed offline, and `offline` keeps the source summary where all root directories are offline. An `offline` response for a failed media access also contains the corresponding `root_id`.

Media rows in configuration and first-run setup accept `root_id` and `library_id`; a newly added media library uses its own ID, and same-named libraries are not merged. Changing the actual location of an existing root directory must carry `change_mode: "relocate"` and keeps the `root` ledger prefix; adding another directory omits the root identity. Name and icon must be consistent across rows of the same `library_id`. Illegal paths, ownership or identity are returned through the original field error contract, and the configuration is not written. For details see [Media libraries and storage roots](OPERATIONS.md#media-libraries-and-storage-roots).

The optional areas of `GET /api/configuration` are read independently. When an area fails, the field is omitted and `section_errors[area key]` provides `title`, `message` and `error_id`; the other successful fields continue to be returned. The page shows a prompt per section and supports reading again, and configuration forms that depend on an unobtained media source pause their display. `downloads.problems` lists problems with addresses, credentials and channel probing, and `downloads.config` keeps the correctable saved addresses and valid preferences; download configuration writes validate addresses strictly, an illegal port returns 400, and the settings file and credentials are kept.

| Address | Purpose |
| --- | --- |
| `/` | The whole library, including local disks and mounted cloud drives; new-release rows use the work detail address |
| `/?browse=folders` | Browse by original directory; `folder` specifies the directory, and `folder_recursive=0` shows only the current level |
| `/?jav=1` | JAV library |
| `/jav?tab=discover` | JAV discovery; `scope=library` shows the library, and `scope=external` shows external discovery |
| `/jav?tab=wants` | Wanted works |
| `/follow` | Follow updates; author, source, tag and watch status use query parameters |
| `/wall` | Video playback wall |
| `/immerse` | Immersive browsing; `id` specifies the starting asset |
| `/performers` | Performer roster; animation authors are browsed through `category=animation` |
| `/studios` | Studio and maker roster |
| `/creators` | FC2 seller roster; the profile object belongs to creators |
| `/agencies` | Agency roster |
| `/series` | Series overview; shares the profile-type switch with studios and agencies |
| `/tags` | Local or online tags; online tags are filtered through the follow page |
| `/playlists` | Playlists |
| `/unseen` | Unwatched |
| `/watch-later` | Watch later |
| `/flagged` | Flagged |
| `/junk-files` | Junk files |
| `/trash` | Trash |

The discovery page keeps the search term `q`, tag `tag`, sort `sort`, direction `dir`, and scope `scope` in the address. Opening a detail page and leaving it keeps the original list, scroll, and filter state.

The library supports multi-select release years with `year=2024,2023`, and `year=none` filters unknown years. Years are computed by release date rather than ingest date, and take effect together with conditions such as source, entity and watch status; the address, saved filters and the sidebar use the same basis. The sidebar year counts follow the remaining filter scope, keeping the other years so that multi-selection can continue.

## Playback Context

| Example address | Context |
| --- | --- |
| `/assets/30741?playlist=7` | Playlist 7 |
| `/assets/30741?mix=30740` | Mix starting from asset 30740 |
| `/assets/30741?parts=30740` | The part group containing asset 30740 |
| `/assets/30741?editions=30740` | The edition group containing asset 30740 |

The path always identifies the current asset. Switching items updates the ID, and the queue key identifies the source. Copying a playback address keeps the current time and queue context.

## Settings and Management

| Address | Purpose |
| --- | --- |
| `/settings`, `/settings/appearance` | Appearance and navigation |
| `/settings/playback` | Browsing and playback |
| `/settings/jav` | JAV and new releases |
| `/settings/search` | Search and recommendations |
| `/settings/content` | Content display |
| `/settings/library` | Media library and ingest |
| `/settings/subscriptions` | Source and subscription parameters |
| `/settings/downloads` | Download channels |
| `/settings/network` | Network and access |
| `/settings/maintenance` | App and maintenance |
| `/settings/diagnostics` | System diagnostics: system checks, library health, source sessions and background diagnostics, scraping record export |
| `/subscriptions` | Follow management: the follow list manages creator sources and JAV subscriptions together; adding a follow offers creator and performer entries and alias management, and tag management supports paging and bulk operations on online tags |
| `/sources` | Sources and credentials: collection sources, access methods and credential status |
| `/tasks` | Task center and cloud download progress |
| `/stats` | Statistics |
| `/taste` | Taste analysis |
| `/review` | Manual review |
| `/data-cleanup` | Data management |
| `/duplicates` | Duplicate files |
| `/quality-goals` | HD version goals |
| `/login` | Sign in |

Settings sections can be opened directly, refreshed, and navigated with browser back and forward. A preferences panel opened from the current page keeps the background; settings sections reuse the settings page and its permission checks. The settings category navigation stays below the search bar, and switching categories shows the start of the selected section.

The userscript calls `POST /api/jav-browser/errors` with a dedicated token, receiving only whitelisted error fields and writing them to the local log; for batches, size, rate limiting and the diagnostic package scope see [Add JAV from the Browser](JAV_BROWSER.md). The status endpoint `GET /api/jav-browser` also projects real download and organizing progress, and grants no permission to write configuration, accounts or the ledger.

`GET /api/client-updates` requires app authentication, and returns the running version and build marker, release check result, installation state, userscript version and automatic repair state, without triggering external checks. `GET /api/jav-browser/updates` uses the userscript's dedicated token, needs no product code, and returns a snapshot of the running and release versions and the script version, without exposing repair details. `POST /api/configuration/upgrade-repairs/retry` is limited to local same-origin requests and retries failed items; `GET /api/configuration/upgrade-repairs/review` is limited to local admin permission and downloads the JSON review record, returning 404 when there is no record.

`GET /api/configuration/cloud-proxies` returns the CloudDrive accounts corresponding to added media libraries with their API/data proxies, unmatched media libraries and the account revision number, without echoing proxy passwords; when no CloudDrive2 address has been entered yet, it returns an empty list with `configured: false`. `POST` accepts the account `id`, `revision` and the `api`/`data` changed this time, writes back to CloudDrive and returns that account's current state; a configuration conflict returns 409. Both endpoints are limited to local admin permission, and writes also require a same-origin request.

`POST /api/configuration/smb/test` accepts a share address and connection fields, verifies read-only directory access, and returns `readable` and up to 500 enterable subdirectory names. The endpoint requires local admin permission and a same-origin request; an invalid address returns 400, missing read permission returns 403, and an unreachable share returns 502, without echoing passwords. Configuration reads return only the account, the encryption requirement and whether a password is saved.

## Compatibility Addresses and Service Interfaces

| Compatibility address | Canonical destination |
| --- | --- |
| `/item/:id` | `/assets/:id` |
| `/jav/movie/:code` | `/works/:code` |
| `/follow/item/:id` | `/posts/:id` |
| `/mix/:seed/:item`, `/parts/:seed/:item`, `/editions/:seed/:item` | `/assets/:item` plus the matching queue parameter |
| `/playlists/:playlist/:item` | `/assets/:item?playlist=:playlist` |
| Entity name and alias paths | The matching numeric ID address |
| `/activity` | `/tasks` |
| `/scraping` | `/sources` |
| `/follow-manage` | `/subscriptions` |
| `/configuration` | `/settings/library` |
| `/diagnostics` | `/settings/diagnostics` |
| `/resource-sync` | `/data-cleanup#resource-sync` |

Compatibility redirects keep query parameters; the background information for back and forward stays in the history entries. An index trailing slash redirects to the path without the trailing slash.

`/api/*`, `/stream`, `/follow-stream`, covers, images, and other media endpoints use their own service contracts. The read-only entity endpoints `/api/entity` and `/api/photos` support `kind` plus `id`, and also accept `kind` plus `name`. Authentication and local write permission are checked by the server.

When API documentation is enabled, `/docs`, `/docs/oauth2-redirect` and `/openapi.json` are the service documentation entries; the first-run form is shown by the home page in the unconfigured state.

The remote media proxy rejects HTML, SVG, XML and content of undeclared type; ordinary media and HLS manifests use a passive response policy. Old disk caches are checked for type too, cached bytes can be reused, and browsers must revalidate with the origin. Image responses and their 304 receipts carry CSP `sandbox` and `nosniff`.

When a browser first gets the HTML page of the current media policy, it receives a `Clear-Site-Data` that clears only the cache, and a policy cookie avoids repeated clearing, with logins and preferences not cleared. Browsers that do not support this response header must clear the old site cache manually.
