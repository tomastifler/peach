# Windows test build

The Windows build comes as a full installer, a lite installer and a portable package, none of which needs a separate Python, Git, Node or OpenSSL. For the macOS DMG build, installation and the limits of the test package, see [macOS standalone test package](OPERATIONS.md#standalone-macos-test-build).

| File | Purpose |
| --- | --- |
| `Peach-<version>-windows-x64-setup.exe` | Full installer, includes all tools, can be installed offline |
| `Peach-<version>-windows-x64-lite-setup.exe` | Lite installer, verifies and reuses existing tools, and downloads them automatically when missing or the version does not match |
| `Peach-<version>-windows-x64.zip` | Full portable package, run `Peach.exe` after extracting |

The installers install to `%LOCALAPPDATA%\Programs\Peach` by default, the directory can be changed, and no administrator rights are needed; both installers provide an uninstall entry in the Start menu and in system Settings. The portable package stays wherever it is extracted.

All three packages keep their data in `%LOCALAPPDATA%\Peach\peach-data`, so when you switch to another one, settings and the database carry over as usual.

The lite installer first gathers and verifies the tools in a temporary directory, then stops the old program and installs; a failed download can be retried, and the existing installation is kept. When a matching `tools-*.zip` sits next to the installer, it can be verified and used directly.

The installation directory must be a separate folder writable by the current user, and its parent directory must also be writable so that automatic updates work. You can choose an empty folder or an existing Peach installation directory; the program directory must not overlap the data directory or pass through a directory link. Upgrades reuse the existing installation directory by default. To change the location, uninstall first while keeping the data, then install to the new directory.

## Getting started

1. Download one of them and `SHA256SUMS.txt` from [GitHub Releases](https://github.com/peach-mitao/peach/releases).
2. Verify the hash: run `Get-FileHash .\<downloaded file name>` in PowerShell; the result should match the corresponding line in `SHA256SUMS.txt` (case-insensitive).
3. Installer: double-click it, choose the installation directory, follow the prompts, and on the last step check "Run Peach". Portable package: right-click the archive, choose "Extract All", keep the whole `Peach` folder (do not take out only `Peach.exe`), then double-click `Peach.exe`.
4. The browser opens the first-run setup page.
5. Add a media directory (you can pick it with "Choose folder"), choose who can access it, whether to set an access password and whether to scan immediately, then submit.
6. When setup finishes you go straight into the library, and a setup guide appears at the bottom right; follow it or skip items one by one.

The test build is not code-signed, and Windows may show "Unrecognized app". First confirm the file comes from this project's Release page and the hash matches `SHA256SUMS.txt`, then decide whether to run it.

## Opening from other devices

- Choose "Only this computer": it can only be opened on this machine at `http://127.0.0.1:<port>`.
- Choose "Devices on the same LAN": phones, tablets or computers on the same network open `http://<configured name>.local:<port>`.

On the LAN the test build uses HTTP, and traffic is not encrypted. When other people are on the LAN, set an access password.

When Windows asks for firewall permission for the first time, check only "Private networks".

If other devices cannot connect, check in order:

1. Both devices are on the same network.
2. The router does not have "client isolation" turned on (sometimes called AP isolation).
3. Windows Firewall allows Peach on private networks.

## Changing the configuration

Open the configuration page from the management menu "Configuration", from "Open configuration page" under "This computer" in the settings dialog, or from the tray menu "Configure Peach". Here you can add or remove media directories, change the port, set an access password and request a rescan.

- Saving the configuration restarts the local service, and any video that is playing is interrupted.
- Before each save, the previous configuration is backed up as `config.previous.toml` in the data directory.
- When you change the port, the page checks for conflicts. If the port is in use, quit the program using it and try again.

Data is stored in `%LOCALAPPDATA%\Peach\peach-data`, separate from the program folder.

## Playback and FFmpeg

The full installer and the full portable ZIP both include FFmpeg and ffprobe, located in `tools\ffmpeg\bin` in the program directory; the lite installer gathers the tools during installation. Transcoding, media information probing and thumbnails need no extra configuration. `*-update.zip` is verified and installed by the Peach updater and has no manual import entry; for a first installation use either installer or the full portable package. `tools-*.zip` is handled on demand by the updater or the lite installer.

The full installer and the full portable ZIP also include the face models used for avatar framing and matching, located in `tools\face-models`, together with the licenses of both models (YuNet is MIT, SFace is Apache-2.0); they work without a network. When this model is deleted, quarantined by security software or fails verification, Peach downloads it into the data directory instead, and on failure shows a prompt under "Needs attention" in the activity center, where you can retry immediately.

Repair of MP4 files missing an index uses the bundled `tools\untrunc\untrunc.exe`, which needs a complete reference clip with the same encoding parameters. This tool and the FFmpeg libraries it is compatible with are built separately and distributed under GPL-2.0-or-later; the complete corresponding source artifact is `untrunc-corresponding-source.zip` in the same Release. An explicit `PEACH_UNTRUNC` takes precedence over the bundled tool, followed by a lookup in the data directory and PATH.

The tools are invoked as separate processes and distributed under GPL-3.0-or-later; the tool directory contains the licenses, build configuration, source manifest and SHA-256. The complete corresponding source artifact `ffmpeg-corresponding-source.zip` sits in the same Release as the app, and contains pinned sources and build scripts for FFmpeg, x264, dav1d, nv-codec-headers, the AMF headers and libvpl. Release builds verify the tools and the corresponding sources, and packaging stops if any item is missing or its hash does not match.

When running from source, put FFmpeg and ffprobe on PATH, or place them in `tools\ffmpeg\bin` in the data directory. An explicitly set `PEACH_FFMPEG` or `PEACH_FFPROBE` takes priority; a standalone package then uses the bundled tools, followed by the data directory and PATH.

If media tools are already installed on the system, run [`import_windows_media_tools.cmd`](../scripts/import_windows_media_tools.cmd); it calls the PowerShell script in the same directory to detect WinGet, Scoop, Chocolatey, PATH and the download directory, and puts the tools and the DLLs in the same directory into Peach's data directory, keeping a backup when it replaces files. When no extracted tools are detected, it can recognize Gyan's `ffmpeg-9.0.2-essentials_build.zip` in the download directory and extract and wire it up after verifying the pinned SHA-256. The script does not modify the system PATH or the library ledger; refresh the configuration page when it finishes.

## Temporary access from the internet

"Cloudflare public entry" under "Network and access" on the configuration page can generate a temporary public link, off by default.

1. First set a password under "Access password" in the same group. The public entry cannot start without a password.
2. Click "Start public entry".
3. The page shows a random address `https://<id>.trycloudflare.com`; use it to access. `https://try.cloudflare.com/` is only an introduction page, not your entry.

Notes:

- This is only for temporary preview. The address is random, becomes invalid once you stop the public entry or quit Peach, and changes the next time it starts.
- Do not save the random address in bookmarks, documents or public configuration.
- The test build already bundles a SHA-256-verified `cloudflared.exe`; no separate install is needed.
- If the connection fails, check whether the firewall or proxy allows cloudflared outbound access on TCP/UDP port `7844`. A random address appearing on the page does not mean the connection has succeeded.

## Collection sources

The Windows full installer, portable package, light installer and app update package all ship with the amane standalone console bridge at the version pinned by the lock file, so users need not install Python, uv or Git. The runtime directory is at `_internal\tools\amane-runtime` in the program resources; the bridge is a required app resource and is not split off with the optional media tools. The standalone macOS app carries the bridge for the matching architecture in `Contents/Frameworks/tools/amane-runtime`, and the data resources are mapped to `Contents/Resources` through in-app links.

Desktop builds call `scripts/build_amane_runtime.py`, which installs a standalone build environment from the bridge's `uv.lock`, then reuses the PyInstaller pinned by the main lock to produce the runtime directory. The build runs `--self-check`, loading the runtime and all Peach-enabled site classes offline; site connectivity checks still need a real network. `manifest.json` in the directory records the version, the full revision and the executable's relative path. The GPL-3.0 license, source notes, amane's complete corresponding source, and the pinned sources of zhconv and certifi are distributed together with the runtime directory.

1. After the scan finishes, open the "Data Management" page and click "Sources and credentials" on the "Scanning and collection" card.
2. Each source lets you choose a connection mode: "Peach proxy" or "Direct connection". HD sources usually need a proxy; "Peach proxy" uses the setting under "Network and access → Peach proxy" on the configuration page (system proxy, direct connection or a custom address; the system proxy does not support PAC).
3. Click "Check connection". DMM checks the page and the HD image server separately, and the image check shows the actual pixel size.
4. Under "HD cover", enter a product code already in your library and click "Fetch cover". The existing cover is replaced only if the new image decodes completely and has more pixels than the current cover; on failure the existing image is kept. If the same code was fetched successfully within 24 hours, the file already on this machine is used directly.
5. For sources that need cookies (for example FC2), choose either "Paste cookie" or "Import file"; the file supports Netscape-format `.txt`. Cookies are saved only on this computer and are not shared between computers.

"Saved" only means the cookie was stored, not that the login is still valid. After revoking, collection from that source that needs a login requires the cookie to be provided again. Cookies in the browser cannot be imported directly; they can only be pasted or imported from a file. For more on sources see [Source collection](https://github.com/peach-mitao/peach/blob/master/docs/SOURCING.md).

## Updating

Operate under "App and maintenance → Check for updates" on the configuration page:

1. Click "Check for updates". When a new version exists, "Download and install" appears.
2. Click "Download and install" and wait for the download, verification, extraction and installation preparation to finish.
3. Click "Restart to install".

If the first-run setup page appears even though a library already exists, click "Use existing data directory" and enter the `peach-data` directory that holds the library. After a successful connection the location is remembered and the original configuration, ledger and access password are reused. A deployment that has not yet entered the library can first run the new installer and then reconnect the existing directory.

You can also turn on "Automatically check for new versions" and "Automatically download updates"; after the download finishes you still confirm the restart here.

You can also update manually. The data directory needs no changes, and the new version reuses the existing configuration after it starts:

- Installer: simply run the new installer. It first makes the running Peach exit, and after installing it updates the local database if needed; the database backup made before the update is in the `database` folder of the data directory, with a file name starting with `ledger.pre-migrate-`.
- Portable package: first quit Peach from the tray, then extract the new full package into a new folder. Do not replace only `Peach.exe`: the `_internal` folder next to it is also part of the program.

## Uninstalling

Operate under "Maintenance → Uninstall Peach" on the configuration page. Uninstalling first quits Peach, then removes the program folder, startup entry and desktop icon; for installer-based installs, the Start menu entry and the uninstall entry in system Settings are removed as well.

An installer-based install can also be uninstalled from system Settings under "Apps → Installed apps". This route removes only the program, the Start menu entry, the startup entry and the desktop icon, and all data is kept; to delete the data as well, use "Complete uninstall" on the configuration page.

- Data is kept by default: settings, the local database, watch history and caches remain, so a later reinstall can pick up where you left off.
- Checking "Complete uninstall" also deletes settings, the local database, watch history, credentials and caches.
- Original media files are never deleted under any circumstances. A `config.toml.bak` you copied by hand and other files Peach does not recognize are also kept.
- When the data directory is elsewhere, uses a directory link, or overlaps the media directory, "Complete uninstall" is unavailable and you need to clean up manually against the directories listed on the page.
- When deletion fails because a file is in use, the dialog gives the log location; the log is `peach-uninstall.log` in the temporary directory, and it records the failing path and the reason.

## Reporting problems

When startup fails, keep the full dialog and find the `peach-support-*.zip` the dialog points to. When the program can run, get the report from the tray "Export diagnostic report" or the system diagnostics page "Download diagnostic report"; it can also be exported before the program is configured. Before sending, open the report and confirm it contains no private information you want to keep.

Please include the version, operating system, steps, expected result and actual result. For collection-related problems, also add the source, connection mode, code, page state and image pixel size. The version, data directory and log directory are all on the configuration page under "Runtime information".

Before sending:

- Check the logs and remove personal paths and source URLs.
- Do not send the `secrets` directory, the database, cookies or signed image URLs.
