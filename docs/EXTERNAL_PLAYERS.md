# External Players and VR

The work detail for local or mounted videos offers "External player / VR". After choosing this device's player, click "Generate playback link",
then open the player or download an M3U playlist. VR players can use the generated network playback URL.

| Option | How to use |
| --- | --- |
| M3U playlist | Open the downloaded `.m3u` with an external player that supports network URLs |
| VLC (iPhone / iPad) | Calls VLC's `vlc-x-callback` protocol |
| IINA (Mac) | Calls IINA's `iina://weblink` protocol |

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

The VLC protocol follows the [VideoLAN official implementation note](https://mailman.videolan.org/pipermail/vlc-devel/2014-October/099830.html),
and the IINA protocol follows the [IINA upstream protocol discussion](https://github.com/iina/iina/issues/3922). Player implementations do not enter Peach,
and there are no new dependencies. Actual playback after the protocol opens depends on whether the client has the matching player installed; automated verification covers tickets, Range,
M3U content, and page interaction, and does not replace decoding acceptance on real devices.

Windows native verification uses the existing ffplay, a temporary HTTPS service, and a dedicated test certificate to play the signed network address in the M3U.
A two-second H.264 synthetic test picture played and exited normally with audio off and output hidden, and ffprobe confirmed 20 decoded frames;
TLS verification stayed on. This verification does not cover VLC / IINA protocol launch or VR projection.
