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

First install the pinned toolchain in the build directory; the example below is for Apple Silicon, and for Intel replace `arm64` with `x86_64`:

```sh
./.venv/bin/python -X utf8 scripts/setup_macos_media_tools.py --root "$PWD/build/macos-media-toolchain"
export PATH="$PWD/build/macos-media-toolchain/env/bin:$PATH"
./.venv/bin/python -X utf8 scripts/build_macos_media.py --tool ffmpeg --arch arm64 --output build/media-macos/arm64/ffmpeg
./.venv/bin/python -X utf8 scripts/build_macos_media.py --tool untrunc --arch arm64 --output build/media-macos/arm64/untrunc
./.venv/bin/python -X utf8 scripts/fetch_cloudflared_macos.py --arch arm64 --destination build/media-macos/arm64/cloudflared
```

Build the app and DMG containing Python, pages, migrations, resources and self-contained tools:

```sh
./.venv/bin/python -X utf8 scripts/build_macos_standalone.py
```

Artifacts are in `dist/macos.noindex/<arch>/`; the build copy avoids Spotlight indexing. For day-to-day use, keep only the app in Applications, and unmount the mounted installer image after testing. Apple Silicon uses `arm64` and Intel uses `x86_64`; build each with the Python and dependencies of the matching architecture. `--target-arch` sets the target explicitly, and a mismatched interpreter architecture stops the build. The two packages do not mix native extensions and are not merged into a universal2 build. The Intel build can be done on an Intel Mac or in an x86_64 Python environment under Rosetta; Rosetta acceptance cannot replace acceptance on real Intel hardware and older macOS versions.

The bundled tools and licenses are in `Contents/Resources/tools/ffmpeg/bin` and `Contents/Resources/tools/untrunc`, the face detection and matching models are in `Contents/Resources/tools/face-models`, and cloudflared is in `Contents/MacOS`. At build time `scripts/fetch_face_models.py` downloads the two models and licenses at a pinned commit and verifies each SHA-256, caching them in `build/face-models`. The tools are signed on their own first, then the whole app is signed, and the resource directory may hold the tool manifests and notes at the same time. They do not depend on Homebrew; FFmpeg, x264, dav1d and the FFmpeg libraries used for repair are statically linked, and dynamic dependencies are allowed only on macOS system libraries. `scripts/smoke_macos_media.py` uses synthetic H.264/AAC and AV1 samples under the system PATH to verify tool lookup, probing, frame extraction, transcoding, repair of a missing `moov`, and full decoding. This repair acceptance covers a reference sample with the same encoding, and does not mean arbitrary damaged media can be recovered.

For each architecture, `ffmpeg-macos-<arch>-corresponding-source.zip` and `untrunc-macos-<arch>-corresponding-source.zip` are generated together, and must be released with the same version as the DMG; the archives contain the complete upstream source, pinned hashes, licenses, build scripts, configuration and environment records. The build rejects tools that are missing, have a hash mismatch, an architecture mismatch or depend on the build machine's dynamic libraries. cloudflared is pinned to the official 2026.9.0, the archive SHA-256 takes the `digest` of the GitHub Release asset API, and the source is registered in `scripts/cloudflared-macos.json`; the old checksum in the release body is not used as the lock for these two macOS archives.

The source development shell `build_macos_app.py` outputs to `dist/macos-source.noindex/` by default, depends on the local venv and LaunchAgent, and must not be installed as a standalone app.

The build script reads the system-version floor of the bundled Mach-O files, fills it into `LSMinimumSystemVersion`, and re-signs. The build interpreter must also support the target system; a Homebrew Python may require the build machine's system version. If locally compiled extensions such as `watchdog` hit an old cache, rebuild with the deployment target and the matching `ARCHFLAGS` via `uv sync --locked --extra build --extra macos --no-cache --reinstall-package watchdog --no-binary-package watchdog`, then check the `minimum_macos` reported by the artifact.

Open the DMG for the matching architecture, drag `Peach.app` into Applications, then open the app to complete first-run setup. The menu bar offers entries to open the page, restart and quit; data is stored by default in `~/Library/Application Support/Peach/peach-data`, and `PEACH_DATA_ROOT` can point to a separate directory.

The test build is not notarized, and when downloaded from a browser or chat app it carries the quarantine attribute; newer macOS shows "Peach is damaged and can't be opened", and "Open Anyway" also does not appear under "Privacy & Security". After dragging it into Applications, run the command below in Terminal, then open the app:

```sh
sudo /usr/bin/xattr -rd com.apple.quarantine "/Applications/Peach.app"
```

When prompted for a password, enter this Mac's login password; no characters are shown on screen while typing. This command only removes Peach's quarantine mark; run it once more after installing a new version. The command writes the full path `/usr/bin/xattr`, avoiding the same-named command wrapped by Python; `sudo` covers the case where the app is not owned by the current user.

The first-run setup page appears only when there is no `config.toml` in the data directory. When Peach was installed on this Mac before, the app opens the home page directly with the existing settings; to set up again, quit Peach first, move the whole `peach-data` directory elsewhere, then open it.

The install image uses the APFS file system, keeping the Unicode file names and app extended attributes of signed resources. A light peach background fixes the drag layout with Peach on the left and Applications on the right, hides the toolbar and sidebar, and the background provides both standard and Retina resolutions. The license stays at `Contents/Resources/LICENSE` of the app, and the install window shows only the two entries.

A version commit triggers the Release rehearsal, building on native Apple Silicon and Intel runners separately, then a clean runner downloads and mounts the DMG to verify signature, architecture and standalone operation. The tag checks the successful rehearsal and digests of the same commit, and publishes the same accepted files. Only after both DMGs and the Windows installer all pass are they uploaded together to the GitHub prerelease, with a unified SHA-256 manifest generated. A manual workflow run only accepts candidate artifacts and creates no Release; pushing an ordinary commit does not trigger installer builds. A release starts with a read-only review and dependency checks, completes the recheck and freezes the inputs before heavy verification; integration, runtime verification and release cutting are carried out per [release checks](TESTING.md#checks-for-every-release), and tagging uniformly uses `scripts/release_tag.py`.

### GitLab Release and Download Backend

GitLab-compatible platforms use `.gitlab-ci.yml`. The single version entry supports `--gitlab-host` to specify the host, and the default entry uses GitHub. The mainline release criterion requires the latest push pipeline of the same commit to succeed and the Linux, Windows, macOS and wheel acceptance jobs to all succeed; tagging is refused when native system jobs are missing. The three platform acceptance runs on the mainline run only the changed domains and platform-sensitive cases ([ADR-0119](adr/0119-mainline-changed-scope-release-full-suite.md)). The mainline pipeline of a version commit `chore(release): version X` is also the release rehearsal: three-platform full runs, media tools, Windows and macOS builds, the Windows smoke test and the Docker image are all run through, just without publishing. `--ship` tags only after the rehearsal fully succeeds; the tag pipeline checks that the rehearsal of the same commit has passed, and only rebuilds and publishes ([ADR-0121](adr/0121-release-rehearsal-and-atomic-publication.md)). GitHub's `release.yml` uses the same criteria, so no flow changes are needed when moving back to GitHub. CLI transport reuses the official glab, and no access token is stored in the repository or command arguments.

The systems of platform shared runners are provided by the administrator. The registration page lists Windows and macOS, meaning runners on these systems can be connected; it cannot be taken to mean the platform provides the corresponding cloud hosts. Temporary native runners connect only to the protected mainline and version tags, use project-specific tags, and are stopped and unregistered after acceptance. The Mac's Intel build needs a real x86_64 Python and dependencies; when accepting through Rosetta on Apple Silicon, explicitly record that real Intel hardware was not covered.

When a Windows native runner checks out the project in a deep directory, Git needs `core.longpaths=true` enabled, for the checkout and cleanup stages to handle the npm cache. The setting can be limited to the runner's job environment, passed through `GIT_CONFIG_COUNT` and the matching `GIT_CONFIG_KEY_<index>` and `GIT_CONFIG_VALUE_<index>` entries; existing entries are appended by index. The host system's long-path switch and the Git setting are checked separately.

When keeping a Windows native runner resident with a scheduled task, the task setting's `Priority` takes `4`, for example `New-ScheduledTaskSettingsSet -Priority 4`; for an already registered task, read out the object, change `Settings.Priority` to `4`, then write it back with `Set-ScheduledTask -InputObject`. When omitted the default is `7`, and `gitlab-runner` and all job subprocesses run with BelowNormal CPU priority, Low I/O priority and memory priority level 2. The runner and the development session share this machine, and when another session runs a full test run, the vitest worker processes in the job, the service readiness probe after first-run setup and the shortcut COM calls cannot get CPU and disk and fail from waiting timeouts, and the full regression also exceeds the job time limit. The setting takes effect only for newly started processes: restart the task while no job is running, then check that the `gitlab-runner` process's priority class is `Normal`.

The scheduled task's "restart on failure" (`RestartCount`, `RestartInterval`) takes effect only when the task fails to start; after the `gitlab-runner` process exits on its own it is not brought back, and the mainline's Windows jobs just stay queued with nobody to pick them up. So the task's action is the entry script `run-runner.ps1` in the runner directory: it looks up this directory's `gitlab-runner.exe` by executable path, exits directly if it is already running, and starts it only if it is not, so the same token never runs two runners. The trigger keeps "At log on", plus a time trigger repeating every 5 minutes with no end time, with `MultipleInstances` set to `IgnoreNew`. After the runner exits it is brought back within 5 minutes at most.

The scheduled task uses `pythonw.exe` to call `scripts/run_gitlab_runner.py --root <runner directory>`, and the launcher runs the original `run-runner.ps1` through `CREATE_NO_WINDOW`. PowerShell's `-WindowStyle Hidden` cannot guarantee it does not trigger Windows Terminal hosting, so the background entry does not use a console program directly as the scheduled task action. The launcher log is saved in the runner directory's `runner-launcher.log`, and the runner output still uses `runner.log`.

Version tags must be protected. The rehearsal of a version commit completes three-platform regression, pinned-source media tools, the Windows full and split packages, the macOS dual-architecture DMGs, install-upgrade and image acceptance, then registers the candidate. The tag checks the same commit, the verification jobs and file digests, then publishes the accepted artifacts without rebuilding. `publish-release` uploads to R2 and creates the GitLab Release, `publish-docker` is ordered after its success and pushes the image with the same image ID; the rehearsal staging is finally reclaimed. When a publish job fails, retry the same job and the tag does not move. The project pipeline uses `PEACH_DOWNLOAD_BACKEND=both`, and the same artifacts are stored separately in R2 and the GitGud Generic Package Registry; job artifacts that expire are not used as permanent download addresses. A standalone deployment can explicitly choose the single backend `r2` or `gitgud`. For the candidate and publishing order see [ADR-0127](adr/0127-verified-release-artifact-promotion.md).

Linux publish jobs use the official uv Python 3.14 container and check the interpreter version before fetching artifact tools; source archives are extracted using the `data` filter of `tarfile`. CI's `.npm/` and `.uv-cache/` are generated caches and do not count as source worktree changes.

Windows install-overwrite and task-recovery acceptance is allowed on GitHub Actions and on the GitLab `smoke-windows` job on protected version tags or version-commit rehearsals; it refuses to run when the host already has a Peach installation registration. All program, ledger and task fixtures are placed in temporary directories, and after install and uninstall complete the registration cleanup is checked. The relative output path of `fetch_cloudflared.ps1` is resolved against PowerShell's current working location, and downloads must still pass the pinned SHA-256 check.

GitGud's Linux platform runner provides no Docker daemon, so the Docker image is built by the `docker-build` job on a Windows native runner, whose host must run Docker Desktop. The job checks the tag and version and accepts a temporary container with `smoke_docker.py`, with the image staying on the machine; in a rehearsal it is deleted once accepted. On a tag pipeline, `publish-docker` pushes the version tag and the `edge` tag only after `publish-release` succeeds, so `edge` only points to a fully released version. `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` go into protected and masked CI variables scoped to the `release` environment; the token grants only repository read and write. Login is written to a job-specific temporary `DOCKER_CONFIG`, logged out and deleted at the end, without touching the host user's Docker login.

Media tool sources can specify an HTTPS cache entry through `PEACH_SOURCE_CACHE_BASE`, locating files by `<SHA-256>/<archive name>`. Tag pipelines use the release bucket's `_sources/` prefix; before a maintainer fills the cache, the original SHA-256 of the lock file must be checked, and the cache likewise counts toward the bucket capacity budget. When downloading from the cache fails, the pinned upstream address is tried; a hash mismatch from any source is rejected immediately, and the manifest cannot be loosened. Source packages with no cache configured use the upstream directly.

The optional `r2` backend uses a standalone Standard bucket and an HTTPS custom domain. `PEACH_R2_ACCESS_KEY_ID`, `PEACH_R2_SECRET_ACCESS_KEY` and `PEACH_R2_ENDPOINT` go into protected and masked CI variables scoped to the `release` environment; `PEACH_R2_BUCKET` and `PEACH_R2_PUBLIC_BASE` specify the publishing target. S3 transport reuses rclone, and version files must not be overwritten; each file must be fully downloaded from the public entry and have its size and SHA-256 checked before the public version index and the Release links are updated.

The GitLab rehearsal passes media tools, the Windows release directory, the macOS image and the Docker acceptance receipt through R2 staging, and job artifacts store the JSON manifests. The transfer needs the R2 variables above; build and acceptance jobs use the `prepare` or `verify` action of the `release` environment, and only rehearsals of protected version tags and of version commits on protected master can get credentials. The candidate is kept until both the desktop and the image are published successfully, and reclaimed by `publication-cleanup`; on failure it is kept for retry. The build-time rclone is installed from the officially pinned version archive by the current OS and CPU architecture, with SHA-256 checked.

Staging objects are located at `_ci/<project ID>/<pipeline ID>/<commit SHA>/<artifact group>/<job ID>/`, counting toward the same bucket budget. After a complete upload, an immutable completion manifest is registered in `completed/` under the same prefix; a retry prefers to restore artifacts of the same pipeline that are already complete, and a transfer failure is not treated as not built. `seal-release` registers the version, commit, successful jobs and file digests. The tag checks, through the GitLab API, the successful mainline rehearsal of the same commit and then downloads its same files; paths are confined to the corresponding output directory, and symlinks or path traversal are not accepted. For macOS, only the DMGs of the two architectures, the corresponding sources, `build-info.json` and `SHA256SUMS.txt` are transferred, not the expanded app. The official version directory and the public index are written only after all builds and standalone artifact acceptance succeed; after both the desktop and the image are published successfully, only that rehearsal's prefix is reclaimed. A failed candidate is kept for retry, and existing public versions are not overwritten.

Completed builds during upload are saved in a standalone identity directory under `CI_BUILDS_DIR/.peach-upload-resume/`. After a partial R2 upload failure, a retry on the same machine checks the backup's size and SHA-256 and continues uploading to the original job prefix; once the complete upload manifest is registered, this group's backup is reclaimed. When the machine changes and there is no complete remote manifest, a rebuild is needed, and files of unknown origin are not stitched together.

When the Windows light installer lacks the local tool package, it first downloads the current version's tools from R2; on connection failure or content verification failure, it tries GitHub's same-version files. Both sources must match the size and SHA-256 of the installer's built-in manifest, and other versions cannot be mixed in. After publishing completes, use `--prepare-with-app --online` of `scripts/smoke_split_update.py` to run the actual artifact in an empty cache, checking whether the tools obtained online can rebuild the full program. The GitLab Release's download table uses R2, the asset area additionally lists the GitGud copy, and document links point to the corresponding version tag.

An installed standalone package reads the new version's release entry and update package with its own code, which cannot be changed at release time. After splitting the package, `build-windows` runs `scripts/update_compat.py`, which reads this version as is using the update code in every published version tag since 0.48.0: when the new version cannot be selected, the tool manifest cannot be read, or the manifest has tools that the old version does not recognize and the runtime cannot make up, the job fails and no files are uploaded. Local tests run the same check with synthetic artifacts, and the checkout must carry the release tags. The client prepares only the tools it recognizes and that are also in the manifest; when the app update package cannot be used, the same-version full package is downloaded instead. Versions 0.47.3 and earlier cannot read manifests from 0.48 on, and need a manual run of the full installer once. For the basis see [ADR-0120](adr/0120-standalone-update-client-compatibility.md).

Dual-backend publishing reuses the official `glab packages upload`, saving installers, tool packages, corresponding sources and SHA-256 manifests under `peach-release/<version tag>/`. Before uploading, local files are verified to match the R2 release manifest, and after uploading the size and SHA-256 recorded by the GitGud server are checked; the same version, same name and same content is reused directly, and different content keeps the original file and stops. R2 keeps the original download path, and the GitGud Release's fallback direct link uses `/gitgud/<file name>`, avoiding conflicts with the main download entry. The Release is registered only after both storages are ready; the website continues to prefer downloading from Cloudflare.

R2 public download traffic is free, while storage and requests are billed against the account's shared quota. Budget alerts only notify and do not stop the service; the R2 backend provides no zero-cost hard cap. A deployment that requires never incurring usage-based charges should use a download service not tied to metered billing, and not enable R2 automatic publishing.

The rehearsal entry reads this bucket's actual usage and staging scope, computes after the build manifest is complete and before the install smoke test the exact peak of staging plus the public copy, and rechecks at candidate registration and upload; by default it stops above 8 GB, keeping existing files. The size of an unknown new version is not treated as known capacity before the build. `PEACH_R2_MAX_BYTES` can explicitly adjust this bucket's budget; this check cannot limit other buckets of the same account, nor replace request-volume billing protection. Version files get long-term caching, and the public version index is cached for only one minute.

At the top level, the Mac and Windows trays show only a short status and the number of alerts; expand the status submenu to see services and media sources row by row. Long addresses and paths are abbreviated, and "View full configuration" in the submenu keeps the full settings entry; once an alert disappears, it is updated with the next health-check round.

Single-machine setup turns ledger replication off by default and needs no Windows, SMB, LaunchAgent or system port forwarding. Each computer keeps its own data; a shared library is still configured according to [two-computer replication](#replication-between-two-computers) below, and offline edits cannot be merged automatically. Existing data directories are not imported automatically.

This build path uses a local ad-hoc signature, has not completed Developer ID signing and Apple notarization, and is not published as a signed release package. The DMG distributes only the app and installs no system services; when centralized deployment of system components is needed, PKG will be evaluated. The standalone package contains media tools and cloudflared; for tool locations and verification see "Standalone macOS Test Build"; the source development shell uses the local environment. The macOS online update installer is not included in this test package.

## First Run and the Settings File

In the web settings "JAV and new releases", performer names can be displayed in Chinese or the original Japanese. The preference is saved in the database, and other devices read the same setting; when saving fails, the original choice is kept. Switching only adjusts the spelling of the selected stage name, keeps the current name when no counterpart exists, and does not change person names, the original text of aliases or work credits.

There are two ways to open Peach for the first time, with the same result:

- **Tray (recommended)**: after you run the tray program, the browser opens the first-run setup page.
- **Terminal**: run `peach init` and complete the setup through the Q&A.

Either way creates the data directory, prepares the database, generates the local certificate and the access token, and writes the settings file.

### First-Run Setup Page

First-run setup has four steps: welcome, media directories, access scope and confirmation. Going back keeps what was filled in; when submission validation fails it returns to the corresponding step. The welcome page offers "Use existing data", and the recovery flow and the completion page use the same split-pane frame.

The first-run setup page asks:

1. Media directories: grouped by media library, each library can set a name, icon, source color and processing mode, and add multiple folders. The "Choose folder" beside it pops up the system folder picker; you can also choose to add media libraries later.
2. Data directory: the database, covers, preview images and caches all go here, and a large library can take tens of GB. On Windows the default is `%LOCALAPPDATA%\Peach\peach-data` on the system drive; when system drive space is tight, choose a folder on another disk; after installation you can also migrate it on the settings page.
3. Who can access: "Only this computer" or "Devices on the same LAN".
4. Peach proxy, and the port and LAN name in advanced settings.
5. Access password (optional): when left empty, devices that can reach Peach get in without logging in.
6. Whether to scan and send diagnostic feedback right away; no scan is triggered when media libraries are added later.

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

When a first-run setup page appears even though a configuration exists, choose "Use existing data" and enter the original data directory, for example `E:\Peach\peach-data`. This directory must contain a valid `config.toml` and the Peach database; once connected, normal startup also keeps using that location. Any custom directory with no location record cannot be discovered automatically on upgrade and must be chosen once; no re-initialization or data deletion is needed.

For deployments that already entered the library through `--data-root`, the new version installed by online update records the directory in use into the empty default data directory, after which ordinary launch works. When the default data directory already has a configuration, a Peach database or a directory record, its choice is kept.

The restore endpoint `POST /api/setup/restore` accepts `{"data_root":"absolute path"}` and reuses the first-run local and same-origin guards. On success it returns the completion-page fields plus `restored=true`; on failure it returns 400 with the reason in `errors.data_root`.

For the same setting, precedence is: environment variable > settings file > built-in default.

### Automatic Handling After an Upgrade

After upgrading and starting Peach, the configured write end automatically completes database migration, local deterministic metadata repair and background completion, with no need to start repairs manually. A database backup is kept before structure and metadata processing; manual entries, review results and manual canonical names are protected, and items with identity conflicts keep review records. Read-only devices do not perform these writes.

This version's updater allows a reader to install a structurally compatible program; if a prompt says the structure awaits migration, first upgrade the write end and sync the ledger, then install the reader update, and neither installation nor failure recovery writes back to the ledger. A reader still using the old updater must first complete the write end's upgrade and sync; an old helper may still write back its own ledger backup after a migration is refused, and the current program cannot retroactively modify an old helper that is already running.

Metadata and image caches are invalidated by rule version and source changes. Items that need media read again obey the media library's processing mode, preview settings and read cost: free sources can be processed automatically, and items with extra traffic are deferred. Processing saves progress; failures can be retried at "App and maintenance → Automatic repair", and tasks the user cancelled stay cancelled. A normal upgrade needs no opening of this panel.

The app offers prompts for new versions, update ready, and page needing refresh. When automatic updates have never been set, the version is checked daily; settings explicitly turned off are kept. Download, restart-install and page refresh each follow the user's choice, and the prompts do not interrupt the current operation automatically. A standalone package resumes background tasks only after the new program passes the startup check; when installation fails, the program, database, configuration and task checkpoints are restored.

"Automatic repair" can download the local review record. `GET /api/client-updates` reads only the local snapshot and does not trigger an external version check; for the interface and permissions see the [route list](ROUTES.md). For the design and the rule-version boundary see [ADR-0126](adr/0126-upgrade-effective-repairs.md).

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

"Stop task" first shows stopping, and settles after the in-flight step exits. Registered videos, metadata, previews and candidates are kept, a stopped task does not continue automatically after a restart; a new run can be started again. A library processing run started from the command line returns exit code 130 when stopped.

For daily use, "Sync new files": enumerates directories to find files not yet registered, and completes only the metadata and previews of new and pending videos. Known paths skip per-file attribute reading and existing videos are not scraped again; it still has to enumerate directories and cannot replace the file-deletion check. "More sync options" is split into daily sync and a standalone "Full library maintenance", the latter checking all files and reusing existing metadata and previews, and can run the scan, metadata or preview step on its own.

The pending-completion count sums the videos registered for the first time and not yet finished processing; directory scans, file monitoring and registration after cloud downloads complete share this set; images, companion files and duplicate registrations are not counted. The daily menu's "Complete pending videos" processes only this registered group. Each run's scope is saved to the checkpoint, and videos ingested later wait for the next run; failed items can still be retried in a targeted way from the original task. A source being offline is not the same as deletion.

When push discovery settings have never been saved, local file monitoring is on by default, and CloudDrive notifications must be configured separately; settings explicitly turned off are kept. Monitoring uses system file events and a debounce queue, waiting for events when idle and not periodically traversing media directories; network drives are not monitored recursively. Files added while notifications were not received or the service was down can be filled in by "Sync new files".

Local move events and recorded system file identities can preserve a video's ID, manual metadata and personal records across renames and same-volume moves. File identities accumulate with local scanning and registration; moves that happened before an upgrade without identity records or while the service was down, and cross-volume copies, cannot be automatically taken as the original video merely by the same name or size. Copies whose old path still exists and hard links are registered separately.

A finished task can "Export full issue list", downloading JSON containing all paged records. When the task or records change during export, the export stops, and cancellation or failure never downloads a half file; when the original issue records are missing, a prompt suggests exporting diagnostic logs. "Archive notice" only collapses the old issue notice, and the full records and task history are still kept.

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

### Media Libraries and Storage Roots

A media library keeps a name and an icon, and can contain several storage roots. "Directory's media library" on the settings page and in first-run setup explicitly specifies ownership; libraries with the same name stay independent. Changing a library's name or icon syncs to all its directories, and reordering directories does not change identity.

`media.library_catalog.<library_id>` and `media.storage_roots.<root_id>` persistently keep identity. Paths, mounts, sources and read policy belong to the root, while name and icon belong to the media library. Path tables such as `media.locations` are compatibility projections, and manual configuration follows the identity tables; for fields and the upgrade basis see [ADR-0115](adr/0115-library-and-storage-root-identity.md).

Each media library can also set a source color and a processing mode. The source color lays a light tint on this library's cards and list rows, with no color by default. The processing mode has three tiers: "Auto-complete" fetches whatever is missing online; "Local metadata only" reads only local NFO and same-directory images, still reads video info and generates the nine-grid, and does not fetch metadata, covers and person images online; "Custom" selects steps one by one. In the configuration these are written as `color`, `policy` (`auto` is not written) and, for custom, `stages`; scheduled scans, incremental ingest and retries all obey the library the work belongs to, see [ADR-0116](adr/0116-library-processing-policy.md) for the basis.

On the first save of the path configuration, stable identities are written by the original same-name groups, and before writing the original file is kept as `config.pre-media-identity.toml`, which later saves do not overwrite. You can also rehearse with `scripts/upgrade_media_identity.py --data-root <data root>`, and after checking, add `--apply` to upgrade explicitly; the script backs up the configuration and writes atomically, without opening the ledger. Repeated runs keep identities. Upgrading a real configuration follows deployment authorization, validated first in an isolated configuration.

When an existing directory changes location, choose "Relocate this directory, keeping file records"; it keeps the ledger prefix and updates the local mount location. Choose "Add another directory" to create an independent root. Removing a directory declaration keeps files and personal records, and file deletion still uses its own confirmation entries. Relocating a directory should point at the same batch of files, and an existing ID cannot be used to take over a different batch of content.

Each root's offline state is returned by `root_id`. When one directory of a multi-directory media library is offline, it affects only works in that directory; source filtering disables the source only when all roots are offline. Resource cleanup keeps the existing online protection conditions.

### Mapping Windows Paths on macOS: `[media.mounts]`

In first-run setup or on the settings page, add a media directory, entering a directory this device can read, such as macOS `/Volumes/Media`, Linux `/mnt/media` or `/media` inside a Docker container. Peach automatically saves the path configuration the database needs. When changing the location of an existing directory, edit the media directory on this row and choose relocate; Peach keeps the correspondence of the internal paths.

The field descriptions below are for editing the configuration by hand or for mapping existing media directories across multiple Peach installs.

In the Peach database, every video's `path` field uses Windows format, for example `R:\media\x`, even when the service runs on macOS or Linux. This value is a string in the database; when this machine has no matching drive letter, Peach needs the two settings below to find the actual file. For Docker configuration see [Docker Deployment](DOCKER.md#configuration-file-and-paths).

- Both use the same media source key, for example `local`, `115`.
- `[media.locations] local = 'R:\media'` means that file paths in the database start with `R:\media`; it does not require this directory to exist on macOS or Linux.
- `[media.mounts] local = '/Volumes/<volume name>/media'` is the directory actually read on this machine. `R:\media\x` in the database is converted to `/Volumes/<volume name>/media/x`.
- When a source has several directories, write both as arrays; the number and order of directories must be the same.

Windows `[media.mounts]` can be left empty, in which case the ledger prefix is used directly; when relocating a directory, the mount mapping is executed likewise. macOS and Linux still use two configuration entries; when the matching actual directory is missing, that root shows offline, and media records are kept but files cannot be read. Changing the value of `[media.locations]` to a POSIX path does not modify existing video records, and cannot replace this conversion step. When a media source key is misspelled or written as a drive letter, the configuration is rejected.

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

"Network and access" shows the local address, the phone connection address and the available backup IP addresses. The address protocol comes from the actual service; HTTPS uses the configured name address. A standalone desktop deployment can choose local or LAN access and change the LAN name; file-managed deployments display per the startup configuration. When "turn off access password" is checked, the new password and confirm input boxes collapse, and the current password is still verified on save.

When library processing waits a long time for external metadata or covers, the card and the resident task floating window offer "Skip this one". The command checks the current task and asset, and after the current request ends, continues to the next at a safe point; results already obtained are kept, and skipped items enter the retryable list. The task floating window is hidden with the close key and dragging does not collapse it; the prompt and action share a line when the width is enough.

The Peach settings page address is `/configuration`. Enter from "Peach Settings" in the management menu or settings popover, or from the tray menu "Configure Peach". The page is divided into five groups: "Media library and ingest", "Sources and subscriptions", "Download channels", "Network and access" and "App and maintenance". Source credentials, work metadata sites and resource search indexers are in "Sources and subscriptions", and this section can also lead to collection sources and login state; the local port is in "Network and access".

- It can be changed only on the computer running Peach and only when the service is managed by the tray. The admin menu on other devices has no such entry, and the settings say which computer to go to.
- This computer can open the configuration page with the configured `.local` name, the loopback address or the IP the service is bound to. Peach decides whether a connection is local by the IPs at both ends.
- "Choose folder" opens the system folder picker (Windows Explorer, macOS Finder) on the computer running Peach, again open to the local machine only.
- After saving, the tray reloads the settings and the local service restarts.
- A source-deployed tray service keeps a fixed HTTPS address and port; the Windows test build can change its port on the configuration page.

Media repair is on the "Data Management" page, and subscription sources are on the "Subscription Sources" tab of the "Follow Management" page (for the division of work see [ADR-0050](adr/0050-settings-modal-holds-values-pages-hold-work.md)).

Scanning and collection keep results item by item. Single-item problems such as a frame-extraction failure on a file or a metadata request timeout are recorded in the list, and the remaining files and later stages continue; after all stages end, a task with problems shows "Processing finished, some items need attention", and you can view everything or retry only the unfinished items. Interruptions caused by faults in common stages such as state saving and the database are shown separately. Videos with no release metadata obtained can still be browsed under "All content"; the JAV category filters by product code and release metadata. When you need to pick a processing scope, use "Scan only", "Metadata only" or "Preview images only" in "More sync options".

When one Windows canonical path has several historical records, the scan lists the path and record numbers in the issue list, and other files continue to be ingested. The conflicting records' identity, metadata, personal records and disposition state are kept separately; when enumeration confirms the file is still there, only the observation time of these records is refreshed. Automatic discovery can register other files in the same directory, while registering the conflicting file directly reports the specific conflict. Duplicate records need review, and rescanning does not merge or delete them automatically.

A single read of media directories, NFO and companion images has a 20-second limit, and on timeout the read subprocess is ended and a problem recorded; this run does not repeatedly read directories that already failed. The nine-grid of a single video shares a 120-second processing limit, and after a failure continues to the next video and external metadata collection. User pause, insufficient disk space, and ledger or result save failures interrupt the task and keep the checkpoint. Directories not registered successfully need rescanning; problems of registered videos can be retried from the list.

After files are removed on disk, you can check the ledger records under "Resource sync" at the bottom of the data management page. This section requires at least one scannable source to have a root directory configured; before cleanup, check the inspection results and confirm. Lost works with personal records are kept as vanished, and for the other cleanup rules see the confirmation notes of resource sync.

The collection estimate shows both the expected new disk usage of metadata and preview artifacts, the temporary file peak, and the free space of each output disk. Covers are deduplicated by product code, and metadata snapshots and the nine-grid are estimated for the scope pending execution; cache hits and finished work are not counted again. Usage is estimated from the median local cache size, and uses planned values when there are no samples. Each disk keeps a 1 GiB runtime margin separately, and when space is insufficient the shortfall is shown; when capacity reading fails, not obtained is shown. When cloud drive mount cache and prefetch cannot be measured accurately, a separate prompt is shown, and it cannot be concluded from that the drive cache can also hold it.

The app metadata collector allows at most 6,000 requests, 1 GiB of download and 4 hours per session, plus source rate limiting, cooldown and per-item deadlines. The app collection pipeline checks the data disk's 1 GiB floor at run time; the standalone cover, probe and nine-grid scripts use their own disk parameters, with covers and nine-grid defaulting to 40 GiB. The traffic and disk estimates themselves do not change these limits.

The scanning and collection progress floating window at the bottom right can collapse its details, and can also be closed with "Hide task notice"; after hiding, background tasks keep running. The current tab remembers the hide choice for this run, and it stays hidden across refresh, page changes and resume after pause. Click "Show progress window" on the "Manage → Data management → Scanning and collection" card to restore it. A new task shows automatically, and a task finishing while hidden still gets one completion notice; failure details are kept on the data management page.

Before "Scanning and collection" starts it shows an approximate traffic figure by pending items; while running, the task surface shows traffic used and the estimated total, and can expand to show per-drive details with drive icons. Metadata downloads are deduplicated by product code, deducting fields already complete, usable covers, valid caches and requests whose source recently confirmed no result, and use the existing HTTP download budget; external collectors are estimated separately. After companion file checks finish, the estimate is updated by the fields actually obtained and the checked scope, and finished work is deducted from the amount still to download. Cloud drive reads are summed per CloudDrive account by its data proxy configuration; directories that follow the system or have no matched account keep their connection state separately, and are not counted in the confirmed proxy total. "Proxy protection" limits automatic video reads and does not decide the drive's connection method. Local disk reads do not count toward network traffic; metadata site downloads are listed separately by the source connection settings. Mount read volume is affected by cache and prefetch, and the traffic of browsers and external collectors cannot be fully counted either, so the readings are an estimate for reference. Files of new directories not yet registered update the estimate after the scan, and pause and app restart keep the same task's cumulative value.

"CloudDrive proxy" in media library settings shows only the accounts corresponding to added media libraries, bound by exact mount point or push path prefix; when several media libraries share one account they sit in the same group. The API proxy is used for listing directories and querying file info, and the data proxy for reading videos and companion files. First save the CloudDrive2 address and API token in download settings; the token needs the "view cloud drive" permission, saving also needs "modify cloud drive", and automatic mount point detection needs "view mount points". The CD's current configuration is fetched on page entry, refocus and clicking "Read again"; when there are unsaved edits, focusing does not overwrite the form. Saving writes to CloudDrive immediately and reads back to confirm, affecting other consumers of that account. The proxy password is not echoed, left empty it is kept, and when checked it can be cleared. Before saving, the whole account configuration's revision number is checked; the official interface has no atomic conditional write, and if another client modifies exactly between the check and the save there is still a race window. On request timeout or read-back failure, read again to verify first, and never resend automatically. HTTP/SOCKS5 means a proxy entry is configured, while the billing of the specific node still depends on the proxy tool's rules and TUN. For the applicability of more interfaces see [CloudDrive official API integration](CLOUDDRIVE_API.md).

The startup popup shows the video file count, the count of JAV files recognizable from file names or existing metadata, and the de-duplicated number of works. Directories with no registered videos are listed in batches, only recognizing names, never opening media content and never writing the ledger; you can start scanning directly while statistics are running, and after the popup is closed later batches are no longer requested. A new task reuses the same process's pre-check result for that scope within 5 minutes, then updates it with the actual scan; records already in the ledger take precedence. The time of the first cloud drive pre-check depends on how fast the mount tool lists directories; JAV files whose names have no product code are recognized after companion metadata is read. The per-work average estimate in the details covers only this run's pending metadata, and videos with a complete cache do not enter this average. The "Manage media libraries" link at the bottom right closes the popup and goes to media library settings, where each directory's read options can be adjusted.

File names need not contain only the product code. When the code is followed by a title, performer or subtitle note (`CAWD-987 title`, `GVH-520【中文字幕】title`), the first segment "studio-at least three-digit serial" in the file name is taken; FC2 product numbers (`+++ FC2-PPV-1234567 title Part 1`) are recognized anywhere in the file name. For naming the built-in rules cannot recognize, write one regular expression per line under "Media library and ingest → Product code recognition rules": it searches the full file name, case-insensitively, the code goes in the named group `(?<code>…)`, and when there is no named group the first parenthesis is taken; the extracted part must still conform to the product code format. Rules are saved in the ledger, shared across devices, and syntax is checked on save. During "Process", videos without a code are first recognized by these rules, then by the built-in rules; existing codes are not rewritten. The startup popup's pre-check counts only by the built-in rules.

This machine's `state/library-processing-traffic.json` stores recent usage of the same kind. Video probing and single-frame reads accumulate separately by media directory; metadata collection is grouped by sources to visit, cover needs and direct/proxy. After at least 3 valid samples the average of the most recent 50 is used, and later work of the same kind is calibrated accordingly; failed, zero-download and incompletely metered metadata collections are not counted as normal samples. First use with no history still uses the default planned values.

Commonly used local settings:

- "General → Start at login": start Peach after login, silent start (after login only the tray icon is shown, without opening the web page), and create a desktop shortcut.
- "Network and access → Peach proxy": choose system proxy, direct connection or a custom address. Default outbound HTTP requests and collection sources set to "Peach proxy" share the setting here, and sources set to "Direct connection" use a direct connection. After saving, newly created clients run with the new setting, and existing tasks and long connections keep the configuration from creation. For the coverage scope and the boundaries of local, cloud drive and standalone tools see [source connection settings](SOURCING.md).

### CloudDrive Configuration

115 and PikPak cloud drives are mounted as local drives by CloudDrive2, and Peach reads them as ordinary folders. Mount steps, source IDs, path mapping on macOS, cache and read settings, and automatic ingestion of new files are all in [CloudDrive Configuration and Tuning](CLOUDDRIVE.md). "CloudDrive cache suggestions" in the configuration page is its summary.

### Storage and Migrating the Data Directory

"App and maintenance → Storage" on the settings page lists the data directory, the free space of its disk, and after "Calculate usage" the size of each kind of data. Calculation runs in the background, taking a minute or two for a data directory of tens of GB, and the progress bar is estimated from the file count of the last calculation. The result is a donut chart (share of each category), a disk usage bar (Peach, other files, available) and a per-category list, each category stating what it is, whether it can be cleaned and why.

Categories that can be cleaned have a checkbox at the start of the row; after checking, click "Clean selected", or click "Clean all":

| Category | What is cleaned | Afterwards |
| --- | --- | --- |
| Database backups | `ledger.pre-*.db` in `database/` and `generated/organize-backups/`, keeping the most recent one in each place | Cannot be recovered; cleaning is refused when the current database fails verification |
| Playback cache | Whole-file transcodes in `generated/transcodes/` and `generated/stream-segments/` | Regenerated on next playback; rebuilt file headers (`.mp4hdr`) are kept |
| Thumbnails | `generated/cover-thumbs/` and `generated/avatar-thumbs/` | Regenerated while browsing |
| Logs | Archived `*.until-*.log` and `crash-*.log` in `logs/` | Logs being written are kept |

Thumbnails are small copies of covers and avatars, shrunk from the originals already on this machine; preview images are the nine-grid, posters and progress bar previews generated by extracting frames from the video, and rebuilding means reading the whole video again, with videos on cloud drives being downloaded again, so they are only counted and not cleaned. Covers and online metadata must be downloaded again over the network, and imported data, task and review records, media tools and login state cannot be rebuilt by Peach, so these are likewise only counted and not cleaned.

"Change location" moves the whole data directory to another folder. The installed version, source runs started from the tray (Windows, macOS) and the desktop-less service (`python -m peach.server`) all support it:

1. First calculate usage, then choose an empty folder (or create one). You cannot choose a disk root, the program directory, the media directory, or a location that contains or is contained by the current data directory; for a move across disks, the target disk needs 1 GB more headroom than the data directory.
2. After confirmation Peach pauses background tasks, stops the service and quits the tray; the desktop-less service stops only the web service, and the watchdog process stays to carry out the migration. Within the same disk it is a direct rename; across disks Windows uses Explorer's copy (with progress and cancel) and macOS copies one by one, and after copying the file counts and sizes are checked item by item.
3. The preview image and follow-evidence paths in the database that point into the data directory are changed to the new location; the default location and the original location each keep a `state/data-root.txt` pointing to the new location, and start-at-login and the desktop icon are rewritten for the new location.
4. Peach reopens at the new location (the desktop-less service restarts the web service at the new location), and the data at the original location is deleted afterwards. Paused tasks resume automatically.

If any step fails, it stays in use at the original location, with the reason shown under "Storage"; when a cross-disk copy fails, the part already copied to the new location is deleted. When files at the original location cannot be deleted, their paths are listed, and you delete them manually after confirming the new location works.

For source runs, the default location is `peach-data` next to the project; the `state/data-root.txt` left at the original location makes both the default location and an explicit `PEACH_DATA_ROOT` follow to the new location. When running `peach serve` directly there is no watchdog process to take over, and migration from the settings page is not possible: start from the tray or the desktop-less service instead, or quit Peach, move the data directory manually, then point `PEACH_DATA_ROOT` at the new location.

A container's data directory is a volume mounted from the host, and migrating inside the container would leave the volume, losing data when the container is rebuilt, so the settings page offers no migration and instead lists the steps and commands to migrate on the host, see [Docker deployment](DOCKER.md#migrating-the-data-directory).

### Uninstall

Uninstall the Windows test build from Peach Configuration "App and Maintenance → Uninstall Peach":

1. First choose the scope. By default data is kept; ticking "Full uninstall" also deletes settings, the local database, watch records, credentials and caches.
2. After confirmation, Peach exits the tray, shuts down its own services, ends leftover processes still running in the program directory, then removes the launch-at-login entry and the whole program directory. Deletion is retried three times and an error is reported only if it still fails.

What is kept:

- Original media files are kept under all circumstances.
- A manually copied `config.toml.bak` and other files Peach does not recognize.
- A full uninstall deletes the settings file, the settings backups Peach generated itself (`config.previous.toml`, `config.pre-media-identity.toml`, and backups of the form `config.toml.<note>-<date>-<time>`) and the listed directories such as the database, cache and credentials. When the data directory is elsewhere, uses directory links, or overlaps with the media directory, you need to check and clean it manually.

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

On tray startup or when the local address changes, the leaf certificate's coverage, expiry and issuer key identifier (AKI) are checked. Existing leaves missing the AKI are re-signed with the original CA and a backup is kept, the CA trust already installed remains valid, and there is no need to rebuild the CA or reinstall trust manually; leaves that meet the conditions are not re-signed repeatedly. Both the runtime and the TLS setup script explicitly sign in the SKI and AKI to satisfy strict TLS validation.

1. Copy `peach-local-ca.crt` to the device you want to access from. Copy only this one file, and never send any private key out.
2. Install and trust it on the device. On iPhone/iPad, after installing the profile, also turn on full trust under "Settings → General → About → Certificate Trust Settings".
3. Use `openssl x509 -noout -fingerprint` to check that the certificate fingerprint on the device matches the local machine.

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

1. Environment variables set explicitly.
2. `tools/ffmpeg/bin` under the Windows standalone program directory, or `Contents/Resources/tools/ffmpeg/bin` of the macOS app.
3. `tools/ffmpeg/bin` under the data directory.
4. PATH.

untrunc is looked up in the same order, with the directory `tools/untrunc`. The standalone program prefers the version verified with the package; an environment variable can still specify the tool path explicitly.

The face detection (YuNet) and matching (SFace) models ship with the Windows full installer, the full portable ZIP, the macOS app and the Docker image, usable offline. Peach first reads the directory `PEACH_FACE_MODELS` points to (set to `/app/tools/face-models` in the Docker image), then the standalone program's `tools/face-models`, both verified by SHA-256; when absent or failing verification, it switches to the copy in the data directory's `tools/yunet` and `tools/sface`, and only downloads online if there is none. The bundled copy is not copied to the data directory. The light installer and the app update package carry no models, and the installer or updater downloads `tools-face-models.zip` on demand.

During playback:

- For formats the browser does not support such as AVI and MKV, Peach transcodes them into a compatible MP4 cache and then plays it, **without modifying the original file**. Before the first playback the file is probed first, for up to 20 seconds.
- Streams that can be kept are kept as far as possible: H.264 (`yuv420p`/`yuvj420p`) video is not re-encoded, AAC audio is copied directly, and other audio is converted to AAC. When video must be re-encoded, auto mode tries in turn hardware decode plus hardware encode, software decode plus hardware encode, and all software; Windows uses NVIDIA (`scale_cuda` + NVENC), Linux uses an available VAAPI node, and macOS uses VideoToolbox. macOS hardware encoding is probed with actual synthetic frames, and system software encoding is forbidden from posing as hardware; H.264 output uses 6 Mbit/s. AV1 hardware decoding explicitly uses FFmpeg's native `av1` decoder, falling back to dav1d software decoding when the device does not support it.
- At most 2 transcodes or probes run at the same time, each for at most 1 hour, and closing the playback page cancels the corresponding task.
- Videos on 115 and PikPak play through the mount directory declared in the media library configuration. Whether it can play is judged by actually opening a known video in Peach.

"Frame extraction decoding" under "Media library and ingest → Video preview" and "Transcoding" under "App and maintenance → Video playback" in Peach settings are saved as the preference of the computer running Peach, independently of each other, and both can choose "Auto (hardware first)" or software. The frame extraction setting controls covers, the nine-grid and the timeline; scanning, reading NFO and duration probing do not depend on the GPU. The playback setting controls only Peach's server-side whole-file and HLS transcoding, and when the browser plays directly it chooses its own decoding. Saving needs no restart and takes effect for new tasks; valid caches already generated keep being used, and running FFmpeg is not forcibly interrupted. macOS frame extraction tries VideoToolbox within the same timeout budget, Windows frame extraction tries D3D11VA for H.264, HEVC, VP9 and AV1, and all fall back to software on failure; video codec probing is cached by file size and modification time. The auto tier of Windows playback probes NVENC, AMF and QSV encoding in turn, and when none of the three is available uses D3D11VA decoding and then hands over to libx264; AMF accepts only D3D11 devices on AMD graphics cards, and Peach probes them one by one by adapter index. Preferences are read and written through GET/POST of `/api/media-processing`, with `preview_acceleration` and `playback_acceleration` each accepting `auto/software`; omitted fields keep their current values. Like the timeline thumbnail `/api/thumbnail-jobs` and `/api/configuration/*`, this interface accepts only requests from the computer running Peach, and other devices get 403 even if logged in or in open access. `PEACH_TRANSCODE_BACKEND` can be used for administrator diagnostics, supporting `auto/software/nvenc/amf/qsv/vaapi/videotoolbox`, and an explicit `software` keeps hardware disabled.

The `/stream` requested by card hover previews carries no stream session, cannot be cancelled, and browser disconnects are not seen. When the source needs whole-file transcoding and there is no ready cache, this request returns 415 directly and does not start FFmpeg; details and immersive mode play with a session, and on close the transcode ends with the session.

The player progress bar can reuse the Jellyfin Trickplay next to the video, BIFs exported from Emby/Roku/Plex, WebVTT image indexes, and HLS and DASH image tracks. Existing artifacts are read-only, and timeline collection skips when it meets a usable preview. For naming, read scope and handling when there is no time index see [Existing timeline previews](VIDEO_PREVIEWS.md).

## File Organizing

Choose a source in "Data management → Organize". The path box on the right accepts a directory directly, and the folder button beside it opens a directory picker window on the computer running Peach; with remote access or when the system picker window is unavailable, enter the path directly. An empty path means the whole source, and a specified directory includes its subdirectories. The path must belong to the chosen source; switching sources clears the path.

Organizing removes decorative symbols, emoji, the replacement character `�`, private-use characters and invisible noise from file names, keeping normal text, common punctuation, units, serial numbers and extensions. Entries that cannot form a valid name keep their original name; whole stretches of garbled text are not guessed back. When both templates are left empty only names are cleaned, and when templates are filled in, names are changed and files are filed into directories by the templates at the same time. The directory template starts from the specified path, or from the source root when the path is empty.

First click "Preview" to check the scope and per-file changes, then confirm to execute. After changing the path, source or templates a new preview is required. Entries whose target already exists are skipped, and an executed batch can use "Roll back last batch" to restore names, locations and ledger paths. The PikPak UI offers only preview, and renaming still needs the official verification channel.

The PikPak official verification channel uses the unique CloudDrive path prefix corresponding to that media root in "Push discovery", supporting custom drive letters and subdirectories. It refuses to run when the mapping is missing or the same media root has several mappings. The WebDAV account root is returned by CloudDrive, and the authenticated direct link must match the PikPak official domain and the path within the account; each batch of operations is limited to the media root the sample belongs to.

## Resource Sync and Deletion

Please read carefully which operations delete files and which do not before acting.

### Resource Sync

After organizing a cloud-drive directory in CloudDrive2 or a file manager, reconcile manually once under "Manage → Resource Sync". Peach never quietly deletes any record in the background.

- Reconciliation has two steps: first "Check files", then "Clean stale entries". The check only reads the disk and changes nothing, reporting for each source the records whose files are no longer on disk, empty folders and directories that cannot be read, and in addition caches no longer referenced.
- Reconciliation checks the configured local and cloud drive sources. Offline sources are skipped entirely; when a directory cannot be read, its records are kept and it is reported in the result.
- Scanning takes long when the library is large, so it runs as a background task and reports progress source by source.
- **After cleanup is confirmed, records whose files are no longer on disk fall into two tiers.** Library entries carrying personal records (likes, ratings, watch later, playlists, watch history, looking for a better version) are marked "vanished" and kept, and when a new version is ingested these records are reattached by location, product code or "creator + file name + duration"; **the rest are permanently deleted, including those in the trash, without going to the trash and unrecoverable.** The check report counts the two tiers separately, and the confirmation box states which tier is irreversible (ADR-0087). Before deletion each record is reconfirmed that the file is really absent, and records whose file has reappeared are kept and listed in the result.
- The "Records with lost files" list on the data management page lists all vanished entries and the personal records they carry, which can be manually attached to a file or deleted completely; complete deletion is irreversible.
- Cleanup recognizes only the result of the most recent check: if another check has been run since, or the service has restarted, it must be checked again.
- Empty folders are deleted from the bottom up, each source's root directory is kept; empty directories whose contents cannot be listed on CloudDrive also count as empty.
- Reconciliation cleans only generated files no longer referenced by the library: snapshots, posters, photo thumbnails, transcode caches, playback segments, per-file generated avatars, and shared product-code covers. Avatars and logos of performers and other metadata, collection evidence and review CSVs are outside the scope of automatic cleanup.
- Only caches in the data directory where the current database lives are cleaned, and anything outside that scope is skipped.
- Each cleanup leaves a "Resource sync cleanup" record in the task center.
- "Delete in sync" in an entry's details checks only this one directory: missing records carrying personal records are marked vanished, the rest are moved to the trash, and both tiers can be undone within 8 seconds.

### Trash

- Entries moved to the trash can be "Restored" in the trash.
- **"Delete permanently" on the selected items in the trash, or "Empty trash", permanently deletes the media files and the corresponding library records and cannot be recovered.**
- Media on rclone FUSE mounts is deleted directly, to avoid the remote rename of some backends degrading into a copy. If the media is deleted but the ledger transaction fails, the trash record is kept; emptying again can remove this leftover record, and the completed remote file deletion cannot be rolled back.
- The native 115 remote mount of the Feiniu OS file manager can appear as `fuse.rclone` in the Linux mount table; the behavior above then applies. The rclone here is the underlying file system type of that environment, and does not mean the user separately deployed rclone, CloudDrive2 or OpenList, nor that other mount methods have been verified.

### Junk Files

The "Junk files" review covers file types of all kinds in the configured physical media sources, excluding online URLs. The check reuses the same scoring, first checking the original file name, directory, duration, size and adjacent main feature, then deciding whether to quarantine.

| Flow | Check and processing order |
| --- | --- |
| Adding a media library, full scan | Registration and companion file recognition → check by this run's directories → media probing where automatic reading is allowed → rejudge |
| Push discovery, single-file registration | Registration and companion file recognition → check that asset → media probing where automatic reading is allowed → rejudge |
| Cloud download | Land and bind the main feature → check the download scope → probe and rejudge → collect metadata and previews → rejudge → organize by template → dispatch follow-up tasks |
| Complete metadata, complete previews | Check the current scope → probe and rejudge → read local metadata and generate previews → refresh active assets → collect applicable metadata online |
| Collect metadata only | Check existing evidence → read companion metadata → rejudge → collect online; no video read or frame extraction |
| Manual organize, maintenance scripts | Check before organizing and generating the nine-grid; standalone probe scripts check before and after probing; organize preview and read-only inventory stay read-only |

Probing keeps the source's billing and proxy protection, and reads no extra media for junk checks. After probing, personal records whose ownership can be determined are reattached first, then junk is rejudged. Videos with no valid duration go only to review. Preview-only is limited to local sources; the full process skips frame extraction when video previews are off. A failed task keeps its checkpoint and issue records, and a retry reuses registered assets, measurements and the organize log; when metadata or organizing fails, the follow-up tasks of that download are not dispatched.

- Files judged to be junk are only moved to the trash, never deleted directly.
- Clicking "Not junk" records the judgment for this file (it can be undone), and it appears in the "Excluded" view. This judgment applies only to this one file, and does not whitelist a whole domain or source.
- Automatic quarantine requires reaching the auto threshold, and protects personal records such as manual keep, likes, viewing or playlists, paired subtitles, the work's own product code in the file, and the main feature bound by this download. The current asset is checked again before writing; entries that have left the library do not enter later collection or organizing.
- A very short attachment with no keywords can enter review on the strength of a long main feature in the same directory, the count, and cross-directory measurements; this kind of structural evidence and "domain plus serial number" naming cannot alone trigger automatic quarantine. A file confirmed to be kept after restoring can also be marked "Not junk".

The maintenance script `scripts/trash_junk.py` generates a candidate list by default; permanent deletion uses `--purge --review-csv`,
and each row of the review CSV contains `id`, `path`, `size`, `decision`, `confidence`, `why`.
Only rows with `decision=delete` and confidence of at least 0.95 enter deletion, and execution also needs `--apply --backup`.
The score only decides review order and cannot by itself decide permanent deletion; if a file's path or size changes, the whole batch is rejected.
Installation attachments, web scripts and promotional clips whose duration was not probed also enter review; subtitles and NFO files do not enter the junk queue.
Plot words are not evidence of advertising; torrents, work galleries and creator profiles must be judged by file content.

### Cache Directory

`generated/avatar-thumbs` holds reduced avatars (long side 640), generated by each computer itself, not synchronized and needing no backup. Deleting the whole directory only makes the next opening of the index page slower, and when missing the page shows the original image. After importing a batch of new avatars, you can run `scripts/build_entity_thumbs.py` to generate them in advance.

"Change avatar" on a person profile page supports local images, image URLs and existing candidates. Input supports JPEG, PNG, WebP, AVIF, GIF, BMP, TIFF, ICO and JPEG 2000; animated and multi-page images use the first frame, EXIF orientation is corrected on the server, and transparent areas are kept. After the image is fully decoded it is converted to a static JPEG or PNG, and the crop preview and installation use the same conversion rules. Both a single original and the converted result are at most 16 MiB; unsupported formats, unrecognizable content, corrupt data and excessive pixel dimensions each give their own reason. The original file is left untouched; the conversion preview of a local image stays in the candidate cache, and it is installed as the avatar only when "Use this region" or "Use whole image" is clicked.

## Maintainer Reference

The following is for people who develop, package, release and maintain two machines from source.

### Internals of First-Run Setup

- The "Peach proxy" in first-run setup supports follow-environment, direct connection and a custom HTTP/SOCKS proxy. A custom address and port keep the settings page's validation, and credentials are stored in the local secrets of the chosen data directory; the question-reading interface returns only the connection mode and whether an address is saved. When a loopback proxy address is entered in Docker, a prompt suggests switching to a host address reachable from the container. "Network and access" on the settings page can change it at any time.
- The `peach_proxy` of `GET /api/setup/questions` contains `mode`, `proxy_saved` and `needs_selection`; `docker` indicates whether the deployment is Docker. The `peach_proxy` of `POST /api/setup` takes `{mode, proxy}`, with `mode` being `environment`, `direct` or `proxy`, defaulting to `environment`. Validation errors go into `errors.peach_proxy`. The proxy is persisted before `config.toml` and the first scan request, to ensure the chosen connection method is used after the tray switches.
- The tray reads the settings file once at startup, judged by `tray.needs_setup()`: only **no `config.toml` and no database** counts as needing first-run setup. `PeachConfig.configured` is not used: the tray's single-instance lock creates `state/` under the Peach data directory as soon as it starts, so one failed start could make the next be misjudged as configured; conversely, an old deployment with no `config.toml` whose database still exists must not be dragged into first-run setup.
- When setup is needed, the tray does not build normal service specs (on a brand-new machine `build_service_specs()` would raise `FileNotFoundError` for missing TLS material), but starts `peach serve --setup --host 127.0.0.1 --port <the port in the settings, default 8900> --no-mdns --no-ledger-sync`, then opens the browser at `http://127.0.0.1:<port>/`. This bootstrap service has no TLS and a forcibly empty token, and the security boundary is the loopback bind address.
- The home page is the first-run setup form: `GET /` returns a thin shell (`routes_pages.setup_shell()`), the form is drawn by the page bundle `/dist/peach-pages.js`, and the questions and submission go through the two JSON endpoints below. The completion entry carries `/?onboarding=1`; if importing browser history was chosen it goes first to `/taste?onboarding=1`. The install tutorial reads each item's actual state through a dedicated status endpoint.
- The two endpoints share a guard (`routes_pages._setup_guard`): already configured is 404, a non-loopback origin is 403, and a standalone package whose address bar hostname is not a loopback spelling is 403; submission additionally checks Origin (403) and an existing settings file (409). Both are under `/api/`, and errors always return JSON.
  - `GET /api/setup/questions` gives the data needed to draw the form: `questions` lists, in the order of `onboarding.questions()`, each question's `key`, `label`, `help` (list of explanation lines), `default`, `required`, `advanced` (whether folded into "Advanced settings"), `input` (`text`, `number`, `choice`, `folders`), `prefix`, `suffix`; `host` additionally carries `options` arranged in page order, and `mdns_name` additionally carries `visible_when: {"host": "2"}`; also `media_sources`, `media_source_default`, `media_root` (the corresponding path cell on non-Windows, `null` on Windows), `cloud` (prompt, help link and missing mount software `dependencies`), `windows`, `standalone`, and the initial values of three switches `access_enabled` (on if the default host is LAN), `scan_now`, `history_guide`.
  - `POST /api/setup` takes fields of the same names: `media_dir` is a list of `{path, location, root}` rows (`location` defaults to `local`), `access_enabled`, `scan_now`, `history_guide` are booleans, and when "Only this computer" is chosen `mdns_name` may be omitted. A 400 returns `{"error", "errors"}`: `errors` is keyed by question key, the access password is under `access_password`, `media_dir` corresponds one to one with the submitted rows with an empty string for rows without errors; when the whole form is invalid (more than 100 rows) there is only one sentence, with length unequal to the row count. An `apply` failure returns 400 with the error under `data_root`. A 200 returns `url`, `scan_requested`, `history_guide`, `standalone`, `redirect` (the entry address for standalone packages, `null` otherwise, with the redirect duration decided by the frontend) and the runtime info `facts` (the same as `facts` of `/api/configuration`).
  - Creating directories (`database`, `generated`, `sources`, `state`, `secrets`, `logs`, `tools`, `review`), migrating the database, generating the CA and token, and writing the settings file are all done by `onboarding.apply()`; the CLI and the settings page call the same function, differing only in output form. The questions, defaults and file-writing logic are in `src/peach/onboarding.py`.
- The web does not show a database path input, and `media_root` is `null`. The `root` in a `media_dir` row can be omitted or left empty, and the server fills it in by media directory; when an existing row submits its original `root`, it is kept. When a media directory uniquely matches an existing configuration, the original prefix is reused, and a new directory gets an auto-generated prefix, with the directory name as the media library name.
- On Windows, `[media.locations] local` written by `peach init` is directly those directories, with `[media.mounts]` empty; on macOS the configured directory is `R:\media` (`R:\media2` from the second on…), and the local directories are written into `[media.mounts] local` in the same order. Copy, writer mirror and SMB are never asked, and stay off or empty.
- The switch is handled by `tray.SetupGate`, shared by the Windows tray and the macOS menu bar. It hangs on the health poll (10 seconds on Windows, 5 seconds on macOS) and calls `settings_file.load_config()` again each round; when setup is no longer needed it stops the bootstrap service, builds the normal specs for the new Peach data directory and starts them, without restarting the tray process itself.
- The standalone test package serves HTTP on a high port by setting: local mode binds `127.0.0.1` and publishes no mDNS, LAN mode binds `0.0.0.0` and publishes `<mdns_name>.local:<port>`; the tray's page opening and health checks always go through loopback. Source deployments build the HTTP redirect and the HTTPS entry with `build_service_specs(tls_dir=..., mdns_hostname=...)`, and wait for the next round if the TLS material is incomplete. The mDNS name is passed into the specs from here, not the value read at import time.
- The first scan does not run inside the bootstrap service, because that process is stopped at the switch. Checking "Scan now" in the form only writes a one-time marker `<Peach data directory>/state/first-scan.request` (content is the source ID), which the tray reads and deletes after the switch completes, then runs `peach scan <source>` in a subprocess, with output in `<Peach data directory>/logs/tray-scan.out.log`. Checking scan when saving on the settings page also goes through this marker.
- The settings page's data goes through `/api/configuration`; on save it first copies the old file to `config.previous.toml`, then writes and leaves a reload marker for the tray to take over. Folder picking goes through `/api/pick-folder`.
- The wheel installs `web`, `migrations` and `resources` into `peach/_resources`. `scripts/smoke_wheel.py` runs outside the repository with the interpreter that has the wheel installed; CI's consumer job only downloads artifacts and does not check out the source. Tests use only temporary Peach data directories.
- Per-Monitor V2 DPI must be enabled before Win32 windows are created; normal operation pops up no modal MessageBox, the update check runs in a background thread, and pystray's native non-modal notification gives feedback.

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

Add `?edit` to the page address to turn on text editing; hovering over text shows the editable range, click the text to edit in place, Enter or clicking elsewhere saves, and Esc cancels.
Text on buttons and links uses an input box fitted to the text position. Toggle controls respond to clicks normally, and Alt-click edits the text; "Pause editing" lets you keep operating the page.
Static copy is written back to the selected source among `web/index.html`, `frontend/src` or the library upload and processing modules; when the same text has several locations a source must be chosen. Clearing static text deletes that piece of copy.
Dynamic sentences of library processing show placeholders such as `{problems}`; edit only the surrounding text, keeping every placeholder. The numbers vary with the task and cannot be used to modify library data.
Saving writes directly back to the source, with no export needed. React copy is built automatically, and Python copy has the service reloaded by the source tray; when done the current address is refreshed automatically keeping `?edit`. The floating bar shows save, build and reload states; when taking effect fails, the source edit is kept and "Retry apply" is offered. Before the service reloads it checks whether tasks can resume, and a reload is refused while tasks that cannot resume are still running.
The source file digest is verified before saving, and backups are in `build/copy-editor/backups/`. The frontend builds in a temporary directory and replaces page resources only when the artifacts are complete; the build log is at `build/copy-editor/build.log`. Python automatic reload requires running the source tray.
"Export changes" provides an extra change record, and does not take on saving the source.

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

- The standalone package's version check reads GitHub's public release records and the R2 public manifest, and selects the highest downloadable version; for the same version GitHub is preferred. R2 artifacts must have a SHA-256, and release notes uniformly point to GitHub. When either source is unavailable the other is still checked, and when neither source is obtained a check failure is shown.
- When the tool package download of an update package, full package or light installer fails or fails verification, the other public source's same version and same file name is tried; each time it is verified against the size and SHA-256 of the original release record. The fallback source cannot be swapped for another version or loosen verification, and when both sources fail the error state is kept.

- The version number is defined only in `src/peach/__init__.py::__version__`, using pre-1.0 SemVer. A Git commit is the build identifier, a `vX.Y.Z` tag is the release point, and pushing it to GitHub triggers the Release workflow (see "Desktop Entry and Release").
- The version number moves only at release time, one step per release, so every `X.Y.Z` has a downloadable artifact.
- **Dependency upgrades**: before the release is cut, complete the dependency upgrade batch of [checks for every release](TESTING.md#checks-for-every-release), including applicable compatibility changes, derived artifacts, full verification and local integration; those that cannot be upgraded for now keep the specific reason and failure evidence. When a dependency change is found necessary after the release is cut, first save a draft of the release notes, withdraw this round's version changes not yet committed, and cut the release again after the upgrade is done.
- **Cutting the release**: on a clean master main checkout run `python scripts/release_tag.py --bump auto --apply`. It determines the bump from the range between the previous version tag and HEAD (`bump_part_for()`: a subject starting with `feat`, carrying the breaking marker `!`, or a new file in `migrations/` pushes minor, otherwise patch; 1.0 requires a manual `--bump major` and a separate ADR, see ADR-0012), writes `__version__`, and fixes the unreleased section of `CHANGELOG.md` to this version number. When the range changed only docs, skills and tests it is refused outright, because the package built that way would be identical to the previous tag. `--bump` only writes files without committing, and prints the section it cut for a person to check; without `--apply` it only prints the plan.
- **Publishing**: after confirmation run `python scripts/release_tag.py --ship --apply`, which completes the remaining four steps in one go: commit `src/peach/__init__.py` and `CHANGELOG.md` (message `chore(release): version <new version>`), push master, check this commit's Test workflow every 30 seconds, and once green create and push an annotated tag. It waits at most 30 minutes by default, changeable with `--timeout`. Without `--apply` it only prints the steps.
- Before acting, `--ship` checks: not on master, the changelog lacks the section, the tag is already taken, or the worktree has other changes besides those two release files; if any holds it refuses (the tag points at the release commit, so whatever is smuggled in is published). If Test finishes non-green it stops immediately, at which point the tag has not been made.
- The first step of the tag pipeline runs two npm audits, for the repository root and for `frontend`; a newly disclosed high-severity vulnerability would leave an already created tag unable to publish anything. So before `--bump --apply` writes files, and before `--ship` makes the tag after Test turns green, each first rechecks with the same criteria as `scripts/npm_audit.py`, and stops on a high-severity vulnerability, leaving the version files and the tag untouched.
- While waiting for Test, it also stops immediately when it can be determined that no result will come, rather than running to the timeout: a GitLab required job (`verify-linux`, `verify-windows`, `verify-macos`, `wheel-smoke`) has already failed; a job is queued with nobody to pick it up, and the runners carrying these tags are all offline or paused (reading the runner list needs maintainer permission; when it cannot be read, or no runner carrying these tags is found in the list, it judges to stop after queuing 5 full minutes without starting); there is still no Test record 5 minutes after the push. The error names the job, tags and the time already waited. GitHub makes the same judgment only for self-hosted runner jobs, and hosted-runner queuing is waited out as usual. After fixing it, run `--ship --apply` again to carry on.
- If it stops midway (network loss, CI still running, timeout), just run the same command again: each step first looks at the current state, what is already committed is not committed again, what is already pushed is not pushed again, and the tag is never made if Test is not green.
- To make up a tag on its own use `python scripts/release_tag.py`: by default it only checks that local and GitHub master match, this commit's latest Test is all green, `CHANGELOG.md` has a section for this version and the tag does not exist; with `--apply` it creates the annotated tag and pushes only this tag. It applies when the release commit is already pushed and only the tag is missing. The changelog section is a hard requirement, and if it is missing, draft it first with `--bump`. Version tags are not overwritten, and the next version first changes `__version__`. When a push fails and leaves a local tag, confirm ownership before handling manually, and never force push. The Release workflow further checks that the tag commit is in master history and the Test of the same commit has passed, then checks the artifacts of the successful rehearsal and creates the prerelease. Making a tag means a public prerelease, which is not the same as replacing the local production entry.
- After a confirmed release commit is pushed, if master keeps advancing, use `python scripts/release_tag.py --release-sha <full commit SHA>` to check the release plan of the fixed commit, and after confirming the output add `--apply` to make up the tag. This mode reads the version and changelog from the chosen commit, and before creating the tag checks again the mainline ownership, the latest green Test of the same commit and tag occupancy; it pushes only the tag, keeping the current master. It cannot be combined with `--bump`, `--ship` or `--verify-sha`.
- **When to release**: `scripts/agent_worktree.py integrate` does not change the version number, and only reports the current value, and outputs a `release` field (`due()` of `scripts/changelog.py`). When `due` is true a release is proposed, with the reason in `why`. The rhythm is once a week, earlier when enough entries accumulate, with breaking changes and security fixes not waiting for the cycle (`DUE_DAYS = 7`, `DUE_ENTRIES = 10`). Only user-visible change entries are counted, not commits. `DUE_ENTRIES` is a conservative starting point when there are no samples, `due()` reports the actual entry count and groups each time, and it will be calibrated after several real releases accumulate.
- **End-of-session reminder**: `scripts/release_due.py --hook-event` hangs on the `Stop` hook in Claude's `.claude/settings.json` and Codex's `.codex/hooks.json` (the two sides agree: stdin takes JSON, stdout returns `systemMessage`, exit code 0). It outputs one sentence only when on the main checkout, on master, with a clean worktree, this master sha not yet asked about, and `due` true, and prints nothing otherwise. The asked record is in `<Peach data directory>/state/release-due.json`, and it asks again only after master advances. For manual viewing use `python scripts/release_due.py` with no arguments, which is read-only and changes no record.
- The hook uses `uv run --no-project` to find the interpreter, and the same command works on both platforms. `--no-project` must not be omitted: `release_due.py` uses only the standard library; if uv is allowed to recognize the project, it creates an empty venv in a checkout that has `pyproject.toml` but no venv yet, `scripts/test.ps1` will then prefer it, and tests cannot even import `filelock`. `tests/test_release_due.py` runs the command in the configuration verbatim and checks that no extra `.venv` appears in the working directory. It needs `uv` on PATH, recommended `winget install --id astral-sh.uv`, and do not pipe a remote script directly into a shell.
- "Check for updates" only fetches and compares; "Sync development progress" only does `merge --ff-only`, with no stash, no rebase and no `--force`: parallel worktrees and the main checkout share the same object store and reflog, and any history-rewriting operation affects other branches. When the worktree has changes or the two sides have diverged, it reports as is and leaves it to a person. When local is not behind the remote or the remote cannot be reached, whether the packaged tray needs rebuilding is judged by build identity (see "Desktop Entry and Release"); this path does not block a worktree with changes, because the build uses the code in the checkout.
- When a fast-forward involves `tray.py`/`menubar.py`/`versioning.py`/`certs.py`/`netwatch.py`/`config.py`/`pyproject.toml`, restarting only the child service is not enough, and the tray restarts itself with `launchctl kickstart -k`: first `stop_owned()`, then kickstart, provided that the pid launchd reports equals its own pid.

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
- Applied migration files must not be modified, and any later change needs a new version. Rewriting an applied migration causes checksum drift, and the only fix is to replay from the pre-migration backup, compare differences item by item until zero, then correct `schema_migration`.
- Automatic retirement of database backups: `ledger.pre-*.db` is managed by `peach.ledger_backups`, with all three kinds "most recent 5", "within 24 hours" and "newer than `ledger.db`" kept, and the rest deleted together with `-wal`/`-shm`. The Windows tray runs it automatically at every startup; when `scripts/prune_ledger_backups.py` is run manually it only lists the plan by default and `--apply` is needed to delete; when the database `integrity_check` is not ok, retirement is refused with exit code 2. Each backup is over a hundred MB, and 5 days without cleanup is 7 GB.
- Automatic retirement of organize backups: download-then-organize and manual organize each leave a whole-database backup before writing, in `<Peach data directory>/generated/organize-backups/`, with file names `ledger.pre-download-<task>-<time>.db` and `ledger.pre-organize-<time>-<task>.db`. After each backup write this directory is retired by the same rules, keeping only the most recent 5 (`ORGANIZE_KEEP_RECENT`) and not keeping by age (`ORGANIZE_MIN_AGE` is zero): a wave of downloads can organize forty files in an hour, and a 24-hour window would accumulate tens of GB. The one being referenced by an organize in progress is registered by `ledger_backups.holding`, and retirement inside the web service process skips it; other file names in the directory are left alone. For manual viewing or cleanup use `scripts/prune_ledger_backups.py --organize`, likewise listing only the plan by default and needing `--apply` to delete; registration does not cross processes, and do not give `--keep 0` while an organize is in progress.
- All `*.log` in `<Peach data directory>/logs` are kept for half a year, with no size limit (`peach.log_retention.sweep`, run by the tray before starting any subprocess): a file not written for half a year is deleted whole; a file still being written is segmented by calendar month, and one whose last write was in an earlier month is renamed to `<name>.until-<last write date>.log`, deleted after another half year. Subprocesses append stdout directly without going through `logging`, so it is handled by file, not by line.
- Automatic retirement of update and packaging artifacts: at every startup the tray keeps only the 2 most recent backups `dist/Peach/Peach.pre-source-sync-*.exe`, and deletes the staged builds in `<Peach data directory>/state/source-sync-build/` that do not belong to a pending apply record (`WindowsUpdateInstaller.sweep_artifacts`); after `build_windows.ps1` succeeds it deletes the PyInstaller work directory `build/windows/app`; the single-file tray at every startup deletes `_MEI*` extraction leftovers in `%TEMP%` older than a day and not its own (`sweep_onefile_extractions`; when the tray is killed PyInstaller does not clean up on its own, 40–80 MB each). Automatic cleanup recognizes only these naming forms: the `Peach.exe` itself, directories placed in `dist/` by hand, `build/release-*` and `attic/` are never touched, and leftovers of manual builds must be deleted yourself.
- The deletion scope of rebuildable caches is determined by the current database path: a production database can clean only caches under the same `peach-data`, a temporary database can clean only its temporary directory, and anything outside the scope is skipped. Emptying the trash in tests must use a temporary Peach data directory, and a missed setting would delete real covers.
- Resource sync uses a background job and reports progress per source, to avoid the sync full-library scan blocking requests; the same directory is enumerated only once, directory metadata concurrency is fixed at 8, and it neither reruns the whole library nor blindly trusts old results.
- Ops scripts must not produce file, network or database side effects when imported. `scrape_codes.py` writes a resumable review CSV by default; `clean_names.py` previews first, `--apply` must also be given `--backup <path>`, and after the backup is written its integrity is verified on the spot (`peach.scripting.open_for_write`).
- The compilation criteria of follow updates act only on newly fetched candidates. After tightening the threshold, scan the existing stock with `scripts/prune_follow_compilations.py`: by default it only lists and writes a review CSV, and `--apply` first backs up to `ledger.pre-follow-compilations-*.db` before deleting, with entries already saved as assets never touched. Old rows whose detail pages were never probed have no credits, and the criteria cannot count them.
- File names are normalized only by the product codes already confirmed in the database, and codes are not re-guessed from file names. When only case changes, it goes through a temporary name in the same directory; for those with duplicate names after ad removal, a suffix starting from `(2)` keeps both.
- `generated/cover-fetch-log.csv` is evidence of source, size and result, and is not cleaned together with the images. When images are lost, use `scripts/fetch_jav_covers.py --restore-successes` to restore from the original URLs in the success records and replace atomically; failures are still recorded as failures, and thumbnails never stand in for covers.
- Cover candidates must be confined to the current work's main cover node: a work page is mixed with hundreds of related works, stills and performer avatars, and measuring every image URL on the whole page is forbidden.
- The article archive of FC2CMADB serves only as mirror evidence for the official product page: titles and conservatively translated tags are written into the candidate CSV and enter `/review` together with the latest JAV metadata batch, and are not written to the database automatically. For covers, replace the list's `w276` with a confirmed existing `w1200`, then go through the decoding, width, disk and atomic write checks of `fetch_jav_covers.py --fc2-only`, with failures logged one by one.
- When approving official tags, `(asset_id, tag)` conflict update must be used to update source and confidence: the unique constraint of `asset_tag` makes `INSERT OR IGNORE` keep the old source, so a value that already exists does not show "official".
- "Not junk" writes a per-asset, undoable `junk_file` review decision. In junk judgment, the evidence of promotional names, directories and creator positions is shared across types, and for videos duration, size and a longer version of the same product code are also consulted.

### Frontend and Verification Standards

- Metadata from the database must not be interpolated into inline JavaScript event attributes: an apostrophe in a real studio name causes a Firefox syntax error directly.
- The frontend API wrapper must check the HTTP status before returning JSON: on a read-only conflict the write endpoint returns `409` and error JSON, and treating that as ordinary success clears the selection and reloads, so the user just sees the entry come back unchanged. Batch handling and detail feedback must keep the current selection and show the failure reason.
- Report verification results separately: static/unit/API, desktop browser, 390×844 phone, and whether the production service has been restarted.
