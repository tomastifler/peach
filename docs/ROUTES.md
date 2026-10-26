# Page Routes

Lists use a one-level path and detail pages use a two-level path. Query parameters express filters, sorting, and playback context; names are used only for display and search.

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

## Browse Entries

| Address | Purpose |
| --- | --- |
| `/` | The whole library, including local disks and mounted cloud drives; new-release rows use the work detail address |
| `/?browse=folders` | Browse by original directory; `folder` specifies the directory, and `folder_recursive=0` shows only the current level |
| `/?jav=1` | JAV library |
| `/jav?tab=discover` | JAV discovery; `scope=library` shows the library, and `scope=external` shows external discovery |
| `/jav?tab=wants` | Wanted works |
| `/follow` | Follow updates; author, source, tag, and watch status use query parameters |
| `/wall` | Video playback wall |
| `/immerse` | Immersive browsing; `id` specifies the starting asset |
| `/performers` | Performer roster; animation authors are browsed through `category=animation` |
| `/studios` | Studio and maker roster |
| `/creators` | FC2 seller roster; the profile object belongs to creators |
| `/agencies` | Agency roster |
| `/tags` | Local or online tags; online tags are filtered through the follow page |
| `/playlists` | Playlists |
| `/unseen` | Unwatched |
| `/watch-later` | Watch later |
| `/flagged` | Flagged |
| `/junk-files` | Junk files |
| `/trash` | Trash |

The discovery page keeps the search term `q`, tag `tag`, sort `sort`, direction `dir`, and scope `scope` in the address. Opening a detail page and leaving it keeps the original list, scroll, and filter state.

Series profiles can be reached directly; there is no standalone series index page.

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
| `/settings/diagnostics` | System diagnostics: system checks, library health, and source sessions |
| `/subscriptions` | Follow management: follow list, add follow, JAV subscription feeds |
| `/sources` | Sources and credentials: collection sources, access methods, and credential status |
| `/tasks` | Task center and cloud download progress |
| `/stats` | Statistics |
| `/taste` | Taste analysis |
| `/review` | Manual review |
| `/data-cleanup` | Data management |
| `/duplicates` | Duplicate files |
| `/quality-goals` | HD version goals |
| `/login` | Sign in |

Settings sections can be opened directly, refreshed, and navigated with browser back and forward. A preferences panel opened from the current page keeps the background; settings sections reuse the settings page and its permission checks. The settings category navigation stays below the search bar, and switching categories shows the start of the selected section.

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

When API docs are enabled, `/docs`, `/docs/oauth2-redirect`, and `/openapi.json` are the service documentation entries; the first-run form is shown by the home page in the unconfigured state.
