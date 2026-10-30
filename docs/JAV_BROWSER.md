# Adding JAV from the Browser

On a supported site's video detail page, click "Add to Peach library"; Peach searches magnets by product code, automatically picks, among the existing quality ranking, a main-feature resource that can be confirmed to belong to that code, and submits it to the default cloud drive. After the file lands, the existing cloud download flow registers it, completes its metadata and organizes it.

## Preparation

- The ledger write end running Peach.
- Add a cloud drive media library and configure the cloud download account, target directory and mount path. The CloudDrive2 channel reuses the path associations from mounts or push discovery, and filters by the cloud download capability the directory returns; PikPak also supports a direct connection. Drives such as Guangya enter the list only when the current connector confirms cloud download support. For configuration see [Resource search](RESOURCE_SEARCH.md) and [CloudDrive2](CLOUDDRIVE.md).
- In the browser, install a userscript manager that supports the GM API; follow the [official Tampermonkey installation and browser notes](https://www.tampermonkey.net/).

CloudDrive2 reports separately the capability to submit cloud downloads and to manage offline tasks. Drives that support management track progress through the task list; drives that only support submission wait for the file to land in the target directory, and cancelling is done in the drive. Peach hides the unavailable remote cancel button. The association between media libraries and cloud paths is also used for ingest after a download completes.

The script is maintained independently at [peach-mitao/peach-userscript](https://github.com/peach-mitao/peach-userscript), covering online players, databases and profiles, release and sales platforms, studio official sites, uncensored release sites and resource indexes. For each site's domain and recognition method see the [complete site list](JAV_BROWSER_SITES.md). Mirror domains are registered separately, and are not automatically treated as the same site by similar names. User-facing installation, pairing and site notes are centralized in the [Sleazy release page copy](JAV_USERSCRIPT_SLEAZY.md), and Peach's settings page keeps only the install and pairing operations.

Auto-detect uses the main title of the work's detail page and explicit code fields; for DMM and MGS, Peach cross-validates the detail address and the page's "メーカー品番" and "品番" by source. DMM product catalog prefixes and MGS release prefixes are interpreted separately, and the trailing letter of a product number is kept. When a field is missing, a complete code can be selected; when fields conflict, automatic adding stops and asks you to check. A site marked "Selected code" needs a complete code selected first, then choose "Add selected code to Peach" from the script menu, and finally click the floating add button.

## Installation and Pairing

1. On the computer running Peach, open "Peach Settings → Download Channels → Add JAV from Browser".
2. Click "Install Peach userscript", and the script manager installs the artifact currently bundled with Peach. For the public install entry see the [Sleazy release page](https://sleazyfork.org/zh-CN/scripts/600821).
3. Choose the default download channel, click "Enable and generate token", then click "Copy pairing info". The token is shown only once after generation; after leaving the page, regenerate it with "Update channel and token".
4. Open a registered site, click "Configure Peach" or the settings button at the bottom right, paste the pairing info into "Peach address", which fills in the address and token automatically, then save the settings. You can also open the settings panel from the script menu "Configure Peach address and token" and enter the address and token separately. The target browser must trust Peach's HTTPS certificate; HTTP is allowed only for loopback addresses.
5. Allow the script manager to connect to your own Peach address. For remote devices, enter the Peach HTTPS address that device can reach.

The dedicated token only allows querying a work's add status, initiating JAV adds and writing restricted script error records; the cloud drive account is still managed by Peach. Clicking "Turn off browser add" revokes the token and stops adds in the queue that have not yet started submitting; cloud downloads being submitted or already submitted are viewed and cancelled from the task center.

The script reads the saved configuration from GM storage; in the settings panel the token can be left empty to keep it, and the token must be re-entered when the address changes. The server stores only the token hash and cannot read back the plaintext. The pairing info contains the address and the dedicated token, and should be kept like a token; importing only fills in the form and takes effect after clicking "Save settings". Configuration validation and the prompts for the selected code are shown inside the page, with light and dark following the system.

Peach's settings page detects the script version and whether a pairing has been saved for the current address through a same-origin bridge page. When no response is received, it shows "Not detected", keeping the install and re-detect entries; a disabled script, a script manager that has not granted access or an old version that does not support the bridge all produce this state. The bridge returns no token; "Paired" only means the script has saved the current address, and the token's permission and the service connection are confirmed by the status query from the source page.

## Adding and Viewing Progress

1. Open a video detail page and click "Add to Peach library".
2. The script shows five stages with an overall progress: queued, searching, downloading, ingesting and organizing, with completed stages ticked and the current stage highlighted, along with specific states such as submitted to the drive and file accessible. The drive's percentage belongs to the download stage only, and the other stages advance by real state. A video already in the library shows "The library already has a video with this code", and the button shows "Already in library". An in-progress task for the same code is reused.
3. After the cloud download is submitted, check download and post-ingest organizing progress in Peach's task center.

The source site page can be closed during the search; the queue is stored by Peach, and Peach resumes unfinished searches after a restart. After submission the script refreshes the status automatically, for up to one hour. On failure the cause is distinguished: magnet problems (drive rejection, invalid link, no download source, content mismatch) allow clicking "Try another magnet", where Peach skips the failed magnets and takes the next one after checking all sources, and does not stop early at the first HD result; drive problems (configuration or login, quota, network, file not landed) require checking the drive in Peach first, then clicking "Retry adding to Peach library", and the retry still uses the original magnet. When there is no magnet to switch to, "No resource found" is shown. A network timeout offers only a status query, and you decide whether to retry after confirming the server's result.

The floating card's title bar can collapse details, and can also be minimized to a Peach logo ball at the bottom right. Clicking the ball expands it and queries existing tasks, and does not add again. The floating card is hidden while the settings panel is open and restored after it closes; the toggle transition follows the system's reduced-motion preference.

After "Codes on this page" are recognized, each code's Peach status is queried first, and only then is the add operation opened. Items already in the library, already ingested and tasks in progress are not counted in "Add all", while items not added and retryable items can still be selected; tasks in progress continue to refresh. A failed query shows "Not obtained", and "Recognize again" queries again. After returning, later codes are no longer queried, and tasks already submitted continue to be processed by Peach.

An add request only validates the local configuration and saves the queue; cloud drive capability probing and submission are executed in the background, and status queries do not wait for the remote submission. The script's single request limit is 60 seconds; a timeout does not mean the download failed, and does not add again automatically. The optional `download` field of the status endpoint projects only the task state, label, current stage `phase`, download progress, organizing state and update time; download progress comes from the background's latest drive reconciliation, and the overall stage comes from task milestones. On a connection error the last confirmed stage is kept; organizing that was not requested is shown as skipped.

The script writes request timeouts, connection failures, HTTP rejections and invalid responses to `POST /api/jav-browser/errors` with the dedicated token. A record contains only the time of occurrence, event identifier, script version, site identifier, product code, operation type, elapsed time and HTTP status, and no token, account, full source address, page body or raw exception. Each batch is at most 10 entries and 16 KiB, and the server accepts at most 20 entries per minute and deduplicates by event identifier; it writes only to the local `errors-*.log`, provided with the exported diagnostic package. The script manager buffers at most 20 entries for 7 days, and reports them back to the original Peach address with a one-minute rate limit when later requests succeed; a failed record does not retry the add, and does not generate errors recursively.

## Configuration Sources and Display Conditions

| Content | Source and display condition |
| --- | --- |
| Cloud drive accounts and their specific fields | Declared media sources; PikPak's login and directory fields are hidden when PikPak has not been added, and 115's directory and check prompts are hidden when 115 has not been added |
| CloudDrive2 configuration, proxy and mount help | Shown when a cloud drive media library exists; hidden when there are only local media libraries |
| Download channels, names and icons | Media library names, the source registry and the directory's cloud download capability; a removed media library leaves the selectable list |
| Default channel | A valid selected channel, otherwise the available candidates are offered; with no candidates the selection stays empty. When an enabled channel becomes invalid, a prompt asks to reconfigure |
| Script version, compatibility requirement and install entry | The bundled release manifest; the install entry points to the same-version artifact of the current Peach |
| Peach address and token | The settings page's current address and the user-generated pairing info; the script reads GM storage |
| Sites, mirrors and install matching | The same `jav-sites.json` build manifest |
| Product code and post-processing sources | Reuses the cataloging rules; post-processing uses the media source, and a specific download channel identifier is not taken as the source |

Cloud download capability queries are read-only, and results are cached for 30 seconds; changes to media paths, names, download settings or credentials invalidate it. Removing a channel does not clear existing accounts, pairing info or download tasks. Request timeouts, polling limits, protocol versions and field lengths are communication and validation constraints.

DMM / FANZA's `/av/content/?id=…` and the older digital and DVD detail paths, and MGS's `/product/product_detail/…/`, automatically hand the product number to Peach for recognition. For example, DMM's `1dandy00899` corresponds to `DANDY-899` and `h_086iqqq00026` to `IQQQ-026`; MGS's `104DANDY-851C` keeps the release prefix and the trailing letter. An explicit product number and the subtitle marker in the file name use their own contexts, and the separators of date-style codes are part of identity. The script supports KIRARI's `MKBD-S`/`MKD-S` and date-style codes with two- to four-digit serial numbers. Recognition and status queries never create download tasks.

## FAQ

| Symptom | What to do |
| --- | --- |
| No button | Check the domain, script enablement and the script manager's site access permission; open the work detail page, or select a code and use the script menu |
| Installed but not detected on the settings page | In Chrome's Tampermonkey extension details, turn on "Allow user scripts" or developer mode, allow access to the current Peach site, confirm the script is enabled and updated, then refresh the page and detect again; see the [Tampermonkey permission notes](https://www.tampermonkey.net/faq.php#Q209) |
| Code conflict | Check the address, title and detail fields; the script does not submit multiple pages with inconsistent identities |
| Cannot connect to Peach | Check the Peach address, certificate trust, service online state and the script manager's connection permission |
| Token invalid or no permission | Update the token in the local download channel and reconfigure the script; a reader cannot receive adds |
| Download channel not configured | Enable it after saving the cloud drive account and target directory |
| No resource found | Search manually or choose another version in Peach's cloud download popup, after which you can add again actively |
| Cloud download or ingest failed | Check the specific reason in Peach's task center, and retry following the existing cloud download flow |

The source address stores the page protocol, host, path, and the work-identifying parameters allowed by the manifest, for example `v` for JavLibrary and `id` for FANZA. Other query parameters, fragments, cookies, and site player addresses are not submitted to Peach. Directly playing external online sources is a later feature; see the [public roadmap](https://github.com/orgs/peach-mitao/projects/7).

## Verification Scope

A temporary ledger and a simulated cloud drive complete server-side regression; the full install script connects to a real temporary backend through a simulated GM bridge, covering joint desktop and 390×844 acceptance of DMM and MGS product numbers, maker codes and trailing letters. Chromium pages with a simulated GM API additionally cover special codes, SPA page switches, identity conflicts, HTTP errors and request retries. Joint acceptance of the real Tampermonkey extension install, current MissAV/Jable pages and real cloud drive downloads was not obtained.

## Artifact Sync

The script settings, the floating card and the script manager menu all offer "Check for updates". A matching page can check independently even if no code is recognized or pairing has not been done; a visible page checks the trusted script release metadata automatically once a day. The public check carries no Peach dedicated token, does not execute returned content, and a failure can be retried manually later.

When a script version update is found, an install entry is offered. After the script updates, pages already open keep the current operation and prompt a refresh; the first time updating from an old script lacking the version listener, the page needs to be refreshed once. Peach's download channel shows the minimum compatible version and the current release version separately, and a compatible old script also shows an update prompt.

The single source of truth for script and site rules is in the independent repository. Peach's `web/integrations/` keeps the full install script, the site snapshot and the `jav-userscript-release.json` source record from the same release; the install endpoint returns that script directly, and the server independently validates source addresses with the local snapshot. At runtime no remote rules or code are downloaded.

To update, build, verify, and commit in the userscript repository, export to the Peach isolated worktree through its `scripts/export-peach.mjs`, then deliver through this project's tests and integration entry. The provenance record contains the upstream commit, version, and SHA256; for the sync method see the [independent repository notes](https://github.com/peach-mitao/peach-userscript#发布与-peach-同步).
