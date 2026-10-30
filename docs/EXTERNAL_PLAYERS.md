# External Players and VR

## Local Players

On Windows or macOS, open the work's detail on the computer running Peach, choose "System default player" or a detected player above the detail, and click "Open" on the same row. On Windows, PotPlayer, VLC and mpv are detected in PATH and common install directories; on macOS, IINA, VLC and mpv are detected in the system and user application directories. The choice is saved in the current browser; the player receives the original media file, and web playback pauses once the request succeeds.

The player menu lists only programs that the current deployment supports and that are detected as installed, plus the system default player. The same selector also offers a network playback address and an M3U playlist, for Docker and remote access. On Windows, after downloading the M3U, you can open it with the system default player, or choose a player through the system's "Open with". The player must support the media format, the network address and Peach's certificate.

The local-open endpoint is open only to direct local connections and rejects forwarded requests; Docker and desktop-less deployments do not launch apps on the host or in the container. The endpoint accepts a ledger asset ID and a fixed player ID, opens the file after authorization through the media root, and does not accept a client-specified program or file path. STRM uses the network playback address or M3U.

## Web Video Rotation

The player's "Settings → Rotate video" offers 0°, 90°, 180° and 270°; 0° restores the original orientation. The picture keeps its ratio and fits the player, and the control bar stays upright. Fitting continues when switching quality, theater mode and fullscreen. Rotation affects only the web picture and does not modify media files or external player settings.

Rotation, playback speed, subtitle selection and subtitle appearance are saved per video in the same server-side memory file, shared by the detail view, the mini window and immersive playback; they are restored after a refresh, reopening or switching browsers. Setting 0°, normal speed or turning subtitles off is saved as well, and videos do not affect each other. WebVTT content and the memory file are placed in the data directory under `state/player-subtitles/<video id>/`, with the manifest `subtitles.json`. Windows, macOS and Docker share this storage; Docker needs the data directory mounted persistently. Existing subtitle content and selections carry over directly, and the subtitle appearance already saved in the browser serves as the initial value for videos that have no appearance record yet. The playback memory endpoint is `GET/PUT /api/player/memory?video=…`, the subtitle endpoint shares the same manifest, and an update merges only the submitted fields and does not modify the ledger.

The picture-in-picture entry holds a fixed place in browsers that support the API, and is disabled while media loads. When the browser explicitly refuses picture-in-picture, the entry keeps the reason it is unavailable. A browser declaring the API available does not guarantee a system window can be created; for limits and exceptions see the [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture).

## Network Playback

The work detail for local or mounted videos shares one row for the player selector and the "Open" button. After choosing a network playback method, click "Open",
and a time-limited link is generated and an M3U is downloaded. When "Network playback address / VR" is chosen, only a copyable address is shown.

| Option | How to use |
| --- | --- |
| M3U playlist | Open the downloaded `.m3u` with an external player that supports network addresses |
| Network playback address / VR | Generate and display the address, for players such as VR |

The player choice is saved only in the current browser. Another device must be able to reach the current Peach address; a URL generated on the computer with `localhost`
cannot be used from a phone. When HTTPS uses the project certificate, external devices also need to trust that certificate.

A playback link is valid for 6 hours and expires when Peach restarts. The link only allows reading the selected asset and contains no local drive-letter path or
long-lived login credential. Requests support HTTP Range and transfer the original file; decoding capability and VR projection are decided by the external player.
Generating a link and opening a player do not count as watch records, and cannot prove the player has started playing.

## Protocol and Verification

The issuing endpoint `POST /api/external-playback?id=…` uses the existing login and same-origin checks. The stream and M3U endpoints verify
a single-asset time-limited ticket signed with an in-process key, and every read still goes through the existing media-root check.
The origin of the playback URL is signed too: the page Origin that passed the same-origin check is preferred; clients without an Origin use the configured
tunnel entry or the current service address. The M3U uses this signed address, so a local Host forwarded by a proxy does not rewrite the public entry in the playlist.

The player implementations do not enter Peach, and no dependencies are added. Automated verification covers tickets, Range,
M3U content and page interaction, and does not replace decoding acceptance on real devices.

Windows native verification uses the existing ffplay, a temporary HTTPS service and a dedicated test certificate, playing the signed network address in the M3U.
A two-second H.264 synthetic test picture plays and exits normally with audio off and output hidden, and ffprobe confirms 20 decoded frames;
TLS verification stays on. This verification does not cover launching a local player or VR projection.

Local opening reuses Python's standard library [Windows file association](https://docs.python.org/3/library/os.html#os.startfile) and macOS's [`open`](https://support.apple.com/guide/terminal/apdb66b5242-0d18-49fc-9c47-a2498b7c91d5/mac). Process arguments are passed as an array, not through a shell. Cross-platform automation covers the invocation arguments and permission boundaries; system associations, app launching and real media decoding need verification on the corresponding desktop systems.
