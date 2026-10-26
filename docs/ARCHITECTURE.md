# Overall architecture

This document covers what parts Peach is made of, what each part is responsible for, how data flows, and which directions are explicitly not taken. The reasoning behind each trade-off is in `docs/adr/`.

## Product shape

Peach is a FastAPI modular monolith: the frontend and backend are separate logically but still deploy as one process. Single-user and local self-hosted by default; online follow-up, external metadata, and pluggable AI are all official capabilities.

The application port is not exposed directly to the public internet. For remote access and the authentication boundary see the [security notes](../SECURITY.md); for VPN and Cloudflare Tunnel setup see [Operations and configuration](OPERATIONS.md).

## Core boundaries

Each part does one thing, and crossing parts goes only through the interfaces written below.

1. **Peach database (ledger)**: stores media records, personal actions, metadata sources, and profiles of people in SQLite. The application treats the data saved here as the truth. Two machines each hold a copy of the database, and only one may modify it at a time; `peach.sync` does the copying, and when both modify it, it switches to read-only and asks which database to keep, with **no multi-master merge**.
2. **API / application layer**: FastAPI serves pages, JSON, media responses, and the write boundary. `api.py` only assembles; routes are split across five APIRouters, `routes_auth`, `routes_pages`, `routes_media`, `routes_configuration`, `routes_api`; `/api/{route}` is dispatched by the `web_router` handler table to domain modules such as `web_catalog`, `web_entity`, `web_stats`, `web_batch`, and `web_follow`.
3. **Platform layer**: `peach.platform` converts the media paths in the database into the file paths the current system actually reads. A movie record's `asset.path` uses Windows format on every system; `asset.location` denotes the media source, for example `local`, `115`. `[media.locations]` stores the directory prefixes in the database, and `[media.mounts]` stores the real directories on this machine. For example `R:\media\a.mp4` in the database can map to `/media/a.mp4` in a container, and Linux does not need an `R:` drive. Docker, Linux, and macOS all use these two settings; Windows uses the database path directly. When no corresponding real directory exists, the platform layer refuses to read, the source shows offline, and the media records in the database are kept. `PEACH_MEDIA_MOUNTS` can temporarily override the real directories. CloudDrive uses drive letters on Windows and macFUSE mount directories on macOS; this layer handles the system differences.
4. **Media Engine**: FastAPI holds exactly one `MediaEngine`, and local files and mounted drives are both native backends. Remote MP4 uses standard Range by default; `stream-plan` gives time-based HLS segments only when explicitly enabled. HLS is an exception, not the default, because HEVC-in-TS silently goes black (ADR-0016).
5. **Web**: single page, mobile first. The main interface is rendered by a React route tree; application-domain controllers, shared state, and controls live in `frontend/src/`; it uses Tailwind v4 and the BoardUI source, and build output is committed to `web/dist/`. Adapter retirement follows ADR-0031, and module responsibilities are in [Frontend layer](FRONTEND.md).
6. **AI Provider**: `InferenceProvider` and `AgentProvider` are separate. AI only produces candidates with a source and a confidence.
7. **Profile**: single-user by default; the data model reserves user/profile, and no full account system is introduced.
8. **Follow sources**: entries returned by protocols such as RSS/Atom are first converted to a unified metadata format; raw data, manual confirmation, and database writes are handled separately. The "want" list `want_item` registers outside-library titles by product code, and when scanning registers a movie it matches the list by product code automatically (ADR-0090).
9. **Task system**: source cost, disk gate, process ownership, progress, and source evidence are defined by Peach itself; HTTP, scheduling, media probing, images, and protocol parsing use mature components.
10. **Download**: Peach only hands magnets to the drive's offline download (115 via CloudDrive2 gRPC, PikPak directly), and after files land they are still registered by push discovery and scanning (ADR-0089).
11. **HTTP / search**: network adapters share a long-lived HTTPX transport by default. There are three exceptions, each with registered evidence: FANBOX public `post.info` uses a pinned-version `curl_cffi` to keep Firefox's TLS/HTTP2 transport characteristics, but solves no challenge, does not log in, and does not read paid content; sources behind Cloudflare fetch pages by driving the local browser through `peach.browser_transport` (ADR-0065); 115 cloud download is submitted through CloudDrive2's gRPC interface, with `grpcio` pinned to an exact version (ADR-0089). Title full-text search uses SQLite FTS5 trigram, with short queries falling back to LIKE.

## Data flow

```text
local/drive/online sources -> index/probe -> ledger.db
                                  -> FastAPI -> Web/player
AI/external metadata -> reviewed candidates -> ledger
```

## Explicitly not doing

- Microservices, message bus, PostgreSQL
- A one-shot rewrite of the whole frontend (migrate page by page only, per ADR-0031)
- Scraping or storing ChatGPT/Claude OAuth tokens
- Treating Stash's private directories or GPL builds as a stable packaging dependency of Peach

For the data defects and license boundary inherited from Stash see [docs/STASH.md](STASH.md); for the boundary between reuse and in-house work and the succession of old scripts see [docs/REUSE.md](REUSE.md).

## Runtime data directory

Windows and macOS each hold the code, `peach-data`, `.venv`, and worktrees on their internal disk; the external disk only provides the media mount points declared in the configuration. Between machines there are only three channels, each going its own way, and one failing is not replaced by another:

- Code and task branches go through GitHub, and worktree directories are rebuilt locally on each machine;
- The database is copied between the two devices by Peach, and only one can modify it at a time;
- Generated artifacts such as images sync one way through Syncthing.

Other runtime data is split into durable artifacts and local state, and syncing it as a whole is forbidden; the boundary is in ADR-0017.

`peach-data` is kept apart from the code repository: by default it is the `peach-data/` next to the repository, `peach init --data-root` can change it, and the environment variable `PEACH_DATA_ROOT` overrides it; local coordinates are written in `<Peach data directory>/config.toml`. The directory layers are as follows:

- `database/`: the SQLite source-of-truth database. The local one is the working copy, and lineage is recorded in `ledger.db.sync.json` in the same directory
- `generated/`: snapshots, posters, avatars, and studio logos; `follow-assets/` and `link-marks/` are rebuildable caches of follow avatars, source icons, and external-link round marks
- `sources/`: immutable raw inputs such as browser, follow-up, inventory, and exports
- `state/`: task checkpoints, local runtime state, and locks
- `secrets/`: credential material kept only on this machine
- `logs/`: current run logs
- `archive/`: historical migration evidence and backups
- `inbox/`: temporary imports awaiting processing
- `tools/`: locally managed runtimes such as FFmpeg; binaries and licenses do not enter Git

This is the agreed layering. Verify each machine's actual paths, symlinks, and mount state before operating; run records are in [Operations and configuration](OPERATIONS.md).
