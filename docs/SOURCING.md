# Identity, Source and Mark Collection

This file covers how Peach pulls work metadata, performer and studio identity, avatars and marks from external sites: how each source is wired in, what it requires,
which limits it runs into, and where to look when something fails. It describes how things work now; for the history of changes see Git and the ADRs.

- Batch-job rate limits, resuming and traffic budgets: `.claude/skills/peach-batch-jobs/SKILL.md`.
- Evidence registration when referencing external products: `.claude/skills/peach-reference-evidence/SKILL.md`.
- Before actually writing the ledger, read `.claude/skills/peach-ledger-write/SKILL.md`.

In development notes, **candidate** means information that keeps its source and confidence and still awaits a decision; in user-facing text, write it as pending-confirmation data, search results or alternative images according to use. **Review sheet** in this file means a CSV: when sent for review it is a table of pending-confirmation data, and after a human decision is saved it is a table of confirmed results. **Not obtained** means the corresponding data or evidence was not obtained; it is never filled in by guesswork.

| What you want to do | Section |
| --- | --- |
| Judge whether something a source says can be trusted | Collection Criteria |
| In-library collection: which sites to ask for a code, in what order, when to stop | Which Rows Should Not Enter JAV Scraping, Source Chains by Content Type |
| Wire up or fix a site's parser | Site Parser Contract |
| Dedicated sources for FC2, 1Pondo, K-MIB and the amateur wikis | The matching sections |
| javdb, AVBase or JavBus returns 403, is banned, or enters cooldown | Rate Limits and Bans on javdb, AVBase and JavBus |
| Code misidentified, creator wrongly created, cross-work code mix-ups | Code Catalogs, Creators and Watermarks |
| Performer renames, aliases, avatars, social links, agencies | Naming and Identity Merging, Performer Name and Avatar Sources, Directory-Type Sources and Social Links |
| Studio Japanese names, official sites, logos, small round icons | Studio Names and Studio Marks, Site Round Icons and Icon Compositing |
| Subscribing to "which codes were released recently" | Code Discovery Sources (Feed) |

## Collection Connections and Cloud-Drive Reads

Source failure issue records keep the stage, canonical product code, source and sanitized exception chain, and the full issue log and the scraping diagnostic export share this evidence. The UI still shows a short failure reason; a source not obtained is not written as a normal no-result, nor cached as a confirmed absence of cover. Local processing faults such as model loading are located separately from source login and network cooldown. After an HTTP client is rejected and before switching to a browser, the pause and stop intent of the current library task is still checked; this control does not take over other standalone tasks.

"Sync media library" and `scripts/scrape_codes.py` share the official source chain. When a source is set to "Direct", a direct client is used; when set to follow the Peach proxy, the direct, custom proxy or follow-environment setting saved on the settings page is used. Online covers use the same source transport, and the amane bridge passes the proxy and per-site direct settings to the subprocess. Browser page fetching also follows explicit direct and custom proxies; when the proxy address carries a username it falls back to the HTTP client.

Default outbound HTTP requests share the "Peach proxy", covering discovery page and work detail metadata, follow media, covers and avatars, subtitle search, the PikPak API, update checks and downloads, model downloads and remote diagnostics. Standalone collection, link checking, reference material and release download scripts also reuse this setting. A source's explicit "Direct connection", custom metadata's standalone connection policy and injected transports continue to take precedence.
`tests/test_outbound_proxy_policy.py` scans every client construction in `src/peach`: it either expands the Peach proxy setting or states `trust_env=False` (loopback, LAN services and injected transports); bare `urlopen`, `build_opener` without a `ProxyHandler` and bare-name imported clients are all rejected. Whether the target of `trust_env=False` is the local machine or LAN cannot be judged by the scanner and is checked in review.

When the external network is unreachable, a banner appears at the top of every page, pointing to "Network and access → Peach proxy". The judgment comes from the server: once a page reads `/api/network-status`, the background visits the two system connectivity-check addresses `www.msftconnecttest.com` and `captive.apple.com` through the Peach proxy setting, and the machine counts as online if either returns the expected body; it is rechecked every ten minutes when normal and every minute when offline, and probed again immediately after the proxy setting is saved.

When following the environment, the HTTP client reads the process proxy environment variables and the browser uses the system proxy; the two are not guaranteed to use the same exit. An app direct connection cannot exclude the operating system's TUN. Settings take effect for newly created clients, and tasks already running or long connections keep the setting from creation. External-site images loaded directly by the browser and external links opened by the user are decided by the browser's own network settings.

The local health check, the browser control interface, the writer mirror, user-configured Torznab indexers and CloudDrive mount connections use their own network boundaries. CloudDrive's API/data proxies are still managed in media library settings; the networking of Git, glab, rclone, cloudflared and build tools is up to each tool's configuration. The independently buildable FFmpeg corresponding-source archive does not contain the Peach app, and the download script inside the archive uses the system environment proxy.

Probing, the 3x3 grid, the timeline and playback of cloud-drive media read video data; the network connection of a mounted path is the job of the CloudDrive2 or OpenList mount tool. Peach's directory "media read policy" limits background reads and the confirmation boundary, and does not modify the mount tool's proxy. Fetching work text and covers online uses the source settings above, configured separately from the cloud drive that holds the video.

## Iwara Video Author Subscriptions

In follow management, paste an Iwara author's homepage or the author's video list link, or register the source with `provider=iwara` and the author's username. The subscription reads the author's videos by publish time, supporting update checks and fetching earlier content; images, playlists and the site-wide video list are not part of this source. Entries keep title, author, time, tags, duration and cover; entries using an external player prompt to open the source page.

The general tag vocabulary and filtering accept only tags Iwara explicitly marks as `general`. Tags of `category`, `source`, unknown and unprovided types keep the source's original terms; when the category mapping is not confirmed, no genre is inferred.

Public author videos need no login. Videos with access restrictions require a valid `access_token` from an account with access rights, entered in the "Sources and subscriptions" settings. The token is stored only in the local credentials file, and does not enter the ledger or sync; when it expires, log in again and copy it as the settings page explains. Peach does not solve browser verification. During playback the short-lived video address is resolved on demand, the highest resolution is chosen by default, and the qualities the source provides can be switched; private or deleted videos, interface structure changes and rate limiting show specific failures. No earlier content is a normal historical end point.

## Collection Criteria

Collection results must keep the data source and the basis for the judgment. Data that code rules can determine and that can be withdrawn in bulk by source is saved under the existing rules; LLM output, source conflicts and multiple possible outcomes are kept as pending-confirmation data. A site name alone is never enough to judge data correct.

- A collection script that needs human confirmation outputs a pending-confirmation CSV, and the user's confirmation result is saved as a file that can be read again. Writing `entity.canonical_name`, `asset.studio`, `entity_link` or avatar files must follow `peach-ledger-write`; pending-confirmation data cannot be treated directly as a result the user has confirmed.
- javdb, laoshi, jae and R18 are references only, each with its own credibility. A name on a profile page may have been altered by a repost channel.
- A fact given by two unrelated sources is the strongest evidence. A fact stated by only one source is always a candidate.
- When two sides conflict, do not rank by site name; see whether the fact can be corroborated by yet another source. The same applies to the side already in the ledger:
  it too was once just one source's single judgment.

Example: to judge whether an X account is the person's own official account, follower count is the first filter, and a clearly low count should raise suspicion. Two opposite cases have actually occurred:
in one the ledger's existing account pair was right and javdb's was wrong; in the other javdb's account was live and the ledger's existing one was already suspected dead. So a conflict cannot be settled with a blanket
"the ledger wins" or "the new source wins".

### Manual Data and Identity Boundaries

When changing profile editing, candidate adoption or source refresh, state separately who owns the source facts, the manual values and the final displayed values. Manual adoption does not delete source evidence; a source refresh cannot overwrite protected fields, and continues to reuse the existing field ownership and review mechanism.

Clearing a field, lifting manual protection and restoring a source value are defined separately. Restoring needs a traceable source value, and with no corresponding evidence an empty value or a guess cannot be used to fake a successful restore. Editing a display name or avatar, adjusting a video's ownership, and merging person/work identities are different operations, and identity or association must not be changed covertly by changing a display value.

## Seesaa Wiki Work Evidence

This section covers how to pull a code's cast, title and date candidates from the amateur-identification wikis on Seesaa.

The entry point is `scripts/scrape_codes.py --profile seesaa` (the amateur-series general wiki); the two identification wikis are named explicitly with
`--sources av_neme,av_name`. All three sites share one module and one page-fetch layer, and produce the existing
`metadata-field-candidates` CSV.

Requests and resuming:

- `--wiki-pages-file` can prefetch catalog pages; all works on one page share one request.
- `--wiki-max-requests` defaults to 80, one quota per site; at most 4 MiB per page; at most one request per 2 seconds in total for the same host.
- Successful pages are cached and an interrupted run can resume; `--refresh` refetches pages.
- On a 403, 429 or bot challenge, online fetching for this batch stops. This "not obtained" is not frozen into a permanent no-result.

How pages are read:

- Codes are matched back exactly against the `NO` column of the works table, supporting the existing numeric-prefix and zero-padding normalization. The site search of the two identification wikis is a full-text substring
  match, so `AR-101` also brings back `GAR-101` and `STAR-101`; exact matching back blocks them.
- The display name of an `ACTRESS` link is a cast candidate, and the link target is only an identity-verification clue. EUC-JP pages are decoded using the source encoding.
- When the roster contains `？`, `▲`, `--`, a name without a person page, or a broken empty link, only the raw-text evidence of the whole list is kept; a conflicting row is reported as an error.
- `TITLE` and `RELEASE` yield title and date candidates; `SUBTITLE` does not pass for a full title.
- The two identification wikis yield cast candidates only. Titles, dates and amateur credits go only into `wiki_evidence` (the MGS titles on av_name studio pages are
  truncated).
- Cover URLs, person-page links, notes and cross-platform codes stay only in the raw snapshot and the candidate evidence. No images are downloaded, and people or works are not merged automatically.
- Page-structure details are in the module docstring (`src/peach/sources/seesaa.py`).

Seesaa is a hosting platform, and the wikis below are edited by their own maintainers; being on the same platform does not make them independent corroboration of each other:

| Source | Verified use |
| --- | --- |
| [素人系総合 Wiki](https://seesaawiki.jp/w/sougouwiki/) | Studio work tables, compilation rosters, credits and person-page links, dates, images and cross-platform clues; wired into the scripts |
| [このAV女優の名前教えてwiki](https://seesaawiki.jp/av_neme/) | Verifies cast credits for DMM, MGS, S-Cute and 舞ワイフ; no tables, series pages and monthly archive pages have one `h5` section per work (「品番\| 系列名」 plus 「名前(女優名)」); 300MIUM can be looked up, FC2-PPV and MIB cannot; wired into the scripts (`av_neme`) |
| [AV女優の名前特定wiki](https://seesaawiki.jp/av_name/) | FANZA amateur and FANZAビデオ have one page per product code (key-value table); MGS hangs in `h5` sections on studio pages and lists only the latest ~1100; 300MIUM and FKOS can be looked up, FC2-PPV, 476MLA and MIB cannot; wired into the scripts (`av_name`) |

The entry points in the table were fetched on 2026-09-06, and the two wired-in identification wikis were retested on 2026-09-24. Similar wikis not wired in (AV女優大辞典, AV女優パーフェクト,
シロウトTV・ナンパTV, 人妻系まとめ, 素人AV女優名鑑, and domain indexes such as VR, adult films and NHpedia) are only manual lookup clues; the other
wikis on the platform have nothing to do with video work metadata.

## K-MIB Official Site Works and Performers

Asking JAV catalog sites about a Korean MIB code always goes wrong; the official site [k-mib.com](https://www.k-mib.com/) is the only trustworthy source.
The script is `scripts/harvest_kmib.py`, the parser is in `peach.metadata_kmib`, and it reads snapshots under `peach-data/sources/k-mib/`
(list pages, `video/<idx>.html`, `star/<idx>.html`, `images/`).

- `--fetch` fetches missing snapshots online: 1.5 seconds between requests to the same host, existing ones are skipped, and a 403 or 429 stops the batch immediately. robots.txt blocks only
  `/_adm/` and the login page.
- Read-only by default, it writes three CSVs: `kmib-catalog.csv` (whole-site works compared against the ledger; ledger codes absent from the official site are recorded as "not obtained"),
  `kmib-performers.csv` and `kmib-metadata-field-candidates.csv`.
- `--apply` first backs up the ledger, then fills empty codes, auto-approves official-site candidates per ADR-0018, installs missing covers, installs official profile-page links and avatars for performers
  already linked to MIB works, and installs the official link and logo for MIB.
- The item_key of candidates carries a `:kmib` suffix, because the `<code>:<field>` of these codes is already taken by the rejection decisions of the mismatched JAV candidates.
- The Actor column of partner studios (JS MEDIA, Studio REAL, SETFLIX, PEEKO, MMP, JO GLOBAL) often holds the studio name; it is recorded as maker by studio name and
  code prefix. These prefixes do not belong to `KOREAN_MIB_PREFIXES`.
- Categories are projected only onto the existing vocabulary. Fetish, Kiss, Sex Toy, Ahegao, Tiny Girl, Oil and Femdom go into review as unlisted hints attached to candidates.
- Two-word romanized stage names (`Mao Hamasaki`, `Sarina Momonaga`) fail the stage-name shape gate and are reviewed by hand; the latter is matched by alias to
  `藤木真央`, identity pending confirmation.

## Which Rows Should Not Enter JAV Scraping

Before in-library collection asks JAV sources about a row, it passes `catalog_rules.scrapes_as_jav`. It blocks only one case: **a creator work's
filename read as a code**.

- Examples: `sumwall95 masturbation_1.mp4` reads as `SUMWALL-095`, and `aerith 2412a.mp4` (character name plus year-month) reads as `AERITH-2412`. In shape they are no different from studio codes,
  and `is_jav_code` accepts them all.
- Criteria: filed under a creator's name, with no studio and no other release evidence, and a form that belongs to no release system.
- Let through: FC2 product numbers, the three-digit numeric prefixes of amateur platforms, MGStage's `STP`/`SIRO`, and date-style codes. A creator's filenames cannot collide into
  these shapes.

**Do not swap in `is_jav_asset`.** It judges "is this an established JAV release", requires release evidence to be in the database first, and decides which category a
work falls under when browsing. Using it at the scraping entry deadlocks: the evidence is precisely what scraping is meant to bring back, and without scraping there is no evidence; genuine amateur
codes like `300MIUM-698` would be shut out along with it.

## Source Chains by Content Type

Once past the gate in the previous section, which sites to ask, in what order and when to stop is decided by a single table in `peach.metadata_routes`.

This table governs only the **query side**; how returned values are ordered and whose view wins on disagreement lives in `peach.metadata_policy` and on the persistence side. For example, javbus
is a fallback source in settlement (ADR-0035) yet is queried ahead of javdb: javdb counts its quota per egress IP, so asking the two cheaper sites first only affects who hits the rate limit first.

The type depends only on the code's shape and local evidence (path, filename, ledger studio), not on metadata having arrived; otherwise codes without metadata would never get to the site that should be asked.

| Type | Criteria | Chain (left to right) | Why the chain excludes |
| --- | --- | --- | --- |
| censored | Other studio codes | (when local evidence recognizes it) prestige/faleno/dahlia; when none recognizes it, makers → r18dev → dmm → avbase → javbus → javdb | 1pondo (uncensored maker), fc2 (a different product-number scheme), mgstage (a reseller for censored codes) |
| amateur | Three-digit numeric prefixes like `300MIUM-1239`, plus `SIRO`/`STP`/`STN`; or local evidence showing the same code with a three-digit prefix (`LUXU-688` whose file is `259LUXU-688.mp4`) | mgstage → avbase → javbus → javdb → r18dev | makers and the three maker sites (amateur codes are not theirs); dmm (searching `MIUM 1239`, `LUXU 1475` gives zero results). r18dev goes last: in the local snapshots it has never returned a single amateur code |
| uncensored | Date-style codes, `HEYZO-1380`, Tokyo-Hot's `n0780` | (when evidence points to 1Pondo) 1pondo → avbase → javbus → javdb → avsox | r18dev: it has no uncensored codes |
| fc2 | Product numbers beginning with `FC2`, and un-normalized short forms like `FC-43768` | fc2 → fc2cmadb → fc2ppvdb → javten → javarchive → javdb | r18dev (all 85 entries empty), avbase and javbus (zero output for FC2), fc2club (zero output in local snapshots, and it also returned 429 and entered cooldown) |
| kmib | Prefixes in `KOREAN_MIB_PREFIXES` | Ask none | All: the codes have the same shape as Japanese titles, and what comes back is a different work |
| other | Censored shape, but the path carries a domestic-China marker (`OTHER_SYSTEM_MARKS`: 国产, 网红, 兔子先生, 麻豆 ...) or the filename is in a Western-studio style (`wankzvr-elena-koshka-GFE-180`) | Ask none, and do not ask for covers either | All: Peach has not wired in sources for these systems |
| unsure | Censored shape, with a letter segment in the local evidence but no full spelling of this code (`UWFr85dczsVeysGg.mp4` read as `UWFR-085`) | avbase → javbus → javdb, one pass | Maker sites, r18dev, dmm: the code was most likely misread, and official archives would only come back empty |

Places where it is easy to ask the wrong way:

- **`ABF`/`ABW`/`ABP` are censored, not amateur.** The mgstage home page lists censored and amateur codes together, and classifying by site would label all of Prestige
  as amateur. Amateur recognizes only three-digit numeric prefixes and MGS's three letter prefixes.
- **1Pondo needs local evidence.** A date-style code carries no maker; 1Pondo and カリビアンコム have the same shape, and asking the wrong one returns another title released the same day. If evidence
  does not point to it, fall straight to the general indexes. See "1Pondo Work Metadata and Covers".
- **The three maker sites are asked only about their own codes.** Prestige, FALENO and DAHLIA send requests for any code, so they are asked only when the code's letter prefix is in
  `metadata_routes.MAKER_EVIDENCE`, or the ledger studio or path names that maker; once one recognizes it, `makers` is no longer asked.
  `makers` is routed by amane's built-in maker table; when the prefix is not in the table the bridge makes zero HTTP requests and only costs one subprocess (about 0.8 seconds).
- **Domestic-China and Western titles go to `other`, and none are asked.** What can be recognized stops here, and what cannot is still asked as censored. Hentai anime has no criteria and is not a separate type.

Candidate sources (not wired in; to be added when an actual gap appears): sokmil, kingdom.vc, km-produce, fantia (needs a Cookie), jav321, javlibrary,
from the 2026-10-01 survey of metadata engines such as Javinizer-Go, mdcz and AMMDS (ADR-0092).

### When to Stop

- A censored work missing content tags still gets a separate JavDB `類別` request after scalar settlement, with local NFO taking priority (ADR-0100); sources already tried, already cached, route-excluded or explicitly missing are not requested again, and a failure keeps the existing scalars. A work that already has tags has its candidates refetched by code through `scrape_codes`; routine library processing does not expand into a full-library backfill.
- The official and publisher sites form tiers one by one. Once a tier supplies all of **the required scalars this row is still missing** (title, cast, studio, release date),
  the next tier is not asked; if it supplied only half, it keeps asking downward, otherwise that row could only wait for a human to fill it in.
- The general-index tier is asked all at once, without short-circuiting site by site. Review-free approval needs two sites with matching values (ADR-0030, ADR-0034), and cover cross-confirmation needs two
  different image sources (ADR-0032); stopping at the first site would cut the sample for these two criteria to the minimum.
- When a row needs only tags or a cover, stop as soon as the first site supplies it (ADR-0033).
- The one exception: the FALENO and DAHLIA official sites do not supply categories, so a row missing tags is asked once more at r18.dev after the maker site has answered the scalars; if the next tier is
  the general index, it stops all the same. Once r18.dev has answered, dmm is not asked again for tags; the two are the same catalog.

### DMM / FANZA Catalog

On the censored chain, the dmm after r18.dev is DMM/FANZA's own GraphQL catalog (`sources/dmm.py`, ADR-0059), filling the part r18.dev
missed; for new releases of the current month, r18.dev often returns 404 while DMM already has them.

- The endpoint accepts only POST. It returns 200 even from a direct China Telecom connection, taking 0.3 to 1 second per request; no Japanese egress is needed and there is no age gate.
- The cid is first guessed as `{letters}{five digits}`, and searched if the guess misses. Only search results whose letter segment and digits both match are accepted, and identity is then verified with `makerContentId`.
- `makerReleasedAt` is the release date, written as Japan-time midnight in UTC; convert to Japan time before taking the date.
- The studio is a Japanese name, normalized to a ledger entity via `entity_alias`.
- Prestige has been withdrawn from FANZA and MGS amateur codes are not in this catalog, so it is on the censored chain only.

### Fewer Requests: Snapshots and the "Known-Miss" Memory

- The raw snapshot saved by the previous run (`<Peach data directory>/sources/library-metadata/<code>-<source>.json`) is used directly if still fresh, with no request sent.
  Its validity is 7 days, the same as the "said none" memory, and both expire at the same time, so that there is never a case where "none" has expired but "has" still holds an old value.
  The "Retry now" in the error prompt fills in only unfinished items, and wants a new answer, so it forces a re-ask.
- "Said none" is recorded per site (`state/library-metadata-misses.json`, `library_processing._MissCache`): sites that said none within a tier
  are removed, and the whole tier is skipped only when all have said none. The file records the time each site first appeared; if a site on the "no cover" chain was connected later than it,
  that entry does not count. The memory for coded product numbers is not invalidated by a new site connected to the FC2 chain.
- A field that has only a pending candidate still counts as missing: auto-approval without review needs two sources agreeing, and a field given by only one source is exactly the one to ask the next source about. A
  source that has already given a candidate for this row is not asked again (`_answered_sources`), each source is asked at most once per row for a candidate; after every site on the chain has given a candidate or said none, this row
  is skipped before the disk is read. Basis: on 2026-09-25 there were 410 FC2 performer candidates pending approval, and treating pending candidates as already settled would have kept
  FC2PPV-DB out entirely.
- The cover step continues with the snapshots of the metadata step: the work JSON in the r18.dev snapshot directly gives the original image address, and the snapshots of the community sources are handed directly to
  the image-source corroboration; when a candidate is already as wide as 700, r18.dev and MGS are no longer asked (`sites_when_needed` of `best_cover`). When r18.dev
  is not on this product code's chain, the cover step does not ask it either.
- Browser sources (FC2PPV-DB, JAVten) get 45 seconds per request, not trimmed by the remaining budget. The time spent waiting for a person to click when the verification window first pops up
  is recorded in `LibraryMetadataProvider.excused` and does not count toward this video's action budget (ADR-0065 item 2).

### Manually Replacing a Chain

A user can replace the whole chain of one type: `process_library(route_overrides='censored=r18dev,javdb')`. The text form is
`type=source,source`, with multiple entries separated by semicolons; a mapping of the same shape is also accepted.

- Replacement is wholesale, not item-by-item merging. Item-by-item merging would become "cannot remove a site": to drop javdb you would first have to know the built-in table contains it.
- A misspelled type or source name raises an error directly. Silently ignoring it shows up as "the setting changed but nothing happened", which is far harder to trace than an error.

The trade-offs of the source chains drew on amane's `docs/dev/content-routes.md`, and the evidence is registered in `docs/reference-sources.json` under
`amane-content-routes`.

### Sites Reached via the amane Bridge

Some sites are not answered by Peach's own parsers but by amane through the subprocess of `tools/amane-bridge/` (ADR-0043). The bridge's venv is rebuilt on
the card of the "Sources and credentials" page, and the pinned version is changed only by people. It counts as installed only when amane's package metadata is read in the venv, and a half-built environment left by a failed rebuild
is still shown as not installed. For Docker deployments see [Docker deployment](DOCKER.md#amane-scraping-sites).

The bridge's stdout and stderr are fixed to UTF-8, with source runs and standalone artifacts using the same protocol. The main program decodes strictly; on an encoding mismatch it records `bridge_stdio_decode`, the product code, source, run mode, byte position and SHA-256, and does not treat replacement characters as normal metadata. The `collection_diagnostics` in source snapshots is exported with the diagnostic package and scraping records, including the encoding and collector version, and containing no proxy credentials or response bodies.

Upgrade repair invalidates in a targeted way source text snapshots containing `�`, keeps the original file for diagnostics, and schedules the affected videos for re-collection; existing old repair receipts or completed checkpoints do not block the new rule. Normal caches and manual data are kept, and paid sources or those needing a download still wait for explicit handling. Text already ingested continues to rely on upgrade repair and manual review, and is not restored by deleting characters or guessing the encoding.

- **Community tier `amane`**: avsox, plus fc2club, freejavbt and airav, which can be reached only when an override names them. The chain composes them into one tier, asked concurrently in one subprocess.
  An upstream-reported `rate_limited` is written to the same cooldown record as the 429 tier, and `cloudflare_*` and `ip_banned` as the 403 tier;
  sites currently in cooldown are not taken into the subprocess.
- **Official tier `amane_official`** (ADR-0048, each site has exactly one owner): `makers` (amane's `official`, the official sites of twenty-nine makers), `prestige`, `faleno`, `dahlia`, `mgstage`, the first sites in the official tier of the censored and amateur chains. The grade is official, and in settlement
  the maker sites rank ahead of dmm and r18.dev.
- The date Prestige returns is the MGS distribution start date (ABW-032 answers 2020-11-11, release date 2020-12-11), recorded only in
  `extra['delivery_date']`; the release date is left to r18.dev.
- Region restrictions and bare 401/403 responses from a site both count as "blocked": they fall in the `auth` tier, and the whole site enters cooldown as the 403 tier, not frozen into the "none" memory.
- dmm, giga and kin8 do not enter the official tier; for the reasons and data see ADR-0048 and `build/agent-verification/amane-official-stage.md`.
- The old domain of fc2ppvdb.com is closed (ADR-0043 amendment); the new site fc2ppv-db.com is reconnected to the FC2 chain by a Peach-written parser (ADR-0060), not through the bridge.
- The through-proxy real-test record is in `build/agent-verification/amane-chain-realtest.json`; in that run, airav's search address returned 404.

## Site Parser Contract

Self-written parsers and the sites on the amane bridge share one interface shape (`src/peach/sources/`, ADR-0044 "Implementation: parser contract"). When wiring in
a new site, write it to this shape.

- One class per site: `fetch(code, session=)` fetches the work page, `parse(page, code)` reads out the record, and `query()` chains the two steps.
- Site name, primary domain and image hosts, request interval, whether it carries a Cookie, page cap and tier are all written in `SiteConfig`, as data and not constants.
- Only one return type, `SiteRecord`. `payload()` projects it into the dict of the source snapshot, so what candidates, source-chain settlement, the cover layer and the ledger read does not change.
- Failures have only one `FailureReason` table (twelve tiers). `REASON_KINDS` maps it to the three tiers `auth`, `unavailable` and `not_found` of `MetadataProviderError`; `COOLDOWN_ACTIONS` specifies which tiers write the whole site into the `scraping_access` cooldown record:
  `cloudflare_challenge`, `ip_banned` and `geo_restricted` double as the 403 tier, and `rate_limited` as the 429 tier.
- A self-written site's `query()`/`records()` is wrapped in `SiteSource.holding()`; when one of the tiers above is raised it is handed to `SourceTransport.hold` on the session transport chain to be recorded, writing the same record as the amane bridge. This is how
  the verification page AVBase returns with a 200 puts the whole site into cooldown.
- The cooldown period (`SourcePaused`), the action budget and connection failures are raised by the transport layer, and the contract lets them through unchanged. So each site's rate-limit and ban behavior
  is decided in one place only, the transport layer.
- The rows for the same site in the config, `SOURCE_SPECS`, `SOURCE_LABELS`, `PROVIDER_NAMES`, `scraping_access.SOURCES` and
  `SOURCE_INTERVALS` must agree, guarded by `tests/test_metadata_sources.py`.

All sites in the table below have the contract applied: the twelve self-written sites are registered in `sources.SITE_SOURCES`, and the nine bridged sites in `metadata_amane`.

| Site | Status | Location | Notes |
| --- | --- | --- | --- |
| JavBus | Contract applied | `sources/javbus.py` | Age gate maps to `auth_required`; 404 and a code mismatch map to `not_found` |
| javdb | Contract applied | `sources/javdb.py` | Both hops, search page and detail page, are in `fetch`; the login page maps to `auth_required`, and a detail-page code that disagrees with the search result maps to `parse_error`; the 3-second host interval is in the config |
| fc2club, freejavbt, airav, avsox | Contract applied (via bridge) | `metadata_amane.py` | amane's sixteen reason tiers are translated one-to-one into contract fine tiers by `AMANE_REASONS`, wrapped into a `SiteRecord` first and then projected; `SITE_CONFIGS` holds only site name, UI name and tier, with the primary domain and Cookie managed by amane |
| makers, prestige, faleno, dahlia, mgstage | Contract applied (via bridge) | `metadata_amane.py` | Tier `official` (`OFFICIAL_SITES`); `http_error` carrying 401/403 maps to `auth_required` through `contract_reason`; prestige's `release` goes into `extra['delivery_date']` |
| AVBase | Contract applied | `sources/avbase.py` | One search-page hop, picking the work and its own product entry out of `__NEXT_DATA__`; no search hit maps to `not_found`, a Cloudflare verification page to `cloudflare_challenge`, and any other structure mismatch to `parse_error`; it gives no runtime, so `runtime` stays empty |
| r18.dev | Contract applied | `sources/r18dev.py` | Two hops, work JSON and the combined page; the Japanese spelling, the performer avatar template and taking genre in the original Japanese words are all in this site; a `content_id` mismatch maps to `parse_error`; tier `official_mirror`, page cap 2 MiB |
| DMM / FANZA | Contract applied | `sources/dmm.py` | The GraphQL endpoint via `Session.post`, one to three hops (guess cid → search → detail); `ppvContent` null and no search hit map to `not_found`, and a non-JSON reply or a query rejected by the endpoint (only `errors`) maps to `parse_error`; tier `official`, page cap 1 MiB |
| 1Pondo | Contract applied | `sources/onepondo.py` | One work-JSON hop; an unrecognizable work number, 404 and a `MovieID` mismatch map to `not_found`, and a non-JSON reply to `parse_error`; tier `official`, page cap 1 MiB |
| FC2 | Contract applied | `sources/fc2.py` | One product-page hop; a delisted page and an `sku` mismatch map to `not_found`; the functions for code, runtime, original-file address and placeholder detection are shared by three sites and also live here; page cap 2 MiB |
| fc2cmadb | Contract applied | `sources/fc2cmadb.py` | After the work page, `query()` asks one more hop naming `actresses` with the handshake header, and if that hop fails it hands back "no performer"; the comment-section cast, equivalence and compilation parsing is also here, and `scripts/fetch_fc2_metadata.py` takes from it |
| FC2PPV-DB | Contract applied | `sources/fc2ppvdb.py` | One work-page hop `/ja/videos/<id>`; a code not recognizable in `<h1>` (including a site-side 200 404 page) maps to `not_found`, and a Cloudflare verification page to `cloudflare_challenge`; performers are taken only from the 出演女優 block, the 「流出」 marker goes into `extra['leaked']`, and no cover is handed over (thumbnail 360×360) |
| JAVten | Contract applied | `sources/javten.py` | One hop `/search?kw=<id>`; on a single hit the site jumps straight to the work page, and if it lands on a translated page the Japanese original page is fetched again; an `h1.fc2-id` mismatch maps to `not_found`, and an `og:url` with a language prefix maps to `parse_error` (the Chinese is machine translation, so only the Japanese original page is accepted); the cover is the FC2 storage original at the two places `og:image` and fancybox |
| JavArchive | Contract applied | `sources/javarchive.py` | Two hops, search page plus work page; `records()` hands over one record for each re-upload hit in the search, skipping any that return 404 or do not match |
| The three Seesaa wikis | Contract applied | `sources/seesaa.py` | Named only by `scrape_codes --profile seesaa` or `--sources sougouwiki,av_neme,av_name`; the two identification wikis share `NameWikiSource`; `rows()` reads each row of a page's works table into a record; the transport is `WikiPages` (page cache, per-batch quota, stop the network on hitting a wall), not in `scraping_access.SOURCES`; failures keep the tiers `budget`, `blocked`, `ambiguous`, `incomplete_search` and so on, and land in the batch's error table and health table, with `budget` and 403/429 deciding that this batch stops the network |

The flow in which the five FC2 sites are asked in turn, stopping once the metadata is complete while covers are asked to the end, is in `LibraryMetadataProvider.fc2`,
calling `records()` site by site per `metadata_routes.FC2_STAGE`; each site handles only its own page fetching and parsing.

## FC2 Work Metadata and Covers

FC2 is not JAV: the code is the seller's own submission number, and when JAV catalog sites look it up they either have nothing or collide with a different title (r18.dev, AVBase and
JavBus cannot give anything for FC2, and javdb carries some but with a tight quota). So in-library collection (`peach.library_processing`) asks FC2 codes
only the five sites below, in order:

1. **Publisher product page** `adult.contents.fc2.com/article/<video_id>/` (`peach.sources.fc2`, no credentials). The data is in the
   `ld+json` Product; one request gives the title, description, seller, product tags, runtime, sale date and the original cover.
   Check the `sku`: the site's product numbers get reused for other submissions. A delisted product page still returns 200, only without the Product, and this does not count as a scraping failure.
2. **Mirror site fc2cmadb** `fc2cmadb.com/articles/<video_id>` (`peach.sources.fc2cmadb`, Laravel + Inertia, the props tree is in
   `application/json`). It keeps the same fields and original image for delisted works. Titles and tags are maintained by the site's users, so they are registered as community sources and the values go into review.
3. **FC2PPV-DB** `fc2ppv-db.com/ja/videos/<video_id>` (`peach.sources.fc2ppvdb`, Next.js server rendering). It is a metadata database of FC2
   products: the 出演女優 link to in-site performer pages, the 販売者 links to the seller page (the slug is the same as the publisher's user page), plus the 販売日,
   タグ, and the 「流出あり／なし」 marker (into `extra['leaked']`). The runtime is only at the end of `<meta name="description">`.
   The image on the site is a 360×360 CloudFront thumbnail and is not handed over as a cover. Products not on the site return a 200 404 page with no code in `<h1>`,
   which maps to `not_found`.
4. **JAVten** `javten.com` (`peach.sources.javten`, formerly fc2hub.com). The work address
   `/video/<in-site number>/id<video_id>/<title>` cannot be assembled, so first ask `/search?kw=<video_id>`: on a single hit the site jumps straight to the work page
   (under Chrome it jumps to the `/tw/` translated page, and after the parser recognizes that it fetches the Japanese original page again), and on multiple hits it picks the one with `id<video_id>`. It gives the Japanese title,
   tags, seller name and runtime (description), and the 販売日 (`videos:published_time`, consistent with FC2PPV-DB's). The Chinese on the site is
   machine translation (the user's judgment), so only the Japanese original page is accepted, and an `og:url` with `/tw/`, `/en/` or `/ko/` maps to `parse_error`.
5. **JavArchive** (`peach.sources.javarchive`, no credentials) is reached only when the first four sites all say none; details below.

Sites 3 and 4 must pass a Cloudflare challenge; see the next subsection.

### Cloudflare Challenges on FC2PPV-DB and JAVten

Both sites sit behind Cloudflare's JS challenge. Direct connections by httpx and by curl_cffi impersonating a Chrome fingerprint both return 403 with the title
`Just a moment...` (`sources.base.challenge_page`). Only the `cf_clearance` issued after a browser passes the challenge gets in, and it is bound to the User-Agent and egress IP of
the browser that solved it, and lives only 30 minutes.

So pages of these two sites are opened by the local browser (`peach.browser_transport`, ADR-0065):

1. Peach launches Chrome on the user's machine, or Edge (InPrivate) if there is none. A separate profile lives in `peach-data/secrets/browser/`,
   and the window is off-screen.
2. Navigate to the address. If it lands on a challenge page, wait for it to pass by itself (usually 3 to 25 seconds, no click needed). The automatic phase waits at most
   `min(40 seconds, this request's timeout)`.
3. If it has not passed, bring the window to the front for a person to click once, then wait two minutes; those two minutes are not bound by the timeout. A site that has popped up and not been clicked is not popped up again.
4. If it still has not passed, the whole site enters cooldown per `blocked_pause` (starting at 15 minutes, doubling up to 6 hours), and the chain proceeds downward as usual.
5. Once passed, read back the final address, status code and document.

Other rules:

- A page that is not a challenge page but did not open within the timeout is retried as a connection failure.
- The cooldown record carries `via`: a cooldown accumulated from direct-connection 403s is void when switching to the browser, and vice versa; the rule is in ADR-0065, second clause.
- On first entry FC2PPV-DB lands on an age-confirmation page (`/age-verify`), and the transport clicks that button for the person per the `browser_gate` in `SOURCES`.
- The browser quits by itself after 10 minutes unused.
- When this machine has no Chrome/Edge (`find_browser`), it uses HTTP: the site-wide UA (`peach.user_agent.USER_AGENT`) must match the user's
  Chrome, paste a Cookie in "Sources and Credentials", and choose the connection method with the same egress as that browser. A 403 enters cooldown just the same, and saving a new Cookie
  clears the cooldown. The Location of JAVten's search hop is `http://`; the HTTP layer upgrades same-host plaintext redirects back to https and then carries the Cookie; on the browser
  path the browser follows redirects itself.

### Intermittent Blocking on minnano-av

minnano-av is also behind Cloudflare, but it blocks HTTP clients only intermittently: on 2026-10-01 on the same egress, the search page was blocked and a minute later the
profile page returned 200 as usual. So unlike the two sites above it does not go through the browser from the start; what is registered in `scraping_access.SOURCES` is
`browser_fallback`:

1. First go through the HTTP client (`SourceTransport`, with the connection method per this site's setting in "Sources and Credentials").
2. On 403, 429 or a challenge page, the local browser fetches the same page to verify (`peach.browser_transport`, sharing the profile and process with the two sites above).
3. The browser gets a normal 200 page: this site is pinned to the browser, written into the source setting `secrets/follow/scraping-minnano-av.json` as
   `transport: browser`; the cooldown accumulated by the HTTP client is cleared. Later requests no longer ask the HTTP client first; delete this key to return to step 1.
4. The browser also fails (no browser, challenge not passed, blocked all the same): enter cooldown just as when the HTTP client is blocked, starting at 15 minutes and doubling up to 6 hours.

Alias backfill, performer-profile backfill (`MinnanoPages`), and `harvest_performer_links.py`, `harvest_agency_rosters.py` and
`resync_performer_agency.py` all fetch minnano-av through `SourceTransport`, sharing the same cooldown and pinned state. Measured on 2026-10-01:
Chrome with a temporary profile fetched the search page, followed through to the profile page `actress695633.html`, and the profile table parsed correctly.

Fallback candidate (not wired in): OpenAver 0.16.13, after removing minnano-av, merges performer profiles field by field via xcity → wiki → graphis; it serves only as a stand-in when minnano-av
cannot be reached and does not replace it, because it is currently the only entry that goes from a name to an agency roster (survey in ADR-0092).

### JavArchive

- The work address embeds an in-site article number and title (`/926949-FC2-PPV-4137487-…-pn.html`) that cannot be assembled, so first ask
  `/search?q=<code>` and then fetch the work page. Product numbers are compared on numeric boundaries, so `4137487` cannot match `41374870`.
- A search result has only a title and a thumbnail, while tags, release date, duration and the cover slot are only on the work page, so this hop cannot be skipped.
- This tier gives the title, the cover, and the tags, 発行日 and duration that the reposter filled in the body metadata. Whether they are filled is up to the reposter, and spot checks show most leave the whole block empty.
  The seller, product description and performer fields are not on the site; the rest of the body is reposted cloud drive links, none of which are taken.
- The same product often has several entries on the site, each posted once by a different reposter, with different article numbers, code spellings, titles and images, and order carries no quality meaning.
  Every entry the search hits is taken, since the first one's image may no longer exist. The title in the address is sometimes encoded and sometimes raw, and is encoded uniformly before assembling.
- `robots.txt` allows the whole site.
- Covers are on `img.javstore.net`, **identified by position, not by file name**: the image inside `div.fisrst_sc` comes first, and the schema.org `image` after.
  Reposters' naming is inconsistent, and by name most would yield no image at all. Those ending in `_s.jpg` are excluded, which are multi-frame strip collages marked `Preview`.
- File names are used not to identify but to reject: when no standalone five-to-seven-digit number segment in the name is this product code, it is another work's image,
  and `is_cross_product_cover` blocks it by this rule.
- The GIFs stored there are mostly preview animations. After `best_cover` of the official tier and `picture()` of the community tier download the whole file, they are always discarded, as card covers want only static images.
- Its covers are usually a tier worse than the official originals, so it is ranked last.

### Covers

- The metadata step stops once answered, while the cover step asks the whole chain. The tier that gives an address often cannot deliver the image: the site marks no product image, or the address
  remains but the image on FC2 storage has been deleted. This layer cannot judge, and only knows after `best_cover` has measured it, so for covers it wants all image sources on the chain,
  with it choosing the best; a tier already asked in the metadata step is not asked a second time, and asking that tier more brings along a batch of tags (ADR-0030).
- The covers of the official page, the mirror and JAVten all point to the file the seller uploaded to `storage*.contents.fc2.com`, so they are treated as official images
  and do not go through the two-image-source corroboration of community sources (ADR-0030). JAVten's two addresses are the same file as the publisher's product page, which may already be deleted after delisting,
  and only the cover layer's measurement tells.
- The mirror sometimes gives an address wrapped as `contents-thumbnail*.fc2.com/w276/`, and the parser strips the wrapper to take the original.
- Entries on the mirror with no product image carry its own `no-image.jpg` placeholder, still an in-site relative address, and handing it down as a cover would only earn
  "source connection not obtained", so the parser judges it as no image.

### Performers

- Neither the official product page nor JavArchive has a performer field, and the names in titles are the seller's promotional wording. So when the official page answers but this row still lacks performers,
  fc2cmadb and FC2PPV-DB are asked for this field next (`FC2_CAST_SITES`).
- **fc2cmadb's actress field** is shown in the browser only to logged-in users, and collection carries the login cookie configured in "Sources and credentials"; guests asking for this field
  currently also get a reply. That field is an Inertia deferred prop, absent from the first-screen HTML, and must be asked again separately by naming `actresses` with the handshake version number this page reports.
  The response also attaches a string of former names, and only the proper name is taken, otherwise one actress would spread into a dozen people in the performer field.
- **FC2PPV-DB's actress field** is organized by person in the film, written in the original Japanese name, with priority after fc2cmadb and before javdb.
- In the performer field the mirror ranks ahead of javdb (`metadata_policy.FIELD_SOURCE_PRIORITY`): javdb's side often has names given by reposting sites
  (English nicknames or Chinese translations), while the mirror writes the original name.
- One source writing `Xちゃん` and another writing `X` count as agreeing, and it is stored automatically as `X`; for the conditions and trail see ADR-0086.
- Performer community sources already in the ledger cannot be swapped. Cases where the two sides disagree are listed by `scripts/fc2_cast_review.py` into
  `generated/fc2-cast-candidates.csv`, to be approved one by one in "Metadata fields" on the review page.
- The comments-section line goes through `scripts/fetch_fc2_metadata.py`, which has its own equivalence markers and compilation judgment.
- Product codes with a segment suffix (`FC2-PPV-3312576-1`) cannot be resolved to a product number and nothing is asked: applying a compilation cover to every segment would make
  each segment, whose content differs, carry the same image.
- freejavbt is not part of this chain: after its redesign amane's parser cannot recognize work pages, and the performer field on the work page reads "暫無女優資料" (no actress data yet).

## Metadata and Covers for 1Pondo Works

Uncensored product codes are not on r18.dev; the release date a directory site gives for a date-style code is the reseller's listing date, which does not match the date written in the code itself.
1Pondo's frontend reads a public JSON, with no need to parse HTML and no credentials:
`www.1pondo.tv/dyn/phpauto/movie_details/movie_id/<id>.json`.

- One request gives the title, description, actresses (Japanese and romanized), series, release date, duration and in-site tags. The parser is in `peach.sources.onepondo`.
- Delisted works return 404 directly and fall to community sources (javdb has taken in some).
- **Whether to ask is decided by local evidence.** 1Pondo and カリビアンコム both number as `MMDDYY_nnn`, and the code alone cannot tell whose it is; the separator
  is carried in by a release group's file name and is not a studio identifier. So the official site is asked only when `1pon`/`一本道` appears in this row's path, file name or ledger studio,
  and otherwise it goes through community sources as before. Basis: locally, カリビアンコム codes all return 404 on 1Pondo, and 1Pondo codes all hit.
- The cover is only the site's own 16:9 still (`str.jpg`, 960×540). Uncensored studios issue no jackets, and `thum_b.jpg` is a 120×197 list
  thumbnail; neither is a portrait cover of the JAV kind, and the larger one is taken and treated as an official image.

## Rate Limiting and Bans of javdb, AVBase and JavBus

This section covers when the three community sources are asked, how fast, and what to do when banned. In-library collection asks them by product code only when official channels come up empty; for the
metadata and cover comparison rules see ADR-0030 and ADR-0032.

### Pacing of In-Library Collection

- javdb's per-host interval is set by the user: in `library_processing.SOURCE_INTERVALS`, `javdb.com` and `jdbstatic.com` are both 3 seconds,
  and the two hosts must be changed together. This interval is shared by the whole process through `SOURCE_LIMITER`: when metadata processing, fetching wanted metadata, fetching new-release metadata
  and subscription checks run at the same time, asking the same host is still queued in one line.
- **For FC2 product numbers, only javdb is asked among the three** (`community_catalog.community_sources_for`). In local source evidence, AVBase and JavBus
  have never given anything for FC2; javdb can fill in about half of the performers and release dates, but gives no studio, tags or cover, so it is slow to ask but cannot be cut.
- The length of a collection round is roughly the javdb request count times this interval (measured to differ by about ten percent). `HostLimiter` waits for "N seconds since last", and other sites'
  round trips fall within this window and are absorbed, so skipping the other two saves quota and Cloudflare hits, not time; making it parallel saves no time either.

### After Hitting a 403 or Verification Page

- When javdb, AVBase or JavBus returns 403 or a verification page, the whole source stops. AVBase returns a Cloudflare verification page; the cause of JavBus's 403
  was not obtained.
- The pause doubles by count: the first pause is `scraping_access.FIRST_BLOCKED_PAUSE` (15 minutes), and only consecutive hits double it, with the cap being
  `blocked_pause` in `SOURCES` (24 hours for javdb, 6 hours for AVBase and JavBus). Once a run gets through, the record is cleared and counting restarts.
- **The cap cannot serve as the first pause length.** The actual ban is often much shorter: the time javdb recorded a 24-hour cooldown, all responses returned 200 in under 7 hours, while the failures of that round
  all said "source is cooling down".
- A 403 with only the status code to go on is not reported as a login wall: it may be invalid credentials, or the exit IP being banned (javdb's ban that time lasted 3–7 days, and changing cookies did nothing).
  The wording of `metadata.auth_wall_reason` therefore states only the two possibilities and does not urge changing credentials; only responses carrying a login page address or body say plainly to change credentials.
- The cooldown period throws `SourcePaused` rather than `NotFound`, so the "do not ask again within 7 days" memory (`library-metadata-misses.json`)
  records nothing, and the next round asks the same batch from scratch.
- The issue list records such items as "not reached this run" (`severity: paused`). Failures of self-written sources carrying `cooldown_action` (verification pages,
  bans, region restrictions, rate limiting) also fall in this tier. Items count as not reached only if all the sites that errored in a tier are cooling down; if one is for another reason, it is "not obtained".

### javdb's 403 Is a Quota Counted by Exit IP

What javdb judges is "this exit is sending too fast", not "are you a bot". So **do not swap in a curl_cffi fingerprint for it**.

- Basis: outside the cooldown period, the four combinations of HTTPX and curl_cffi's `chrome136` fingerprint, with and without cookies, fetching search, detail and profile pages
  all return 200, with no challenge page and no login page, differing only in the UI language (with cookies Simplified is returned, without Traditional). Fingerprint recognition would refuse on the first request;
  while a whole round of several hundred requests runs through and the ban comes only after reaching a certain volume, which is the shape of a quota counted by exit IP.
- **Not obtained**: a comparison of the two transports within a ban period. Obtaining it would require first driving the exit IP into the block, which is not done, so whether "changing
  the fingerprint gets through immediately after a ban" remains unknown. The scripts and raw results are in `<private verification records>` outside the repository;
  for the origin of the comparison see [docs/reference-snapshots/amane-crawlers-poc.md](reference-snapshots/amane-crawlers-poc.md).

**Quota and bot judgment are two different things, handled differently.** Cloudflare and verification walls judge "are you a bot", and getting around them means disguising as another kind of
client, which is always given up. This javdb gate judges exit rate; changing nodes only changes a line and recounts the quota, with no disguise, so changing the exit is allowed.
But the quota itself is still honored: the source floor may not be lowered, a 403 still ends the whole source, and hammering with swapped nodes during a ban period
amounts to using several exits to put together one over-speed batch.

- Scripts are allowed to go out through the environment proxy: `via_proxy` of `Site` lets HTTPX read the environment proxy, without guaranteeing that system proxy or PAC is read. App routing and
  the actual exit must be verified separately, and for new users' configuration boundaries see ADR-0024.

### Rate Limiting Directory Collection on javdb

`scripts/harvest_directory_links.py` asks javdb person by person by name (see "Directory-Type Sources and Social Links"), at a more conservative pace than in-library collection.

- It was actually banned once: after fetching over a hundred pages at about one page a second, every path on the whole site returned 403, with the page saying "基於你的異常行為" and suggesting changing nodes,
  and the exit IP was banned for 3–7 days. Before the ban there was no `Retry-After`, no slowdown and no captcha, and pausing a few minutes midway did not win back quota; the quota accumulates by exit
  IP, not by path, and the trigger is on the order of 40–50 pages per minute.
- So the rate limit is a hard-coded source floor, not a command-line default: `harvest_directory_links.SOURCE_INTERVAL` sets javdb at 5.0 seconds
  (12 pages per minute), and `--interval` can only go higher and cannot press below it.
- **On hitting 403/429/503 the whole source ends.** `Site.request()` does not retry on status codes; continuing to page after a ban would only make each spelling of each
  actress's name hit a 403 once. `rate_limited()` does a `break` on a hit, and pages already fetched still go into judgment, so this round's results are not lost.
- Fetched pages are cached in `state/directory-links/javdb/`, and judgment can be replayed offline. After the ban period, raise `--limit` and keep running, and cache hits
  cost no requests, so no checkpoint parameter is needed.

### Several Causes of Cover Failure and the Age Gate

- The official versions return only a "preparing" placeholder image: the work is mostly delisted (MIDE-594).
- Two image sources each have an image but the dHash does not match: "not the same image", and not used.
- When a community source's image comes from only one image source, it is installed all the same, and an empty `verified_by` in `.scraping.json` means uncorroborated (IPX-060 has only javdb).
- JavBus has an age gate, and without a cookie the product page answers with a quiz-style age verification page; javdb has a login wall. The cookies of both are pasted by the user into collection settings after passing the gate
  in the browser or logging in, and public collection carries them with requests.
- JavBus's shared source transport sends `Accept-Language: zh-CN,zh;q=0.9`, and connection checks, work metadata and this site's cover requests share this language preference. Age verification is still completed by the user in the browser, and request headers do not replace login or age confirmation.
- Old JavBus and javdb snapshots under `sources/metadata/javinizer-go/` are used only to pick the official channel from the studio, and covers are not official candidates: when JavBus cannot find
  the original code it returns another work.

## Local Collection Entry

This section covers the shared entry for fetching covers from the GUI and the command line, and its connection, cookie and write rules.

The GUI and `scripts/fetch_jav_covers.py` share `peach.jav_cover_fetch`. The developer's mapping files or cookies need not be copied to
a new user's computer. Existing successful metadata snapshots take precedence, and when a snapshot is missing public sources can be queried online.

- **Connection mode**: the cover HTTP path of R18, DMM, Prestige and MGStage uses the system proxy, app direct connection or a custom proxy by source.
  DMM connection checks report the page and the HD CDN separately. HTTPX's environment proxy is not the same as the system PAC; an app direct connection cannot exclude TUN either.
- **Cookies**: pasting and Netscape file import for cookie-taking sources (JavDB, JavBus, FC2CMADB, Instagram) reuse
  CredentialStore, and save only unexpired items within the current source's domain. Saving itself does not verify whether the login session is valid.
- **Per-task limit**: a GUI cover task accepts only one library-matched product code at a time, reusing BackgroundJob; at most 80 requests and 32 MiB,
  with a 180-second deadline checked before a request goes out.
- **Replacement rule**: replace atomically only when the full image has the same probed size, decodes completely and has a larger area. Original bytes are not downsampled. A successful sidecar records
  the original image and the install digest, and when the digest matches within 24 hours no repeated download is done.
- **Failure and restart**: the 429 Retry-After cooldown is written to a local file, and newly created transports also obey it; failures do not delete the existing cover. After a program restart
  write tasks are not replayed automatically, and unfinished ones are restarted by the user.
- Instant r18 studio evidence and local snapshots use the same source routing, and Prestige and MGS both take part in candidate comparison; original images have no derived downsampling.

This connection configuration covers the cover HTTP and the FC2 CLI. The amane bridge subprocess, other collection scripts and the curl_cffi connector each use their own configuration.
Instagram's standalone user login session was not obtained, and an automatic adapter does not enter the official dependencies.

For test steps see [Windows test build](TESTING_DESKTOP.md), and for architecture requirements [ADR-0024](adr/0024-mark-manifest-not-bundled-bytes.md).

## Online Identification of Videos Without Product Codes

`scripts/scrape_codes.py` recognizes only product codes. Videos without a code (resources from Twitter, Telegram sources and so on) go through the
two-stage flow of `scripts/identify_resources.py`, and the identification results likewise enter "Metadata fields" in `/review`, and are written to the corresponding metadata items in the database only after confirmation:

1. `worklist` reads only the ledger and generates search spellings from the file name: the name as is, with promotional head and tail stripped, separators replaced with spaces, English with no spaces split by case,
   and trailing quality tags stripped. It also marks companion images in the same directory, which can directly serve as posters. `metadata_hits` counts how many of creator, title, studio,
   series and performers already exist, putting those with fewer first by default; `--sparse-only` keeps only entries with none of these, and identification does these first.
2. After an agent or a person checks online, fill the CSV back as `asset_id,field,value,source_url,confidence,note`.
3. `ingest` merges into `generated/library-metadata-field-candidates.csv`, with the candidate source recorded as `websearch` and `asset_path` pinning
   the specific file.

- Fields are limited to title, original_title, performers, studio, series and release_date.
- Videos with a product code still go through the JAV sources of `scrape_codes.py`.
- Web search is executed on the agent's side, and the script sends no requests and writes no ledger.

## Naming and Identity Merging

This section covers how canonical names are chosen, how aliases are registered, and how to merge when the same person is stored as two entries.

### Canonical Names and Aliases

- The canonical name prefers a sourced, commonly used Simplified Chinese name, and keeps Japanese when no reliable Chinese rendering exists yet. Former stage names, romanizations, kana and Traditional names are demoted to aliases.
  `no_avatar` only means no qualifying image was obtained, and does not prevent a verified name from being stored.
- "This page has only one actress" is not evidence: many codes in the library are BEST compilations, and pages with no search results also render recommended articles. An exact back-match
  hit takes priority over any "unique" inference, and "unique" counts only when two product codes bear it out together.
- The romanized field of r18.dev is rendered as "current name (former name, former name)", one field holding several stage names of one person; the kana and Han-character
  spellings each take their own row, with the romanization being only this one. On storing, it is split by `peach.entities.split_composite_person_name`, whose signature is "a space before the
  parenthesis, comma-separated inside it, romanized on both sides". The same literal shape is also used in the ledger for studio disambiguation (`AV DEBUT（本物人妻）`),
  role sources (`アスナ(SAO)`), submission status and deduplication suffixes, and can only be narrowed by this signature.
- `XX XX` is a source node's text repeated, not a legal alias. Before a person name enters a CSV, a compatibility field or `upsert_asset_entity`, the
  whole repeated string is collapsed first; cleanup also audits `asset.creator`, `演员:` tags and `entity_alias`.
- Judging "the ledger already has this name" must look at romanizations too, and `peach.entities.name_chain` must not be used. That chain removes romanizations by design
  (searching Japanese sites with romanizations is wasted effort), and using it as the "already has" criterion would report as a new alias the `Rin Natsuki` plainly sitting in `entity_alias`.
  For the full set, read `canonical_name` plus `entity_alias` directly.
- Zero-width characters in upstream names are stripped in one place, `canonicalize_entity_name`, and not fixed separately in each script. `str.strip()` does not recognize them as
  whitespace, so `normalized_name` would carry an invisible character: identical to an ordinary name in the UI, but `upsert_asset_entity` cannot find the existing entity by
  `normalized_name`, the same person is stored as two entries, and searching by name finds nothing either. U+200B/U+200C/U+2060/U+FEFF are stripped;
  **U+200D is not stripped**, since emoji family and profession sequences rely on it to join, and stripping it would split one glyph in a creator name into two or three.

Aliases fall into three kinds by source, and in the UI only the kind the user typed in themselves can be undone (`user:alias`, write endpoint `/api/entity-alias`):

- What scraping (`r18:performer` and so on) and merging (`merge:*`, `avdb-actor-mapping@<rev>`) leave behind is the record of why this entity looks the way it does,
  and is not deleted with one click.
- Free text is saved to the alias table; `canonical_name` is the person or studio name shown on the page, and can be chosen only from names the profile already has
  (`/api/entity-name`).
- The avatar gallery queries along the whole name chain one by one and takes the union, so one fewer alias row means one fewer batch of candidates. The same person is often stored in several spellings with a batch each, and stopping at the first hit
  would make the images under the later names miss out entirely.

### Merging Entities

- A unique-constraint conflict on `entity(kind, normalized_name)` is usually not a bug but a signal of a person's old and new stage names. Merging goes through
  `peach.entities.merge_entity`: it keeps the side with more works, migrates relations, aliases, external refs, links and search terms, and keeps all old names as aliases.
- The merged-in id leaves a tombstone in `entity_redirect` pointing to the kept side, and chained merges are flattened into one hop on write; follow sources, feed subscriptions and
  discovery associations are repointed with the merge. Entries that fetch by id (`/entity-image`, avatar change, feed discovery, review candidates) go through
  `entities.resolve_entity_id`, which recognizes live entities first and then tombstones; when the target entity is deleted, a trigger deletes the tombstones pointing to it.
- `entity_external_ref` keeps only one row per provider, and a second one from the same source is dropped and reported, not silently overwritten.
- Duplicates across creator and performer do not use the "side with more works" rule. They merge automatically only when the two non-empty work sets are identical and a performer alias
  exactly hits the creator name, or the creator name is composed of the performer's real name and an account alias.
- `r18:performer`/`javbus:performer` are officially released cast metadata and keep performer; the generic `performer` is a flattened compatibility
  assertion and keeps creator. A merge must sync the `asset.creator` and `演员:` projections, otherwise the deleted entity still forges links on the detail page.
- Two traps of `merge_entity`: sqlite connections default to `foreign_keys=OFF`, so child-table rows must be explicitly DELETEd inside the function; counts use
  `SELECT changes()`, not the connection's cumulative `total_changes`. Merging is irreversible, and after a merge `PRAGMA foreign_key_check` should be 0.

### Automatic Registration of Performer Aliases and Profiles

- **Alias follow-up** (`peach.performer_alias_followup`, ADR-0055) automatically registers a performer's other stage names. `source` is the batch number
  `auto:performer-alias@<task row id>`, and `revert_auto_landing.py --source auto:performer-alias` withdraws the whole batch. Verdicts are written to
  `generated/performer-alias-landing.csv`, and spellings already occupied by other entities are only recorded, not written.
  - Reads only the "別名" row of the minnano-av profile table and the name field of the "プロフィール" section of an av_neme person page.
  - On the minnano-av search page, several aliases of the same person each take a row, and uniqueness is judged by deduplicating on the number; on a unique hit the site jumps directly to the profile page, and the number is read from the page header
    canonical.
  - av_neme's series pages and month pages also write "名前(女優名)", and a page counts as a person page only if the page name equals the main name. An old page of a renamed person has only one sentence
    "女優名が【甲】から【乙】へ変更", whose first section is not "プロフィール", and is not read.
- **Performers with FC2 works first ask the fc2cmadb actress field** (ADR-0061): from her own work page enter that person on the site, taking only the site's main name;
  seller product names mixed in the former-name string are not taken. Entities whose canonical name is a seller's handle (`たぬき顔サラサラ黒髪ロング`) get connected to the real name through this site.
- GirlsDelta (`girlsdelta.com/model/<id>`) has a directory and promotional photos, but too little that a face can confirm, and is used only as a single-person corroboration link, not entering the pipeline.
- **Performer profile follow-up** (`peach.performer_profile_followup`, ADR-0067) writes profiles into `performer_profile`, with batch number
  `auto:performer-profile@<task row id>`, and `revert_auto_landing.py --source auto:performer-profile` withdraws it. Verdicts are in
  `generated/performer-profile-landing.csv`.
  - minnano-av profile page `actress<number>.html`: each cell of the table starts with `<span>label</span>` and the value runs to `</td>`; only
    the `act-profile` block is read, and cells of the same name in the comments section do not count.
  - The `<p>` of the `生年月日` cell contains a stray `</td>`, and cutting the value there leaves out exactly the odds and ends after the zodiac sign.
  - `サイズ` looks like `T156 / B86( Eカップ ) / W58 / H85 / S`, with the numbers in centimeters; the meaning of the trailing `S` was not obtained, and only the original text is kept.
    Pages with an unfilled profile lack the rows for birth date, blood type and birthplace.
  - The `ブログ` cell displays `http://` while the `href` is `https://`, and the `href` is taken. The in-site avatar `/p_actress_125_125/` is only 125×125.
  - avwikidb.com returns the full page to a direct httpx request with a Chrome UA (registered in `scraping_access.SOURCES`, with a 6-hour pause on access denial). In the JSON-LD `Movie.actor` in the head of the work page
    `/work/<code>/`, each item gives `name`, the romanized `alternateName` and `/actor/<number>/`, and the number
    is taken from here. In the actress page's JSON-LD `Person.alternateName`, the first two items are the reading and the romanization, followed by other names the site merged (including male
    performer names), which are not taken. The measurements are only in one cell of the body, "身長・スリーサイズ" (`T148 B83(B) W55 H85`). The actress image is DMM `actjpgs`'s
    125×125, not used as an avatar; the in-site search is a `⌘K` popover, whose address form was not obtained.
  - When birth date and height disagree with minnano-av, they are only recorded in the external ref's `metadata_json.conflicts`.

## Product Code Catalog, Creators and Watermarks

This section covers how to recognize product codes from file names and directories, how to confirm that a source returned the same film, and who counts as the creator.

### Extracting Product Codes from File Names

- When a product code directory is projected as a creator, the criterion can only be file-level evidence and must not look at the shape of the name: the only reliable distinction is whether the media file names in the directory
  parse out the same product code (`scripts/audit_code_creators.py`), and doubtful cases always go to the review CSV.
- Product codes are filled in only for videos in the directory. Release directories are also mixed with forum propaganda, downloader ads and cover images (`Tokyo-Hot n0780-HD` has two).
  Writing the code onto them has two consequences: in the library they pose as files of this film; and junk review, because "it carries a real code itself", judges the directory evidence invalid
  and keeps them out of the queue. Writes go through `field_owners` signed `script:code-creators`, and cells the user has changed are no longer overwritten.
- Promotional short clips in release directories are scored by `scripts/find_ads.py` on five criteria and output only as a CSV for people to handle; javm's `find_ad_videos` identifies by keywords and can serve as a comparison (ADR-0092).
- Quality prefixes (`HD`/`FHD`/`4K`/`1080P`) and version suffixes (`-C`/`-CH`/`-UC`/`-SUB`) are not part of a product code, and the extractor strips
  these two layers before matching. The UI projects version semantics as "Chinese subtitles", "Uncensored" and "Uncensored cracked", and the original `name`/`code` are left for file operations. Compact codes missing the
  hyphen are restored only when they have evidence of studio, release date, or a performer/studio/series entity at the same time.
- Promotional domains appear at the head, tail and in brackets of a product code (`www.98t.la@ABW-358-U`, `ABP-762-fuckbe.com`, `[xxx.cc]ABC-123`).
  Code extraction and directory deduplication share the `strip_promo_markers` layer; if each stripped half, `[98t.tv][98t.tv]ABW-251` with two layers stacked would slip through
  in one of them.
- Words that only say "what kind of file this is" (`IMG`, `VID`, `VIDEO`, `NO`, `PART`) have the same shape as a code body, and are centralized in
  `catalog_rules.CODE_BODY_STOPWORDS`; quality words belong to `_QUALITY_HEAD`, and repost site marks to `REPOST_SITE_LABELS`. The three lists
  each handle one kind, and extraction passes through them in turn. New entries are first checked against misjudgment evidence with `stems` of the local temporary tool `build/parse_shapes_audit.py` (not distributed with the repository).
  Creator nicknames can also collide with this shape, and stuffing them into the list one by one only yields
  a table that never converges.

### Date-Style, Tokyo-Hot and Western Numbering

- The separator of amateur-line date-style codes (`MMDDYY_NNN`/`MMDDYY-NNN`) is a studio identifier and belongs to identity: 1Pondo, パコパコママ and
  カリビアンコムPR use `_`, カリビアンコム uses `-`, and the same serial on the same day is two different films. JavDB also stores them separately (in `<private verification records>`
  outside the repository: searching `092415-001`, the first result returned is 1Pondo's `092415_001`).
- So `catalog_rules` normalization, identity comparison and query variants all preserve the separator as is, and do not generate a variant in the other spelling: searching with the wrong separator
  finds another film. Only when the source gives a plain digit string with no separator do both count as hits, and a missing character is not counter-evidence.
- The spellings of wild file names drift (the same 1Pondo film has both `1pon-092415-001-fhd1` and `1pondo-092415_001-FHD`), so when stripping the code
  to display a title both separators are allowed through, and the value landing in `code` keeps the one the file name gave.
- The six digits of a date-style code are `MMDDYY`, and the month and day must be valid for it to count as this shape. Looking only at digit counts, the `125735_816` (month 12, day 57)
  in the phone recording `VID_20220818_125735_816.mp4` would become a 1Pondo code.
- Tokyo-Hot numbers have no studio letter segment, and the canonical spelling is lowercase: main-line `n1234`/`k1234` are zero-padded to four digits, and the Red Hot branch is written
  `red-123`. javbus's work page address is just `/n1234`, and the reference implementation NeoAVDC (MIT)'s `TOKYOHOT_NUM_RE` likewise outputs lowercase
  `n####`. The `k` and `red` branches have no entries in the local ledger, and their spellings on javdb/javbus are **not obtained** as evidence. The number has only one letter,
  and its shape cannot keep out names like `no0037_01`, so it is recognized in only two positions: at the start of the name, or when the name already says `tokyo-hot`.
- Western releases are named "studio/series + release date" (`DorcelClub.24.12.02.Christy.White.XXX.1080p`), which is an identity and not a product code:
  `catalog_rules.western_release_identity` gives `DORCELCLUB.2024-12-02`, `release_identity` recognizes it, and code extraction always
  returns empty. A two-digit year expands with 70 as the cutoff, and a four-digit year is taken as is. It is recognized only at the start of a token, not searched in the middle: for the ledger's
  `E078. Redhead.Sucking.Big.Cock.And.Hard.Sex.2019.10.15`, a mid-token search would yield the series name `Sex`.

### Confirming the Source Returned the Same Film

- The same product code on JavDB can correspond to several source IDs, and it cannot be recognized as the same work by code, duration or search order. Both the web and the anonymous API first gather the matching source IDs; details are fetched only if there is exactly one, and ambiguity is reported when there are several. Details, images and resources keep using the source ID confirmed this time, and do not re-pick a film by code when fetching resources. Old code caches, discovery sidecars and raw snapshots can be reused only through source-specific rules.
- JavDB's `origin-title` / `origin_title` is the original title and `current-title` is the localized display title. When an original title exists it is preferred, and the display title is kept separately as evidence; when the original is missing the display title is kept, and neither text language nor asterisk fragments are guessed at or removed.
- Upgrade repair, through a standalone text-rule receipt, invalidates old JavDB in-library snapshots in a targeted way and picks the corresponding videos to collect evidence again; the original JSON, manual fields and existing cancel and defer records are kept. Old JavDB candidates do not take part in automatic adoption, current candidates enter the existing review flow with the source identity and rule version, and normal evidence from other sources is not cleared.
- A product code returned by a source counts as a hit only after being compared with the code queried. On the javbus side the code is searched as a keyword and the first result taken, and when nothing is found it returns
  a similar someone else (`SA-104 → AVSA-104`, `AR-301 → STAR-3016`). Without the comparison most matched codes are plainly wrong, and the whole MIB directory
  (Korean content) was once given Japanese studios, series and titles because of this, and even upgraded to JAV on that false evidence.
- The criterion is `catalog_rules.same_release_code()`. It normalizes only benign differences such as verified prefix aliases, DMM's `h_` marker, zero padding and remake trailing letters;
  where the source gives no id it does not block (missing evidence is not counter-evidence). The review queue removes candidates by the same criterion (ADR-0035): a row whose candidates are all removed
  stays out of the queue entirely, since putting there something that cannot be written even when clicked only makes a person re-recognize it.
- javbus is a fallback source (`metadata_policy.FALLBACK_SOURCES`): when another source is usable on the same field, its value is not taken as evidence; it gets its turn only when
  it is the only one. This step comes after the code date criterion. After removal, for fields where all sources are official, automatic writes can replace values already in the ledger,
  with the rule name recorded as `adr-0035-official-replaces-*`; community sources still only fill empty ones (ADR-0035).
- Korean MIB numbers (`catalog_rules.KOREAN_MIB_PREFIXES`) are asked of no JAV source for metadata or covers. `HA-101` and `MY-102` collide with Japanese works of exactly the same code,
  code verification passes all the same, and the only way is to not ask by the number prefix as a whole. The five entries of scraping, scanning and collection, page cover fetching, cover batches and
  restore from logs all block by `is_korean_mib_code()`. The cross-work criterion for covers compares both the letter segment and the digit segment: `YUJ-101 → yuj00011`,
  `435MFC-135 → h_1711mfcc00027` have matching letters but wrong digits, and both are other films.
- `catalog_rules.code_query_variants()` only expands search terms, every return is verified against the ledger's original number, and cache and network results are likewise checked.

The prefix equivalence table and the query table are two different tables:

- Verified LUXU, BAZX, HA and 9 MGStage prefixes (`_RELEASE_PREFIX_ALIASES`) can be normalized, and other numeric prefixes are kept.
- Registering a row needs evidence group by group: the MGStage product page compared with the r18dev snapshot on title, duration, cast and cover; avbase groups the two stores' entries as the same work;
  and in the ledger that letter segment hangs on only one studio.
- The full number in MGStage's official product detail path can corroborate the display id that omits the prefix; covers, titles and search URLs are not used as identity basis.
- When DMM/r18dev give only a `content_id`, the studio segment in it can be used to check a bare code, but cannot erase the MGStage prefix in the query.
- `390JAC-040` is an MGStage release, `JAC-040`/DMM `118jac040` is another DVD compilation, and JNT likewise must not be merged by bare number.
- Variants that cannot be confirmed return `identity_mismatch`, keeping the raw snapshot but generating no field candidates.

### Who Is the Creator

- The creator is the channel owner, not the person on camera. In file names the only things that can create a creator are `RT_@X - body…`, an explicitly labeled `女主@X` and a Chinese name in the body;
  a trailing string of bare `@A @B @C` is mutual promotion, and `📷：@X` is the photographer, neither creating one.
- **A release platform is neither a studio nor a creator.** Platforms like FC2 and myfans are places that sell things, and the account on the site that is the actual seller (the producer) is the
  creator. The platform itself can only be a source/platform entity, with links registered under `catalog`, and no "studio official site" is sought for it:
  `studio_sites.PLATFORM_ENTITIES` judges it directly "not applicable (release platform)", sending no request at all, nor silently skipping.
- Some FC2 works in the ledger are labeled with actresses and some comments mention people; that is **performer** identity, and the platform must not be recorded as creator in passing. Once recorded,
  the works of all sellers under this platform would hang under the same "creator", the same kind of accident as stamping a uniform tag on an aggregate directory.
- A repost channel's watermark is not the creator's watermark, and a directory name can also be a disguise. Priority of judgment: on-screen watermark > online lookup by work name > file name text.
- Before applying a creator-level tag, first confirm from the distribution of subdirectories under the ledger path that this creator is not an aggregate directory. Stamping a uniform style tag on an aggregate directory
  is a replay of the `asce` accident.
- **Release names with rotating cast are studios or series.** The same release name may rotate performers by number, and it cannot be recognized as a personal account by directory name alone. `classification.numbered_cast_shape` recognizes three naming forms
  (prefix + number + person name, cast combination - number - title, camel-case person names joined plus a number), reporting only with at least 3 works under the same account, over half the files matching, and at least
  3 performers; for the prefix form, 3 of the names must be performers already in the ledger, and a same person appearing in over eighty percent of the matching files is a personal or couple account.
  The ownership audit reports it as `label_shape`, going only to review and generating no repair plan.
- **Identity research first looks up Japanese wiki sites by page name.** General search does not index sites like sougouwiki and av_neme, and a "not obtained" from searching only general engines
  does not count as having looked. `research_creator_identity_wikis.py` reads only the ledger, and for creators whose identity awaits verification it fetches both sites directly by EUC-JP page name, using the canonical name, the name with the code prefix removed and
  the file name prefix (the page-fetching layer is the alias follow-up's `WikiSitePages`, with page cache, 404 memory and source cooldown shared with the service).
  When a same-name page is a work list of 3 or more performers, an observed `identity=release` is recorded and `unknown` is rejected; when neither exists, the unknown candidate states
  which pages were asked; a fetch failure other than a missing page is not obtained and does not enter the list. The list is handed to `apply_entity_identity_research.py` to freeze the preview and write with a backup.
  When a processing task ends, the "check creator identity" follow-up automatically asks about newly registered and existing creators by the same criteria, and hits land directly as observed with the batch source (ADR-0098).
  Changing an entity type is still user review. 裏DVD村 (uradvd-mura.com) is a DVD/download store with member login and has no series pages addressable by page name,
  is not connected, and serves only as a clue for manual verification.

## Performer Names and Avatar Sources

This section covers where avatars are fetched from, how they are picked and replaced, and what each performer profile site can offer.

### Source Direction and Size Gates

- Avatars are taken from carefully curated galleries; logos conversely recognize only the brand itself, with official sites and the studio's own social accounts being the authoritative sources.
- Candidates are judged by measured pixels (`peach.images.classify`): short side < 128 is rejected; avatars are additionally judged by long side ≥ 500 and short side ≥ 300, since a portrait composition
  held to the square-image gate would reject the best sources. Those with only a URL and no measured size do not count as candidates.
- **"Long side ≥ 500" is a source gate, not a display gate.** It blocks thumbnail-grade sources. Used as a display gate, it would keep out a 382×382 with a 208px face width,
  leaving a cover crop whose face is only 55px occupying the place. For display-side size conventions see [docs/FRONTEND.md](FRONTEND.md).
- Usable sources: r18.dev, av-wiki.net, Gfriends. javlibrary, missav and xslist are blocked by Cloudflare, njav has a verification wall, and jav321 has no
  standalone actress field. Sites blocked by Cloudflare are always given up, and bot detection is not bypassed. javdb.com can be fetched, but is rate-limited by exit IP, see
  "Rate Limiting and Bans of javdb, AVBase and JavBus".
- Gfriends is used as an external Provider only through `Filetree.json` and single raw media, without cloning the gallery or putting images into Git. The index cache is aged by
  mtime (one day), and when no new index can be fetched the old cache is used with a warning in the output; that round's "not included" is recorded as error rather than no_match, otherwise
  `--resume` would harden one network failure into a permanent answer. Gfriends has a median of 1 image per person, the cached image median is 500×600, and it is not grouped by work.
- The service process checks the index cache when the avatar dialog opens: if missing or stale it fetches one in the background (`avatar_picker.IndexRefresher`), going out through the collection
  unified exit and Peach proxy settings. This time candidates are still listed from the old cache; on failure it only logs, does not retry within 15 minutes, and does not enter the task center.
  The index is not distributed with the installer: upstream updates daily, and bundling a snapshot would keep people added after the snapshot showing as not found.

### Auditing and Filling Gaps

- `audit_performer_portraits.py` puts qualifying images into a content-addressed cache dedicated to candidates, saving for each its provider, name hit tier, upstream
  ID/URL, size, MIME, SHA-256 and policy version. Those with the same bytes as the current avatar leave only audit evidence and do not enter `/review`. This script
  has no path that writes the ledger.
- `fill_portrait_gaps.py` walks the stretch from gap to installed: among people who have never had an avatar, those whose name chain hits exactly one image in the gallery are installed directly;
  for those hitting several, none is installed, and a comparison sheet (`--sheet`) is produced instead, with candidate images side by side and next to them her work links in this library. Installing
  reuses the three steps of the picker dialog (`avatar_picker.choices`/`resolve`/`install`), with the evidence, cache and framing sidecar conventions completely identical to a manual swap.
  Default is dry-run, and avatar files are written only with `--apply`; the ledger is opened read-only, and this run writes no ledger.
- **The gallery stores images by name, and the same name means different people.** For a single name like `ななみ`, the twenty-odd hits are twenty-odd people, and picking automatically would be like randomly giving her
  someone else's face, so "only one found" is the single criterion bold enough to install automatically. Even when a single name hits only one, the evidence is just "keys exactly identical",
  and after installing it still needs a look on the profile page; recognizing a person against their works is something the machine cannot do.
- **The gap criterion is "there is no `performer-<id>.img` on disk", so one poor image keeps better sources out permanently.** Example: social collection installed work
  cover crops into a batch of empty slots, those people no longer count as gaps from then on, while Gfriends has HD frontal photos for some of them. The gap audit cannot answer
  "is the one in place good enough", and switching sources needs a separate census round: recognize cover
  crops by the provenance `provider`, recognize undetectable faces, tiny faces and tiny source images by the sidecar, then ask the gallery once for each.

### Picking Images: By Face Width, Not Canvas

An avatar finally lands in a 64–160 px circle, and whether you can recognize who it is depends on how many pixels the face has, regardless of how big the whole image is.

- The criterion is in `harvest_social_avatars.rank_key`, with face width measured by YuNet of `peach.face_detect` (measured once per SHA), and written into the candidate
  CSV's `face_width` column for the reviewer to see directly.
- Counterexample: a full-body standing photo has a larger canvas but a face of only a few dozen pixels; a half-body photo of the same person has a smaller canvas with a face more than twice as wide. Picking by canvas, the one that wins is
  the one whose face is hard to see. The face in a group photo may likewise be far smaller than in a solo photo.
- An undetectable face is recorded as 0 and ranks after any measurable candidate; those with undetectable faces are never installed, official images included. When the whole batch is 0 (model absent, all
  profiles), ranking falls back to canvas, with the run statistics saying this round picked by canvas. The single-person work cover fallback uses the same ruler: faces in the right-half still of a JAV double-panel cover
  are often only a few dozen pixels.
- A swap happens only when the winner's face is wider. A winner that does not fill the circle is installed only as a fallback when the one in place has an undetectable face.
- **The avatar directory is shared by several pipelines, and `--apply` only swaps toward better.** `--force` means "avatars already installed also enter the contest", yet what it overwrites is
  **all** installed avatars, including those installed by other pipelines; and the candidate pool of `harvest_social_avatars.py` (X avatars, directory portraits, work covers) is far worse than
  full-page portraits like `verified-photo-page`, so overwriting without judgment would shrink the faces of most avatars. So before writing to disk, the one on disk is measured once with the same
  `rank_key`, and if the face is not larger it is not overwritten, and the run statistics report how many were "better in place, not overwritten". The face width of the one in place
  first reads the existing framing sidecar, and is really detected again only when there is none.
- **A swap must swap the sidecar.** The framing sidecar and the picking criterion come from the same YuNet detection (`peach.avatar_face`), written out together when the avatar is installed;
  if no new record can be given, the old one is deleted. Keeping the previous image's face box, the page would use it to frame this one, zooming into an empty spot, and in the UI this is indistinguishable from
  "this image is meant to be shown this way". Approval landing in `/review` also detects the face once. `scripts/detect_avatar_faces.py` is only a
  fill-in entry, and neither the detection nor the sidecar shape is defined by it.

### Watermark Removal

Fetched avatars carry other people's watermarks (the `PRIVATE.com`, `TEAMSKEET.COM` strip at the bottom), which must be removed in the bytes, not hidden by framing:
export, a change of framing rules or anywhere that switches to the whole image would bring it out.

1. `scripts/scrub_avatar_watermarks.py` only looks and does not write by default, producing a candidate CSV plus a stack of annotated side-by-side images.
2. The detector cannot catch semi-transparent watermarks, and a manual box is the right path: add a row `file,x,y,w,h` to the CSV of `--marks`. A manual box is not constrained by score, size
   and position priors, which are for questioning the detector and should not overturn a judgment made after looking at the image. A manual box covering a whole edge strip can often crop several watermarks
   at once.
3. After a person confirms, then `--apply`: the original image together with its three sidecars is moved as a set into `avatars-superseded/`, provenance gains a `watermark_scrubbed` segment,
   and the framing sidecar is recomputed on the new image.

- **Crop the edge if possible, do not inpaint.** Cropping forges not a single pixel, whereas inpainting does, and often wipes out only half, leaving semi-transparent residual text. The crop line is limited
  two constraints: do not cut into the face box plus padding (the face box comes from `peach.face_detect`), and do not crop the image to less than 70% of its area. Judged edge by edge independently,
  and one edge that cannot be cropped does not affect the others.
- **An image with more than 4 text regions detected is passed over whole, with not a single pixel touched.** That is not an avatar carrying a watermark, but a work cover installed as an avatar,
  and what is needed is a change of source, see the cover crops in the previous subsection.
- For the detection and removal criteria, model sources and measured numbers see "Avatar Watermark Detection" in REUSE.md.

### What Each Site Can Offer

- **The DMM actress index page is reachable, but its avatars are only 125×125, suitable only for the first avatar of an identity binding.**
  `https://www.dmm.co.jp/mono/dvd/-/actress/=/keyword=<kana row>/` returns the full list page through Peach's `dmm` source settings (with the in-site
  actress id and old stage names in parentheses), with no region blocking; `pics.dmm.co.jp/mono/actjpgs/<romanization>.jpg` also returns 200 without a Referer.
  - The problem is size: `actjpgs/<name>.jpg` is 125×125 and `actjpgs/medium/<name>.jpg` is 100×100, which cannot pass the HD candidate gate or the display gate.
    Gfriends already holds this batch whole and ranks in the last quality tier, so no separate HD provider is created for it. The forensic and replay scripts are in
    `<private verification records>` outside the repository.
  - Exception: on a new import, r18.dev's same person object directly gives the DMM id, name and file name, and an entity lacking an avatar can first install this official thumbnail,
    to be upgraded later by the avatar change page. The Japanese name, old stage names and in-site ID on the page continue to be used for the name chain and disambiguation.
- **javdatabase's entry must be the product code in the ledger, and a slug cannot be assembled from a name.** It has one page per stage name, and slugs do not map one to one to people:
  `/idols/rin-natsuki/` opens the profile page of `Rin Oka`; in-site search does not give idol pages either, only work lists.
  - The query order is fixed as code → `/movies/<code>/` → the idol link the page gives → name, with each step given by the page of the previous one
    (`scripts/harvest_javdatabase_names.py`).
  - A work can carry several actresses, and a matching code does not mean all names on the page belong to this person: an idol page's name is taken only if at least one of its names is already on this person's
    name chain in the ledger, and when it matches several people in the ledger it is recorded as "needs manual disambiguation".
  - It can give the Japanese original name plus the romanization of old stage names. Its studio names cannot be used, since it itself writes `セレブの友` as `Celeb no Tomo`.

## Directory-Type Sources and Social Links

Filling in performers' social media goes by "scrape a directory-type source whole, compare names offline, install a review CSV", not searching person by person (`scripts/harvest_directory_links.py`).
This section covers how each directory site is scraped, how names are matched, how links are judged and how agencies are built.

### Scraping and Name Matching

- laoshi.ink scrapes all actress pages by sitemap (ld+json `sameAs` plus external links in the body); bstar-pro.com passes the age gate once, then scrapes the models list and
  every page. HTML is cached by URL sha1 in `peach-data/state/directory-links/<source>/`, and reruns no longer hit external sites.
- Names on the page (Chinese name, Japanese name, aliases) are matched against the ledger's `canonical_name` and `name_chain` by `peach.social_links.name_key` (NFKC, casefold, whitespace removed).
  A page hitting two entities is recorded as "needs manual disambiguation", not guessed.
- The site's own social accounts (the few on laoshi's home page) are first subtracted from every page's external links, otherwise every actress would get the site's X installed.
- javmodel.com is not a social source and need not be tried again: through the proxy it returns 200 (direct connection times out), but the only twitter link is a share button, and there is
  not a single personal account. Instagram↔X complementing must wait until the directory data is installed and be done from the ledger itself, not in the collection script.

### Link Judgment and Liveness Checking

- Four verdicts: `ok` enters the install queue; `已有` (same platform, same handle, regardless of host spelling and case); `conflict` (the ledger has a different
  handle for the same platform); `未取得` (page failure or no social media).
- The source itself may be stale data: many X accounts copied by directory sites are already suspended and the person long since switched to a new one. So X `ok`/`conflict` rows are all checked for liveness with the logged-out
  page's og tags: a live account has `og:title` and an `og:image` pointing at `profile_images`; a nonexistent handle returns only a JS shell with no og at all,
  from which life or death cannot be told. When og cannot be obtained, the control account `x.com/X` is fetched without cache: only if the control is normal is it judged "suspected dead", and if the control is also empty
  it is rate limiting, recorded as "not obtained". The logged-out pages of Instagram, TikTok and YouTube give nothing, and can only be written as "unverified".
- **An X display name containing 「応援」 is a fan account, not the person.** Directory pages hang accounts like `篠田ゆう様💝応援アカウント` as the person's account,
  and the liveness check also says "alive". A note in the evidence is not enough, since `installable()` looks only at verdict and alive, so the criterion lives in `probe_rows`
  (`FAN_ACCOUNT`), and a hit downgrades it to the separate verdict `应援账号`. Directory-type sources do not verify social ownership, and this check can only be done by ourselves.
- The criteria (platform list, handle normalization, the `twitter.com→x.com` alias, label spelling, X liveness) are centralized in `peach.social_links`,
  and `normalize_link_hosts.py` and `harvest_performer_links.py` both take from it; `harvest_social_avatars.py` still keeps an old copy.
- **Hostnames are always lowercase.** jae's profile page writes `https://Instagram.com/…`, while the UNIQUE of `entity_link` recognizes only the literal, so copying it
  as is makes a second record for the same account (`social_links.canonical_url`). Path and handle are left alone: X handles are case-insensitive, but that
  is the spelling the user reviewed at the time.
- **A page that states it is a blog is counted as a blog, regardless of hostname.** `classify()` recognizes only `BLOG_HOSTS`, while subdomains of `alicejapan.co.jp`,
  `plaza.rakuten.co.jp` and `takasyo.blog.jp` are all the person's own blogs but not in the list; the line "公式ブログ" on the page is closer to
  the facts than the hostname. The label is recorded as "博客" per the ledger's existing spelling, and the blog's name is attached only when the page additionally names it (`公式ブログ「旬の果実」`);
  copying generic names like `オフィシャルブログ` as is would make the same thing appear in three spellings in the UI (`harvest_directory_links.owned_link`).
- Installing uses `install_entity_links.py` to read `directory-links-<date>.csv`; `-review.csv` is all the verdicts, for people to look at. Neither writes
  the ledger directly.

### Labels and Agencies of Official Links

- **A field's value describes only its own row.** In minnano-av's profile table, "所属事務所" and "公式サイト" are two different things: Ako Shiraishi's agency is T-POWERS,
  while the 公式サイト filled in is Prestige's exclusive promotional page. Using the agency name as the label of the official link would produce a control whose text says T-POWERS but whose icon and destination are both
  Prestige.
- So the label of an official link is written by domain ownership (`peach.social_links.host_owners`). Evidence in order: the official site link hung on the studio entity itself identifies directly; next is
  consensus among performers' official links (`OWNER_QUORUM` or more entries on the same domain writing the same name). A lone piece of evidence confirms itself and does not count as consensus. Only when ownership is not obtained
  is the agency name used.
- The agency name is stored in `entity.metadata_json.agency`, with `source` and `checked_at`, and a performer's transfer is overwritten by the latest. Wrong labels already in the library are fixed by
  `scripts/repair_link_labels.py`, which by default outputs only a review CSV.
- `scripts/install_agencies.py` installs these names as `entity.kind='agency'`, with ownership written into `entity_membership` (the primary key is on the member side, a person has only one
  current affiliation, and a transfer is an overwrite). The original text stays in `metadata.agency` as evidence, so a wrong conclusion can be traced back. Agencies do not enter `asset_entity`: storing a separate agency field
  for works would drift, and no one would notice the drifted copy.
- Parentheses in agency names are split by the same rule: outside the parentheses is the current name, and the reading inside and the `旧・`/`元・` after them are aliases. When an old name collides with another company's current name, no
  alias is written: the old name of `GG(旧・Prime Agency)` is exactly the still-operating `Prime Agency`.
- The agency's official site takes those of the members' official links whose label equals this company's name, using the domain root address and not a particular actress's personal page. After the name is split, it must be searched once more by the original text,
  otherwise sites like `ACT(アクト)` that have a site would not be found.
- A company whose current site cannot be opened can register a Wayback snapshot: link_kind is still `official`, url is the full `web.archive.org/web/<timestamp>/<original address>`, and label is
  `Official site archive (YYYY-MM)` (without the company name, the page header already has it), preferring the roster page. `peach.social_links.ARCHIVE_HOSTS` makes domain ownership, the agency's front round mark
  and studio mark collection all skip it; when a mark must be taken from a snapshot, register the `id_` original address of the image in the snapshot into the designated source table of `studio_icons.py`. After the review table's
  label is changed, rerunning `install_entity_links.py` aligns it.

### Agency Rosters and Transfers

- "Who is at this agency" goes through `scripts/harvest_agency_rosters.py`, fetching one agency at a time, with two orders of magnitude fewer requests than asking person by person.
  - minnano-av has no agency index page, and the in-site number appears only in the link in the "所属事務所" cell of an actress page. So first search out the number using this agency's known members, and by the above
    parenthesis rules check that the cell indeed names this agency (`KRONE(クローネ)` matches only after being split; the old name in `GG(旧・Prime Agency)` does not count). The number is written to
    `entity_external_ref(provider='minnano-av', external_kind='production')`, so the next run need not ask again.
  - The roster page `actress_list.php?production=<number>` has 30 per page, and names are read from the JSON-LD `CollectionPage`; the text of the body `<a>` is
    "name + 女優情報", which does not match the ledger.
  - The paging address takes `<link rel="next">` and restores `&amp;`, but the end point cannot be left to it: after the last page the site still gives a next page, with the content being
    a repeat of the last page's people, so it walks until "no new people on this page". When the head count does not match `numberOfItems`, tell whether the page count is capped or the site's roster has duplicates.
  - Matching names back to the ledger must include aliases: those that do not match are recorded as "not in library" (collapsed into a count line by default); a spelling matching two people is recorded as "duplicate name"; those already
    belonging to another agency are recorded as "belongs elsewhere", left for people to judge. `--apply` fills only the vacant one.
- Agencies split and rename. Transfers go through `scripts/resync_performer_agency.py`: select a whole agency by `--agency` or name individuals with `--only`, re-ask the actress page's "所属事務所",
  and overwrite only `entity.metadata_json.agency`; entities and affiliations are still landed by the REPLACE of `install_agencies.py`, so that the two sides do not each split names once and reach two conclusions.
  - Search must go through `name_chain`: the ledger canonical name is Simplified Chinese while the site recognizes only Japanese spellings, and asking with only the canonical name mostly yields "not obtained".
  - An empty cell on the site is recorded as "no agency on the site", and the ledger is not cleared: contract termination and the site not showing that cell that day cannot be told apart on the page.
- "所属事務所" records only who she is currently signed under. For someone who, after retiring, moved to a personal management company, that cell names her own company (三上悠亜 → 株式会社Miss), not an AV
  agency. These are rejected by `scripts/reject_agency.py` from a review CSV: the rejection is recorded in her `metadata.agency_rejected` and the affiliation is withdrawn, and when that agency is left with nobody the
  entity is deleted; when the AV-era agency has been verified, write it in the `replacement` column, and it is reattached in the same pass. The rejection is recorded on the person, and the three paths of writing metadata, creating entities and filling rosters all skip it through `peach.entities.rejected_agencies`, with the verdict recorded as "rejected".
- When one agency splits into two, both write "旧・XX" after the parentheses. The roster collector, by the parenthesis rule, refuses to recognize either as the one that was split, which is correct: the old name
  belongs to both successors (for example: LIGHT split into `ELTRA(エルトラ)旧・LIGHT` and `EST(エスト)旧・LIGHT`).

### jae.tokyo Actress Directory

jae.tokyo (Japan Adult Expo) is the third directory source specified by hand, and the same site's studio directory is under "Studio Names and Studio Marks".

- The profile page structure differs across the three editions: 2014 is `jae2014/actress/NNN.html`, with social and blog links mixed among the body `<a>`; 2015 is the `offActress` popup of `jae2015/actress.html`,
  with one button and one link per `actressLinkBtn`; 2017 is `jae2017/actress/NNN.html`, with the portrait in `img_area` and links in `link_area`.
- **`jae2014/*` gets reset on direct connection** (`WinError 10054`), so the whole of jae went into `PROXY_SOURCES`, and the same source uses two exits depending on the edition.
- **Links inside comments are not this person's.** Some pages' HTML comments leave other actresses' blogs and Instagram from the previous edition's template, and taking `<a>` blindly would install several people's accounts
  on one person, so comments are stripped before parsing.
- **Directory portraits enter the avatar contest, not another install path.** `-portraits.csv` is read by the `jae` route of `harvest_social_avatars.py` and competes on size with the candidates from X and
  babepedia in the same content-addressed cache; the framing of portrait full-body promo photos is left to the face sidecar, see "Face Framing" in REUSE.md.

### javdb Actor Pages

- **javdb.com is a source entered by name, not a directory that can be paged through.** The site has no enumerable actress list, and the entry is the name in the ledger: each spelling is searched in
  `search?f=actor&q=`, and the `title` field of the result card is all the spellings of this person on the site, so identity can be judged without clicking in. The name chain must be searched through before giving up: the ledger
  canonical name is mostly Simplified, `name_key()` does no Simplified/Traditional conversion, and searching only the canonical name often finds none at all (`harvest_directory_links.collect_javdb`).
- **The actor id can be obtained on the work detail page, with no need for a separate trip to the profile page.** Every name in the 演員 field carries `/actors/<id>`, which `sources.javdb.actresses` brings out along the way;
  only when the name exactly matches the person entity already linked to this asset is it registered as `entity_external_ref(provider='javdb', external_kind='performer')`, and the person page's
  JavDB entry is assembled from it (`peach.entry_links`). Historical data goes through `scripts/backfill_performer_entry_ids.py`: the javdb page cache and
  the `actress_id` of `review/agency-rosters.csv` each fill in one route, first outputting a dry-run CSV, then `--apply`.
- **Women whose works were not scraped from javdb have ids filled in by the performer profile follow-up, searching actor cards by name (ADR-0081).** The id on the card is the profile page's id,
  and for the uncensored one the avatar carries `<span class="info">無碼</span>`; matching cards count as the same person only if there is at most one per record type (`javdb.one_person`).
  The backfill script uses the same criterion when reading the search page cache.
- **Two records of the same name: do not take the first.** The same actress often has both a "有碼" and a "無碼" record on the site, and both pages enter judgment, with colliding accounts landing as `conflict` in the review table.
- **Some profile pages require login, and return a login page rather than a 401.** No account is registered. That page is recorded as "not obtained" with the reason stated: "searched, not on the site", "found
  but needs login" and "not searched" are three different things, and not writing them apart means searching again next round. The pages needing login are all the "無碼" twin records, while the 有碼 one is public and the Chinese name can be
  obtained from it, so logging in to get names yields no increment; the work list of the 無碼 record remains behind the wall.
- **Social buttons are only inside the `section-addition` block.** Outside links elsewhere on the page are ads, sister sites and RTA labels. Instagram is the main increment of this source.
- **javdb's round avatar is 250×250 and cannot enter the avatar contest** (square needs ≥400), and `harvest_social_avatars.py` does not take this source.
- For rate limiting and bans see "Rate Limiting Directory Collection on javdb" under "Rate Limiting and Bans of javdb, AVBase and JavBus".

### Name Discovery for Follow Sources

When discovering follow sources by name, the identifier spelling on the site follows the site's interface, not inferred from the handle.

- **Only two places give suggestions as soon as half a name is typed: the local list and rule34.xxx's public autocomplete**, and neither needs credentials.
  - The local one is the whole-site creator list (kemono, pawchive, coomer) that `discover` downloads along the way, sorted by casefold and binary-searched for the prefix range.
    The typing path **does not download the list**, and if it was never downloaded, one group is missing.
  - The site's one goes through `api.rule34.xxx/autocomplete.php?q=`. The same path under the main domain is blocked by Cloudflare as 403, and only the `api.` subdomain returns 200 JSON.
    It returns tags rather than a creator directory, and the UI must state that this group is tags. It returns only ten at a time, and popular prefixes crowd out the full spelling; when credentials exist, direct tag lookup is used instead.
    Only the one identical to the query after erasing separators and folding case is accepted, and others with the same prefix do not count as hits.
- **On rule34.xxx, who is an author can be judged accurately only by the site's classification, and that needs credentials.** Guessing by word form will be wrong (a name containing `artist` may be a coincidence). The classification is at
  `index.php?page=dapi&s=tag&q=index&name=`, and without `user_id`+`api_key` it returns `"Missing authentication"`. Three pitfalls: `json=1` is ignored and only
  XML is returned; `names=` is not recognized and spits out a batch of unrelated tags; `name_pattern=` is a substring match with wildcards on both sides, truncated by id, and `orderby` does not take effect either. So it can only be asked by
  exact name one at a time (about 0.3 seconds each, can be concurrent). A classification is a fact fixed once the site changes it, and once asked it is remembered.
- **gelbooru is not a superset of rule34.xxx and cannot replace or precede it.** The two sites share an origin but each collects its own, and the post counts of same-named tags differ too. gelbooru's
  `index.php?page=autocomplete2&term=` is public and carries `category` itself, but `limit` does not take effect and it always returns 10, so using it to classify rule34.xxx's candidates would
  cover only a few. The candidate list must come from rule34.xxx: Peach creates subscriptions on that site, and giving names it does not have would be misleading.
- **f95zone**'s `latest_data.php` indexes only the five categories of Latest Updates, and an artist's Collection posts are visible only to in-site
  search with a login cookie (without a cookie `/search/` returns 403). Without a cookie it is skipped and the Google external link is kept, and "cannot be found" is not written as
  "not on the site".
  - In-site search matches whole words: `strauz` hits 0, while `strauz*` and the full spelling hit the same posts. So after all spellings come up empty, one more round of `word*` is added; it is added only at four characters
    or more, since three letters plus a wildcard would amount to searching back half the site.
  - The author of a thread title is in the trailing square brackets, by the convention `work name [version or date] [author]`. Look from right to left for the first bracket segment that does not look like a version number, date or
    a site tag such as `Completed`/`Unity`; when two handles are listed side by side (`[LazyProcrastinator/LazyProcrast]`), the first is the display name and the rest are
    alias candidates. Only when there is no usable bracket is the body used, stripping prefix tags such as `[Collection Request]` and container wording such as `Models Collection`
    (`follow_store.f95_author_name`).
  - The author's avatar and identities elsewhere are only in the body link area of the first post, and are visible only after logging in. The poster of the first post is a reposter, not the author, and the XenForo poster's avatar cannot serve as
    the author's avatar. In guest mode all external links in the body are replaced with `/login/`, and some boards are closed entirely to guests.
  - When the profile card has a FANBOX creator id or a pixiv numeric id, the avatar is taken from FANBOX; otherwise from X and Patreon, neither with credentials: the og:image of X's logged-out page falls back per the
    `pbs.twimg.com` size suffix item in "Studio Names and Studio Marks", and Patreon's public `api/campaigns?filter[vanity]=` gives
    `avatar_photo_image_urls.original`. After taking the largest usable tier from each, the actual pixels are compared and the larger is kept. SubscribeStar is **not obtained**.
  - Which hosts count as identity is hard-coded in `follow_sources.profile_link_identity`: anyone can post links in a forum body, and opening up hosts would amount to treating addresses pasted by others
    as the author's.

### Getting Chinese Names from javdb (`harvest_javdb_cn_names.py`)

- **Page structure: `actor-section-name` is the current name, the following `section-meta` is the old stage names, and the last is the film count.** The two must be taken apart:
  the old names on `JULIA`'s page include `京香じゅりあ`, and mixed into one string "this is her Chinese name" cannot be told from "this is a stage name she used before". Parsing is in
  `peach.javdb`, shared with `harvest_directory_links.py`.
- **Two names side by side in the current-name field are not necessarily two spellings of the same name, and may be two stage names.** The current-name field of `美空あやか`'s page is
  `一之瀨亞美莉, 美空あやか`, and treating it as "Chinese spelling + Japanese spelling" would give 美空あやか the Chinese name 一之濑亚美莉. The criterion is that the first
  Han-character string must be found on the opposite side (`same_person`); those that do not match land as `不同名`, and those whose canonical name is not in the current-name field land as `改艺名` to be looked at separately.
- **When comparing names, glyph forms must be folded twice, and opencc alone is not enough.** It handles only Traditional/Simplified, not Japanese shinjitai: `永瀬` cannot be converted to `永濑` and `姫川` cannot be converted to
  `姬川`, and one layer short judges the same person as two. Both layers go through `peach.kanji` + opencc `t2s`, and the spelling stored goes through `simplify_kanji` separately.
- **`?locale=zh-CN` switches only the UI language.** Actress names are data and do not change with it: `愛音麻里亞` is still Traditional under the Simplified UI, and Simplified must be converted ourselves.
- Verdict tiers: `ok`, `同形（站上只有日文名）` (same form, only a Japanese name on the site), `要登录` (needs login), `旧名` (old name), `改艺名` (changed stage name), `未取得` (not obtained), `不同名` (different name). Storing takes the tiers `ok`, `改艺名` and
  `旧名`.
- **The Chinese translations of old stage names exist only on profile pages, and the ledger has none at all.** Scraping sources give Japanese and romanization; the avdb mapping table gives each person only one `zh_cn`, its
  `keyword` comma list is used only for matching and never written into `entity_alias`; and what gets demoted to an alias when the umbrella name changes is the original Japanese canonical name. So `橋本ありな`
  is in the ledger while `桥本有菜` is not, and searching by the latter finds no one.
  - `--aliases` takes, in the same crawl, the Chinese spellings in the field beneath the current name as candidates. That field has no labels on the site, with old stage names and nicknames mixed,
    the parsing layer can neither separate nor filter them, and candidates are recorded only with `origin=别名栏`, whether to recognize the spelling being up to the reviewer.
  - `--scope all` widens the scope to people who already have a Chinese canonical name, who are the batch lacking a second spelling; `--only` names one person by any spelling on the name chain or by
    entity id, not limited by scope, reaching a conclusion in two requests.
  - **When several pages are found, not a single alias candidate is produced (`多页`).** The canonical-name copy records both pages for a person to pick, but aliases cannot: aliases enter identity, and a wrong match
    is harder to trace back than a missing spelling. A spelling colliding with one under another entity's name is recorded as `占用`, which is a question of whether two entities should merge, not decided by collection. Pages
    with no new spelling also keep a row `无新写法`: having looked and found nothing is a different thing from not having reached her yet.
- Storing is another script and another authorization: `apply_alias_candidates.py --candidates <csv> --revision <batch> --apply --backup`.
  - The source is recorded as `javdb-actor-page@<batch>` (`peach.javdb.ALIAS_SOURCE` is this prefix), the same shape as what `localize_performer_names.py` writes,
    `javdb-actor-page@javdb-202609`, and distinguishable from the undoable `user:alias` in the UI.
  - The batch number must be given on the command line: when parsing is misjudged, only a recognizable batch lets that whole run be withdrawn by `source`.
  - Four cases are not written: this entity already has this spelling; the spelling belongs to another entity; the umbrella name in the ledger is no longer the one in the CSV (stale snapshot, should be re-crawled); the entity
    is absent or not a performer.

## Studio Names and Studio Marks

This section covers where a studio's Japanese original name, official site and logo come from, and how to judge that what was found really belongs to this studio.

### Japanese Original Names

A studio's Japanese original name is looked up, not transliterated: going from romanization back to Japanese has no unique answer (`Hon Naka` can be `本中` or `ほんなか`).
So `scripts/localize_studio_names.py` does no transliteration, and instead takes the product codes of that studio's works to hit `www.javbus.com/<CODE>` and reads the `製作商` field.

- For one studio, try to take codes of two different prefixes, and propose a rename only if the two pages agree. The same prefix is necessarily the same company and proves nothing.
- javbus has an age gate, and without `age=verified` it returns only a confirmation page; the product page must go through the proxy, since direct connection times out.
- A 404 on a product page is that page's matter, not that this studio cannot be found. Corroboration is across prefixes, and filling in for a 404 is within the same prefix: `code_groups` is one group per prefix, with at most
  `--depth` (default 3) per group, and the later ones in a group take no part in corroboration and take over only when the previous one cannot be fetched.
- When the codes of all of a studio's prefixes 404, suspect the ledger first: it is often that films with English file names or Korean performers were given a same-prefix JAV studio name by the scraper
  (`Crystal Eizo`/HA), and that studio name never belonged to those films.

The seven verdicts each mean one thing:

- The name is changed only when the source gives kanji or hiragana (`Celeb no Tomo→セレブの友`).
- Pure katakana is just the loanword spelling of an English brand, and the English original in the ledger is kept by default (`ムーディーズ` does not replace `MOODYZ`).
- When the source itself writes Latin too (`V＆R PRODUCE→V＆RPRODUCE`), the difference is only spaces and symbols, and is not removing romanization.
- Western studios with no JAV product codes in the ledger at all, and FC2-PPV, are recorded as "not applicable (not a product code system)", and must not be written as "not obtained" posing as a failed forensic.
- When two codes give different 製作商, it is recorded as "inconsistent" and handed to a person: `K M Produce` yields ケイ・エム・プロデュース and スクープ, which is two companies mixed
  under one ledger name.

Romanizations and free translations transcribed by code sites do not count as English, and rank below the Japanese original; only English names the studio itself uses are kept (the user's examples: `PREMIUM`
uses English, `Celeb no Tomo` uses Japanese). The criterion is the studio's self-designation: where the official site or the official X display name writes katakana and the Latin name is merely its romanization, it is likewise changed back to Japanese
(`Akinori→アキノリ`, `Milu→ミル`, `Das→ダスッ！`); where the official site itself writes Latin it is kept (`BALTAN`, `GENEKI`). So the "pure katakana"
verdict is only a default, and a changed ruling is written directly in the review file's verdict column. Class B of `merge_studio_name_variants.py` uses the same basis: if the Japanese side contains kanji
or hiragana the Japanese side is kept, and for pure katakana the English side is kept.

Rows judged "rename" are landed by `scripts/apply_studio_name_localization.py`: the canonical name, the old spelling demoted to an alias, the flat `asset.studio` and the marks under
`--logo-root` are changed together. Rows where the review file is stale (the current name has changed, the entity has been merged) or the Japanese name collides with another company are only reported, not changed.

### Merging Duplicate Entities

- Duplicate entities are merged in two classes, by spelling and by writing system (`merge_studio_name_variants.py`).
- The comparison key for spelling variants (`AVS collector's` versus `AVS collector’s`) is NFKC plus symbol folding, and **not a single kana may be lost**: a folding that keeps only ASCII
  would fold both `シロウトTV` and `ラグジュTV` to `tv`, and the merge would mix two real studios together, irreversibly.
- The only identity guarantee for a Japanese name versus a romanized name (`ムーディーズ` versus `MOODYZ`) is a shared product code prefix: the prefix belongs to the studio and is evidence verifiable locally.
  Transcription takes no part in judgment. A collision with two or more is always handed to a person.
- A merge also rewrites the flat `asset.studio`, otherwise the next scrape would rebuild the old entity from the projection.
- **After a merge the marks must be reattached.** Marks are stored under names by `logo_key(canonical_name)`, and from the moment of the merge the square mark of the discarded side is claimed by no one,
  and the big slot of the kept side, if left empty, falls back to the filler wordmark.
  `merge_studio_name_variants.py --logo-root` moves them per the review file: whichever variant the kept side lacks is filled in, and not one byte of those already there is touched; `.ct` and
  `.provenance.json` follow the image (without `.ct`, `/logo` cannot answer the Content-Type).

### Finding Official Sites

A studio's official site and social links are registered separately. `find_studio_socials.py --db <ledger> --output <scan table>
--review-output <link review table>` reads only the existing official sites, and checks them together with studios that already have social accounts, deduplicating by account case and listing what is missing.
The review table keeps the source URL, page SHA-256, anchor text and context; after ownership is confirmed, hand it to `install_entity_links.py` to install.
All accounts on an official site cannot be automatically assigned to the studio: the shop customer service, performers and the studio's other sub-labels each have their own ownership. On the S-Cute official site,
`SCute_av` is marked as S-Cute official and `_scute` as the official account of its directly operated successor service nanairo, with the latter's link label keeping nanairo.
Collection recognizes only account homepage anchors; posts, share buttons and script strings do not count. The age gate's text, image alt and whitespace between text all take part in judgment,
and only the affirmative entry on the same site is followed; HTTP failures and cross-domain redirects are recorded as not obtained. Progress is saved after each site completes, `--resume` reuses rows with account evidence,
and empty results and failures are rechecked; collection itself does not write the ledger.

- Search for official sites and X accounts with the Japanese name, not the romanization: in the built-in browser open
  `html.duckduckgo.com/html/?kl=jp-jp&q=<Japanese name> AVメーカー 公式`. Google pops up a bot verification, which is not bypassed; the built-in WebSearch
  returns only US-filtered results, and searching by product code or romanization yields only irrelevant results.
- AV studio official sites generally show an age confirmation page first, and without passing through it you get only an empty shell of about 10 KB. The criterion must be anchor text and not URL: the negative link points
  off-site (the 「いいえ」 of `dasdas.jp` and `muku.tv` both point to dmm.com), while the affirmative link 「はい（入室する）」 points on-site, and the hrefs of the two
  look no different. See `scripts/find_studio_socials.py` for the implementation, and `test_age_gate_is_crossed_by_the_affirmative_link_only` guards this line.

`scripts/harvest_studio_sites.py` guesses domains from studio names to find official sites. Every rejection criterion must be able to name a counterexample, and also guard against hurting real sites:

- Block parked pages (`kawaii.com - domain for sale`: the keyword is far down the body but written in the title).
- Block pages that declare themselves unavailable (returning 200 with all the adult words in the body, but only `Site Unavailable` as the title). The alternative path "domain derived from the studio name + is an adult site" would
  confirm them as official sites, so `BROKEN_TITLE` must block after the parked-page criterion.
- Block generic sites whose title merely echoes the domain (the title of `prestige.com` is `prestige.com`, while the real site is `prestige-av.com`). The criterion is "the title prints the domain as is,
  and says nothing besides the domain"; the normalised title cannot be compared with the normalised host, otherwise real sites like `NATURAL HIGH（ナチュラルハイ）`
  would inevitably be judged as echoes.
- Before judging "no official site", first tell whether it is the site's answer or network jitter. `probe` retries only transport-layer exceptions by the convention of `page_cache.Site`
  (`retries=2, backoff=2.0`), and an HTTP status code is the site's answer and is not retried. For rows with `未取得`, the verdict of each attempt is stitched in order into an evidence chain and written into `note`.
- Studios whose names have no Latin letters (`一本道`, `カリビアンコム`…) take part in comparison by their kanji and kana themselves: `normalise` keeps kanji, hiragana, katakana and the
  long vowel mark `ー`; `・` (U+30FB) is a separator, stripped like full-width parentheses and `【】`. The domains of such studios cannot be derived, and `--seeds` is the only entry.
- `entity_alias` also takes part in the check "the page declares the studio name": the canonical name of `东京热` is Simplified, the page writes 「東京熱」, and the ledger has long had this alias. Comparing by alias does not
  loosen the criterion. The verdict is written "matched the alias 『X』", not "the page writes 『X』", because after normalise it is no longer the page's original text.
- Adult-context words include the 「アダルト動画」 and 「無修正」 that uncensored sites write. Non-adult sites with the same name (Hunter Engineering, Bazooka, Madonna) do not show these two words.
- **Information not on the page can only be confirmed manually.** `SOD Create`'s official site is the parent company's site `www.sod.co.jp`, and this string does not appear anywhere on the site; relaxing the generic criterion to catch it
  would let `hunter.com`, `bazooka.com` and `madonna.com` in as well. So it goes through `studio_sites.CONFIRMED_SITES`: one row per studio, stating the address,
  the date of manual confirmation and the reason. It replaces only the last gate "the page must declare the studio name", while the four gates of status code, empty shell, parked/self-declared unavailable and domain echo still must pass; confirmed
  addresses rank ahead of all derived candidates.
- A studio the ledger records in romanization but the site uses only in the Japanese original does not go into `CONFIRMED_SITES`: that is the ledger name being wrong, and once changed to the Japanese name the page's self-declaration matches (`えむっ娘ラボ`).
  The whitelist keeps only information that is not on the page, such as "which company the studio belongs to"; where there are aliases, go through `aliases`.
- A studio with few works also appears in the big slot on the studio page. `--min-assets` is only the threshold of a full scan; targeted fills go through `--only <canonical_name>...`, which ignores
  work counts when a name is given, and fails outright when the name does not match, never skipping silently.

### Social Account Avatars as Logos

The source of an AV studio logo is the studio's own social account avatar: a social avatar is naturally square, and published by the brand itself.

1. Forensic order: handle → `unavatar.io` resolves the platform CDN's real address → download from the CDN → measure. unavatar is used only to resolve the address, and provenance
   records both (`scripts/fetch_studio_avatar_candidates.py`).
2. Candidates use a content-addressed cache, SHA-256, same-studio perceptual hash and a cross-studio exact-duplicate gate. The same image scaled or re-encoded is recorded as unchanged, and only a real visual change upstream
   re-enters `/review`. No handle, no image, unchanged and duplicate are written only into the health report and do not use the manual queue.

- Resolvable does not mean it is the right brand: `@bazooka` does exist and a 400×400 avatar can be fetched, but that is a generic account registered in 2007, not this AV studio.
  So the handle must be confirmed by forensics one by one, and the script does not guess by default; the output of `--guess-handles` is always marked `needs_confirmation`, not adopted automatically, and when it cannot be found
  it is left empty.
- The r18.dev detail JSON has only `maker.name`/`label.name` and the work cover, and no logo resource.
- **The size suffix of `pbs.twimg.com` is not evidence that "it is this big".** The one without a suffix is the uploaded original (the largest tier); an address with a suffix, when the original is smaller,
  still returns the original: for `セレブの友` both `_400x400` and no suffix are 242×242, while what unavatar gave is `_200x200` (8068 B versus 12302 B).
  So it always starts from the original without suffix and steps down by the tiers of `peach.social_links.twimg_tiers` (some old avatars have only a thumbnail left), `resolved_url` records the tier actually
  obtained, and fetching counts as failed only when all tiers are missing. Studio logos (`fetch_studio_avatar_candidates.py`) and performer social avatars
  (`harvest_social_avatars.py`) share this criterion.

### Directory Sources

The studio directories of release platforms and publishers themselves are the breadth source for official wordmarks. Entries are registered in `harvest_maker_directories.DIRECTORIES`.
**Store the directory entry, not the image address**: image addresses often carry timestamps, and when a studio changes its mark the address changes, so what a rerun fetches is the current one.

| Directory | Entry and spec | Notes |
| --- | --- | --- |
| MGStage | `/ppv/makers.php` paged by the 50-sound kana order, uniformly 180×54 | The whole site has an age gate, and without `adc=1` it returns only the confirmation page; the `osusume` recommendation slot overlaps entirely with the syllable pages, deduped by slug; the 50-sound nav bar is also gif, excluded by filename; `【独占】` (exclusive) is a sales status and not a studio name |
| Prestige | `/api/maker` returns all studio JSON at once, `codeName` is the romaji slug, and the image is the white-background wordmark `/api/media/maker/banner-<slug>.jpg` | `/maker` and `/maker/<slug>` are both client-rendered empty shells with identical titles, so go through the API and don't fetch pages |
| KMP | `/label` lists everything on one page, the name is on `alt` | Mostly SVG, so don't filter by suffix; studio images are at `/img2018/label/<slug>/` or `/file/label_<timestamp>.<suffix>`, and KMP's own mark in the site header/footer goes through `/wp-content/themes/`, told apart by path |
| FANZA | `www.dmm.co.jp/mono/dvd/-/maker/=/keyword=<sound>/` paged by the 50-sound order | `age_check_done=1` is needed to pass the age gate, **and it must go through the proxy**: a direct connection returns 「お住まいの地域からご利用になれません」 while the status code is 200, and judging only by status code treats it as a normal page. It gives only the Japanese name plus `article=maker/id=<N>`, **has no studio mark image**, and is a name source and not a mark source; `digital/videoa/-/maker/` doesn't even get past the age gate |
| 妄想族 | `mousouzoku-av.com/maker/list/<50-sound>/`, uniformly `contents/maker/id<N>/logo_l.jpg`, 200×200 | An official-grade square mark that meets the `LOGO_SOURCES` threshold directly with no need to bake a square; the `wa` page returns 500; the directory writes `studio/distribution group` (`Asia/妄想族`), matched to the ledger by the left half of the slash; mostly doujin/independent studios with little overlap with the ledger, so the value is in square-mark quality and not coverage |
| javtiful | `/channels` and `/actresses` listed in pages | An aggregator; its images cannot serve as marks: channel cards are site-generated font images, and performer cards show stills. After switching to the `/ja/` prefix the **performer names** are given in Japanese (`hatano-yui` → `波多野結衣`), usable as a romaji↔Japanese pairing source; studio names don't switch with language |

- The directory gives Japanese names and the ledger records romanization; the bridge is the slug in the filename. `harvest_maker_directories.py` matches four ways: slug-normalized equal, Japanese names equal, romanization
  matching an alias, and a unique prefix candidate (when the slug is an abbreviation, like `waap` for `Waap Entertainment`).
- **Normalizing to an empty string must be treated as incomparable.** Pure Japanese names folded of non-ASCII are all empty strings, and if not excluded the whole directory would all match one company. The prefix candidate is weaker than the first three, and the criterion must
  be written into the review sheet: the `kira*kira` that `きらきらワイフ` collided with is a different real studio.
- **Directory entries that don't match the ledger are mostly studios the ledger doesn't have, not a missing Japanese alias.** Relaxing to substring plus edit distance and recomputing only turns up false pairings. MGStage is an amateur/planning
  platform, and the unmatched are mostly FANZA-line studios (MOODYZ, S1 and so on), needing a separate entry. What studios without marks lack is an official-site link; the to-do is item 5 of "existing skeleton" in the
  [public roadmap](https://github.com/orgs/peach-mitao/projects/7).

**Expo directory jae.tokyo** (a manually designated source, the exhibiting-studio directory of Japan Adult Expo): the three editions each carry a set of logos submitted by the makers themselves, with a different page structure each edition.

- 2014: in `exhibitor/`, `<li><a><h2>name</h2>` plus `images/logo/*.jpg` (270×180, `alt` unreliable).
- 2015: in `maker.html`, the `makerLogo`/`makerRightTitle`/`makerLinkBtn` of the `offMaker` overlay (188×188).
- 2017: the `alt` in `maker.html` plus the `name_area` of the detail page `makaer/NNN.html` and the `class="pop"` official-site link (320×320).
- The 2016 edition has only images and no names in the HTML, and is not taken.
- Names that don't match but are the same company are matched by the studio's self-designation (in the directory `SODクリエイト` is written as `ソフト・オン・デマンド株式会社`). When the same company appears in several editions, the edition with the most pixels
  is taken, and only after viewing each one and recognizing which company it is is it written into `LOGO_SOURCES`.
- The official-site links on detail pages are judged for kind one by one:
  - Catalog sites and distribution platforms are not official sites: the four hosts `mgstage.com`, `indies-av.co.jp`, `dmm.co.jp` and `fanza.com`, and work lists filtered by maker whose path carries `/works/list/`,
    all go into `catalog`.
  - A studio page within the parent company's site (`km-produce.com/l_06_bazooka.php`) counts as official, being this studio's only storefront online.
  - In-site search strings (`?s=OREA`), distribution-site filter lists (`ppv_advanced.php?`), merchandise lists (`goods_list.php?`) and distribution-platform home pages are not installed.
  - The UNIQUE on `entity_link` judges by URL literal, and `http://www.x.com/` and `https://x.com/` would sit side by side as two rows, so dedup by host.
  - Probe liveness one by one before installing; a portion of the addresses from older editions no longer exist.

### Pinned Mark Source Tables

Pinned mark sources are split into three tables by **shape**, not by image quality. All three consumption slots (the prime slot on the profile card `[data-entity-portrait]`, `.idface`, and the filter chip) are `object-fit:cover` boxes,
and a wide flat wordmark installed as is leaves only the few letters in the middle.

| Table | What goes in | Threshold |
| --- | --- | --- |
| `LOGO_SOURCES` | Square marks installed directly into the prime slot | `MIN_LOGO_SHORT_EDGE=96`, below which it is a thumbnail |
| `WORDMARK_SOURCES` | Wide flat wordmarks, baked into a square by `images.bake_square` and then shared by both slots | 32, the same as the icon slot |
| `ICON_SOURCES` | Governs only the small slot; the prime slot is unchanged | — |

- The problem with a wide flat wordmark is not that it is small but that it shouldn't take the direct-install path, so the 96 gate is not used to hold it back.
- **The two slots may want two side-by-side blocks within the same image.** For example, a landscape image with a square mark on the left and a horizontal wordmark on the right: `refit_plate` crops the square mark by content for the filter chip,
  while the horizontal strip wordmark belongs in the 160 px prime slot. One table cannot express this division of labor, hence `ICON_SOURCES`.
- **Don't pick by pixel count.** A larger colored-background carousel image, once baked square, gets two big blocks of background color added, and a smaller white-background plain wordmark is actually more right. Bake them all and look before choosing.
- **Replacing an already installed image must be able to be collected into the target set.** `harvest_targets` collects by "is there an `<safe>.img`", and changing an address in the pinned table cannot be collected by that alone.
  `restated_sources` compares the provenance sidecar (`source_url`) from install time against what the table now says, and collects only on mismatch; after installing they agree, and it drops out by itself next round.
  The "only accept larger" guard at write time is not applied to pinned sources (`PINNED_KINDS`): the addresses in the pinned tables were written in after a person looked at each image, and swapping in a smaller one is also the desired result.

### FC2 Marks

- FC2-PPV "only has a small icon" because the site truly has nothing else. The several FC2 hosts all declare the same 16×16 `static.fc2.com/share/image/favicon.ico`; the larger
  assets are all horizontal wordmarks, belonging to the `logo` slot; the only one both square and large, `id.fc2.com/apple-touch-icon.png` (114×114), is a lockup with text that blurs into
  a smear at 28px, and sits on the FC2 ID host rather than the PPV marketplace's host.
- So each of the two slots uses a hand-designated non-official source:
  - `icon` slot: `storage.googleapis.com/datanyze-data//technologies/8ef39cbce34aece41d279b6e8e7dbb77aea3086e.png` (400×400,
    a pure red unicorn with no text), written under `fc2.com` in `site_icons.HOST_OVERRIDES`. The content-type the server returns is
    `application/octet-stream`, which is unlocked by PIL's sniffing in `link_marks.decode`; deciding whether to decode by content-type would drop this one entirely,
    and `test_an_octet_stream_png_is_still_a_png` guards this line.
  - `logo` slot: `images.seeklogo.com/logo-png/42/1/fc2-logo-png_seeklogo-429409.png` (600×600, unicorn + "FC2" text), written in
    `studio_icons.LOGO_SOURCES` and not `HOST_OVERRIDES`: that table governs exceptions to "discover icons by host", while this one governs "where this studio's big wordmark is".
- Looked at and not used: the App Store's 「FC2動画」 icon (the background has an added film pattern), another same-named company on Wikimedia, defunct icon libraries, brand libraries requiring credentials,
  favicon services that return only 16×16, and store icons with mascots or corner badges.

## Site Round Icons and Icon Compositing

This section covers how the small round icons beside external links and studio marks are discovered, filtered and baked into square images, and how the page decides whether an image exists.

### Discovery Order

The round icon of an external link takes the one the site itself declares, not the first one guessed at the root.

1. The home page's `<link rel=icon|apple-touch-icon|mask-icon>` and `msapplication-TileImage`.
2. `icons[]` in the web app manifest.
3. The old conventional locations (`/apple-touch-icon.png`, `/favicon.ico`).

Ordering is "host override table → vector → bitmap by size → root-path guess → mask-icon". Each of the ordering rules has a counterexample:

- Vector must outrank any bitmap regardless of `rel`: threads declares a finished icon with a 512 viewBox as `rel="icon"`.
- Declared must outrank the root-path guess: T-POWERS's root `/apple-touch-icon.png` is a horizontal lockup with text, and the one declared in `<link>` is the
  compact mark; both are 180, and on a tie the wordmark would rank first because its path is shorter.
- `rel="mask-icon"` is by spec a pure black silhouette, and used as a finished icon it yields an all-black square, so it always ranks last, and when its turn comes it goes through the glyph channel.

Other rules:

- The discovery flow reads only declarations and does not dig through the body for images. Where a pinned source is truly needed (av-event's mascot appears only in the body of the age-confirmation page, and FANZA's assets are hosted on
  p-smith.com), it goes through `site_icons.HOST_OVERRIDES`, and every added row must state why the discovery flow is insufficient, otherwise that table will grow into a hand-written
  favicon list nobody updates. The keys of `HOST_OVERRIDES` support "host + path prefix", taking the longest match.
- One discovery actually downloads at most `MAX_FETCH` candidates: it uses up one only when the fetched one fails to qualify, and a 404 doesn't count.

### Gate and Two Channels

- **The criterion is the content bounding box, not the canvas.** A wide flat wordmark in a square canvas, squeezed into a 32 px circle, is a blurred horizontal bar; a smaller image with only a single letter is actually clear.
  So after ordering there is also a content-ratio gate (`link_marks.MAX_CONTENT_ASPECT`): wide flat wordmarks don't take part in the small-icon contest; they belong to the studio page's big logo slot (`/logo`).
- After the gate there are two channels: a finished square icon is let through as is, with the circle cropped by CSS `[data-link-icon]`; only transparent single-color glyphs get "brand-color circular base + white subject".
- Passing the gate doesn't mean suitable, and a wordmark with a content ratio close to the limit is still unrecognizable. So `studio-icons-<date>.csv` carries a `content_aspect` column, and rows close to the limit need
  a person to look at the 3x3 grid before deciding.
- Studio small marks borrow the content-ratio gate of `link_marks`, not its size floor. `MIN_DESIGNED_SIZE=96` is set for the 128 px round icon of `/link-mark`, and the favicons of JAV studio sites
  are generally only 32 or 64; applying it would knock out HEYZO, MOODYZ, Prestige and a whole batch and wrongly record them as "still a wordmark". So
  `scripts/harvest_studio_icons.py` sets its own size floor `MIN_SHORT_EDGE=32` (the slot to fill is only 28 to 32 px), pixels are not upscaled, and `MIN_DESIGNED_SIZE`
  is not touched for it.

### Studio Mark: Separate icon and logo Copies

- Studio marks are split into icon/logo copies by slot, but fork only when there really are two copies: `<safe>.icon.img` and `<safe>.logo.img` both fall back to `<safe>.img`.
  The vast majority of studios get the same image in both slots.
- The on-disk suffix says nothing about sharpness: for some studios the `icon` is only a few dozen pixels while the bare file is several hundred. For the page conventions on the image slot and the `variant` parameter see [docs/FRONTEND.md](FRONTEND.md).

### Source Order (`studio_icons.icon_row`)

Source order picks the best by resolution and is not rigidly ranked by how official a source is (the studio page's prime slot is a square image, and an avatar sharp enough can serve as the icon).

1. Icon declared by the official site → `<img>` in the home page header → a hand-designated social avatar → the avatar of the X account linked on the page.
2. Stop once the short edge reaches `GOOD_ENOUGH_SHORT_EDGE=360`: the company cell is at most 180 CSS px wide, and beyond 360 real pixels on a 2x screen there is no difference on the page, and every
   additional source asked means knocking on another's door one more time.
3. If the line isn't reached, ask the remaining sources through and take the largest by short edge; but it must be `BETTER_BY=1.5` times larger to displace an earlier-ranked one: a small size difference makes no visible difference,
   while sources do differ in how official they are; a declared 16×16 against a 400×400 X avatar is the kind of gap worth switching for.

- **Bigger must not beat the shape; each of the two slots picks for itself.** A displacer must also be no wider than the displaced one by `ASPECT_SLACK=1.1` times: a landscape image of icon plus text is bigger than a plain icon, but in a
  28 px small slot only unrecognizable letters remain. That image is precisely the complete mark the prime slot wants, and `hunt_logo_row` picks the largest one separately from this run's haul, with the verdict
  `这一趟取到的最大一枚` (the largest one obtained this run).
- **A company with no official site at all uses the social avatar.** `FALLBACK_LINK_KIND="social"` is used only when the company has no official/catalog link, taking the account avatar directly without asking
  declared icons and the header. Those with an official site never take this path: the vast majority of social media in the ledger hangs on performers, and mixing it in would turn it into the operator's selfie. twimg avatar addresses carry no signature.
- **Shared-host guard.** Host-level discovery represents only the host and cannot represent a channel under a path on the same host: the official links of three studios under `bangbros.com/websites/` would
  collapse into the same host and fetch the site template's generic favicon. So when a link carries a non-root path,
  `studio_icons.py` attaches a guard to `site_icons.best_mark(accept=...)`: candidates in `site_icons.HOST_SCOPE` don't count, with the verdict `平台通用图标` (platform generic icon), and the evidence states
  the host, which copy and the sha256. `/link-mark` is by host anyway (`cache_key` is also by host) and is not bound by this.
- **Reachability probing must withstand TLS jitter.** `install_entity_links.resolves` retries transport-layer exceptions three times, and a status code settles it in one go. `site_logos.logo_images`
  drops `data:` lazy-load placeholder images, which wear the mark's class and can't be opened when fetching bytes.
- **Instagram avatars**: `--avatars` reads the local `peach-data/state/agency-avatars.json`, which is manual address input and not a general parser; address discovery and
  byte download are verified separately, and for the image-fetching boundary see [Sourcing](SOURCING.md) and [ADR-0024](adr/0024-mark-manifest-not-bundled-bytes.md).
- **Wordmark padding**: when not a single square mark has been made but a wide flat wordmark with short edge ≥ `MIN_SHORT_EDGE` has been fetched, it is baked into a square with `peach.images.bake_square` and installed, with the verdict
  `字标补白` (wordmark padded) and `content_aspect` recorded as usual. The same square image yields another `logo` row (verdict `ok`) installed into `<safe>.logo.img`, otherwise the prime slot would fall back to `<safe>.img`
  (the top of the BangBus page would then show the parent brand BANGBROS). A manually pinned logo source takes priority when produced; the first copy is kept rather than the largest, because the traversal order of `best_mark`
  is already "override table → declared → root-path guess". The wordmarks of BangBus and BangBros18 are taken from the `*_LOGO` assets that `bangbros.com/websites` server-renders into the HTML
  (note the `/` escaping); MonstersOfCock has no corresponding asset and is recorded as **not obtained**, continuing to use the existing `MonstersOfCock.img` without speculative replacement.
- **A pinned logo source is itself the reason for entry, and the small slot is baked from the big slot's image.** `harvest_targets()` collects three kinds: those that were padded, those with links but no image, and those with a pinned logo source
  but no image; the third is for studios with not even one official/catalog link (mostly the jae.tokyo directory batch). When the small slot wasn't made but the big slot's
  pinned source was, `icon_from_logo()` installs the same image, passed through `bake_square`, into the `icon` slot. Whether "padded or not" is judged by the source image aspect ratio and `images.MAX_ASPECT`, not the content ratio: a fully
  opaque jpg's `content_aspect` is always 0. The `studio` column of the review sheet is taken from `LOGO_SOURCE_NAMES`.
- **An installed square mark that is too small is asked once more.** `studio_icons.py` also collects studios whose small slot has a short edge under 64 real pixels into the targets (`INSTALLED_SHORT_EDGE`,
  `small_installed_marks`), measuring the one the small slot would really fetch (`<safe>.icon.img` first, and `<safe>.img` only if absent). Writing is further guarded by
  `_shorter_than_installed`, which can only swap in a larger one, and if none can be found the verdict is left on the review sheet.

### Verdicts

Each tier of verdict corresponds to a different next step:

| Verdict | Meaning and next step |
| --- | --- |
| `ok` | Installable |
| `字标补白` (wordmark padded) | Installable, see above |
| `只有小图标` (only a small icon) | FC2 has only 16×16 across the site; go find a larger asset |
| `平台通用图标` (platform generic icon) | See "Shared-host guard" |
| `仍是字标` (still a wordmark) | No qualifying square mark |
| `未取得` (not obtained) | Not a single byte was fetched back; this can be judged only because `Fetcher` counts for itself how many copies came back |
| `无官网链接` (no official-site link) | Add a link first |

Only the first two tiers are written to disk by `--install`. `best_mark` returns only the result and not the reason, so the reason for falling back is recorded in place by `SquareMark`, otherwise the review sheet would be left with just an empty verdict.

### Baking into an Opaque Square Image

**Logo files are always opaque square images**, with margin and background color baked into the file, and the page no longer patches things up itself. The only entry point for bitmaps is `peach.images.bake_square`,
and `classify_plate` gives the judgment on which it branches:

- `mark` (has transparent pixels, such as a transparent-background wordmark): crop off the transparent edge by the alpha bounding box, center it on an opaque square base, with the content occupying
  `PLATE_CONTENT_RATIO` of the side (0.76, about 12% margin on each side), pixels not scaled, output an opaque PNG.
- `tile` (fully opaque, such as a black-background or red-background square): the background color is part of the design. Near-square images return the original bytes, and elongated ones are padded to square with the dominant edge color (`pad_to_square`),
  not painted white.

The product of both paths goes through `refit_plate` again. A small chip fills the entire canvas and not just the content: a favicon's own large margin makes the mark too small to recognize, and a solid square mark running to the edge would have its four corners fall outside the circle. `refit_plate` does three things in order:

1. Content width below `PLATE_MIN_SPAN` (0.6): crop to the content box, leaving 12% on each side.
2. Proportion of content falling outside the inscribed circle exceeds `PLATE_CIRCLE_LOSS` (0.025): pad the canvas to the content's circumscribed circle.
3. Product under `PLATE_MIN_SIDE` (64, the real pixels of 32 CSS px on a 2x screen): pad to that number with its own background color. What is judged is the product and not the original, because
   many images fall short only after the margin is cropped. The padding cap is held at `PLATE_MIN_SPAN`; pushing further out would become the large margin that rule 1 crops, and the two rules would tug back and forth.

- Pixels are never scaled: the cropped one is smaller but sharper, and the padded one is bigger with sharpness unchanged. The several breakpoints were set after viewing actual icons one by one.
- The content box is counted by rows and columns, and rows and columns with a scattering of pixels don't count as content: faint specks left by lossy compression in solid-color areas would stretch a per-pixel bounding box over the whole canvas.
- The write side has only two paths, with one and the same rule: `install()` of `studio_icons.py` bakes before writing to disk; `normalize_studio_logos.py` retroactively processes installed files (all
  `*.img` under the directory, including `.icon.img`/`.logo.img`, and writing requires `--apply`). Both are idempotent. Photos such as performer avatars do not take this path.
- **Vector**: `install()` accepts only bitmaps, and vector is handled as "refuse to install". SVGs in the directory go through `peach.images.bake_square_vector` in `normalize_studio_logos.py`: the same 76% margin, the square base is given by an outer SVG,
  the original document is stuffed whole into a nested `<svg>` without rewriting a single node, and the content box is taken directly from `viewBox`. The outer root element keeps `data-peach-plate="1"` so a rerun skips it, otherwise it would nest more and more. Empty shells with none of `viewBox`, `width`/`height` can't
  yield a ratio and are still recorded as `vector`, leaving the original file.
- **The background color is judged by content lightness, one rule for bitmap and vector** (`images._plate_color`; for vector, a 256 px probe is rasterized first to count pixels). Only when the opaque coverage within the content box
  is below `PLATE_SOLID_COVER` (0.9) is a background judged, and when the visible proportion on white falls below `PLATE_VISIBLE_RATIO` (0.7) it is paired with a dark base `#111111`: white strokes on a white base
  would erase half the mark. Those that bring their own full-bleed base (white cards, camo blocks) have boundaries they drew themselves and are not paired with a dark base.
- **Normalization starts from the original.** When an installed file has a backup of the original recorded and the backup is still on this machine, `normalize_studio_logos.py` uses the backup as input: the transparency destroyed by baking a base and a
  wrongly paired background color cannot be recovered from the product. The sidecar keeps pointing at the original and is not repointed to this round's normalized product.
- The sidecar's `action` is a stable identifier recognizing provenance: `bake-white-plate`, `pad-to-square`, `refit-plate`, `plate-vector`. `studio_icons.padded_studios`
  recognizes "the source image is a strip wordmark" by `pad-to-square`, so the three bitmap paths are recorded separately. The provenance of each installed bitmap is recorded in `*.img.normalization.json`.
- **On-disk filenames keep kana and kanji.** `previews.logo_key` normalizes by `\w`, punctuation becomes underscores, with a length cap of 60. If only `[A-Za-z0-9_-]` were kept,
  both `プレステージ` and `ムーディーズ` would become `______`, and the one installed later would silently overwrite the earlier.

### Inverted Round Icons

The jaggedness of inverted round icons has three causes, and missing any one layer leaves them rough:

- The mask is binarized with `alpha >= 128`, which chops off in one stroke the anti-aliasing mid-values the source image brings.
- The binary image is generated at the source resolution of 48×48 and then stretched to 64, magnifying the steps along with it.
- The glyph is not `composite`d with the circle, so white pixels spill outside the circle and bite notches into the circle's edge.

So alpha is used directly as a continuous mask, the whole composite is done on an 8x supersampled canvas and then downscaled once with LANCZOS, with a 128 px result (container 32 px CSS, and a 3x screen needs
96 px). Whenever the fetching rule or the compositing method is changed, `link_marks.RENDER_VERSION` must be bumped at the same time: the cache's validity is 30 days, and without changing the key, after the code changes the user still sees the old one.

### Page Image Slots and "Emit `<img>` Only When an Image Exists"

This subsection is a Web contract, placed here because it is bound to the on-disk rules for marks and avatars.

- **The three image slots all fill uniformly.** The `img` of the brand chip `.brandpill .mk`, the identity cell `.idface`, and the studio page's 160 px prime slot `[data-entity-portrait]` are always
  `object-fit: cover`, with no inset or padding and no change to contain: the margin is already baked into the file. The placeholder background and initial show only when no image can be fetched.
  "Native size + blurred backfill" (`data-fit-native`) is applied only to the latter two prime slots; chips are not laid out that way, otherwise the mark would be half as large, and images with their own white card would also show square corners.
- **The page emits `<img>` only when the server says there is an image.** Emitting images unconditionally when missing would earn a string of 404s without cache headers, and every redraw would fire another round.
  - Studio marks: judged by `WebContract.has_logo()`, delivered with the data as `has_logo` (`/api/tops`, `/api/entity`) and `has_studio_logo` (in `/api/item`
    a non-canonical studio has only the flat `studio` field, a separate flag). The index is a single `os.scandir` in `logo_index()`, with a TTL of 90 seconds, visible immediately after review approval calls
    `cache_bust()`.
  - Person images and avatars: judged by `has_entity_image()`/`has_avatar()`, delivered as `has_image` and `has_avatar`. Endpoints attach the flags with `entity_ref()` of `web_catalog`
    and `attach_avatar_availability()` (batched, no row-by-row N+1). The page assembles these two addresses in only one place, `entityFaceImg()` in `frontend/src/card-art/markup.ts`,
    shared by each image slot through `avatarInner()`; an absent `has_image` is treated as "no image", otherwise an endpoint that forgot to attach the flag would quietly fall back to unconditional emission.
  - Person images are delivered together with `has_image` carrying `image_version` (`entity_image_version()`, the hex nanoseconds of the entity image's modification time), which `entityFaceImg()`
    assembles into `&v=`. Replacing an avatar overwrites the same file in place, and when the address carries no version the browser reuses the old in-memory image within the same page, and a refresh is needed to see the new one.
  - Covers and marks are the same: `cover_version`/`logo_version` (the modification times taken when `cover_index()` and `logo_index()` scan the directory) are delivered with cards, details and
    studio references, and carried as `&v=` when assembling `/cover` and `/logo`. When the base image for picking an avatar is a cover, `/api/avatar-choices` also gives a `version`, which image fetching carries,
    passes back when handing in the box, and the server rejects on mismatch, so the box isn't measured on the old cover and cropped on the new one.
  - There is only one rule for on-disk filenames: marks go through `previews.logo_key` and person images through `previews.entity_image_key` (kind is part of the name; recognized kinds are in
    `previews.ENTITY_IMAGE_KINDS`; `.ct`, `.provenance.json` and `.face.json` are sidecars and don't count as images).
  - Avatars are generated on demand, so `has_avatar` = a cropped `<id>.jpg` **or** the contact sheet is still on disk (`has_snapshot`); a mid-generation `<id>.<cell>.tmp.jpg`
    doesn't count. Generation itself can still fail (no ffmpeg, all six cells black), and the image-removal handling of `data-drop="self"` must be kept.
  - The kind of the face on a review card has one copy each in `web_review.ENTITY_REVIEW_KINDS` and the page's `ENTITY_REVIEW_CATEGORIES`, and they must be identical character by character.
  - Gates: `LogoAvailabilityTests` in `tests/test_studio_icon_variants.py`, `EntityImageAvailabilityTests`/`AvatarAvailabilityTests` in `tests/test_previews.py` (availability and image fetching must give the same answer),
    the endpoint flag tests in `tests/test_rm_web.py` and `tests/test_web_review.py`, and `tests/test_web_ui.py`.

## Code Discovery Sources (Feed)

The Feed answers only one question: **which codes were released recently**. It downloads nothing and touches no media files; the product is a code plus a clickable work-page address, and scraping still goes through the existing
source chain. The evidence-gathering scripts and raw results are in `<private verification record>` outside the repo.

The criterion is not "does this source have RSS" but "is the string in the entry really a code". Before a source is wired in, one must first look at what its codes look like,
and cannot look only at parse success rate (see DUGA below for a counterexample).

### Two Usable Kinds

- **Native RSS: sukebei.nyaa.si** (`https://sukebei.nyaa.si/?page=rss&c=2_2&f=0`).
  - RSS 2.0, 75 entries per page. `guid` is the entry permalink (`https://sukebei.nyaa.si/view/<id>`), and `pubDate` is the real RFC 822 time with timezone,
    **naturally satisfying the entry-identity layer of the two-layer dedup**.
  - **It gives neither `ETag` nor `Last-Modified`**, so the 304 layer does not take effect for it, and dedup can rely only on entry identity.
  - Titles look like `HMN-071 新人 …[有碼高清中文字幕]`, with the code at the very front. Handing the whole string to `catalog_rules.release_code_from_text` recognizes almost nothing;
    first splitting into tokens by whitespace and brackets and trying each recognizes about two thirds. **This is the direct reason the Feed must do its own token scan**, and the "whole text → code"
    path cannot be copied wholesale. Most of those not recognized are uncensored codes, amateur titles and compilations, not parsing defects.
  - `c=2_2` is the category and `f=0` is no filter; changing the category or adding a `q=` keyword is a different subscription with the same shape.
- **Pseudo-Feed: JavDB performer pages** (`https://javdb.com/actors/<javdb_id>`).
  - 40 works per page. Each is `<a href="/v/<id>" class="box" title="…">` plus `<div class="video-title"><strong>code</strong>…</div>`
    plus `<div class="meta">release date</div>`: `/v/<id>` serves as entry identity and the `<strong>` holds the clean code. Nearly every entry yields a code, and those that don't are where the code field
    itself is empty.
  - **It sorts by release date, so "works not yet released" appear first.** The release date of an empty shell may be later than today, and this is not dirty data.
  - The ledger already has the `javdb` id in `entity_external_ref` (`entry_links.provider_ids`), so the subscription need not make users copy addresses by hand.
  - The subscription is toggled from the person page, and can also be subscribed by performer name in the "Subscription sources" tab of follow management: the server takes performer cards from the JavDB performer search, the user picks on a card,
    the page sends only the performer id, and the server assembles the address; if the ledger lacks this person a new `performer` entity is created (ADR-0083).
  - Rate limiting follows in-library collection: 3-second host interval, a 403 stops the whole source, the cooldown criteria are in `scraping_access`, see "Rate Limits and Bans on javdb, AVBase and JavBus".
    Don't start a separate set merely because the Feed is a background task.
  - **A page obtained with `?sort_type=4` yields not a single work**, while the parameterless request in the same round is still a complete page. So the performer-page pseudo-Feed always uses the address without a query string.
  - The title bar `<span class="actor-section-name">` is the names this page is hung under, often several spellings joined by commas (`涼森玲夢, 涼森れむ`);
    another `section-meta` reads 「N 部影片」 (N films). A performer often has two pages,
    and the old-stage-name page may be empty for years (`/actors/MmbDR` 白石アイリ, measured 2026-09-28 as 「0 部影片」 and 「暂无内容」). Only a page that reports 0 itself counts as a quiet source;
    a count other than 0 with not one entry parseable is still reported as a fetch failure.

### Verified Unusable

The feed addresses of FANZA/DMM, MGStage, the 1Pondo family, Tokyo-Hot, AVBase, javtrailers and OneJAV return 404 or 500, and their home pages declare no feed (the 1Pondo family's
`movie_details` is still usable but has no new-release list path); FANZA 302s to the age-confirmation page, and JavBus 302s to the human-verification page; RSSHub public instances and javlibrary return
403 (Cloudflare, not bypassed); 色花堂 returns HTML. Per-site addresses and raw results are in the evidence directory mentioned above.

**DUGA is the counterexample**: `https://duga.jp/news.xml` is the only RSS properly declared by the home page's `<link rel="alternate">`, with a complete `pubDate`, and looks fully usable.
But entry titles carry not a single code, the code can be taken only from the link, and the one in the link is DUGA's in-site product number (`ppv/doc-2376`). It looks exactly like a studio code,
and `release_code_from_text` would accept it as is, producing **fake codes that exist on no scraping source**, such as `DOC-2376`.

## Caching and Retries

This section covers the whole-page cache and retry rules shared by all collection scripts, and where fixtures for parsing tests come from.

- Whole-page HTML caching and rate limiting go through `peach.page_cache.Site` (stored on disk named by URL sha1, with `cookies` used to pass age gates). It lives in `src/peach/` and not in some
  collection script, because both the directory-link collection and the studio-name lookup scripts use it. When a collection script's criterion changes by one line it must be rerun; with the cache in hand a rerun can work from offline data and doesn't hit external sites again.
- Backoff retry is also at this layer: fetching javdatabase through the proxy hits a TLS `UNEXPECTED_EOF` about once in three times, and a whole batch killed by one blip is a mistake this project has made twice. So
  `Site` retries transport errors itself (2 times by default, `backoff` increasing), and collection scripts needn't each write their own. HTTP status codes are not retried: a 404 retried three times is still a 404, only wasting
  three times the traffic.
- **Fixtures for parsing must be the HTML actually fetched.** The real form of a javdatabase profile row is
  `<b>JP:</b> 涼森れむ  - <b>Alt:</b> Iwatani Shiki, …<br>`, and a fixture written from memory as `JP: name` would let the regex be pushed off by the immediately following `</b>`: all tests green,
  yet online not one Japanese name and not one old stage name is collected, only romanization comes back. A fixture redrawn from memory can prove only that the code agrees with the memory.
- Direct reachability of the DMM image hosts (`pics.dmm.co.jp`, `awsimgsrc.dmm.co.jp`/`.com`) inside China varies with the carrier: China Telecom and China Unicom direct work fine, while China Mobile
  is mostly cut off after the TLS handshake. When measuring size every candidate breaks at connection with not one host replying, and `best_cover` raises `CoverConnectError`: what it speaks of
  is the line, and resuming retries as usual; the new-release row and the collection page accordingly point to the DMM / FANZA connection method and don't report it as the official source having no image.

## Code Sample Images

Official sample images laid out by code in the photo tab of the performer page (ADR-0068). Reading, writing and page fetching are in `peach.sample_images`, and backfill is in `peach.sample_followup` (task center
"Backfill code sample images").

- Only the publishers' own sites are recognized:
  - For censored, DMM / FANZA's `jp-N`. The `awsimgsrc…/pics_dig/…/<cid>-N.jpg` that GraphQL gives is a 120×90 small image, and `<cid>jp-N.jpg` in the same directory is the
    800×534 original, rewritten before landing.
  - For amateur, the `a.sample_image` (`cap_e_N`, 840×472) of the MGS product page.
  - The `screenshot_urls` handed over by the amane bridge are read only from snapshots.
- The sample images of javdb, JavBus and avwikidb are reposts or direct links of FANZA's, and don't count as an official criterion; avwikidb's increment is the per-image performer annotation `sampleImageActors`,
  see the to-do. FC2 product pages have no sample area, and R18.dev details have no gallery; both are not obtained.
- First read the `sources/library-metadata/<code>-<site>.json` snapshot, with zero network; ask the site only if there is none. A site's answer of none is recorded in
  `generated/provider-cache/sample-images/misses.json` and not asked again for 7 days; cooldown and exhausted budget are not recorded.
- Images are not downloaded at collection time: the first time someone views, `/sample-thumb` fetches one by this site's connection method and stores it in `generated/sample-cache/`. When the DMM image hosts are unreachable on
  China Mobile egress it returns 404 and records a one-day failure marker, and the page shows a placeholder.
- Gfriends is for avatars and profile photos, not grouped by work, and not used as a photo collection.
