# Running and Configuration

This page covers what you need to know when running Peach on your own computer: how to do first-time setup, where the configuration page is, how to reach it from other devices, how to install FFmpeg, and which operations really delete files.

If you use the Windows test build, read [Windows Test Build](TESTING_DESKTOP.md) first; if you run from source, follow the installation steps below. The "Maintainer Reference" section at the end is for people who develop, package and release from source; regular users can skip it.

## Running from Source (Windows, macOS)

You need Git and [uv](https://docs.astral.sh/uv/getting-started/installation/). The minimum Python version is 3.14, the project pins the runtime version through `.python-version`, and uv downloads any missing interpreter automatically.

In PowerShell 7 (Windows) or zsh (macOS), run these in order:

1. Clone the repository: `git clone https://github.com/peach-mitao/peach.git peach-app`.
2. Enter the project directory: `cd peach-app`. All later commands run in this directory.

Install dependencies on Windows: `uv sync --locked --python 3.14`. Then start the tray: `& .\.venv\Scripts\peach-tray.exe`.

Install dependencies on macOS: `uv sync --locked --python 3.14 --extra macos`. Then start the tray: `./.venv/bin/peach-tray`.

The tray opens the first-run setup page in your browser. Running from source does not require downloading the Windows installer.

## Standalone macOS Test Build

On macOS, install the build dependencies in the project directory:

```sh
MACOSX_DEPLOYMENT_TARGET=11.0 uv sync --locked --extra build --extra macos
```

Build the app and DMG containing Python, the pages, migrations and resources:

```sh
./.venv/bin/python -X utf8 scripts/build_macos_standalone.py
```

Artifacts are in `dist/macos.noindex/<arch>/`; the build copy avoids Spotlight indexing. For day-to-day use, keep only the app in Applications, and unmount the mounted installer image after testing. Apple Silicon uses `arm64` and Intel uses `x86_64`; build each with the Python and dependencies of the matching architecture. `--target-arch` sets the target explicitly, and a mismatched interpreter architecture stops the build. The two packages do not mix native extensions and are not merged into a universal2 build. The Intel build can be done on an Intel Mac or in an x86_64 Python environment under Rosetta; Rosetta acceptance cannot replace acceptance on real Intel hardware and older macOS versions.

The source-development shell `build_macos_app.py` outputs to `dist/macos-source.noindex/` by default and depends on the local venv and a LaunchAgent; do not install it as a standalone app.

The build script reads the system-version floor of the bundled Mach-O files, fills it into `LSMinimumSystemVersion`, and re-signs. The build interpreter must also support the target system; a Homebrew Python may require the build machine's system version. If locally compiled extensions such as `watchdog` hit an old cache, rebuild with the deployment target and the matching `ARCHFLAGS` via `uv sync --locked --extra build --extra macos --no-cache --reinstall-package watchdog --no-binary-package watchdog`, then check the `minimum_macos` reported by the artifact.

Open the DMG for the matching architecture, drag `Peach.app` into Applications, then open the app to complete first-run setup. The menu bar offers entries to open the page, restart and quit; data is stored by default in `~/Library/Application Support/Peach/peach-data`, and `PEACH_DATA_ROOT` can point to a separate directory.

The installer image uses a light peach background, fixes the drag layout with Peach on the left and Applications on the right, hides the toolbar and sidebar, and provides both standard and Retina background resolutions. The license is kept in the app at `Contents/Resources/LICENSE`, and the installer window shows only the two entries.

A version tag triggers the Release workflow, which builds on native Apple Silicon and Intel runners separately; a clean runner then downloads and mounts the DMG to verify the signature, the architecture and standalone running. Only after both DMGs and the Windows installer all pass are they uploaded together to a GitHub pre-release, with a unified SHA-256 manifest. Running the workflow manually only validates candidate artifacts and does not create a Release; pushing ordinary commits does not trigger installer builds. For release checks see [Testing and Dependencies](TESTING.md#checks-for-every-release); always tag with `scripts/release_tag.py`.

At the top level, the Mac and Windows trays show only a short status and the number of alerts; expand the status submenu to see services and media sources row by row. Long addresses and paths are abbreviated, and "View full configuration" in the submenu keeps the full settings entry; once an alert disappears, it is updated with the next health-check round.

Single-machine setup turns ledger replication off by default and needs no Windows, SMB, LaunchAgent or system port forwarding. Each computer keeps its own data; a shared library is still configured according to [two-computer replication](#replication-between-two-computers) below, and offline edits cannot be merged automatically. Existing data directories are not imported automatically.

This build path uses a local ad-hoc signature; Developer ID signing and Apple notarization are not completed, so it is not published as a signed release. The DMG distributes only the app and installs no system service; a PKG will be evaluated when centralized deployment of system components is needed. Transcoding and frame extraction use the local FFmpeg; this test build does not bundle media tools, cloudflared or a macOS online-update installer.

## First Run and the Settings File

There are two ways to open Peach for the first time, with the same result:

- **Tray (recommended)**: after you run the tray program, the browser opens the first-run setup page.
- **Terminal**: run `peach init` and complete the setup through the Q&A.

Either way creates the data directory, prepares the database, generates the local certificate and the access token, and writes the settings file.

### First-Run Setup Page

The first-run setup page asks:

1. Media directories: you can add several; the "Choose folder" button next to the field opens the system folder picker.
2. Who can access: "Only this computer" or "Devices on the same LAN".
3. Port.
4. Access password (optional): if left blank, any device that can reach Peach gets in without logging in.
5. Whether to scan immediately.

After submitting you enter Peach, and an installation guide appears at the lower right, listing library, collection credentials, browser history, follow, follow credentials and review. Each item can be skipped (and undone shortly afterwards); once all are completed or skipped, the guide disappears automatically. Guide progress is saved only in the current browser. If you chose to import browser history, the taste page opens first.

The first-run setup page is served by a temporary service that listens only on the local loopback address (default port 8900); after a successful submission the tray switches to the regular service automatically, with no tray restart. For its port, return codes and the switching process, see "Internals of First-Run Setup" under "Maintainer Reference".

### Terminal `peach init`

Running `peach init` directly in a terminal (with no arguments) starts the Q&A:

1. Data directory.
2. One or more local media directories: after you answer one it asks "Add another", and pressing Enter ends it. Duplicate folders or folders that contain each other are rejected.
3. Who can access (only this computer / devices on the same LAN).
4. Port.
5. LAN access address.

Pressing Enter on any question uses the default. Three invalid inputs in a row exit without writing any file. After answering, it asks "Scan <directory> now?" (default yes), and finally prints the next steps and a scan summary.

The terminal Q&A can only add local folders. Add 115 and PikPak cloud drives on the first-run setup page or the configuration page; see "CloudDrive Configuration" below.

When given any argument, with `--no-input`, or when not run in a terminal, `peach init` asks no questions and generates directly from defaults and arguments such as `--data-root`, `--host`, `--port`, `--mdns-name` and `--mount local=/mnt/media`. The settings file written this way carries three example sources: `local`, `115` and `pikpak`. When a database already exists it is not rebuilt, and the command suggests `--from-existing` instead.

### Where the Settings File Lives

The settings file is always `<Peach data directory>/config.toml`. The Peach data directory (where Peach keeps its data) is found in this order:

1. The environment variable `PEACH_DATA_ROOT`.
2. `peach-data/` next to the project directory (searching up to four levels up, so the main checkout, worktrees and the packaged `dist/Peach` all find the same one).
3. If neither exists, it is "not configured".

The Windows test build uses `%LOCALAPPDATA%\Peach\peach-data` by default. When first-run setup selects a different data directory, `state/data-root.txt` in the default data directory records the chosen absolute path; the tray, child services and later launches all read settings along this record. This file stores only the local path; the Peach database and media stay in their own directories. An unreadable record, an invalid path or a loop causes an error.

If the first-run setup page appears even though a configuration exists, choose "Use existing data directory" and enter the original data directory, for example `E:\Peach\peach-data`. This directory must contain a valid `config.toml` and a Peach database; after a successful connection, ordinary launches keep using that location too. A custom directory with no location record cannot be discovered automatically on upgrade and must be selected once; you do not need to re-initialize or delete data.

For deployments that already entered the library through `--data-root`, the new version installed by online update records the directory in use into the empty default data directory, after which ordinary launch works. When the default data directory already has a configuration, a Peach database or a directory record, its choice is kept.

The restore endpoint `POST /api/setup/restore` accepts `{"data_root":"absolute path"}` and reuses the first-run local and same-origin guards. On success it returns the completion-page fields plus `restored=true`; on failure it returns 400 with the reason in `errors.data_root`.

For the same setting, precedence is: environment variable > settings file > built-in default.

### When the Settings File Has Problems

- **A settings file already exists**: `peach init` refuses to run and returns 3; adding `--force` overwrites it. Before overwriting it copies `config.toml.bak`, which is the only file recording this computer's configuration.
- **The settings file has a syntax error**: `peach serve`, `peach migrate` and `peach status` refuse to run and report the file path and the offending line, rather than quietly running with defaults and ending up in a wrong state. `peach init --force` still works then and is the only self-rescue entry.
- **No settings file**: `peach serve` starts as usual, the page prompts you to run `peach init` first, and `/healthz` returns `configured=false`.
- **Drive-letter keys written directly under `[media]`** (for example `R = '...'`): `peach serve` refuses to start and tells you to rewrite them as `[media.mounts]`.

### Scanning a Directory

`peach scan <source ID> [root directory]` registers the files in a directory into the database. It only adds records and refreshes size and modification time; it does not change manually confirmed information and deletes no records.

When a directory has an assigned purpose and "New files follow this rule" is on, newly registered files are associated by the nearest rule level; existing conflicts are kept, see [Directory Browsing](DIRECTORY_BROWSING.md).

- Without a root directory, it scans all the directories this source declares in `[media.locations]`.
- With a root directory, it must be inside a declared directory (inside the mount point on macOS), otherwise it is rejected, because the registered path could not be converted back to a local path.
- The scan skips `#recycle` and NAS system directories whose names start with `@`; ordinary files with the same name prefix are still handled by file type.

### Long-Task Checkpoint Resume

Background tasks save the task identifier, processing range, completed set and counts locally. When the service restarts it reattaches to the same task record and continues the unfinished part. Tasks the user paused stay paused; an explicit stop cancels resumption. Failed, rate-limited or unobtained results keep the existing retry and cooldown rules and are not skipped as successful items.

| Task | Unit saved and resumed |
| --- | --- |
| Scan files | Source roots, directories still to traverse, and committed file batches within directories; file counts, byte counts and subtitle pairing data are kept |
| Read companion data, collect metadata and previews | Local evidence already read, candidates already written to disk, and previews already registered; finished videos and problem records are kept |
| Fetch follow updates, backfill history | A fixed set of sources, successful sources and committed page numbers; a from-scratch backfill task reuses the page numbers saved this time |
| New-release subscription, want-list data, discovery-card data | Completed sources or codes, saved data and covers; discovery cards also keep the consumed request and traffic budget |
| Follow-up tasks, post-download processing | The existing persistent queue and the same task record; batch data and samples save the original code set and successful items |
| Timeline thumbnails, media repair | Verified artifacts, file-identity-bound check conclusions and cumulative counts |
| Link check, follow-source lookup, taste reading | Completed links, search rows or browser data; results and processing range are kept |
| File organizing and rollback | A fixed organizing plan, the per-item log of the same batch, and pending rollback records |
| Resource check, resource cleanup, link cleanup | Completed sources, processed records and cleanup receipts; the current state is still reviewed before deletion |
| amane bridge environment preparation | The `uv` cache and installed dependencies; an interrupted install command re-checks the lock file |

A checkpoint is committed after the result is saved successfully. On interruption, file batches, source pages, single videos or write transactions not yet committed can be redone, while committed results continue to be reused. An external request itself cannot be resumed from a half response. A damaged checkpoint or an unobtained result file is reported as a problem; progress that was never saved cannot be recovered retroactively.

After a command-line scan is interrupted, run it again with the same source and root directory to pick up the checkpoint; finishing a full scan clears the checkpoint, and the next scan re-checks the directory. `scripts/scrape_codes.py` resumes the same batch by default, and the candidate CSV is kept together with the adjacent `.resume.json`; when `--out` is specified, the original output path is reused. Batch arguments must be identical, and `--no-resume` starts a new batch. Other probing, montage and cover batch jobs keep selecting their to-do items from saved measurements, artifacts or success logs.

### Media Source Status

The service reads the first entry of each mount directory in the background; an empty readable directory also counts as online. Healthy sources are probed every 600 seconds and failing sources every 60 seconds; after a first failure it re-checks one second later, and a fault is confirmed only after two consecutive failures. The messages respectively say no permission to read, directory does not exist, target is not a directory, or directory read failed.

`/api/sources` returns a periodic snapshot and the probe time; while probing or when a probe has not returned, `online` is `null` and the page keeps the source's availability state. "Refresh status" in the fault panel reads the latest snapshot, and the background re-probes at the intervals above. Actual playback and scanning still check the directory immediately. The `media_mounts` summary of `/healthz` and the tray show source names and fault reasons; a mount fault does not trigger a normal service restart. There are at most four probe threads, and a directory with an unreturned probe is not probed again.

### Mapping Windows Paths on macOS: `[media.mounts]`

Add a media directory on first-run setup or the configuration page, entering a directory this device can read, for example `/Volumes/Media` on macOS, `/mnt/media` on Linux, or `/media` inside a Docker container. Peach saves the path configuration the database needs automatically. To move an existing directory, change the media directory on this line; Peach keeps the internal path mapping.

The field descriptions below are for editing the configuration by hand or for mapping existing media directories across multiple Peach installs.

In the Peach database, every video's `path` field uses Windows format, for example `R:\media\x`, even when the service runs on macOS or Linux. This value is a string in the database; when this machine has no matching drive letter, Peach needs the two settings below to find the actual file. For Docker configuration see [Docker Deployment](DOCKER.md#configuration-file-and-paths).

- Both use the same media source key, for example `local`, `115`.
- `[media.locations] local = 'R:\media'` means that file paths in the database start with `R:\media`; it does not require this directory to exist on macOS or Linux.
- `[media.mounts] local = '/Volumes/<volume name>/media'` is the directory actually read on this machine. `R:\media\x` in the database is converted to `/Volumes/<volume name>/media/x`.
- When a source has several directories, write both as arrays; the number and order of directories must be the same.

Windows uses the paths in `[media.locations]` directly, and `[media.mounts]` can be left empty. macOS and Linux still use both settings; if the matching actual directory is missing, that source shows as offline, media records are kept, but files cannot be read. Changing the values of `[media.locations]` to POSIX paths does not update existing video records and cannot replace this conversion. If a media source key is wrong or written as a drive letter, the configuration is rejected.

For temporary diagnosis you can override with an environment variable, for example `PEACH_MEDIA_MOUNTS=local=/mnt/res,115=/mnt/115`.

### Replication Between Two Computers

`[replication] enabled` decides whether this computer takes part in database replication between two computers; the default is `false`. With only one computer, keep it off; then every feature is writable and `ledger_sync` in `/healthz` shows `disabled`. For behavior once enabled, see "Synchronization Between Two Machines" under "Maintainer Reference".

### Writing a Settings File on a Machine Already Running

For a computer that is already running but has no settings file yet, use `peach init --from-existing`:

- It writes only the settings file, builds no database, and touches none of the files already in `peach-data/`.
- It writes the currently effective configuration into the settings file. Items it cannot infer (the LAN writer address, the SMB host and account) are left blank and printed one by one; supply them all at once in the same command with arguments such as `--writer-origin`, `--smb-host` and `--smb-user`, rather than hand-editing afterwards.
- The replication switch written by `--from-existing` is `true`, while a fresh `init` writes `false`.
- When `init --from-existing --force` rewrites an unreadable settings file, it writes the built-in defaults plus environment variables and does not inherit the old file's content. The command prints this first; a custom mDNS name, writer address and SMB information from the old file must be given again in the same command.

If you do not run `--from-existing`, built-in defaults are used, and at least these change: the mDNS name, the macOS source mount table, the reader's writer address and proxy, the SMB host and account, and the replication switch (off by default). The Peach data directory, database path, Windows drive letters and listening port stay the same.

### Configuration Page

The Peach configuration page is at `/configuration`. Reach it from the admin menu or "Peach Configuration" in the settings dialog, or "Configure Peach" in the tray menu. The page is divided into five groups: "Library and Ingestion", "Sources and Subscriptions", "Download Channels", "Network and Access", and "App and Maintenance". Source credentials, work-metadata sites and resource-search indexers are under "Sources and Subscriptions", which also leads to collection sources and login status; the local port is under "Network and Access".

- It can be changed only on the computer running Peach and only when the service is managed by the tray. The admin menu on other devices has no such entry, and the settings say which computer to go to.
- This computer can open the configuration page with the configured `.local` name, the loopback address or the IP the service is bound to. Peach decides whether a connection is local by the IPs at both ends.
- "Choose folder" opens the system folder picker (Windows Explorer, macOS Finder) on the computer running Peach, again open to the local machine only.
- After saving, the tray reloads the settings and the local service restarts.
- A source-deployed tray service keeps a fixed HTTPS address and port; the Windows test build can change its port on the configuration page.

Media repair is on the "Data Management" page, and subscription sources are on the "Subscription Sources" tab of the "Follow Management" page (for the division of work see [ADR-0050](adr/0050-settings-modal-holds-values-pages-hold-work.md)).

Common local settings:

- "General → Launch at Login": start Peach after login, start silently (only the tray icon shows after login and the web page is not opened), and create a desktop shortcut.
- "Network and Access → Peach Proxy": choose the system proxy, a direct connection, or a custom address. When a collection source selects "Peach Proxy" it shares this setting, and selecting "Direct connection" bypasses the proxy. After saving, new collection runs use the new setting.

### CloudDrive Configuration

115 and PikPak cloud drives are mounted as local drives by CloudDrive2, and Peach reads them as ordinary folders. Mount steps, source IDs, path mapping on macOS, cache and read settings, and automatic ingestion of new files are all in [CloudDrive Configuration and Tuning](CLOUDDRIVE.md). "CloudDrive cache suggestions" in the configuration page is its summary.

### Uninstall

Uninstall the Windows test build from Peach Configuration "App and Maintenance → Uninstall Peach":

1. First choose the scope. By default data is kept; ticking "Full uninstall" also deletes settings, the local database, watch records, credentials and caches.
2. After confirmation, Peach exits the tray, shuts down its own services, ends leftover processes still running in the program directory, then removes the launch-at-login entry and the whole program directory. Deletion is retried three times and an error is reported only if it still fails.

What is kept:

- The original media files, in every case.
- A manually copied `config.toml.bak` and other files Peach does not recognize.
- Full uninstall deletes the settings file, the settings backups Peach generated itself (`config.previous.toml`, and backups of the form `config.toml.<note>-<date>-<time>`), and the listed database, cache, credential and other directories. If the data directory is elsewhere, uses a directory link, or overlaps the media directory, you need to check and clean up manually.

When deletion fails because a file is in use, the dialog gives the log location: `peach-uninstall.log` in the temp directory, which records the reason and the failing path.

A source install cannot be uninstalled automatically: first turn off launch-at-login on the configuration page and quit the tray, then delete the paths the page lists by hand. The Git working tree is not deleted automatically.

### Health Check

`/healthz` confirms whether the service is running:

- With no parameters it reports that the service is alive and provides per-item status for the database, migrations, configuration, tools, mounts and access security; mount anomalies are warnings and the service still returns 200.
- `/healthz?ready=1` also checks the configuration, pages, database queries and database migration validation, and returns 503 when not ready.
- In the response, `configured` says whether this computer has a settings file, and `ledger_sync` says this computer's role in two-machine replication (`writer`, `reader` or `disabled`).

A source-deployed tray (Windows, and macOS with TLS configured) runs an HTTP service and an HTTPS service at the same time. The HTTP one only redirects the browser to the HTTPS address, so a healthy `/healthz` on the HTTP port only shows that it itself is alive.

The status line of the tray menu lists each service one by one, for example `HTTP OK · HTTPS error (status code 503)`, with the most recent failure reason appended when abnormal.

### Local Diagnostics

The tray's "Export diagnostic report" and the system diagnostics page's "Download diagnostic report" provide a redacted ZIP. After the tray export completes you can open the folder, open the file or close the window; when startup fails, the dialog gives the location of the automatically saved report. The report contains the version, system information, the tail of selected logs and system checks that could be obtained; configuration files, credentials, the Peach database and media do not enter the report. URLs, local paths, IPs, emails and common credential fields in logs are redacted, but you should still check the report before sending it.

The standalone package supports `Peach.exe --diagnostic-report`, which saves a report without starting the service; when specifying a target file, put it after this argument, and an existing file is not overwritten. A source environment can get the same kind of report with `python -m peach.support_bundle`. By default reports and error logs are saved in the data directory's `logs`, and when that directory is not writable, `Peach/logs` under the system temp directory is used.

Errors from the main thread, background threads, unhandled coroutines and the local browser are written to `errors-<PID>.log`; native crash stacks that Python can capture go to `crash-<PID>.log`. Windows standalone launch-failure records include the failing API name and the system error code. When the operating system blocks the program before Python starts, the process is killed directly, or the disk is entirely unwritable, the program itself may be unable to leave evidence; keep the system prompt and the full dialog.

The local download endpoint is `/api/diagnostics/bundle` and must pass the existing login check; the browser-error endpoint `/api/diagnostics/client-error` accepts only local same-origin requests, supports first-run and the login page, records at most 20 times per minute, and at most 16 KiB per request.

Run `peach doctor` on the computer where Peach is installed to review, item by item, the version, configuration, Peach database migrations, tool paths, data directory writability, media mounts, ports and the most recent task failure. `peach doctor --json` outputs the same redacted report, for use by the local diagnostics API `/api/diagnostics`.

Peach Configuration "App and Maintenance → Runtime Info" opens `/diagnostics`. Library health provides counts of recognition failures, metadata-fetch failures, missing covers and missing durations; expand to open the works and copy the current list. Each category returns at most 500 items and keeps the total; works with no code use their number. Failures come from the problem records of recent processing tasks; paused and no-match records are not counted as failures; when a record is damaged it shows as unobtained.

minnano-av and javdb use records that were actually parsed, identity-checked and written to the database, and show the last success time and cooldown deadline. With success evidence within one day and not in cooldown they show as normal; old records keep their time and the current state is unobtained. Opening diagnostics does not trigger any source fetch.

The standalone package diagnoses the configured port by default; a source environment with complete TLS material diagnoses the tray's HTTPS entry (Windows 443, macOS 8443). When starting the service directly, `--host` and `--port` can specify the actual listening address.

`failed` means attention is needed and the command exits with 1; `warning` or `unknown` keeps the specific reason and exits with 0. Diagnostics only create and clean up a temporary write probe in the data directory and run no migration or repair. When a port is in use, only the occupied state is reported, and process ownership must be checked separately. The public `/healthz` provides only status and reason; full tool paths appear only in local diagnostics.

## Access Address, Password and Certificates

### Which Address to Open

- **Windows test build**: with "Only this computer" selected, open `http://127.0.0.1:<port>`; with "Devices on the same LAN" selected, other devices open `http://<mdns_name>.local:<port>`. The test build uses HTTP, unencrypted.
- **Source deployment**: the tray serves HTTP on port 80 and HTTPS on port 443 of this machine's LAN IPv4 address; open `https://<mdns_name>.local` in the browser. The LAN address is chosen automatically by default and can also be set with a startup argument or `PEACH_LAN_ADDRESS`.

`<mdns_name>` is the value of `[server].mdns_name` in the settings file, and Peach announces this name on the LAN.

### Access Password and Login

- The access password is set on the first-run setup page or in the configuration page under "Network and Access → Access Password", and can be left blank. If blank, any device that can reach Peach gets in without logging in. Terminal `peach init` sets no access password by default.
- If an existing deployment has no access-password setting, the login page keeps using the access token. A logged-in local browser can set its own password on the configuration page, or explicitly turn off the login requirement.
- Changing the password requires the current password; turning it off also requires ticking a confirmation of the access scope. Changing or turning off takes effect immediately, logins in other browsers become invalid, and the current device stays logged in for 30 days.
- Ticking "Stay signed in" on the login page keeps you logged in for 30 days; unticked, it is valid only for this browser session, at most 12 hours. Refreshing the page does not extend the validity.
- The password is stored on this machine as a scrypt hash in `<Peach data directory>/secrets/access.json`, not in the database and not synchronized.

For the full description of the security model see [Security Notes](../SECURITY.md).

### Access Token

Scripts and API calls use the access token, placed in the `X-Token` request header.

- A service started on a non-loopback address must have an access token, which is generated automatically at first initialization.
- `peach token` shows the token (the file is `<Peach data directory>/secrets/auth-token`), and `peach token --rotate` replaces it with a new one; restart the service after replacing.
- Replacing the token invalidates the old token and sessions logged in with it; browsers logged in with the access password are unaffected. Changing the access password does not affect the access token either.
- Login exchanges the token for an HttpOnly cookie through the `/login` form. The `?t=<token>` query parameter is only for one-off use, because it leaves the token in access logs and browsing history.

### Making Other Devices Trust the HTTPS Certificate

A source deployment issues the HTTPS certificate with a locally self-signed CA (a `.local` name cannot use a public certificate such as Let's Encrypt). The certificate and private key are both in `<Peach data directory>/secrets/tls/` on this machine.

1. Copy `peach-local-ca.crt` to the device that needs access. Copy only this one file; never send out any private key.
2. Install and trust it on the device. On iPhone/iPad, after installing the profile, you also need to enable full trust under "Settings → General → About → Certificate Trust Settings".
3. Use `openssl x509 -noout -fingerprint` to check that the certificate fingerprint on the device matches the one on this machine.

Each computer running Peach has its own independent CA. If a different computer starts serving, the device needs that computer's `peach-local-ca.crt` installed.

On Windows the TLS private key has permission inheritance disabled and is readable only by the account actually running the service, SYSTEM and Administrators.

### macOS Cannot Open the `.local` Address

When opening a `.local` address in the browser returns 503 while connecting directly from the terminal works, a system proxy has usually intercepted the request: the proxy cannot resolve mDNS names.

In the macOS system proxy exception list, add `*.local`, `localhost`, `127.0.0.1` and this machine's LAN subnet:

- Set: `networksetup -setproxybypassdomains`
- Check: `ExceptionsList` in the output of `scutil --proxy`

After a proxy client resets the system proxy, this list may be cleared and you need to add it again.

## Access from the Internet: Cloudflare Public Entry

"Cloudflare Public Entry" under "Network and Access" on the configuration page is off by default. **You must set an access password before you can start it**; without a password it is stopped and kept off.

### Temporary Link

1. After setting the access password, click "Start public entry".
2. The page shows a random address `https://<id>.trycloudflare.com` generated by cloudflared; use it to access. `https://try.cloudflare.com/` is only an introduction page.
3. After you stop the public entry or quit Peach, this address stops working; the next start gives a new address.

Notes:

- This is only for temporary preview; it is not a stable domain and has no team account or Cloudflare Access layer.
- The random address is stored only in the state file in the data directory. Do not save it in bookmarks, documents or public configuration.
- cloudflared needs outbound access to TCP/UDP port `7844`. When it is blocked by a firewall or proxy, the page shows a failure; a displayed random address does not mean the connection has succeeded.
- The Windows test build ships a SHA-256-verified `cloudflared.exe`. Running from source requires installing the official cloudflared yourself, and Peach looks for it in the order of `tunnel.binary` in the settings file, the environment variable `PEACH_CLOUDFLARED`, then PATH.
- In a source deployment, Cloudflare connects to the actual local HTTPS service and validates with the project CA and the mDNS name; the test build connects to the local loopback HTTP port.

### Named Tunnel (Source Deployment Only)

A named tunnel has a fixed address that does not change after restart. The Windows test build does not support this method, and the configuration page does not show this block.

1. In Cloudflare Zero Trust under Networks → Tunnels, create a new Cloudflared tunnel and copy its tunnel token.
2. Add a Public hostname to the tunnel, using your own domain as the hostname. For Service enter this machine's HTTPS address: for a source deployment `https://<LAN IP>:443` (on macOS, use the actual TLS port). Then, under Additional settings, set Origin Server Name to `<mdns_name>.local` and put the project CA in the CA Pool; otherwise the locally self-signed certificate fails validation.
3. On the configuration page under "Cloudflare Public Entry", switch to "Named tunnel", fill in the public hostname and the tunnel token, and click "Save configuration". The token is written only to `[tunnel] token` in the settings file; the page never shows it again, and it does not appear in the database, logs or `/healthz`. When replacing the token, enter the new one; leaving it blank means keep the saved one.
4. It is recommended to configure an identity policy for this hostname in Cloudflare Access. This layer is configured entirely in the Cloudflare dashboard; Peach neither reads nor manages it. Peach's own access password is still a precondition for starting the tunnel, so both gates exist at once.

The whole site refuses search-engine indexing: every response carries `X-Robots-Tag: noindex, nofollow, noarchive`, `/robots.txt` is readable without login and gives `Disallow: /`, and the main page and login page additionally carry `<meta name="robots">`. This cannot be turned off.

## Playback and Transcoding

Formats the browser can play directly (for example common MP4) need no extra software. The Windows installer and portable builds ship FFmpeg, ffprobe and untrunc, which repairs damaged MP4 indexes. A source deployment must supply these tools itself; when they are missing, "Runtime Info" on the configuration page gives a download entry. First-run setup also gives a download entry when OpenSSL is missing.

Peach looks for FFmpeg and ffprobe in this order:

1. Explicitly set environment variables.
2. `tools/ffmpeg/bin` under the standalone program directory.
3. `tools/ffmpeg/bin` under the data directory.
4. PATH.

untrunc is looked up in the same order, with the directory `tools/untrunc`. The standalone program prefers the version verified with the package; an environment variable can still specify the tool path explicitly.

During playback:

- For formats the browser does not support, such as AVI and MKV, Peach converts them to a compatible MP4, caches it, then plays it, and **does not modify the original file**. Before the first playback the file is probed first, for at most 20 seconds.
- Streams that can be kept are kept: H.264 (`yuv420p`/`yuvj420p`) video is not re-encoded, AAC audio is copied directly, and other audio is converted to AAC. When video must be re-encoded, Windows prefers an NVIDIA GPU (`scale_cuda` + NVENC) and falls back to the CPU (`libx264 veryfast`) only on failure; macOS uses the CPU directly.
- At most 2 transcodes or probes run at once, each for at most 1 hour, and closing the playback page cancels the corresponding task.
- 115 and PikPak videos play through `B:` and `A:` mounted by CloudDrive2. Whether they can play is determined by actually opening a known video in Peach.

## Resource Sync and Deletion

Please read carefully which operations delete files and which do not before acting.

### Resource Sync

After organizing a cloud-drive directory in CloudDrive2 or a file manager, reconcile manually once under "Manage → Resource Sync". Peach never quietly deletes any record in the background.

- Reconciliation has two steps: first "Check files", then "Clean up stale entries". The check only reads the disk and changes nothing; for each source it reports records whose files are no longer on disk, empty folders and unreadable directories, and also reports caches that are no longer referenced.
- Reconciliation checks the configured local and cloud-drive sources. Offline sources are skipped entirely; when a directory cannot be read, its records are kept and it is reported in the result.
- When the library is very large the scan takes a long time, so it runs as a background task and reports progress source by source.
- **After you confirm cleanup, records whose files are no longer on disk fall into two tiers.** In-library entries carrying personal records (likes, ratings, watch later, playlists, watch history, look for a better version) are marked "Vanished" and kept, and when a new version enters the library these records are reattached by location, code, or "creator + filename + duration"; **the rest are permanently deleted, including those in the trash, bypassing the trash and unrecoverable.** The check report counts the two tiers separately, and the confirmation box states which tier cannot be undone (ADR-0087). Before deletion the file is re-confirmed missing one by one; records whose files have reappeared are kept and listed in the result.
- The orphan-record list on the Data Management page lists all vanished entries and the personal records they carry; you can manually attach one to a file, or delete it for good; permanent deletion cannot be undone.
- Cleanup trusts only the result of the most recent check: if another check ran afterwards, or the service restarted, you must check again.
- Empty folders are deleted bottom-up, and each source's root directory is kept; empty directories on CloudDrive whose contents cannot be listed also count as empty.
- Reconciliation cleans up only generated files that no library entry references any more: snapshots, posters, photo thumbnails, transcode caches, playback segments, per-file generated avatars, and shared code covers. Avatars and logos of performers and other profiles, collection evidence and CSVs used for review are not within the scope of automatic cleanup.
- Only caches inside the data directory where the current database lives are cleaned; anything outside that scope is skipped.
- Each cleanup leaves a "Resource sync cleanup" record in the task center.
- "Sync delete" in the entry details checks only this one directory: among the missing records, those carrying personal records are marked vanished and the rest are moved to the trash; both tiers can be undone within 8 seconds.

### Trash

- Entries moved to the trash can be restored there with "Restore".
- **"Delete permanently" on selected items in the trash, or "Empty trash", permanently deletes the media files and the matching library records and cannot be undone.**

### Junk Files

The "Junk files" review covers file types of all sources `local`, `115` and `pikpak`; online URLs are not included. Windows `.url` shortcuts are handed straight to manual judgment.

- Files judged to be junk are only moved to the trash and not deleted directly.
- Clicking "Not junk" records the judgment for this file (it can be undone), and it appears in the "Excluded" view. This judgment applies only to this one file and does not whitelist a whole domain or source.

The maintenance script `scripts/trash_junk.py` generates a candidate list by default; permanent deletion uses `--purge --review-csv`,
and each row of the review CSV contains `id`, `path`, `size`, `decision`, `confidence`, `why`.
Only rows with `decision=delete` and confidence of at least 0.95 enter deletion, and execution also needs `--apply --backup`.
The score only decides review order and cannot by itself decide permanent deletion; if a file's path or size changes, the whole batch is rejected.
Installation attachments, web scripts and promotional clips whose duration was not probed also enter review; subtitles and NFO files do not enter the junk queue.
Plot words are not evidence of advertising; torrents, work galleries and creator profiles must be judged by file content.

### Cache Directory

`generated/avatar-thumbs` holds reduced avatars (long side 640), generated by each computer itself, not synchronized and needing no backup. Deleting the whole directory only makes the next opening of the index page slower, and when missing the page shows the original image. After importing a batch of new avatars, you can run `scripts/build_entity_thumbs.py` to generate them in advance.

## Maintainer Reference

The following is for people who develop, package, release and maintain two machines from source.

### Internals of First-Run Setup

- When the tray starts it reads the settings file once, and `tray.needs_setup()` decides: only **no `config.toml` and no database** counts as needing first-run setup. `PeachConfig.configured` is not used: the tray's single-instance lock creates `state/` under the Peach data directory as soon as it starts, so one failed start could make the next one misjudge as configured; conversely, an old deployment with no `config.toml` whose database is still there must not be dragged into first-run setup.
- When setup is needed, the tray does not build the normal service specs (on a brand-new machine `build_service_specs()` would raise `FileNotFoundError` because TLS material is missing). Instead it starts `peach serve --setup --host 127.0.0.1 --port <port from settings, default 8900> --no-mdns --no-ledger-sync`, then opens the browser at `http://127.0.0.1:<port>/`. This bootstrap service has no TLS and the token is forced empty; the security boundary is the loopback bind address.
- The home page is the first-run setup form: `GET /` returns a thin shell (`routes_pages.setup_shell()`), the form is drawn by the page bundle `/dist/peach-pages.js`, and both the questions and the submission go through the two JSON endpoints below. The completion-state entry carries `/?onboarding=1`; if importing browser history was chosen, it goes first to `/taste?onboarding=1`. The installation guide reads each item's actual state through a dedicated status endpoint.
- The two endpoints share a guard (`routes_pages._setup_guard`): already configured gives 404, a non-loopback origin 403, and a standalone-package address-bar hostname that is not a loopback spelling 403; submission additionally checks Origin (403) and whether the settings file already exists (409). Both are under `/api/`, and errors are always returned as JSON.
  - `GET /api/setup/questions` gives the data needed to draw the form: `questions` lists, in the order of `onboarding.questions()`, each question's `key`, `label`, `help` (list of help lines), `default`, `required`, `advanced` (whether it folds into "Advanced settings"), `input` (`text`, `number`, `choice`, `folders`), `prefix`, `suffix`; `host` additionally carries `options` ordered as on the page, and `mdns_name` additionally carries `visible_when: {"host": "2"}`; there are also `media_sources`, `media_source_default`, `media_root` (the path-mapping cell on non-Windows, `null` on Windows), `cloud` (hint, help link and the missing mount-software `dependencies`), `windows`, `standalone`, and the initial values of three switches `access_enabled` (on if the host default is LAN), `scan_now`, `history_guide`.
  - `POST /api/setup` takes fields of the same names: `media_dir` is a list of `{path, location, root}` rows (`location` defaults to `local`), `access_enabled`, `scan_now`, `history_guide` are booleans, and `mdns_name` may be omitted when "Only this computer" is chosen. A 400 returns `{"error", "errors"}`: `errors` is keyed by question key, the access password is under `access_password`, and `media_dir` corresponds one-to-one with the submitted rows, with an empty string for rows without errors; when the whole form is invalid (more than 100 rows) there is only one message and the length does not equal the row count. An `apply` failure returns 400 with the error under `data_root`. A 200 returns `url`, `scan_requested`, `history_guide`, `standalone`, `redirect` (the entry address for the standalone package, `null` otherwise; the redirect delay is decided by the frontend) and the runtime info `facts` (same as `facts` of `/api/configuration`).
- Creating directories (`database`, `generated`, `sources`, `state`, `secrets`, `logs`, `tools`, `review`), migrating the database, generating the CA and token, and writing the settings file are all done by `onboarding.apply()`; the CLI and the setup page call the same function and differ only in output. The Q&A questions, defaults and file-writing logic are in `src/peach/onboarding.py`.
- The web page does not show a database path input, and `media_root` is `null`. The `root` in a `media_dir` row may be omitted or left blank, and the server fills it in from the media directory; when an existing row is submitted with its original `root`, it is kept. When a media directory uniquely matches an existing configuration, the original prefix is reused; a new directory gets an automatically generated prefix and uses the directory name as the library name.
- On Windows, the `[media.locations] local` written by `peach init` is directly those directories and `[media.mounts]` is empty; on macOS the configured directory is `R:\media` (`R:\media2` from the second on...), and the local directories are written in the same order into `[media.mounts] local`. Replication, writer mirror and SMB are never asked and stay off or blank.
- Switching is handled by `tray.SetupGate`, shared by the Windows tray and the macOS menu bar. It hangs off the health poll (10 seconds on Windows, 5 seconds on macOS) and calls `settings_file.load_config()` again every round; when setup is no longer needed, it stops the bootstrap service, builds the normal specs for the new Peach data directory and starts them, without restarting the tray process itself.
- The standalone test build serves HTTP on a high port according to the settings: local mode binds `127.0.0.1` and does not publish mDNS; LAN mode binds `0.0.0.0` and publishes `<mdns_name>.local:<port>`; opening the page from the tray and health checks always go through loopback. A source deployment builds the HTTP redirect and HTTPS entry with `build_service_specs(tls_dir=..., mdns_hostname=...)`, and waits for the next round if TLS material is incomplete. The mDNS name is passed into the spec here and the import-time value is not read.
- The first scan does not run inside the bootstrap service, because that process is stopped at switch time. Ticking "Scan now" in the form only writes a one-time marker `<Peach data directory>/state/first-scan.request` (content is the source ID); after the tray finishes switching it reads and deletes it, and runs `peach scan <source>` in a child process, with output in `<Peach data directory>/logs/tray-scan.out.log`. Ticking scan when saving on the configuration page also goes through this marker.
- The configuration page's data goes through `/api/configuration`; on save it first copies the old file to `config.previous.toml`, then writes and leaves a reload marker for the tray to pick up. The folder picker goes through `/api/pick-folder`.
- The wheel installs `web`, `migrations` and `resources` into `peach/_resources`. `scripts/smoke_wheel.py` runs outside the repository with an interpreter that has the wheel installed; CI's consumer job only downloads artifacts and does not check out the source. Tests use only a temporary Peach data directory.
- Per-Monitor V2 DPI must be enabled before Win32 windows are created; normal operation shows no modal MessageBox, the update check runs on a background thread, and feedback uses pystray's native non-modal notifications.

### Desktop Entry and Release

- The everyday Windows entry is the single `Peach.lnk` in the current user's Startup folder, pointing to `dist\Peach\Peach.exe` inside the project. The desktop shortcut and launch-at-login are toggled in the "Launch at Login" group of the configuration page and written by `src/peach/desktop_startup.py`; `scripts/manage_tray_startup.ps1` is only for troubleshooting release packages.
- `dist/Peach/Peach.exe` is the local packaged entry, not a standalone distribution you can copy away: only the tray itself is packaged, and the service process is still run by the project venv's `peach.exe` (`_peach_executable()` searches upward from the exe's location for `.venv\Scripts\peach.exe`); do not describe it as a portable build.
- The everyday macOS entry is the LaunchAgent `io.github.longmeidao.peach.tray`, managed by `python scripts/install_macos_agent.py` (`install`/`status`/`uninstall`). The `.app` shell's bundle ID is `io.github.longmeidao.peach.app`, and the 80/443 forwarding is in the pf anchor `io.github.longmeidao.peach`. All three identifiers come from `src/peach/appid.py`; the shell literals in `setup_macos_port80.sh` are kept consistent by `tests/test_tray.py`. The build entry of the macOS source menu bar is `build_macos_app.py`.
- An identifier change takes effect only after the commands below are run on the Mac; the legacy LaunchAgent and pf anchor are cleaned up by `install` itself:

```bash
launchctl bootout gui/$(id -u)/gg.lmd.peach.tray || true
python scripts/install_macos_agent.py install
sudo sh scripts/setup_macos_port80.sh install
python scripts/install_macos_agent.py status
launchctl print gui/$(id -u)/io.github.longmeidao.peach.tray | grep -E '^\s+pid'
launchctl print gui/$(id -u)/gg.lmd.peach.tray            # expect "Could not find service"
sudo pfctl -a io.github.longmeidao.peach -s nat
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' http://peach.local/healthz
curl -s --noproxy '*' -o /dev/null -w '%{http_code}\n' https://peach.local/healthz
```

  Four acceptance checks: the menu bar has only one Peach icon and `status` reports "loaded" (the literal output is in Chinese); the pid from `launchctl print` is that menu-bar process; `pfctl -s nat` lists two rdr rules, 80 → 8900 and 443 → 8443; both `/healthz` return 200. Replace `peach.local` with the value of this machine's `[server].mdns_name`.

- The build entry is `scripts/build_windows.ps1`: it first generates the square logo and multi-size `.ico` with `scripts/generate_brand_assets.py`, then builds the single `dist/Peach/Peach.exe`. Run with no arguments it is the tray; `serve`/`migrate` run the CLI.
- The public test build is built by `.github/workflows/release.yml`: `build_windows.ps1 -Standalone` produces the complete Windows program directory with PyInstaller onedir, and after compression a consumer job that does not check out the source runs `scripts/smoke_desktop.py`. The smoke test completes first-run setup, restarts with `0.0.0.0`, reads `/healthz` from the local LAN address, confirms mDNS is wired up, and logs in with the access password. A mismatch between the `v<__version__>` tag and the version fails; only after artifact acceptance passes is the GitHub pre-release created with SHA256 attached. `workflow_dispatch` only produces and validates artifacts.
- The installer is compiled by `build_windows.ps1 -Installer` on the same program directory by invoking Inno Setup 6's `ISCC` on `scripts/installer/peach.iss`, producing `dist/Peach-<version>-windows-x64-setup.exe`; `ISCC` is searched in the order `PEACH_ISCC`, `PATH`, and two default install locations. It installs by default to the current user's `%LOCALAPPDATA%\Programs\Peach`, and you can choose a standalone, writable program directory that does not overlap the data directory. Before an in-place install, the bundled temporary runtime runs `--installer-prepare`, which tells collection tasks to save progress and pause; then it stops the tray, overwrites the program and migrates the existing Peach database in the actual data directory, and finally releases the installation guard. New collection requests during installation wait; after installation completes or is cancelled, a still-running Peach resumes, and an exited one recovers at next start. Uninstall goes through `--installer-uninstall`, which revokes the startup entry and the desktop icon and keeps data. The conventions and `AppId` are in `src/peach/desktop_installer.py`.
- The standalone build puts the pinned-version official `cloudflared-windows-amd64.exe` next to `Peach.exe` and verifies it with the SHA-256 in `scripts/cloudflared-windows.json`. Run `scripts/fetch_cloudflared.ps1` before building, or give `build_windows.ps1 -CloudflaredPath` a file with the same hash. A source run does not carry this binary.
- Every package carries a build identity: before calling PyInstaller, `build_windows.ps1` writes `{commit, version, built_at}` into `build/windows/build-info.json`, then places it at the package root with `--add-data`, shared by the local tray and the standalone test build. When the build machine has no git or the source is not a checkout, `commit` is `null` and the build proceeds as usual. `peach.buildinfo.frozen_build()` reads it only when `sys.frozen`; a missing or malformed file returns `None`, and the tray starts as usual, only treating its own identity as unobtained.
- PyInstaller resources sit directly under `sys._MEIPASS`, without the `src/` level of the source tree; after packaging, `migrate`, web and brand resources must all be resolved from here, and `parents[2]` must not be hard-coded in `config.py`.
- The local tray discovers by itself that it is "older than the checkout" and rebuilds. The criterion is the gap between the build commit and the local checkout, not the gap to GitHub: on this machine commits land locally first and are then pushed to the remote, so "behind the remote" can never hold.
  - `VersionManager.build_age()` counts how far behind with `rev-list --count <build commit>..HEAD`, and the version menu shows `master@<HEAD> · tray build <build commit>, N commits behind`. When it cannot be counted (identity unobtained, commit not in this checkout's history) it is treated as stale and the rebuild scope narrows to `src/peach/`.
  - "Sync development progress" takes the local rebuild path under `ahead`/`current`/`error`/`unconfigured`; the health poll additionally reads the local HEAD every 5 minutes to trigger automatically, tries automatically only once per HEAD, and does not trigger when first-run setup is not finished.
  - The rebuild flow is: full tests → staged build → check the packaged migration resources → backup → replace. If any step fails, only a notification is sent, the old tray and services keep running, the notification says which step it stuck at, and the log is at `<Peach data directory>/logs/windows-source-sync.log`.
  - The standalone test build and a source-run tray do not take this path: the test build uses the online update on the configuration page, and the source entry says the source is already up to date.
- For the release flow (versioning, changelog, tagging and when to release) see "Versions, Updates and Self-Restart".

#### Refreshing the Source Runtime: `restart_windows_tray.py`

The Windows tray runs independently of the terminal and agent that started it. Startup, restart and abnormal recovery take their parent identity from the current session's Windows desktop process; closing Codex, Claude or the terminal does not stop the tray. The entry first read-only probes the single-instance lock of the current Peach data directory; if a tray already exists, it opens the page or exits silently according to the startup arguments. On first launch handed over from a Job, the parent process does not hold the single-instance lock, and the new tray starts the child services after acquiring the lock. The Peach data directory, source path and startup arguments stay consistent; when the desktop process cannot be obtained or Windows refuses creation, it errors clearly and does not continue running inside the launcher's private Job.

The desktop process and tray may keep the system-managed shared Job. The child process gets its Job inheritance from the desktop process designated by `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`, and independence is accepted by surviving after the launcher's private Job is closed. The one-time handover marker is consumed by the tray entry and applies to source, directory-package and onefile bootstrap processes; child services do not inherit the marker. When creation is refused it retries explicit breakaway only once, and the error keeps the API and the system error code. Exiting the Windows session and the system Job itself ending belong to the system lifecycle.

Standalone launch forensics record the caller, the desktop and child PIDs and the Job membership state, the raw limit values of the calling process's direct Job and the recognized flags. Failure context enters the redacted diagnostic report; Job handle chains and ownership that cannot be obtained are clearly marked unobtained, the Job owner is not inferred, and administrator rights are not required to enumerate system handles.

After acquiring the single-instance lock, the Windows tray starts an independent watcher. The watcher waits for the tray to exit using a Win32 process handle and checks the process creation time to avoid PID reuse; an unexpected exit (including a zero exit code with no registered exit intent) is recovered with delays of 2, 5 and 10 seconds, at most 3 times within 5 minutes. Recovery keeps the current Peach data directory and source entry and starts in silent mode. Handover completes once the new tray's watcher is ready; import or startup failures count against the same retry budget. A manually started new instance cancels the old instance's recovery that has not yet run. After the limit is reached it stays stopped, and you must check the logs and start it manually.

Menu exit, update, uninstall, external stop messages and system session end all register an exit intent and stop the watcher. A normal restart is brought up by the restart script, and the watcher takes no part in dependency sync or package swap. Each line of `tray-lifecycle.log` is one JSON record containing UTC time, instance identifier, tray and watcher PIDs, launching parent process, exit intent, external-message sender PID, abnormal exit code and recovery result. When a process is force-killed, the recorded actor is `unknown`, and you cannot tell from the exit code who closed it.

The watcher and tray share the current user's privileges and register no scheduled task or Windows service. When the watcher itself is killed, the whole process tree is killed, or the system shuts down, automatic recovery is not possible. A watcher startup failure is written to `tray.log`; when the log is not writable, exit and service-cleanup behavior is kept. macOS keeps the LaunchAgent startup behavior.

Use this when the code is already in the checkout and only the running tray needs to reload, without swapping the binary.

- Do not click the tray with Computer Use. `python scripts/restart_windows_tray.py` finds the pystray hidden window by the exact EXE path, sends a normal stop message, waits for the tray to shut down its child services itself, then starts a new tray silently and confirms the new tray has taken over both services.
- If a unique window cannot be found or exit times out, it refuses to proceed, and never force-kills then starts another. After the old tray exits, it waits until the child services under it have fully exited before starting the new tray. When the port is held by a `serve` process the old tray does not own, it refuses before starting work and reports their PIDs, because swapping the tray cannot replace them.
- The tray puts the child services it launches into a kill-on-close Job: when the tray is force-killed by something like `Stop-Process -Force`, the whole `serve` subtree exits with it, leaving no orphan process holding 80/443 and running old code. If a round of the tray's health check finds a port unresponsive, it re-launches; a service seen healthy but not its own is only logged as a warning and not taken over. Startups and re-launches are logged at `<Peach data directory>/logs/tray.log`.
- `--swap-from <staged package>` swaps the binary after the old tray exits and before the new tray starts, the only moment in the whole package swap when the target file is not held by a process. To swap the production binary use `deploy_windows_tray.py`; do not call it on its own.
- When the packaged tray's window cannot be found, the command automatically switches to the source tray: `find_source_tray_windows()` recognizes the source tray by the same window class name plus "command line contains `peach.tray`", and `restart_source_tray()` relaunches with the same command line (including `--show`/Peach data directory) after the tray exits, without swapping the package or making a backup. `--source` explicitly skips the packaged entry.
- Restart prepares the runtime environment automatically (ADR-0091), with no need to fix dependencies or run migrations by hand:
  - **Task gate**: before starting, it read-only checks the rows still running in this machine's `task_run`. Follow-up tasks (`followup_key` non-empty) and scheduled tasks resume after restart and are let through; tasks that cannot resume, such as manual and CLI ones, make the restart refuse while running, and `--force` overrides. Rows whose process is dead are only listed and do not block.
  - **Dependencies**: a source deployment (with `uv.lock` and `.venv`, and uv found) runs `uv sync --locked --all-extras --inexact --no-install-project` after the old tray and child services have fully exited and before the new tray starts, and does nothing when already consistent. If another process is still using the project venv before the sync (for example an 8099 debug serve), it refuses the restart and reports the PID: on Windows a loaded `.pyd` cannot be replaced.
  - **Migrations**: before the first child-service launch, the new tray runs `peach migrate upgrade --yes` on the local writer's Peach database, and `migrate` itself first leaves `ledger.pre-migrate-<time>.db`. No migration is done for readers, when the Peach database does not exist, or when first-run setup is not finished.
  - **Readiness**: after the child services come up, the tray asks `/healthz?ready=1`, and not-ready items such as a Peach database schema inconsistent with migrations are written to the log and the startup notification.
  - The new tray writes these steps into `<Peach data directory>/state/runtime-prepare.json`, and the command reads it back to report together. stdout is one line of JSON, and when `ok` is false the exit code is 1: rejection by the gate, dependency sync failure, migration failure or services not ready all count.
- The tray menu's "Restart service": when dependencies are consistent it restarts only the child services, migrating while they are stopped; when dependencies are inconsistent with `uv.lock` it launches `restart_windows_tray.py --source --force` detached to restart the whole tray, with output appended to `<Peach data directory>/logs/tray-restart.out.log`. When the script refuses or does not start, the notification states the reason and it falls back to restarting only the child services.

#### Editing Text in a Source Environment

Add `?edit` to the page address to turn on text editing: hover over text to see the edit range, click text to edit in place, press Enter or click elsewhere to save, and Esc to cancel.
Button and link text use an input box placed at the text position. "Pause editing" lets you keep operating the page.
Static copy is written back to the chosen source in `web/index.html` or `frontend/src`; when the same text appears in several places you must choose the source.
Before saving, the source file digest is verified, and backups are in `build/copy-editor/backups/`. React copy takes effect in normal mode after the frontend is rebuilt.
The change log can be exported from the toolbar. Library data and dynamic counts in the UI have no static copy source and cannot be used to modify the Peach database.

The tool scripts are in `scripts/dev/` and are not distributed as web assets; frozen release packages provide no copy-editing endpoint.
On the demo site, `?edit` saves only a copy draft in the current browser, which can be exported, and ordinary visits do not apply the draft.

#### Replacing the Production Tray Binary: `deploy_windows_tray.py`

Use this when the EXE of the production entry itself must be replaced with a newly built one. Replacing the production entry is a release action that needs manual confirmation beforehand, and the script does not stand in for that confirmation.

- Run `python scripts/deploy_windows_tray.py` in the main checkout with the project venv's Python. Steps: refuse a dirty checkout → build by HEAD commit in `<Peach data directory>/state/source-sync-build/<commit>/` → have the staged package itself run `migrate status` once → stop the old tray, replace `dist/Peach/Peach.exe` in place (the old file is kept as `Peach.pre-source-sync-<time>.exe`), start the new tray → read `/healthz` on the production HTTPS port with strict validation against the project CA.
- Acceptance depends on who answers. A standalone distribution is answered by the frozen process; check that `build_commit` equals the packaged commit. A source deployment is answered by a project-venv process (`_peach_executable()` in `src/peach/tray.py` picks the child-service entry), with `build_commit` None; then check that the sha256 of the production entry file equals the staged package.
- Neither acceptance looks at the version number: the version number advances one notch per release, and one version number covers many builds.
- The result is printed as one JSON, and `step` says where it stopped. When the new tray cannot start or cannot take over both services, it automatically swaps back the backup and reopens the old tray. `--staged <path>` reuses an already built package and skips the build.
- Do not build `dist/Peach/` in place: the running tray holds that file, and PyInstaller clearing the directory hits WinError 5.

### Synchronization Between Two Machines

- "Sync development progress" goes through GitHub and "Sync database" goes through an SMB share; the two cannot be merged into one button: neither side being unreachable should hold up the other. The HTTP/HTTPS services only observe the role and do not replicate automatically.
- When `replication.enabled` is on: a sync watcher is built, SMB is probed and mounted, two Ledger menu items appear in the tray, and follow credentials are written to the shared replica. When off, none of this happens, `ledger_sync` in `/healthz` is `disabled`, and all write endpoints are open.
- Manual sync first uses `sync.resolve()` to judge read-only whether this run would really copy. `offline` is not a conclusion: after a macOS reboot the SMB share does not remount automatically, and the tray remounts once according to `SHARED_SMB_HOST`/`SHARED_SMB_SHARE`/`SHARED_SMB_USER` before judging, reporting only if it truly cannot mount.
- Remounting uses `osascript`'s `mount volume`, and the keychain must be checked first: without a matching entry NetFS raises no error but pops up an authentication dialog and waits forever, so the background operation both hangs until timeout and shows a password box in front of the user. Keychain entries are stored by hostname, and the same machine's IP and mDNS name are two different entries.
- If it is still `offline` after remounting, and for `conflict`/`in-sync`, the result is reported directly without stopping services; only when copying is certain are the services it created stopped, copying with the SQLite backup API plus atomic replacement, and finally services are restored.
- "Take over database writes on this machine" takes the shortcut only when the shared disk is unreachable: a shared source on macOS smbfs must be read as an immutable closed snapshot, a shared target cannot be opened by SQLite as a transactional connection, and takeover is refused when the health port does not belong to this tray.
- Generated images are synchronized one-way with Syncthing; it is a separate channel from the database and from Git, and none replaces another: Windows send-only, Mac receive-only, five folders `snapshots`/`posters`/`avatars`/`logos`/`covers`. The Mac-side root is under `peach-data/artifacts/` (do not make a symlink pointing to it the sync directory), and Trash Can versions are kept for 30 days.
- `.stignore` is not synchronized across devices, so put one in each directory on both ends. The direction is fixed, and images generated on the Mac never return to Windows.
- The access tokens of the two machines must match: when the reader fetches the writer's review results it sends its own token.
- The local CAs of the two machines are independent, and `secrets` is not shared by design.
- The broadcast names of the two machines are each machine's `server.mdns_name` and must differ; read `mdns` from `/healthz` to check the actual name. `PEACH_MDNS_NAME` is only a temporary override.

### Versions, Updates and Self-Restart

- The version number is defined only in `src/peach/__init__.py::__version__`, using pre-1.0 SemVer. The Git commit is the build identity, the `vX.Y.Z` tag is the release point, and pushing it to GitHub triggers the Release workflow (see "Desktop Entry and Release").
- The version number is changed only at release time, one notch per release, so every `X.Y.Z` has a downloadable artifact.
- **Versioning**: run `python scripts/release_tag.py --bump auto --apply` on a clean master main checkout. It decides the level from the range between the previous version tag and HEAD (`bump_part_for()`: a subject starting with `feat`, a breaking marker `!`, or a new file under `migrations/` pushes minor, otherwise patch; 1.0 requires a manual `--bump major` and a separate ADR, see ADR-0012), writes `__version__`, and fixes the unreleased section of `CHANGELOG.md` to this version number. If the range changed only docs, skills and tests it refuses outright, because the package built would be identical to the previous tag. `--bump` only writes files without committing, and prints the finalized section for people to check; without `--apply` it prints only the plan.
- **Release**: after confirmation run `python scripts/release_tag.py --ship --apply`, which finishes the remaining four steps in one go: commit `src/peach/__init__.py` and `CHANGELOG.md` (message `chore(release): 版本 <new version>`), push master, poll this commit's Test workflow every 30 seconds, and once green create and push the annotated tag. It waits at most 30 minutes by default; change that with `--timeout`. Without `--apply` it prints only the steps.
- Before acting, `--ship` checks: not on master, the changelog lacks this section, the tag is already taken, or the working tree has changes beyond the two versioning files; if any holds it refuses (the tag points to the release commit, and whatever is sneaked in is released). If Test ends non-green it stops immediately, and the tag has not been created yet.
- If it stops midway (network down, CI still running, timeout), run the same command again: every step checks current state first, what is committed is not committed again, what is pushed is not pushed again, and the tag is never created unless Test is green.
- To tag separately use `python scripts/release_tag.py`: by default it only checks that local and GitHub master agree, that this commit's latest Test is all green, that `CHANGELOG.md` has a section for this version, and that the tag does not exist; only with `--apply` does it create the annotated tag and push only that tag. It applies when the release commit has been pushed and only the tag is missing. The changelog section is a hard requirement; if missing, draft it first with `--bump`. Version tags are not overwritten; for the next version change `__version__` first. When a push failure leaves a local tag, confirm ownership first and handle it manually, never force-push. The Release workflow additionally checks that the tag's commit is in master history and that Test on the same commit passed, then builds, validates artifacts and creates the pre-release. Tagging means a public pre-release, not replacing the local production entry.
- After a confirmed release commit has been pushed, if master keeps advancing, use `python scripts/release_tag.py --release-sha <full commit SHA>` to check the release plan for the fixed commit, and after confirming the output add `--apply` to tag. This mode reads the version and changelog from the selected commit and, before creating the tag, re-checks mainline membership, the latest green Test on the same commit and tag availability; it pushes only the tag and leaves the current master alone. It cannot be combined with `--bump`, `--ship` or `--verify-sha`.
- **When to release**: `scripts/agent_worktree.py integrate` does not change the version number; it only reports the current value and outputs a `release` field (`due()` in `scripts/changelog.py`). When `due` is true, propose a release, with the reason in `why`. The cadence is once a week, earlier when enough entries accumulate, and breaking changes and security fixes do not wait for the cycle (`DUE_DAYS = 7`, `DUE_ENTRIES = 10`). Only user-visible change entries are counted, not commits. `DUE_ENTRIES` is a conservative starting point in the absence of samples; `due()` reports the actual entry count and grouping each time, to be calibrated after several real releases.
- **End-of-session reminder**: `scripts/release_due.py --hook-event` hangs on the `Stop` hook of Claude's `.claude/settings.json` and Codex's `.codex/hooks.json` (the convention is the same on both sides: stdin takes JSON, stdout returns `systemMessage`, exit code 0). It outputs one sentence only when on the main checkout, on master, with a clean working tree, this master sha not yet asked about, and `due` true; in all other cases it prints nothing. The asked record is in `<Peach data directory>/state/release-due.json`, and it asks again only after master advances. For a manual look use `python scripts/release_due.py` with no arguments, which is read-only and does not change the record.
- The hook uses `uv run --no-project` to find the interpreter, and the same command works on both platforms. `--no-project` must not be dropped: `release_due.py` uses only the standard library; if uv recognizes the project, in a checkout that has `pyproject.toml` but no venv yet it creates an empty venv, which `scripts/test.ps1` then prefers, and tests cannot even import `filelock`. `tests/test_release_due.py` executes the command in the config verbatim and checks that no `.venv` appears in the working directory. `uv` must be on PATH; `winget install --id astral-sh.uv` is recommended, and do not pipe a remote script straight into a shell.
- "Check for updates" only fetches and compares; "Sync development progress" only does `merge --ff-only`, with no stash, no rebase and no `--force`: parallel worktrees and the main checkout share the same object store and reflog, and any history-rewriting operation affects other branches. When the working tree has changes or the two sides have diverged, it reports as is and hands it to a person. When local is not behind the remote or the remote cannot be reached, whether the packaged tray needs rebuilding is judged by build identity (see "Desktop Entry and Release"); this path does not block on a working tree with changes, because the build uses the code in the checkout.
- When a fast-forward involves `tray.py`/`menubar.py`/`versioning.py`/`certs.py`/`netwatch.py`/`config.py`/`pyproject.toml`, restarting only the child services is not enough, and the tray must restart itself with `launchctl kickstart -k`: first `stop_owned()` then kickstart, provided the pid launchd reports equals its own pid.

### Network and Service Details

- HTTP probes of local services must set `trust_env=False`: proxy clients set a system-level HTTP proxy that httpx reads by default through `urllib.getproxies()`, so a probe to `127.0.0.1` is sent into the proxy, which returns 503, and a live service is judged "not running". The implementation is in `peach.tray.ServiceManager.healthy`, guarded by `test_health_check_never_goes_through_a_proxy`, and newly written health checks must do the same.
- `peach serve` publishes a fixed mDNS hostname per platform, hard-codes no home IP in source, and keeps `Zeroconf()` listening on all eligible network cards. mDNS acceptance must include unit tests, runtime health, DNS-SD, hostname resolution and a real LAN client.
- FastAPI is the only web server; do not restore a parallel `http.server` or a dynamic legacy loader.
- Before switching services, check ports 80, 443 and 8900 and the actual process ownership.
- Long tasks may stop only the Python/FFmpeg process trees they own and whose command lines match; ending all FFmpeg on the machine is forbidden.
- FFmpeg resolution does not fall back to Stash's private directory. Transcoding is handled by `TranscodeService`, going through the same Range endpoint as ordinary playback; probing and every transcode are protected by a 2-slot concurrency gate, a 1-hour total limit and stream session cancellation.
- The visibility of the `B:`/`A:` drive letters of 115/PikPak differs across Windows tokens, and the final word is Peach's measured `/stream` result on a known work.

### Migrations, Backups and Ops Scripts

- Before a real migration, run in order: SQLite backup, asset/tag counts, `PRAGMA integrity_check`, migration version check, service smoke test. Applied and pending migrations are determined only by the output of `peach migrate status`.
- Applied migration files must not be modified, and any later change must add a new version. Rewriting an applied migration causes checksum drift, and the only fix is to replay from the pre-migration backup, compare differences one by one until they are 0, and then correct `schema_migration`.
- Database backups are retired automatically: `ledger.pre-*.db` is managed by `peach.ledger_backups`, keeping all of the three classes "latest 5", "within 24 hours" and "newer than `ledger.db`", and deleting the rest together with `-wal`/`-shm`. The Windows tray runs it automatically at every startup; when `scripts/prune_ledger_backups.py` is run by hand it only lists the plan by default and deletes only with `--apply`; it refuses to retire when the database `integrity_check` is not ok, exiting with 2. Each backup is over a hundred MB, so 5 days without pruning is 7 GB.
- `*.log` files in `<Peach data directory>/logs` are uniformly kept for half a year with no size limit (`peach.log_retention.sweep`, run by the tray before starting any child process): files not written for half a year are deleted whole; files still being written are segmented by calendar month, those last written in an earlier month are renamed to `<name>.until-<last write date>.log` and deleted after another half year. Child processes append stdout directly without going through `logging`, so handling is per file, not per line.
- Updates and packaging artifacts are retired automatically: at each startup the tray keeps only the 2 latest `dist/Peach/Peach.pre-source-sync-*.exe` backups, and deletes the staged builds in `<Peach data directory>/state/source-sync-build/` that do not belong to a pending-apply record (`WindowsUpdateInstaller.sweep_artifacts`); after success `build_windows.ps1` deletes the PyInstaller working directory `build/windows/app`; at each startup the single-file tray deletes leftover `_MEI*` extractions in `%TEMP%` that are over a day old and not its own (`sweep_onefile_extractions`; PyInstaller does not clean up by itself when the tray process is killed, at 40–80 MB each). Automatic cleanup recognizes only these naming patterns: the `Peach.exe` itself, directories placed by hand in `dist/`, `build/release-*` and `attic/` are never touched, and leftovers of manual builds you must delete yourself.
- The scope for deleting rebuildable caches is decided by the current database path: a production database can only clean caches under the same `peach-data`, a temporary database can only clean its temporary directory, and anything outside is skipped. Emptying the trash in tests must use a temporary Peach data directory; a missed configuration would delete real covers.
- Resource sync uses background jobs and reports progress per source, to keep the full-library sync scan from blocking requests; the same directory is enumerated only once, directory metadata concurrency is fixed at 8, the whole library is not rerun, and old results are not blindly trusted.
- Importing an ops script must have no file, network or database side effects. `scrape_codes.py` writes a resumable review CSV by default; `clean_names.py` previews first, `--apply` must be given together with `--backup <path>`, and integrity is verified on the spot once the backup is written (`peach.scripting.open_for_write`).
- The compilation criterion for follow-ups applies only to newly fetched candidates. After tightening the threshold, scan the existing stock with `scripts/prune_follow_compilations.py`: by default it only lists and writes a review CSV, `--apply` first backs up as `ledger.pre-follow-compilations-*.db` and then deletes, and entries already saved as assets are never touched. Old rows whose detail page was never probed have no credits, and the criterion cannot count them.
- Filenames are normalized only by the confirmed codes in the database, and codes are not re-guessed from filenames. A case-only change goes through a temporary name in the same directory; when de-advertised names collide, a suffix starting at `(2)` keeps both.
- `generated/cover-fetch-log.csv` is the evidence for source, size and result, and is not cleaned up together with images. When images are lost, use `scripts/fetch_jav_covers.py --restore-successes` to restore from the original URLs in the success records with atomic replacement; failed ones remain recorded as failures, and thumbnails are not substituted for covers.
- Cover candidates must be restricted to the current work's main cover node: a work page mixes in hundreds of related works, stills and performer avatars, and measuring every image URL on the whole page one by one is forbidden.
- The FC2CMADB article archive serves only as mirror evidence of the official product page: the title and the conservatively translated tags are written to the candidate CSV and enter `/review` together with the latest JAV metadata batch, not written to the database automatically. For the cover, replace the list's `w276` with a confirmed-existing `w1200`, then go through the decoding, width, disk and atomic-write checks of `fetch_jav_covers.py --fc2-only`, and log failures one by one.
- When approving official tags you must use `(asset_id, tag)` conflict-update for source and confidence: the unique constraint of `asset_tag` makes `INSERT OR IGNORE` keep the old source, so the value already exists but is not shown as "Official".
- "Not junk" writes a revocable per-asset `junk_file` review decision. In the junk judgment, evidence about promotional names, directories and creator locations is shared across types, and video additionally considers duration, size and a longer version with the same code.

### Frontend and Verification Standards

- Metadata from the database must not be interpolated into inline JavaScript event attributes: an apostrophe in a real studio name causes a Firefox syntax error directly.
- The frontend API wrapper must check the HTTP status before returning JSON: on a read-only conflict the write endpoint returns `409` and error JSON, and treating that as ordinary success clears the selection and reloads, so the user just sees the entry come back unchanged. Batch handling and detail feedback must keep the current selection and show the failure reason.
- Report verification results separately: static/unit/API, desktop browser, 390×844 phone, and whether the production service has been restarted.
