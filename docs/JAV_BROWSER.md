# Adding JAV from the Browser

On a supported site's video detail page, click "Add to Peach". Peach searches for magnets by code, automatically picks the main-feature resource that can be confirmed as belonging to that code under the existing quality ranking, and submits it to the default cloud drive. After the file lands, the existing cloud download flow registers it, fills in metadata, and organizes it.

## Preparation

- Run the ledger writer side of Peach.
- Configure a 115 (via CloudDrive2) or PikPak cloud download account, a target directory, and the matching mount and ingest paths. First complete one download through Peach's cloud download and confirm the file can be ingested. For configuration see [Resource Search](RESOURCE_SEARCH.md) and [CloudDrive2](CLOUDDRIVE.md).
- Install a userscript manager that supports the GM API in the browser; follow the [Tampermonkey official installation and browser notes](https://www.tampermonkey.net/).

The script is maintained independently in [peach-mitao/peach-userscript](https://github.com/peach-mitao/peach-userscript), covering online playback, databases and reference data, release and sales platforms, studio sites, uncensored release sites, and resource indexes. Each site's domain and detection method are in the [full site list](JAV_BROWSER_SITES.md). Mirror domains are registered separately and are not automatically treated as the same site based on similar names. User-facing installation, pairing, and site notes are centralized in the [Sleazy release page copy](JAV_USERSCRIPT_SLEAZY.md); the Peach settings page keeps only the install and pairing actions.

Auto-detected sites only read the main title and explicit code fields of a work detail page; when a field is missing or identities conflict, the selected-code method is used. Sites marked "Selected code" require selecting a complete code first, then choosing "Add selected code to Peach" from the script menu, and finally clicking the floating add button.

## Installation and Pairing

1. On the computer running Peach, open "Peach Settings → Download Channels → Add JAV from Browser".
2. Click "Install Peach userscript" to open the [Sleazy release page](https://sleazyfork.org/zh-CN/scripts/600821), then install through the script manager.
3. Choose the default download channel, click "Enable and generate token", and copy the dedicated token. The token is shown only once after generation; after leaving the page, regenerate it with "Update channel and token".
4. Open a registered site, choose "Configure Peach address and token" from the script manager menu, and enter the Peach address and dedicated token shown on the settings page. The target browser must trust Peach's HTTPS certificate; HTTP is allowed only for loopback addresses.
5. Allow the script manager to connect to your own Peach address. For remote devices, enter the Peach HTTPS address that device can reach.

The dedicated token only allows querying a work's add status and initiating JAV adds; the cloud drive account is still managed by Peach. Clicking "Turn off browser add" revokes the token and stops adds in the queue that have not yet been submitted; cloud downloads already submitted are cancelled from the activity page.

## Adding and Viewing Progress

1. Open a video detail page and click "Add to Peach".
2. The script shows queued, searching magnets, cloud download, or ingested status. Videos already in the library directly show "Already in library". An in-progress task for the same code is reused.
3. After the cloud download is submitted, check download and post-ingest progress on the Peach activity page.

The source site page can be closed during the search; the queue is stored by Peach, and Peach resumes unfinished searches after a restart. Adds with no resource found or that failed must be retried on the original site with "Retry add to Peach". A network timeout offers only a status query; decide whether to retry after confirming the server's result.

## FAQ

| Symptom | What to do |
| --- | --- |
| No button | Check the domain, that the script is enabled, and the script manager's site access permission; open a work detail page, or select a code and use the script menu |
| Code conflict | Check the address, title, and detail fields; the script does not submit multiple pages with inconsistent identities |
| Cannot connect to Peach | Check the Peach address, certificate trust, that the service is online, and the script manager's connection permission |
| Token invalid or no permission | Update the token in the local download channel and reconfigure the script; a reader cannot receive adds |
| Download channel not configured | Save the cloud drive account and target directory, then enable |
| No resource found | Search manually or pick another version in the Peach cloud download popover, then add again manually |
| Cloud download or ingest failed | Check the specific reason on the Peach activity page and retry through the existing cloud download flow |

The source address stores the page protocol, host, path, and the work-identifying parameters allowed by the manifest, for example `v` for JavLibrary and `id` for FANZA. Other query parameters, fragments, cookies, and site player addresses are not submitted to Peach. Directly playing external online sources is a later feature; see the [public roadmap](https://github.com/orgs/peach-mitao/projects/7).

## Verification Scope

Server-side regression was completed with a temporary ledger and a simulated cloud drive; a real Chromium page with a simulated GM API covered desktop, 390×844, SPA page switches, identity conflicts, code normalization, and request retries. A combined acceptance of the real Tampermonkey extension install, the current MissAV / Jable pages, and real cloud drive downloads was not obtained.

## Artifact Sync

The single maintenance source of the script and site rules is the independent repository. Peach's `web/integrations/` holds the complete install script, site snapshot, and `jav-userscript-release.json` provenance record from the same release; the install endpoint returns that script directly, and the server independently validates source addresses with the local snapshot. Remote rules or code are not downloaded at runtime.

To update, build, verify, and commit in the userscript repository, export to the Peach isolated worktree through its `scripts/export-peach.mjs`, then deliver through this project's tests and integration entry. The provenance record contains the upstream commit, version, and SHA256; for the sync method see the [independent repository notes](https://github.com/peach-mitao/peach-userscript#发布与-peach-同步).
