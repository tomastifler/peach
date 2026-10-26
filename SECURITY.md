# Security

Peach is a single-user, self-hosted application: one deployment serves one person, with no accounts, roles or tenant isolation. The threat model covers one thing only: other devices on the same LAN being let in by accident. Browser access is protected by an optional access password (scrypt-hashed, login attempts limited per client); scripts use an internal token under `<data root>/secrets/`, and `peach serve` refuses to start on a non-loopback address when it has no token. Source deployments serve HTTPS with a self-signed local CA (only the CA certificate is ever distributed); the standalone Windows package serves plain HTTP on the LAN. Do not expose Peach to the public internet through port forwarding or a reverse proxy: there is no audit log and no second factor. The built-in Cloudflare entry refuses to start without an access password and is meant for temporary previews. Report vulnerabilities through the repository's GitHub **Security** tab (**Private vulnerability reporting**), not a public issue.

## Threat model

Peach is a single-user, self-hosted application: one deployment serves one person, with no account system, no permission tiers and no multi-tenant isolation.

Configuration management on a headless Linux deployment accepts authenticated loopback and private-network connections, and rejects management requests from public, link-local or reserved addresses or carrying forwarding headers. Address classification uses the Python standard library. Container ports are published to the host loopback by default; see [Docker deployment](docs/DOCKER.md) for how to deploy.

Anyone who can open Peach can see the whole library and make any change. Peach guards against one thing only: other devices on the same LAN being let in by accident. Shared use by several people and cloud hosting are out of scope.

## Access password

The access password decides whether a browser has to sign in to open Peach.

- The first-run setup page lets you set an access password or leave it blank. Afterwards, change or turn it off under "Network & Access → Access password" on the configuration page.
- **With no password set, any device that can reach Peach gets in just by opening the address.** If other people are on your LAN, be sure to set one.
- The password must be 8–256 characters. Changing it requires the current password; turning it off also requires ticking a confirmation of the access scope.
- Ticking "Stay signed in" at login keeps you signed in for 30 days; otherwise the session lasts only for that browser session, 12 hours at most. Refreshing the page does not extend it.
- After a password change, sign-ins in all other browsers are invalidated; the current device stays signed in.
- Each source may attempt at most 10 logins per minute; beyond that it must wait a minute.
- The password is stored as an scrypt hash in `<Peach data root>/secrets/access.json` on this machine. It never enters the database and is never synced.

For existing deployments without an `access.json`, the login page uses the access token below.

## Access token

The access token is for scripts and API calls. It is a separate credential from the access password.

- The token is stored in `<Peach data root>/secrets/auth-token` and is generated automatically by `peach init`.
- `peach token` shows the token; `peach token --rotate` replaces it with a new one, and the service must be restarted afterwards. Rotating invalidates the old token and any sessions signed in with it; browsers signed in with the access password are unaffected.
- The lookup order is the `--token` argument, the `PEACH_TOKEN` environment variable, then the token file. Do not pass `--token <token>` for long-term use: other programs on the same computer can see the command line in the process list. The token is also never written to `config.toml`, because that file may get pasted into an issue.
- Scripts send the token in the `X-Token` request header. The `?t=<token>` query parameter also works, but the token then stays in access logs, proxy logs and browsing history, so use it only for one-off cases.
- **`peach serve` refuses to start when it listens on a non-loopback address without a token**, rather than just printing a warning: the tray starts the service in the background where nobody sees a warning, yet the service would already be open to the whole LAN. Listening on `127.0.0.1` only is fine without a token.
- When replication between two computers is enabled, both must use the same token file; just copy it over.

Both the token and the password are compared with a constant-time comparison.

## Network exposure

- `peach serve` listens on `127.0.0.1` only by default; the address and port are in the `[server]` section of `<Peach data root>/config.toml`. Devices on the same network segment can connect only after you change `host` to `0.0.0.0` or a LAN address. The standalone test package listens on `0.0.0.0` when you pick "Devices on the same LAN" in first-run setup.
- Source deployments use HTTPS, with certificates issued by a locally self-signed CA rather than a public CA. `peach init` generates the CA and server certificate under `<Peach data root>/secrets/tls/`. The server certificate is valid for 397 days (Apple caps TLS server certificates at 398 days); when this machine's address changes, Peach reissues it from the same CA, so devices that already trust the CA need no reinstall.
- Devices that need access install and trust only `peach-local-ca.crt`; no private key is ever distributed. For installation and fingerprint verification, see [Operations and configuration](docs/OPERATIONS.md).
- The standalone Windows test package uses HTTP on the LAN, so traffic is not encrypted.
- **Do not put Peach directly on the public internet with port forwarding or a reverse proxy.** Peach has no audit log and no second authentication factor, so doing so hands over the entire library and all modification rights.
- The "Cloudflare public entry" on the configuration page can only be started after an access password is set, and is suitable only for temporary previews. For long-term access from outside, use a private channel such as a VPN.
- Every response asks search engines not to index it (`X-Robots-Tag: noindex`, and `/robots.txt` disallows crawling); this cannot be turned off.

## Credentials and data

- Site cookies, tokens, the access password and TLS private keys all live in `<Peach data root>/secrets/`. They stay out of Git, out of logs and out of every API response. Backing up the data root also backs up these credentials, so store backups to the standard you would apply to credentials.
- The database `<Peach data root>/database/ledger.db` records file paths, performer and other metadata, and watch history. Like the media, it does not belong in the code repository. Before submitting an issue, log or screenshot, strip out paths, LAN addresses and account names.

## Reporting vulnerabilities

Please submit through **Private vulnerability reporting** on this repository's GitHub **Security** tab, not as a public issue.

Include the affected version or commit, reproduction steps and the actual impact. The repository is maintained by one person, so responses are best-effort and fixes are ordered by real impact.
