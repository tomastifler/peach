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

"Sync media library" and `scripts/scrape_codes.py` share the official source chain. When a source is set to "direct", the direct client is used; when set to follow the Peach proxy, the direct, custom-proxy or follow-environment setting saved on the configuration page is used. Online covers use the same source transport, and the amane bridge passes the proxy and per-site direct settings to its subprocess. Browser page fetching also honors explicit direct and custom proxy; a proxy address containing a username falls back to the HTTP client.

When following the environment, the HTTP client reads the process proxy environment variables and the browser uses the system proxy; the two are not guaranteed to use the same egress. App-level direct cannot rule out an operating-system TUN. Some independently maintained scripts use `HttpxTransport` or `page_cache.Site` directly, read only the environment proxy, and are not wired to the Peach proxy saved on the page, so you cannot claim from this that all scripts are configured the same way.

Probing, the 3x3 grid, the timeline and playback of cloud-drive media read video data; the network connection of a mounted path is the job of the CloudDrive2 or OpenList mount tool. Peach's directory "media read policy" limits background reads and the confirmation boundary, and does not modify the mount tool's proxy. Fetching work text and covers online uses the source settings above, configured separately from the cloud drive that holds the video.

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

- If the raw snapshot stored by the previous run (`<Peach data directory>/sources/library-metadata/<code>-<source>.json`) is still fresh, use it and send no request.
  The validity period equals that of the "known-miss" memory, 7 days, and both expire together, so a stale "none" never lingers while a "have" is still held over an old value.
  "Retry unfinished items" wants a fresh answer, so it forces a re-ask.
- The "known-miss" memory is kept per site (`state/library-metadata-misses.json`, `library_processing._MissCache`): within a tier, sites that have said none are dropped, and the whole tier is skipped only when all have said none. The file records the moment each site first appeared;
  for the "no cover" entry, if a site on the chain was wired in after it, the entry does not count. The memory for censored codes does not become void because a new site was added to the FC2 chain.
- Fields that have only pending candidates still count as missing: review-free approval needs two sites to agree, and a field given by only one site is exactly what should be asked of the next site. Sources that have already given this row a candidate
  are not asked again (`_answered_sources`), so each site yields at most one candidate per row; once every site on the chain has given a candidate or said none, the row
  is skipped before the disk is read. Basis: on 2026-09-25 there were 410 FC2 cast candidates pending approval, and treating pending candidates as already settled would have shut
  FC2PPV-DB out entirely.
- The cover step continues with the snapshots from the metadata step: the work JSON in the r18.dev snapshot gives the original image address directly, and the snapshots of the community sites are handed straight to image-source
  cross-confirmation; once a candidate as wide as 700 is in hand, r18.dev and MGS are no longer asked (`sites_when_needed` of `best_cover`). When r18.dev
  is not on this code's chain, the cover step does not ask it either.
- Browser sources (FC2PPV-DB, JAVten) get 45 seconds per request, not trimmed to the remaining budget. The time spent waiting for a person to click when the verification window first pops up
  is recorded in `LibraryMetadataProvider.excused` and is not counted toward this title's action budget (ADR-0065, second clause).

### Manually Replacing a Chain

A user can replace the whole chain of one type: `process_library(route_overrides='censored=r18dev,javdb')`. The text form is
`type=source,source`, with multiple entries separated by semicolons; a mapping of the same shape is also accepted.

- Replacement is wholesale, not item-by-item merging. Item-by-item merging would become "cannot remove a site": to drop javdb you would first have to know the built-in table contains it.
- A misspelled type or source name raises an error directly. Silently ignoring it shows up as "the setting changed but nothing happened", which is far harder to trace than an error.

The trade-offs of the source chains drew on amane's `docs/dev/content-routes.md`, and the evidence is registered in `docs/reference-sources.json` under
`amane-content-routes`.

### Sites Reached via the amane Bridge

Some sites do not have a Peach parser of their own and are answered by amane through a subprocess under `tools/amane-bridge/` (ADR-0043). The bridge's venv is rebuilt on
the card on the "Sources and Credentials" page, and the pinned versions are changed only by hand.

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

- The work address embeds the in-site article number and title (`/926949-FC2-PPV-4137487-…-pn.html`), which cannot be assembled, so first ask
  `/search?q=<code>` and then fetch the work page. Product numbers are compared on digit boundaries; `4137487` must not match `41374870`.
- Search results have only a title and a thumbnail; tags, release date, runtime and the cover slot are only on the work page, so this hop cannot be skipped.
- This tier gives the title, cover, and the tags, 発行日 and runtime that the re-uploader filled in the body metadata. Whether they are filled is up to the re-uploader, and in spot checks most leave the whole block empty.
  The seller, product description and cast column are not on the site; the remaining paragraphs of the body are re-posted cloud-drive links, none of which are taken.
- One product often has several entries on the site, each posted by a different re-uploader, with different article numbers, code spellings, titles and images, and the order carries no quality meaning.
  Every hit in the search is fetched, since the first one's image may no longer exist. Titles in addresses are sometimes encoded and sometimes raw characters; encode them uniformly before assembling.
- `robots.txt` allows the whole site.
- Covers are on `img.javstore.net` and **are identified by position, not filename**: the one inside `div.fisrst_sc` goes first, and the schema.org `image` goes after.
  Re-uploaders' naming is not uniform, and identifying by name would fetch not a single one in most cases. Those ending in `_s.jpg` are excluded; they are multi-frame strip collages marked `Preview`.
- The filename is not used to identify, only to reject: when none of the standalone five-to-seven-digit segments in the name is this code, the image belongs to another work,
  and `is_cross_product_cover` blocks on this.
- The GIFs stored there are mostly preview animations. After downloading the whole file, `best_cover` of the official tier and `picture()` of the community tier reject them all, since card covers want static images only.
- Its covers are usually a notch below the official originals, so it ranks last.

### Covers

- Once the metadata step has answered it stops, but the cover step asks the chain to the end. The tier that gives an address often cannot deliver the image: the site marks it as having no product image, or the address
  is still there and the image on FC2 storage has been deleted. This layer cannot tell; it is only known after `best_cover` has measured, so the cover step wants every image source on the chain
  and lets it pick the best; tiers already asked in the metadata step are not asked a second time, and asking that tier again incidentally brings a batch of extra tags (ADR-0030).
- The covers of the official page, the mirror and JAVten all point to the file the seller uploaded on `storage*.contents.fc2.com`, so they are treated as official images and
  do not go through the two-image-source cross-confirmation of community sources (ADR-0030). The two JAVten addresses are the same file as the publisher's product page, and after delisting it may have been deleted;
  only the cover layer's measurement will tell.
- The mirror sometimes gives an address wrapped as `contents-thumbnail*.fc2.com/w276/`, and the parser strips the wrapper to get the original.
- Entries on the mirror with no product image carry its own `no-image.jpg` placeholder, still a relative in-site address; handing it down as a cover would only yield
  "source connection not obtained", so the parser judges it as having no image.

### Performers

- Neither the official product page nor JavArchive has a cast column, and the names in the title are the seller's promotional wording. So when the official page has answered and this row still lacks cast,
  fc2cmadb and FC2PPV-DB are asked next for this column (`FC2_CAST_SITES`).
- **fc2cmadb's 女優 column** is shown in the browser only to logged-in users, so collection carries the login Cookie configured in "Sources and Credentials"; a guest follow-up for this column
  returns it for now as well. That column is an Inertia deferred prop, not in the first-screen HTML; one must carry the handshake version number this page reports, name `actresses`,
  and ask once more separately. The response also attaches a list of former names; take only the main name, otherwise one performer spread into the cast column becomes a dozen people.
- **FC2PPV-DB's performer column** is organized by who is in the video, written in the original Japanese name, and ranks after fc2cmadb and before javdb.
- In the cast column the mirror ranks ahead of javdb (`metadata_policy.FIELD_SOURCE_PRIORITY`): javdb's side is often a name given by a repost site
  (an English nickname or a Chinese translation), while the mirror writes the original name.
- If one site writes `Xちゃん` and another writes `X`, they count as agreeing and land automatically as `X`; for the conditions and the trace see ADR-0086.
- Community-sourced cast already in the ledger is not replaced. Disagreements are listed by `scripts/fc2_cast_review.py` into
  `generated/fc2-cast-candidates.csv` and approved one by one in "Metadata fields" on the review page.
- The comment-section line goes through `scripts/fetch_fc2_metadata.py`, which also has the equivalence marker and the compilation judgment.
- A code with a segment suffix (`FC2-PPV-3312576-1`) has no recognizable product number and is asked nowhere: a compilation cover applied to every segment would make each segment, whose contents all differ,
  carry the same image.
- freejavbt is not in this chain: after its redesign amane's parser cannot recognize the work page, and the cast column on the work page reads 「暫無女優資料」.

## 1Pondo Work Metadata and Covers

Uncensored codes are not on r18.dev; for date-style codes, the release date a catalog site gives is the reseller's listing date and does not match the date written in the code itself.
1Pondo's frontend reads a public JSON, so no HTML parsing is needed and no credentials are required:
`www.1pondo.tv/dyn/phpauto/movie_details/movie_id/<id>.json`.

- One request gives the title, description, performers (Japanese and romanized), series, release date, runtime and in-site tags. The parser is in `peach.sources.onepondo`.
- A delisted work simply returns 404 and falls to the community sources (javdb carries some).
- **Whether to ask is decided by local evidence.** 1Pondo and カリビアンコム are both numbered `MMDDYY_nnn`, and the code itself cannot tell whose it is; the separator is
  carried in by the filename from the encoding group, not a maker identifier. So the official site is asked only when `1pon`/`一本道` appears in this row's path, filename or ledger studio,
  otherwise it goes down the community sources as before. Basis: local カリビアンコム codes all 404 on 1Pondo, while all 1Pondo codes hit.
- The only cover is the site's own 16:9 still (`str.jpg`, 960×540). Uncensored makers issue no jackets, and `thum_b.jpg` is a 120×197 list
  thumbnail; neither is a JAV-style portrait cover, so take the larger one and treat it as an official image.

## Rate Limits and Bans on javdb, AVBase and JavBus

This section covers when to ask the three community sources, how fast, and what to do when banned. In-library collection asks them by code only when the official channels come up empty; the comparison rules for metadata and covers are in
ADR-0030 and ADR-0032.

### Pace of In-Library Collection

- The host interval for javdb is set by the user: in `library_processing.SOURCE_INTERVALS`, `javdb.com` and `jdbstatic.com` are both 3 seconds,
  and the two hosts must be changed together.
- **Of the three, only javdb is asked for FC2 product numbers** (`community_catalog.community_sources_for`). In the local source evidence AVBase and JavBus
  never gave a single item for FC2; javdb can fill about half of the cast and release dates, but gives no studio, tags or cover, so it is asked slowly yet cannot be cut.
- The length of one collection round is roughly the number of javdb requests times this interval (measured to differ by about 10 percent). `HostLimiter` waits for "N full seconds since the last one", and other sites'
  round trips falling inside that window are absorbed, so skipping the other two saves quota and the number of Cloudflare hits, not time; making it parallel saves no time either.

### After Hitting a 403 or Challenge Page

- When javdb, AVBase or JavBus returns 403 or a challenge page, the whole source stops. AVBase returns a Cloudflare challenge page; the reason for JavBus's 403
  was not obtained.
- The pause doubles by count: the first stop is `scraping_access.FIRST_BLOCKED_PAUSE` (15 minutes), and it doubles only on consecutive hits, capped at
  `blocked_pause` in `SOURCES` (javdb 24 hours, AVBase and JavBus 6 hours). One successful pass clears the record, and counting starts over.
- **The cap must not be used as the first pause.** Real bans are often much shorter: in the instance where javdb recorded a 24-hour cooldown, everything returned 200 in under 7 hours, and all the failures
  of that round read "source is cooling down".
- A 403 where only the status code is available is not reported as a login wall: it may be invalid credentials, or the egress IP may be banned (javdb's ban that time lasted 3 to 7 days, and changing the Cookie did not help).
  The wording of `metadata.auth_wall_reason` therefore names only the two possibilities and does not urge changing credentials; only when it carries a login-page address or body does it say outright to change credentials.
- The cooldown period raises `SourcePaused` rather than `NotFound`, so the "do not ask again for 7 days" memory (`library-metadata-misses.json`)
  records none of them, and the next round asks the same batch again from the start.
- The issue list records such items as "not reached this run" (`severity: paused`). Failures of self-written sources carrying a `cooldown_action` (challenge pages,
  bans, region restrictions, rate limits) also fall in this tier. Within a tier, it counts as not reached only if all the failed sites are in cooldown; if even one has another cause, it is "not obtained".

### javdb's 403 Is a Per-Egress-IP Quota

What javdb judges is "this egress is sending too fast", not "are you a bot". So **do not switch it to a curl_cffi fingerprint**.

- Basis: outside the cooldown period, all four combinations of HTTPX and curl_cffi's `chrome136` fingerprint, with and without a Cookie, returned 200 for search pages, detail pages and profile pages,
  with no challenge page and no login page, differing only in interface language (with Cookie it returns Simplified, without it Traditional). Fingerprint detection would reject at the very first request;
  whereas a whole round of several hundred requests can finish and the ban only arrives after a certain volume, which is the shape of a per-egress-IP quota.
- **Not obtained**: a comparison of the two transports during a ban. To obtain it one would first have to drive the egress IP into the block, which is not done, so "whether switching
  fingerprint gets through immediately after a ban" remains unknown. The scripts and raw results are in `<private verification record>` outside the repo;
  for what prompted the comparison see [docs/reference-snapshots/amane-crawlers-poc.md](reference-snapshots/amane-crawlers-poc.md).

**A quota and a bot check are two different things and are handled differently.** Cloudflare and challenge walls judge "are you a bot", and getting around them means pretending to be another kind of
client, which is always given up. The check javdb applies is on egress rate; changing node just moves to another line and recounts the quota, with no disguise, so changing egress is acceptable.
But the quota itself is still respected: the source floor may not be lowered, a 403 still ends the whole source, and rotating nodes to keep hammering during a ban is not done, as that amounts to
splicing multiple egresses into one over-speed batch.

- Scripts may go out through the environment proxy: `via_proxy` of `Site` lets HTTPX read the environment proxy, with no guarantee of reading the system proxy or PAC. App routing and
  the actual egress must be verified separately; the configuration boundary for new users is in ADR-0024.

### Rate Limiting for Directory Collection on javdb

`scripts/harvest_directory_links.py` asks javdb person by person by name (see "Directory-Type Sources and Social Links"), at a more conservative pace than in-library collection.

- It was actually banned once: after fetching over a hundred pages at about a page a second, every path on the whole site returned 403, with the page reading 「基於你的異常行為」 and advising a change of node, and the
  egress IP was banned for 3 to 7 days. Before the ban there was no `Retry-After`, no slowdown, no captcha, and pausing a few minutes midway did not recover the quota; the quota accumulates per egress
  IP, not per path, and the trigger is on the order of 40 to 50 pages per minute.
- So the rate limit is a hard-coded source floor, not a command-line default: `harvest_directory_links.SOURCE_INTERVAL` sets javdb at 5.0 seconds
  (12 pages per minute), and `--interval` can only go higher, never below it.
- **On a 403/429/503 the whole source ends.** `Site.request()` does not retry on status codes; paging on after a ban would only make each name spelling of each
  performer hit a 403 once. A hit in `rate_limited()` does a `break`, and pages already fetched still go into judgment, so this round's results are not lost.
- Fetched pages are cached in `state/directory-links/javdb/`, and judgments can be replayed offline. After the ban period, raise `--limit` and run on; cache hits
  cost no requests, so no resume parameter is needed.

### Reasons Covers Fail, and Age Gates

- Every official version returns only a "preparing" placeholder image: the work has mostly been delisted (MIDE-594).
- Both image sources have images but the dHash does not match: "not the same image", and it is not used.
- When a community source's image comes from only one image source it is still installed, and an empty `verified_by` in `.scraping.json` means unconfirmed (IPX-060 has only javdb).
- JavBus has an age gate: the code page without a Cookie answers with a quiz-style age verification page; javdb has a login wall. The cookies of both are pasted into the collection settings by the user after passing the gate in the browser
  or logging in, and public collection carries them with requests.
- The old JavBus and javdb snapshots under `sources/metadata/javinizer-go/` only borrow the studio to choose official channels, and their covers are not treated as official candidates: when JavBus cannot find
  the original code it returns a different work.

## Local Collection Entry Point

This section covers the shared entry point by which the GUI and the command line fetch covers, and its connection, Cookie and write rules.

The GUI and `scripts/fetch_jav_covers.py` share `peach.jav_cover_fetch`. The developer's mapping files and Cookies need not be copied to
a new user's computer. Existing successful metadata snapshots take priority, and when a snapshot is missing, public sources may be queried online.

- **Connection method**: the cover HTTP path of R18, DMM, Prestige and MGStage uses the system proxy, app-level direct or a custom proxy per source.
  The DMM connection check reports the page and the HD CDN separately. HTTPX's environment proxy is not the same as the system PAC; app-level direct also cannot rule out TUN.
- **Cookie**: pasting and Netscape file import for sources that take Cookies (JavDB, JavBus, FC2CMADB, Instagram) reuse
  CredentialStore, saving only unexpired items within the current source domain. Saving itself does not verify whether the login session is valid.
- **Per-task cap**: a GUI cover task accepts only one code hit in the library at a time and reuses BackgroundJob; at most 80 requests and 32 MiB,
  with a 180-second deadline checked before a request is sent.
- **Replacement rule**: atomic replacement happens only when the full image has the same probed size, decodes completely and has a larger area. Original bytes are not downsampled. A successful sidecar records
  the original and the install digest, and a digest match within 24 hours does not download again.
- **Failure and restart**: the Retry-After cooldown of a 429 is written to a local file and a newly created transport obeys it too; a failure does not delete an existing cover. Restarting the program
  does not automatically replay write tasks, and the user restarts any unfinished ones.
- Live r18 studio evidence and local snapshots use the same source routing, with both Prestige and MGS taking part in candidate comparison; original images have no derived downsampling.

This connection configuration covers cover HTTP and the FC2 CLI. The amane bridge subprocess, other collection scripts and the curl_cffi connector each use their own configuration.
An independent user login session for Instagram was not obtained, and no automatic adapter enters the formal dependencies.

For test steps see [Windows test build](TESTING_DESKTOP.md), and for architecture requirements see [ADR-0024](adr/0024-mark-manifest-not-bundled-bytes.md).

## Online Identification of Videos Without Codes

`scripts/scrape_codes.py` recognizes only codes. Videos without codes (resources from Twitter, Telegram and the like) go through the two-stage flow in
`scripts/identify_resources.py`, and the identification results likewise go into "Metadata fields" of `/review`, and are written to the corresponding data items in the database only after confirmation:

1. `worklist` reads only the ledger and generates search spellings from the filename: the name as is, with promotional head and tail stripped, separators turned into spaces, unspaced English split by case,
   and trailing quality tags stripped. It also flags companion images in the same directory, which can serve directly as posters. `metadata_hits` counts how many of creator, title, studio,
   series and cast are already present, and by default puts those with fewer first; `--sparse-only` keeps only entries with none of them, and identification is done for those first.
2. After an agent or a person checks online, fill the CSV back as `asset_id,field,value,source_url,confidence,note`.
3. `ingest` merges it into `generated/library-metadata-field-candidates.csv`, recording the candidate source as `websearch`, with `asset_path` pinning
   the specific file.

- Fields are limited to title, original_title, performers, studio, series, release_date.
- Videos with a code still go through the JAV sources of `scrape_codes.py`.
- Web search runs on the agent side; the script sends no requests and does not write the ledger.

## Naming and Identity Merging

This section covers how canonical names are chosen, how aliases are registered, and how to merge when one person is stored as two entries.

### Canonical Names and Aliases

- The canonical name prefers a commonly used Simplified Chinese name with a source; when no reliable Chinese rendering exists, Japanese is kept. Former stage names, romanizations, kana and Traditional names become aliases.
  `no_avatar` only means no qualifying image was obtained and does not block an already verified name from landing.
- "This page has only one performer" is not evidence: the library has many BEST compilation codes, and pages with no search results also render recommended articles. An exact match-back
  hit takes priority over any "only one" inference, and "only one" counts only when two codes agree.
- The romanized field of r18.dev is rendered as "current name (former name, former name)", one field holding several stage names of one person; the kana and kanji
  spellings each occupy their own row, with the romanization existing only once. On landing it is split by `peach.entities.split_composite_person_name`, whose signature is "a space
  before the parenthesis, comma-separated inside the parenthesis, romanized on both sides". The same literal shape is also used in the ledger for studio disambiguation (`AV DEBUT（本物人妻）`),
  role provenance (`アスナ(SAO)`), submission status and dedup suffixes, and only this signature narrows it.
- `XX XX` is the source node's text duplicated, not a legitimate alias. Before person names enter CSVs, compatibility fields or `upsert_asset_entity`, fully duplicated strings are collapsed;
  the cleanup also audits `asset.creator`, `演员:` tags and `entity_alias`.
- To judge "the ledger already has this name", romanization must be considered too, and `peach.entities.name_chain` cannot be used. That chain by design drops romanization
  (querying Japanese sites with romanization is wasted effort), and using it as the "already has" test would report the `Rin Natsuki` plainly sitting in `entity_alias` as a new alias again.
  For the full set, read `canonical_name` plus `entity_alias` directly.
- Zero-width characters in upstream names are stripped in one place, `canonicalize_entity_name`, not fixed separately in each script. `str.strip()` does not recognize them as
  whitespace, so `normalized_name` would carry an invisible character: identical to an ordinary name in the UI, yet `upsert_asset_entity` looking up by
  `normalized_name` cannot find the existing entity, so the same person is stored as two entries and cannot be found by name search either. U+200B/U+200C/U+2060/U+FEFF are stripped;
  **U+200D is not stripped**, since emoji family and profession sequences use it to join, and stripping it would split a single glyph in a creator's name into two or three.

Aliases fall into three classes by source, and in the UI only the class the user typed in themselves can be revoked (`user:alias`, write endpoint `/api/entity-alias`):

- Those left by scraping (`r18:performer` etc.) and merging (`merge:*`, `avdb-actor-mapping@<rev>`) are the record of why this entity looks the way it does, and are not deleted with one click.
- Free text is saved to the alias table; `canonical_name` is the person or studio name shown on the page, and can only be chosen from names already in that profile
  (`/api/entity-name`).
- The avatar gallery queries the whole name chain one by one and takes the union, so one fewer alias row means one fewer batch of candidates. The same person is often stored under several spellings each with its own batch, and stopping at the first hit
  would leave the images under the later names entirely out.

### Merging Entities

- A unique-constraint conflict on `entity(kind, normalized_name)` is usually not a bug but a signal of one person's old and new stage names. Merging goes through
  `peach.entities.merge_entity`: keep the side with more works, migrate relations, aliases, external references, links and search terms, and keep all old names as aliases.
- The merged-in id leaves a tombstone in `entity_redirect` pointing to the surviving side, and chained merges are flattened to one hop on write; follow sources, Feed subscriptions and
  discovery links are repointed with the merge. Entry points that fetch by id (`/entity-image`, avatar replacement, Feed discovery, review candidates) go through
  `entities.resolve_entity_id`, which recognizes live entities first and then tombstones; when the target entity is deleted, a trigger deletes the tombstones pointing at it.
- `entity_external_ref` keeps only one row per provider; a second row from the same source is discarded and reported, not silently overwritten.
- Creator and performer cross-kind duplicates do not use the "side with more works" rule. They are merged automatically only when the non-empty work sets on both sides are exactly equal and either a performer alias
  exactly hits the creator name, or the creator name is composed of the performer's real name plus an account alias.
- `r18:performer`/`javbus:performer` are the performance metadata of formal releases, and the performer is kept; the generic `performer` is a flattened compatibility
  assertion, and the creator is kept. A merge must synchronize `asset.creator` and the `演员:` projection, otherwise a deleted entity will still forge links on the detail page.
- Two traps in `merge_entity`: the sqlite connection defaults to `foreign_keys=OFF`, so child-table rows must be explicitly DELETEd inside the function; counting uses
  `SELECT changes()`, not the connection's cumulative `total_changes`. A merge is irreversible, and after merging `PRAGMA foreign_key_check` should be 0.

### Automatic Registration of Performer Aliases and Profiles

- The **alias backfill follow-up** (`peach.performer_alias_followup`, ADR-0055) automatically registers a performer's other stage names. `source` is the batch id
  `auto:performer-alias@<task row id>`, and `revert_auto_landing.py --source auto:performer-alias` withdraws the whole batch. The verdicts are written to
  `generated/performer-alias-landing.csv`, and spellings occupied by another entity are only recorded, not written.
  - It reads only the 「別名」 row of the minnano-av profile table and the name column of the 「プロフィール」 section on the av_neme person page.
  - On the minnano-av search page, several aliases of the same person each occupy a row, so uniqueness is judged by deduplicating on id; on a unique hit the site jumps straight to the profile page, and the id is taken from the page-head
    canonical.
  - av_neme's series pages and monthly pages also write 「名前(女優名)」, and it counts as a person page only if the page name equals the main name. An old page of a renamed person has only the sentence
    「女優名が【甲】から【乙】へ変更」, and its first section is not 「プロフィール」, so it is not read.
- **Performers with FC2 works ask the fc2cmadb performer column first** (ADR-0061): from her own work page, enter the person on the site, and take only the main name on the site;
  the former-name string is mixed with seller product names and is not taken. Entities whose canonical name is a seller's handle (`たぬき顔サラサラ黒髪ロング`) get linked to the real name through this site.
- GirlsDelta (`girlsdelta.com/model/<id>`) has a roster and promo photos, but too little to confirm by face, so it serves only as a single-person corroborating link and does not enter the pipeline.
- The **performer profile backfill follow-up** (`peach.performer_profile_followup`, ADR-0067) writes profiles into `performer_profile`, with batch id
  `auto:performer-profile@<task row id>`, withdrawn with `revert_auto_landing.py --source auto:performer-profile`. The verdicts are in
  `generated/performer-profile-landing.csv`.
  - minnano-av profile page `actress<id>.html`: each cell of the table starts with `<span>label</span>` and the value runs to `</td>`; only the
    `act-profile` block is read, and same-named cells in the comment section do not count.
  - The `<p>` of the `生年月日` cell contains a stray `</td>`, and cutting the value there happens to exclude the miscellany after the zodiac sign.
  - `サイズ` looks like `T156 / B86( Eカップ ) / W58 / H85 / S`, the numbers being centimeters; the meaning of the trailing `S` was not obtained, and only the original text is kept.
    Pages where the profile was not filled in lack the rows for birth date, blood type and birthplace.
  - The `ブログ` cell displays `http://` while the `href` is `https://`; take the `href`. The in-site avatar `/p_actress_125_125/` is only 125×125.
  - avwikidb.com returns the full page to a direct httpx connection with a Chrome UA (registered in `scraping_access.SOURCES`, stopping 6 hours on access denial). The JSON-LD `Movie.actor` in the head of the work page
    `/work/<code>/` gives each item a `name`, a romanized `alternateName` and `/actor/<id>/`, and the id is taken from here. The first two items of the performer page's JSON-LD `Person.alternateName` are the reading and the romanization, followed by other credits merged on the site (including male
    performer names), which are not taken. The three measurements are only in a single cell of the body, 「身長・スリーサイズ」 (`T148 B83(B) W55 H85`). The performer image is the DMM `actjpgs`
    125×125 and is not used as an avatar; the site search is a `⌘K` overlay, and its address form was not obtained.
  - When birth date and height disagree with minnano-av, they are recorded only in the external ref's `metadata_json.conflicts`.

## Code Catalogs, Creators and Watermarks

This section covers how to recognize codes from filenames and directories, how to confirm a source returned the same title, and who counts as a creator.

### Extracting Codes from Filenames

- When a code directory is projected as a creator, the criterion can only be file-level evidence and never name shape: the only reliable distinction is whether the media filenames inside the directory
  parse out the same code (`scripts/audit_code_creators.py`), and anything doubtful is left in a review CSV.
- Codes are filled in only for videos in the directory. Release directories are also mixed with forum promo files, downloader ads and cover images (`Tokyo-Hot n0780-HD` has two).
  Writing a code onto them has two consequences: in the library they pass for files of this title; and junk review, because "carries a real code itself", judges the directory evidence invalid
  and keeps them out of the queue. Writes go through `field_owners` signed `script:code-creators`, and cells the user has edited are no longer overwritten.
- Promo clips in release directories are scored by `scripts/find_ads.py` on five criteria and output only as a CSV for a person to handle; javm's `find_ad_videos` identifies by keyword and can serve as a cross-check (ADR-0092).
- Quality prefixes (`HD`/`FHD`/`4K`/`1080P`) and version suffixes (`-C`/`-CH`/`-UC`/`-SUB`) are not part of the code, and the extractor strips
  these two layers before matching. The UI projects version semantics as 「中字」(Chinese subtitles), 「无码」(uncensored) and 「无码破解」(decensored), and the original `name`/`code` is kept for file operations. A compact code missing the hyphen
  is restored only when there is evidence of a maker, release date, or performer/studio/series entity.
- Promo domains appear at the head, tail and inside square brackets of a code (`www.98t.la@ABW-358-U`, `ABP-762-fuckbe.com`, `[xxx.cc]ABC-123`).
  Code extraction and directory dedup share the `strip_promo_markers` layer; if each stripped half, a double-layered `[98t.tv][98t.tv]ABW-251` would slip through
  at one of the two places.
- Words that only say "what kind of file this is" (`IMG`, `VID`, `VIDEO`, `NO`, `PART`) have the same shape as a code body and are collected in
  `catalog_rules.CODE_BODY_STOPWORDS`; quality words belong to `_QUALITY_HEAD`, and repost-site labels to `REPOST_SITE_LABELS`. The three lists
  each handle one class, and extraction passes through them in turn. A new entry should first be checked for false-positive evidence with `stems` of the local temporary tool `build/parse_shapes_audit.py` (not distributed with the repo).
  Creator nicknames may also collide with this shape, and stuffing them in one by one would only yield
  a table that never converges.

### Date-Style, Tokyo-Hot and Western Numbering

- The separator of amateur-series date-style codes (`MMDDYY_NNN`/`MMDDYY-NNN`) is a maker identifier and part of identity: 1Pondo, パコパコママ and
  カリビアンコムPR use `_`, and カリビアンコム uses `-`; the same sequence number on the same day is two different films. JavDB also stores them separately (outside the repo,
  `<private verification record>`: searching `092415-001`, the first result returned is 1Pondo's `092415_001`).
- So the normalization, identity comparison and query variants of `catalog_rules` all keep the separator as is, and do not generate variants with the other spelling: searching with the wrong separator
  finds another title. Only when a source gives a pure digit string without a separator do both count as a hit, and a missing character is not counter-evidence.
- The spellings of wild filenames drift (the same 1Pondo title appears as both `1pon-092415-001-fhd1` and `1pondo-092415_001-FHD`), so when stripping the code
  to display a title both separators are let through, and the value landing in `code` keeps the one the filename gave.
- The six digits of a date-style code are `MMDDYY`, and month and day must be valid for it to count as this shape. Looking only at digit count, the `125735_816` in the phone recording
  `VID_20220818_125735_816.mp4` (month 12, day 57) would become a 1Pondo code.
- Tokyo-Hot numbers have no maker letter segment, and the canonical form is lowercase: the main line `n1234`/`k1234` is zero-padded to four digits, and the Red Hot branch is written
  `red-123`. The javbus work page address is just `/n1234`, and the reference implementation NeoAVDC (MIT)'s `TOKYOHOT_NUM_RE` likewise outputs lowercase
  `n####`. The `k` and `red` branches have no entry in the local ledger, and their spelling on javdb/javbus is **not obtained** as evidence. The number has only one letter,
  and shape cannot keep out names like `no0037_01`, so it is recognized in only two positions: at the start of the name, or when the name already contains `tokyo-hot`.
- Western titles are named "studio/series + release date" (`DorcelClub.24.12.02.Christy.White.XXX.1080p`), which is an identity and not a code:
  `catalog_rules.western_release_identity` yields `DORCELCLUB.2024-12-02`, `release_identity` recognizes it, and code extraction always
  returns empty. Two-digit years expand with a cutoff at 70, and four-digit years are used as is. It is recognized only at the start of a token, not searched mid-token: in the ledger's
  `E078. Redhead.Sucking.Big.Cock.And.Hard.Sex.2019.10.15`, a mid-token search would yield the series name `Sex`.

### Confirming a Source Returned the Same Title

- A code returned by a source must be compared against the queried code to count as a hit. On the javbus side a code is used as a keyword search taking the first result, and when nothing is found it returns
  an approximate someone else (`SA-104 → AVSA-104`, `AR-301 → STAR-3016`). Without comparison most matched codes are simply wrong, and the entire MIB catalog
  (Korean content) was once stamped with Japanese studios, series and titles because of this, and even upgraded to JAV on that false evidence.
- The criterion is `catalog_rules.same_release_code()`. It normalizes only benign differences: verified prefix aliases, DMM's `h_` marker, zero padding and remake trailing letters;
  a source that gives no id is not blocked (missing evidence is not counter-evidence). The review queue removes candidates by the same criterion (ADR-0035): rows whose candidates are all removed
  stay out of the queue entirely, since putting things in front of people that cannot be written even when clicked only makes them confirm it again.
- javbus is a fallback source (`metadata_policy.FALLBACK_SOURCES`): when another site can supply the same field, its value is not treated as evidence; it gets its turn only when it is the
  sole source. This step ranks after the code-date criterion. For fields whose sources are all official after removal, automatic writes may replace the value already in the ledger,
  with the rule name recorded as `adr-0035-official-replaces-*`; community sources still only fill empties (ADR-0035).
- Korean MIB numbers (`catalog_rules.KOREAN_MIB_PREFIXES`) ask no JAV source for either metadata or covers. `HA-101` and `MY-102` collide with Japanese works having
  exactly the same code, so code verification passes all the same, and the only way is to not ask by number prefix as a whole. The five entry points of scraping, scanning and collection, page cover fetching, cover batches and
  log-based recovery are all blocked by `is_korean_mib_code()`. The cross-work criterion for covers compares both the letter segment and the digit segment: `YUJ-101 → yuj00011` and
  `435MFC-135 → h_1711mfcc00027` match on letters and not on digits, and both are different titles.
- `catalog_rules.code_query_variants()` only expands search terms, every return is verified against the ledger's original number, and cached and network results are checked alike.

The prefix-equivalence table and the query table are two separate tables:

- Verified LUXU, BAZX, HA and 9 MGStage prefixes (`_RELEASE_PREFIX_ALIASES`) can be normalized; other numeric prefixes are kept.
- Registering a row requires evidence group by group: compare the MGStage product page against the r18dev snapshot on title, runtime, cast and cover; avbase groups the two stores' entries as the same work;
  and in the ledger that letter segment hangs under only one studio.
- The full number in MGStage's official product-detail path can corroborate its display id with the prefix omitted; covers, titles and search URLs are not identity evidence.
- When DMM/r18dev give only a `content_id`, the studio segment in it can be used to check a bare code, but cannot erase the MGStage prefix in the query.
- `390JAC-040` is an MGStage distribution, while `JAC-040`/DMM `118jac040` is a different DVD compilation, and JNT likewise must not be merged by bare number.
- Variants that cannot be confirmed return `identity_mismatch`, keep the raw snapshot, but generate no field candidates.

### Who Is a Creator

- A creator is the channel owner, not the person on camera. The only ones in a filename from which a creator can be created are `RT_@X - body…`, an explicitly marked `女主@X`, and a Chinese name in the body;
  a trailing string of bare `@A @B @C` is cross-promotion, and `📷：@X` is the photographer, neither of which creates one.
- **A distribution platform is neither a studio nor a creator.** FC2 and myfans are places that sell things, and the account on the site that is the actual seller (producer) is the
  creator. The platform itself can only be a source/platform entity, with links registered under `catalog`, and no "studio official site" is sought for it:
  `studio_sites.PLATFORM_ENTITIES` directly judges "not applicable (distribution platform)", sending no request at all, and not silently skipping either.
- Some FC2 works in the ledger are marked with a performer and some comments mention a person; that is **performer** identity, and the platform must not casually be recorded as a creator. Once recorded,
  the works of every seller under the platform would hang under one "creator", the same class of incident as stamping an aggregate directory with a uniform tag.
- A repost channel's watermark is not a creator watermark, and a directory name may also be a disguise. Judgment priority: on-screen watermark > online reverse lookup of the work name > filename text.
- Before applying a creator-level tag, first confirm from the distribution of subdirectories under the ledger path that this creator is not an aggregate directory. Stamping an aggregate directory with a uniform-style tag
  is a replay of the `asce` incident.
- **The release naming of rotating performers is a studio or series.** The same release name may rotate performers by number, and it cannot be taken as a personal account on the directory name alone. `classification.numbered_cast_shape` recognizes three namings
  (prefix + number + person name, performer combination - number - title, camel-case person names run together plus number), and reports only if the same account has at least 3 works, over half of the files hit, and at least
  3 performers; for the prefix form, 3 of the names must be performers already in the ledger, and one where the same person appears in over eighty percent of the hit files is a personal or couple account.
  The ownership audit reports it as `label_shape`, goes only to review, and generates no repair plan.
- **Identity research first looks up Japanese reference sites by page name.** Generic search does not index sites like sougouwiki and av_neme, so a "not obtained" from generic engines alone
  does not count as having looked. `research_creator_identity_wikis.py` reads only the ledger and, for creators whose identity awaits verification, directly fetches the two sites by EUC-JP page name using the canonical name, the name with code prefix removed, and the
  filename prefix (the fetch layer is the alias-backfill follow-up's `WikiSitePages`, whose page cache, 404 memory and source cooldown are shared with the service).
  A same-named page that is a work list of 3 or more performers is recorded as an observed `identity=release` and negates `unknown`; when none exists, the unknown candidate states
  which pages were asked; a fetch failure other than a missing page is "not obtained" and does not enter the list. The list goes to `apply_entity_identity_research.py` for a frozen preview and backup-then-write.
  When a processing task ends, the "check creator identity" follow-up automatically asks about newly registered and existing creators by the same criterion, and hits land directly as observed with the batch source (ADR-0098).
  Changing an entity's type remains a user review. 裏DVD村 (uradvd-mura.com) is a DVD/download store with member login and no series pages addressable by page name,
  so it is not wired in and serves only as a manual lookup clue.

## Performer Name and Avatar Sources

This section covers where avatars are fetched from, how they are picked and replaced, and what each performer-profile site can offer.

### Source Direction and Size Thresholds

- Avatars are fetched from carefully curated galleries; logos conversely recognize only the brand itself, and official sites and the studio's own social accounts are the authoritative sources.
- Candidates are judged by measured pixels (`peach.images.classify`): a short side < 128 is rejected; avatars are additionally judged by long side ≥ 500 and short side ≥ 300, since applying a square-image threshold to
  portrait shots would reject the best sources. Those with only a URL and no measured size do not count as candidates.
- **"Long side ≥ 500" is a source threshold, not a display threshold.** It blocks thumbnail-grade sources. Using it as a display threshold would shut out a 382×382 image whose face is 208px wide,
  leaving a cover crop whose face is only 55px to keep occupying the slot. The size convention on the display side is in [docs/FRONTEND.md](FRONTEND.md).
- Usable sources: r18.dev, av-wiki.net, Gfriends. javlibrary, missav and xslist are blocked by Cloudflare, njav has a challenge wall, and jav321 has no
  separate performer field. Sites blocked by Cloudflare are always given up on, and bot detection is never bypassed. javdb.com can be fetched, but is rate-limited per egress IP; see
  "Rate Limits and Bans on javdb, AVBase and JavBus".
- Gfriends is used as an external provider only through `Filetree.json` and single raw media files; the image library is not cloned and no images are put into Git. The index cache ages by
  mtime (one day), and when a new index cannot be fetched the old cache is used with a warning in the output; for that round "not listed" is recorded as error and not as no_match, otherwise
  `--resume` would harden a single network failure into a permanent answer. Gfriends has a median of 1 image per person, a median cached image of 500×600, and is not grouped by work.

### Auditing and Filling Gaps

- `audit_performer_portraits.py` puts qualifying images into a candidate-only content-addressed cache, and for each saves provider, name-match tier, upstream
  ID/URL, size, MIME, SHA-256 and policy version. Those whose bytes equal the current avatar keep only audit evidence and do not enter `/review`. This script
  has no path that writes the ledger.
- `fill_portrait_gaps.py` covers the stretch from gap to installed: among people who have never had an avatar installed, those whose name chain hits exactly one image in the gallery get it installed directly;
  those hitting several get none installed and instead produce a comparison sheet (`--sheet`), with candidate images side by side and, next to them, links to her works in this library. Installing
  reuses the three steps of the picker overlay (`avatar_picker.choices`/`resolve`/`install`), and the evidence, cache and framing sidecar follow exactly the same conventions as manual image replacement.
  It is dry-run by default and writes avatar files only with `--apply`; the ledger is opened read-only, and this run does not write the ledger.
- **The gallery stores images by name, and people with the same name are different people.** The twenty-odd images hit by a single name like `ななみ` are twenty-odd people, and auto-picking amounts to randomly installing
  someone else's face on her, so "found exactly one" is the only criterion bold enough for automatic installation. Even when a single name hits just one, the evidence is only "keys are exactly identical",
  and after installing it still needs a look on the profile page; recognizing a person from their works is something a machine cannot do.
- **The gap criterion is "`performer-<id>.img` is not on disk", so one poor image shuts better sources out permanently.** Example: social-media collection installed cropped work
  covers into a batch of empty slots; those people have not counted as gaps since, while Gfriends has high-definition face shots for some of them. The gap audit cannot answer
  "is the one in place good enough", and switching sources needs another survey round: recognize cover
  crops by `provider` in provenance, recognize no-face-detected, face-too-small and source-image-too-small by the sidecar, then ask the gallery for each.

### Picking Images: By Face Width, Not Canvas

An avatar ultimately sits in a 64-160 px circle, and whether you can tell who it is depends on how many pixels the face has, not on how big the whole image is.

- The criterion is in `harvest_social_avatars.rank_key`; face width is measured by YuNet in `peach.face_detect` (once per SHA) and written to the `face_width` column of the candidate
  CSV for reviewers to see directly.
- Counterexample: a full-body standing shot has a bigger canvas but a face of only a few dozen pixels; a half-length shot of the same person has a smaller canvas and a face more than twice as wide. Picking by canvas, the winner is
  the one whose face can't be seen. The face in a group shot can likewise be far smaller than in a solo shot.
- No face detected is recorded as 0 and ranks behind any measurable candidate; those with no face detected are never installed, official images included. When the whole batch is 0 (model absent, all
  side profiles), ranking falls back to canvas and the run statistics state that this round picked by canvas. The fallback of a solo work cover uses the same yardstick: in the right-half still of a JAV two-panel cover
  the face is often only a few dozen pixels.
- A replacement happens only when the winner's face is wider. A winner that doesn't fill the circle is installed as a fallback only when the one in place has no detectable face.
- **The avatar directory is shared by several pipelines, and `--apply` only changes things for the better.** `--force` means "avatars already present also enter the contest", yet it overwrites
  **all** installed avatars, including those installed by other pipelines; and the candidate pool of `harvest_social_avatars.py` (X avatars, directory portraits, work covers) is far worse than
  full-frame portraits of the `verified-photo-page` kind, so overwriting without judgment would shrink the face in most avatars. So before writing to disk the one on disk is measured with the same
  `rank_key`, and if the face is not larger it is not overwritten, and the run statistics report how many were "in place is better, not overwritten". The face width of the one in place
  is read from the existing framing sidecar first and only truly detected if there is none.
- **Replacing an image must replace the sidecar.** The framing sidecar and the image-selection criterion come from the same YuNet detection (`peach.avatar_face`) and are written together when the avatar is installed;
  if no new record can be produced the old one is deleted. Leaving the previous image's face box would make the page use it to frame this image, zoomed onto an empty spot, and in the UI this looks no different from
  "this image was supposed to display that way". `/review` approval landing also detects the face once. `scripts/detect_avatar_faces.py` is only a
  backfill entry; neither the detection nor the sidecar shape is defined by it.

### Watermark Removal

Avatars fetched back carry someone else's watermark (the `PRIVATE.com` and `TEAMSKEET.COM` strips at the bottom), which must be removed in the bytes and cannot be hidden by framing:
export, a changed framing rule or any place that switches to the full image would bring it back out.

1. `scripts/scrub_avatar_watermarks.py` looks without writing by default, producing a candidate CSV plus a stack of side-by-side annotated images.
2. The detector cannot catch semi-transparent watermarks, so adding boxes by hand is the proper way: add a row `file,x,y,w,h` to the CSV given to `--marks`. Manual boxes are not bound by score, size
   or position priors; those criteria exist to question the detector and should not overturn a judgment made by someone who has already looked at the image. A manual box covering a whole edge strip can often crop several watermarks
   at once.
3. After a person confirms, run `--apply`: the original together with its three sidecars is moved as a set into `avatars-superseded/`, provenance gets a `watermark_scrubbed` segment added,
   and the framing sidecar is recomputed for the new image.

- **Crop edges rather than inpaint where possible.** Cropping fabricates not a single pixel, whereas inpainting does, and often wipes out only half, leaving semi-transparent remnant text. The crop line is subject to
  two constraints: it may not cut into the face box plus margin (the face box comes from `peach.face_detect`), and it may not crop the image below 70% of its area. Each edge is judged independently,
  and one edge that cannot be cropped does not affect the others.
- **An image with more than 4 text detections is passed over entirely, without changing a single pixel.** That is not an avatar with a watermark; it is a work cover installed as an avatar,
  and what's needed is a source switch; see the cover crops in the previous subsection.
- The detection and removal criteria, model source and measured figures are in REUSE.md under "Avatar watermark detection".

### What Each Site Can Provide

- **The DMM performer index page is reachable, but its avatars are only 125×125, suitable only for the first avatar bound to an identity.**
  `https://www.dmm.co.jp/mono/dvd/-/actress/=/keyword=<kana row>/` returns the complete list page through Peach's `dmm` source setting (with the in-site
  actress id and old stage names in parentheses), with no region block; `pics.dmm.co.jp/mono/actjpgs/<romaji>.jpg` returns 200 even without a Referer.
  - The problem is size: `actjpgs/<name>.jpg` is 125×125 and `actjpgs/medium/<name>.jpg` is 100×100, which cannot pass the HD candidate threshold or the display threshold.
    Gfriends already holds this whole batch, ranking in the last quality tier, so no separate HD provider is started for it. The evidence and replay scripts are in `<private verification record>` outside the repo.
  - Exception: at a fresh import, r18.dev's same person object gives the DMM id, name and filename directly, and an entity lacking an avatar can first install this official thumbnail,
    which the avatar-change page upgrades afterward. The Japanese name, old stage names and in-site ID on the page continue to be used for the name chain and disambiguation.
- **The entry to javdatabase must be a code in the ledger, and slugs cannot be assembled from names.** It has one page per stage name, and slugs are not one-to-one with people:
  `/idols/rin-natsuki/` opens the profile page of `Rin Oka`; the in-site search also gives no idol page and returns only a work list.
  - The query order is fixed as code → `/movies/<code>/` → the idol link the page gives → name, with each step supplied by the page from the previous step
    (`scripts/harvest_javdatabase_names.py`).
  - A work can carry several performers, and a code match does not mean all the names on the page belong to this person: it is accepted only if at least one name on the idol page is already on this person's name chain in the ledger,
    and when it matches several people in the ledger it is recorded as 「需人工消歧」 (needs manual disambiguation).
  - It can give the original Japanese name plus the romanization of old stage names. It cannot be used for studio names; it itself writes `セレブの友` as `Celeb no Tomo`.

## Directory-Type Sources and Social Links

Filling in performer social media goes by "fetch the whole directory-type source once, compare names offline, install via a review CSV", with no per-person search (`scripts/harvest_directory_links.py`).
This section covers how each directory site is fetched, how names are matched, how links are judged and how agencies are built.

### Fetching and Name Matching

- laoshi.ink is fetched in full by sitemap for all performer pages (ld+json `sameAs` plus external links in the body); bstar-pro.com passes the age gate once, then fetches the models list and
  every page. HTML is cached by URL sha1 in `peach-data/state/directory-links/<source>/`, and reruns no longer hit the external site.
- Names on a page (Chinese name, Japanese name, aliases) are matched against the ledger's `canonical_name` and `name_chain` by `peach.social_links.name_key` (NFKC, casefold, whitespace removed).
  A page hitting two entities is recorded as 「需人工消歧」 (needs manual disambiguation), with no guessing.
- The site's own social accounts (the few on laoshi's home page) are subtracted from each page's external links first, otherwise every performer would get the site's X installed.
- javmodel.com is not a social source and need not be tried again: through a proxy it returns 200 (direct connection times out), but the only twitter link is a share button, and there is not
  one of the person's own accounts. Instagram↔X complementing waits until after the directory data is installed and is done from the ledger itself, not in the collection scripts.

### Link Judgment and Liveness Checks

- Four verdicts: `ok` enters the install queue; `已有` (already present: same platform, same handle, regardless of host spelling and case); `conflict` (the ledger has a different handle on the same
  platform); `未取得` (not obtained: page failed or no social media).
- The source itself may be stale data: many X accounts copied by directory sites have been suspended, and the person long since moved to a new one. So X `ok`/`conflict` rows are all liveness-checked via the logged-out
  page's og tags: a live account has `og:title` and an `og:image` pointing at `profile_images`; a nonexistent handle returns only a JS shell without any og, so live or dead can't be told. When no og is obtained, the control account `x.com/X` is fetched without cache:
  only if the control is normal is it judged 「疑似失效」 (suspected dead); if the control is also empty it is rate limiting, and 「未取得」 is written. The logged-out pages of Instagram, TikTok and YouTube give nothing at all, so only 「未验」 (unverified) can be written.
- **An X display name containing 「応援」 is a fan account, not the person.** Directory pages hang accounts like `篠田ゆう様💝応援アカウント` as the person's own account,
  and liveness checks them as "live" too. Marking a note in the evidence is not enough, since `installable()` looks only at verdict and alive, so the criterion lives in `probe_rows`
  (`FAN_ACCOUNT`), and a hit downgrades to the separate verdict `应援账号` (fan-support account). Directory-type sources do not verify social-media ownership, and this check can only be done ourselves.
- The criteria (platform list, handle normalization, the `twitter.com→x.com` alias, label spelling, X liveness) are centralized in `peach.social_links`,
  and `normalize_link_hosts.py` and `harvest_performer_links.py` both take from it; `harvest_social_avatars.py` still keeps an old copy.
- **Hostnames are always lowercase.** jae's profile pages write `https://Instagram.com/…`, while the UNIQUE on `entity_link` recognizes only the literal, so copying it verbatim
  makes a second record for the same account (`social_links.canonical_url`). Paths and handles are untouched: X handles are case-insensitive, but that
  is the spelling the user reviewed in the first place.
- **If the page states it is a blog, treat it as a blog regardless of hostname.** `classify()` recognizes only `BLOG_HOSTS`, yet subdomains of `alicejapan.co.jp`,
  `plaza.rakuten.co.jp` and `takasyo.blog.jp` are all the person's own blogs and are not on the list; the line 「公式ブログ」 on the page is closer to
  the fact than the hostname. The label is recorded as 「博客」 (blog) following the ledger's existing spelling, and only when the page additionally names the blog (`公式ブログ「旬の果実」`) is that name appended;
  copying a generic term like `オフィシャルブログ` verbatim would make the same thing appear in three spellings in the UI (`harvest_directory_links.owned_link`).
- Installation uses `install_entity_links.py` to read `directory-links-<date>.csv`; `-review.csv` holds all verdicts, for people to look at. Neither writes the
  ledger directly.

### Labels and Agencies for Official Links

- **A field's value describes only its own row.** In the minnano-av profile table, 「所属事務所」 and 「公式サイト」 are two different things: Ako Shiraishi's agency is T-POWERS,
  but the 公式サイト filled in is Prestige's exclusive promo page. Using the agency name as the label of the official link would produce a control whose text says T-POWERS while its icon and destination are
  Prestige's.
- So the label of an official link is written by domain ownership (`peach.social_links.host_owners`). Evidence in order: the official-site link the studio entity itself carries identifies it directly; next
  is consensus among performers' official links (at least `OWNER_QUORUM` rows on the same domain writing the same name). A single piece of evidence confirms itself and does not count as consensus. Only when ownership is not obtained is
  the agency name used.
- The agency name is stored in `entity.metadata_json.agency`, with `source` and `checked_at`, and a performer's transfer overwrites with the latest. Mislabels already in the database are repaired by
  `scripts/repair_link_labels.py`, which by default produces only a review CSV.
- `scripts/install_agencies.py` installs these names as `entity.kind='agency'`, with the affiliation written to `entity_membership` (the primary key is on the member side, a person has only one
  active affiliation, and a transfer is an overwrite). The original text stays in `metadata.agency` as evidence so there is something to trace back if the conclusion was wrong. Agencies do not enter `asset_entity`: storing a separate agency
  field for works would drift, and nobody would notice the drifted copy.
- Parentheses in agency names are split by the same rule: outside the parenthesis is the current name, and the reading inside the parenthesis and the `旧・`/`元・` after it are aliases. When an old name collides with another company's current name, no
  alias is written: the old name of `GG(旧・Prime Agency)` is precisely the still-operating `Prime Agency`.
- An agency's official site takes those of its members' official links whose label equals its own name, using the domain root address and not some performer's personal page. After a name is split, it must be looked up again by the original text,
  otherwise sites like `ACT(アクト)` cannot be found.
- A company whose current site won't open can have a Wayback snapshot registered: link_kind stays `official`, the url is the full `web.archive.org/web/<timestamp>/<original address>`, and the label is
  `官网存档（YYYY-MM）` (official site archive; no company name, as the page header already has it), preferring the affiliated-roster page. `peach.social_links.ARCHIVE_HOSTS` makes domain ownership, the agency storefront round icon
  and studio mark collection all skip it; when a mark is to be taken from the snapshot, register the `id_` original address of the image in the snapshot in the designated-source table of `studio_icons.py`. When the review sheet changes the
  label, rerunning `install_entity_links.py` realigns it.

### Agency Rosters and Transfers

- "Who is at this agency" goes through `scripts/harvest_agency_rosters.py`, one agency at a time, with two orders of magnitude fewer requests than asking person by person.
  - minnano-av has no agency index page, and the in-site id appears only in the link in the 「所属事務所」 cell of the performer page. So first search out the id with this agency's known members, and check by the parenthesis rule above
    that the cell indeed names this agency (`KRONE(クローネ)` matches only once split; the old name inside `GG(旧・Prime Agency)` does not count). The id is written to
    `entity_external_ref(provider='minnano-av', external_kind='production')` so the next run need not ask again.
  - The roster page `actress_list.php?production=<id>` has 30 people per page, and names are read from the JSON-LD `CollectionPage`; the text of the body `<a>` is
    "name + 女優情報", which can't be matched to the ledger.
  - The paging address is taken from `<link rel="next">` with `&amp;` restored, but the endpoint can't be trusted to it: after the last page the site still gives a next page whose content is a
    repeat of the last page's few people, so walking stops at "this page has no new people". When the headcount doesn't match `numberOfItems`, distinguish whether the page count is capped or the site roster has duplicate numbers.
  - Names are matched back to the ledger together with aliases: those that don't match are recorded as 「不在库」 (not in library; collapsed into a single count line by default); a spelling matching two people is recorded as
    「重名」 (duplicate name); one already affiliated elsewhere is recorded as 「另有归属」 (belongs elsewhere), left for a person to judge. `--apply` only fills the empty one.
- Agencies split and rename. Transfers go through `scripts/resync_performer_agency.py`: pick a whole agency with `--agency` or name people with `--only`, re-ask the performer page's 「所属事務所」,
  and overwrite only `entity.metadata_json.agency`; entities and affiliation are still landed by the REPLACE of `install_agencies.py`, so the two sides don't each split the name and reach two conclusions.
  - Searches must go through `name_chain`: the ledger canonical name is Simplified Chinese while the site recognizes only Japanese spellings, so asking with the canonical name alone mostly ends in "not obtained".
  - An empty cell on the site is recorded as 「站上没有事务所」 (no agency on site), and the ledger is not cleared: contract termination and the site not displaying that cell that day can't be told apart on the page.
- 「所属事務所」 records only who she is currently signed to. For someone who retired and moved to a personal management company, that cell holds her own company (三上悠亜 → 株式会社Miss), not an AV
  agency. These are rejected by `scripts/reject_agency.py` per a review CSV: the rejection is recorded in her `metadata.agency_rejected` and the affiliation is removed, and if the agency is left with no one the
  entity is deleted; if the AV-era agency has been verified, write it in the `replacement` column and it is switched in the same pass. The rejection is recorded on the person; the three paths of writing metadata, creating entities and filling rosters all skip it through `peach.entities.rejected_agencies`, and the verdict is recorded as 「已驳回」 (rejected).
- When one agency splits into two, both write 「旧・某某」 after the parenthesis. The roster collector, per the parenthesis rule, refuses to recognize either as the one that was split, and that is correct: the old name
  belongs to both successors (example: LIGHT split into `ELTRA(エルトラ)旧・LIGHT` and `EST(エスト)旧・LIGHT`).

### jae.tokyo Performer Directory

jae.tokyo (Japan Adult Expo) is the third directory source designated by hand; for the same site's studio directory see "Studio Names and Studio Marks".

- The profile-page structure differs across the three editions: 2014 is `jae2014/actress/NNN.html`, with social media and blogs mixed into the body's `<a>`; 2015 is the
  `offActress` overlay of `jae2015/actress.html`, with one `actressLinkBtn` button per link; 2017 is `jae2017/actress/NNN.html`, with the portrait in `img_area` and links in `link_area`.
- **`jae2014/*` gets reset on direct connection** (`WinError 10054`), so jae as a whole went into `PROXY_SOURCES`; the same source does not use two different egresses by edition.
- **Links inside comments don't belong to this person.** Some pages leave in their HTML comments the blogs and Instagram of other performers from the previous edition's template, and hard-fetching by `<a>` would
  install several people's accounts on one person, so comments are stripped before parsing.
- **Directory portraits enter the avatar contest, not a separate install path.** `-portraits.csv` is read by the `jae` route of `harvest_social_avatars.py` and competes on size with candidates from X and
  babepedia in the same content-addressed cache; the framing of tall full-body promo photos is left to the face sidecar, see REUSE.md under "Face framing".

### javdb Performer Pages

- **javdb.com is a source entered by name, not a directory you can page through.** The site has no enumerable performer list, and the entry is names in the ledger: search each spelling with
  `search?f=actor&q=`, and the `title` column of the result card is all the spellings of this person on the site, so identity can be judged without clicking in. The name chain must be searched through before giving up: the ledger
  canonical name is mostly Simplified, `name_key()` does no Simplified/Traditional conversion, and searching with only the canonical name often finds nothing at all (`harvest_directory_links.collect_javdb`).
- **The performer id is available on the work detail page, with no need for a separate profile-page trip.** Every name in the 演員 column carries `/actors/<id>`, and `sources.javdb.actresses` brings it out in passing;
  only when a name matches exactly a person entity already linked to this asset is it registered as `entity_external_ref(provider='javdb', external_kind='performer')`, and the person page's
  JavDB entry is assembled from it (`peach.entry_links`). Historical data goes through `scripts/backfill_performer_entry_ids.py`: the javdb page cache and the `actress_id` of
  `review/agency-rosters.csv` each fill one way, producing a dry-run CSV first and then `--apply`.
- **For works whose performer wasn't scraped from javdb, the performer-profile backfill follow-up searches performer cards by name to fill the id (ADR-0081).** The id on the card is the profile-page id,
  and the avatar of the uncensored record has `<span class="info">無碼</span>`; matched cards count as the same person only if there is at most one per record type (`javdb.one_person`).
  The backfill script uses the same criterion when reading the search-page cache.
- **Two records of the same name: don't take the first.** The same performer often has two records on the site, 「有碼」 (censored) and 「無碼」 (uncensored); both pages enter judgment, and colliding accounts land as `conflict` in the review sheet.
- **Some profile pages require login, and return a login page rather than 401.** No account is registered. That page is recorded as 「未取得」 with the reason stated: "searched, not on the site", "found
  but needs login" and "not searched" are three different things, and not writing them separately means the next round has to search again. The pages that require login are all the 「無碼」 twin record; the censored one is public, and the Chinese name can be
  obtained from it, so logging in just to get the name adds nothing; the work list of the uncensored record is still behind the wall.
- **The social-media buttons are only inside the `section-addition` block.** Outside links elsewhere on the page are ads, sister sites and RTA labels. Instagram is the main increment of this source.
- **javdb's round avatar is 250×250 and cannot enter the avatar contest** (square needs ≥400), so `harvest_social_avatars.py` does not take this source.
- For rate limits and bans see "Rate Limiting for Directory Collection on javdb" under "Rate Limits and Bans on javdb, AVBase and JavBus".

### Name Discovery for Follow Sources

When discovering follow sources by name, the spelling of the site's identifiers follows the site's API and is not inferred from handles.

- **Only two places can offer suggestions as you type half a name: the local list and rule34.xxx's public autocomplete**, and neither needs credentials.
  - The local one is the whole-site creator list that `discover` downloads along the way (kemono, pawchive, coomer), sorted by casefold and then binary-searched for the prefix range.
    The typing path **does not download the list**, and if it was never downloaded that group is simply missing.
  - The on-site one goes through `api.rule34.xxx/autocomplete.php?q=`. The same path under the main domain is blocked with a 403 by Cloudflare, and only the `api.` subdomain returns 200 JSON.
    What it returns is tags, not an author directory, and the UI must say this group is tags. It returns only ten at a time, and popular prefixes crowd out the full spelling, so with credentials switch to a direct tag query.
    Only the one that equals the query after stripping separators and folding case is accepted, and others sharing the prefix don't count as a hit.
- **Who the author is on rule34.xxx is told accurately only by the site's classification, and that requires credentials.** Guessing by word shape would be wrong (names containing `artist` can be coincidence). The classification is at
  `index.php?page=dapi&s=tag&q=index&name=`, which without `user_id`+`api_key` returns `"Missing authentication"`. Three pitfalls: `json=1` is ignored and only XML is returned;
  `names=` is not recognized and spits out a batch of unrelated tags; `name_pattern=` is a two-sided wildcard substring match truncated by id, and `orderby` has no effect either. So the only way is to ask
  one by one by exact name (about 0.3 seconds each, can be concurrent). A classification is a fact fixed once the site changes it, so once asked it is remembered.
- **gelbooru is not a superset of rule34.xxx and cannot replace or precede it.** The two sites share an origin but each collects its own, and post counts for same-named tags also differ. gelbooru's
  `index.php?page=autocomplete2&term=` is public and carries its own `category`, but `limit` has no effect and it always returns 10, so using it to tag rule34.xxx's candidates with categories can
  cover only a very few. The candidate list must come from rule34.xxx: Peach creates the subscription on that site, and offering names it does not have is misleading.
- **f95zone**'s `latest_data.php` indexes only the five categories of Latest Updates, and artists' Collection posts are visible only through the in-site
  search with a login cookie (without a cookie `/search/` returns 403). Without a cookie it is skipped and the Google external link is kept, and "could not find" is not written as
  "not on the site".
  - The in-site search matches whole words: `strauz` hits 0, while `strauz*` and the full spelling hit the same posts. So after all spellings come back empty, add a round of `word*`; add it only at four characters
    or more, since three letters plus a wildcard amounts to searching half the site back.
  - The author in a thread title is in the trailing square brackets, by the convention `work name [version or date] [author]`. Going right to left, find the first bracketed segment that doesn't look like a version number, a date or
    a site label such as `Completed`/`Unity`; when two handles are listed side by side (`[LazyProcrastinator/LazyProcrast]`), the first is the display name and the rest are
    alias candidates. Only when there is no usable bracket is the body used, stripping prefix labels such as `[Collection Request]` and container wording such as `Models Collection`
    (`follow_store.f95_author_name`).
  - The author's avatar and other identities are only in the body link area of the first post, and visible only when logged in. The first-post poster is a re-uploader and not the author, and XenForo's poster avatar can't be used as the
    author's avatar. In guest mode, all outside links in the body are replaced with `/login/`, and some boards are closed to guests entirely.
  - When the profile card has a FANBOX creator id or a pixiv numeric id, the avatar is taken from FANBOX; otherwise X and Patreon, neither carrying credentials: the og:image of the X logged-out page steps down by the
    `pbs.twimg.com` size-suffix rule in "Studio Names and Studio Marks", and Patreon's public `api/campaigns?filter[vanity]=` gives
    `avatar_photo_image_urls.original`. Each takes the largest usable tier and then compares actual pixels, keeping the larger. SubscribeStar is **not obtained**.
  - Which hosts count as identity is hard-coded in `follow_sources.profile_link_identity`: anyone can paste links in a forum body, and opening up hosts amounts to treating addresses pasted by others
    as the author's.

### Fetching Chinese Names from javdb (`harvest_javdb_cn_names.py`)

- **Page structure: `actor-section-name` is the current name, the `section-meta` right after it is the old stage names, and the last is the film count.** The two must be taken separately:
  the old names on the `JULIA` page include `京香じゅりあ`, and mixed into one string you can't tell "this is her Chinese name" from "this is an old stage name she used". Parsing is in
  `peach.javdb`, shared with `harvest_directory_links.py`.
- **Two names side by side in the current-name column are not necessarily two spellings of the same name; they may be two stage names.** The current-name column of the `美空あやか` page is
  `一之瀨亞美莉, 美空あやか`, and treating it as "Chinese spelling + Japanese spelling" would install 一之濑亚美莉 as 美空あやか's Chinese name. The criterion is that the first
  kanji string must be found on the other side (`same_person`); mismatches land as `不同名` (different names), and cases where the canonical name is not in the current-name column land as `改艺名` (renamed stage name) for separate review.
- **When comparing names, glyphs must be folded twice; opencc once is not enough.** It handles only Traditional/Simplified, not Japanese shinjitai: `永瀬` won't convert to `永濑`, `姫川` won't convert to
  `姬川`, and with one layer fewer the same person is judged as two. Both layers go through `peach.kanji` + opencc `t2s`, and the spelling stored in the database goes separately through `simplify_kanji`.
- **`?locale=zh-CN` switches only the interface language.** Performer names are data and don't follow: `愛音麻里亞` is still Traditional under the Simplified interface, and Simplified must be converted yourself.
- Verdict tiers: `ok`, `同形` (same form; the site has only the Japanese name), `要登录` (needs login), `旧名` (old name), `改艺名`, `未取得`, `不同名`. For landing, three tiers are taken: `ok`, `改艺名` and
  `旧名`.
- **Chinese renderings of old stage names are only on the profile page, and the ledger has not a word of them.** Scraping sources give Japanese and romanization; the avdb mapping table gives only one `zh_cn` per person, its
  `keyword` comma list is used only for matching and is never written to `entity_alias`; and what gets demoted to an alias when the umbrella name is changed is the original Japanese canonical name. So `橋本ありな`
  is in the ledger and `桥本有菜` isn't, and searching by the latter finds no one.
  - `--aliases` in the same fetch pass takes the Chinese spellings in the column under the current name as candidates. The site gives no labels for that column, with old stage names and nicknames mixed,
    and the parsing layer neither separates nor filters them; candidates record only `origin=别名栏` (alias column), and whether to accept the spelling is for the reviewer.
  - `--scope all` widens the scope to people who already have a Chinese canonical name, who are precisely the batch lacking a second spelling; `--only` names one person by any spelling on the name chain or by
    entity id, unrestricted by scope, reaching a conclusion in two requests.
  - **When the search yields multiple pages, not a single alias candidate is produced (`多页`, multiple pages).** The canonical-name pass records both pages for a person to pick, but aliases can't: aliases go into identity, and a wrongly matched
    person is harder to trace back than a missing spelling. A spelling colliding with one under another entity's name is recorded as `占用` (occupied); that is a question of whether the two should be merged and not for collection to decide. Pages where
    there is no new spelling still leave a row `无新写法` (no new spelling): having looked and found nothing is a different thing from not having reached her yet.
- Landing is a different script and a separate authorization: `apply_alias_candidates.py --candidates <csv> --revision <batch> --apply --backup`.
  - The source is recorded as `javdb-actor-page@<batch>` (`peach.javdb.ALIAS_SOURCE` is this prefix), the same shape as the `javdb-actor-page@javdb-202609` written by `localize_performer_names.py`, and distinguishable from the
    revocable `user:alias` in the UI.
  - The batch id must be given on the command line: when parsing was misjudged, only if the batch can be recognized can that whole run be withdrawn by `source`.
  - Four cases are not written: this entity already has the spelling; the spelling belongs to another entity; the umbrella name in the ledger is no longer the one in the CSV (stale snapshot, should refetch); the entity
    is missing or is not a performer.

## Studio Names and Studio Marks

This section covers where a studio's original Japanese name, official site and logo come from, and how to judge that what was found really belongs to this studio.

### Original Japanese Names

A studio's original Japanese name is looked up, not transliterated: there is no unique way back from romanization to Japanese (`Hon Naka` can be `本中` or `ほんなか`).
So `scripts/localize_studio_names.py` does no transliteration, and instead takes the codes of that studio's works to `www.javbus.com/<CODE>` and reads the `製作商` field.

- For one studio, take codes with two different prefixes where possible, and propose a rename only if the two pages agree. The same prefix is necessarily the same company and proves nothing.
- javbus has an age gate, and without `age=verified` it returns only a confirmation page; code pages must go through the proxy, and direct connection times out.
- A 404 on a code page is that page's problem, not that this studio can't be found. Corroboration relies on cross-prefix, and substituting for a 404 relies on same-prefix: `code_groups` is one group per prefix, with at most
  `--depth` (default 3) per group, and later ones in the group don't take part in corroboration but take over only when the previous one can't be fetched.
- When codes of every prefix of a studio all 404, suspect the ledger first: often the films with English filenames or Korean performers have been given a same-prefix JAV studio name by the scraper
  (`Crystal Eizo`/HA), and that studio name never belonged to those films.

The seven verdicts are each a separate matter:

- Rename only if the source gives kanji or hiragana (`Celeb no Tomo→セレブの友`).
- Pure katakana is just the loanword spelling of an English brand, and the English original in the ledger is kept by default (`ムーディーズ` does not replace `MOODYZ`).
- When the source itself also writes Latin (`V＆R PRODUCE→V＆RPRODUCE`), the difference is only spaces and symbols, not de-romanization.
- Western studios and FC2-PPV with no JAV code in the ledger at all are recorded as 「不适用（非番号体系）」 (not applicable: not a code system), and cannot be written as "not obtained" and pass for a failed lookup.
- Two codes giving different 製作商 are recorded as 「不一致」 (inconsistent) and handed to a person: `K M Produce` yields ケイ・エム・プロデュース and スクープ, meaning one ledger name
  has two companies mixed under it.

Romanization and free translation transcribed by code sites do not count as English, and rank below the original Japanese name; only English names the studio itself uses are kept (the user's example: `PREMIUM`
uses English, `Celeb no Tomo` uses Japanese). The criterion is the studio's self-designation: where the official site or official X display name writes katakana and the Latin name is merely its romanization, it is likewise changed back to Japanese
(`Akinori→アキノリ`, `Milu→ミル`, `Das→ダスッ！`); where the official site itself writes Latin, it is kept (`BALTAN`, `GENEKI`). So the "pure katakana"
verdict is only a default, and an override is written directly in the verdict column of the review sheet. `merge_studio_name_variants.py` class B uses the same standard: if the Japanese side contains kanji
or hiragana the Japanese side is kept, and for pure katakana the English side is kept.

Rows judged "rename" are landed by `scripts/apply_studio_name_localization.py`: the canonical name, the old spelling demoted to alias, the flat `asset.studio` and
the marks under `--logo-root` are all changed together. Rows whose review sheet is stale (current name has changed, entities have been merged) or whose Japanese name collides with another company are reported and not changed.

### Merging Duplicate Entities

- Duplicate entities are merged in two classes, spelling and writing system (`merge_studio_name_variants.py`).
- The comparison key for spelling variants (`AVS collector's` vs `AVS collector’s`) is NFKC plus symbol folding, **and not a single kana may be dropped**: an ASCII-only
  folding would fold both `シロウトTV` and `ラグジュTV` to `tv`, and the merged result is two real studios mixed together, irreversibly.
- The only identity guarantee between a Japanese name and a romanized name (`ムーディーズ` vs `MOODYZ`) is a shared code prefix: the prefix belongs to the studio and is locally verifiable evidence.
  Transliteration plays no part in the judgment. Anything colliding with two or more companies is handed to manual review.
- A merge also rewrites the flat `asset.studio`, otherwise the next scrape would rebuild the old entity from the projection.
- **After a merge the mark must be re-hung.** Marks are stored on disk named by `logo_key(canonical_name)`, and the square mark of the discarded side is claimed by no one from the moment of the merge,
  while the kept side's prime slot, left empty, falls back to the filler wordmark.
  `merge_studio_name_variants.py --logo-root` relocates per the review sheet: for whichever variants the kept side lacks it fills them in, and what it already has is not touched by a single byte; `.ct` and
  `.provenance.json` travel with the image (without `.ct`, `/logo` can't answer the Content-Type).

### Finding Official Sites

Studio official sites and social links are registered separately. `find_studio_socials.py --db <ledger> --output <scan sheet>
--review-output <link review sheet>` reads only existing official sites, and checks studios together with those that already have social links, dedups by account case, and lists missing items.
The review sheet keeps the source URL, page SHA-256, anchor text and context; after ownership is confirmed it is handed to `install_entity_links.py` for installation.
All accounts on an official site cannot be automatically attributed to the studio: mall customer service, performers and the company's other studios each have their own ownership. On the S-Cute official site
`SCute_av` is marked as S-Cute official, and `_scute` as the official account of its directly operated successor service nanairo, whose link label keeps nanairo.
Collection recognizes only account-homepage anchors; posts, share buttons and script strings do not count. The age gate's text, image alt and inter-text whitespace all take part in the judgment,
only affirmative entries on the same site are followed; HTTP failures and cross-domain redirects are recorded as not obtained. Progress is saved as each site completes, `--resume` reuses rows with account evidence,
and empty results and failures are rechecked; collection itself does not write the ledger.

- Search for official sites and X accounts with the Japanese name, not the romanization: open
  `html.duckduckgo.com/html/?kl=jp-jp&q=<Japanese name> AVメーカー 公式` in the built-in browser. Google pops up a bot check, which is not bypassed; the built-in WebSearch
  returns only US-filtered results, and searching by code or romanization yields only irrelevant results.
- AV studio official sites generally show an age-confirmation page first, and without getting through it you get only a ~10 KB empty shell. The criterion must be the anchor text and not the URL: the negative link points
  off-site (the 「いいえ」 of `dasdas.jp` and `muku.tv` both point to dmm.com), while the affirmative link 「はい（入室する）」 points on-site, and the hrefs of the two
  look no different. See the implementation in `scripts/find_studio_socials.py`; `test_age_gate_is_crossed_by_the_affirmative_link_only` guards this line.

`scripts/harvest_studio_sites.py` guesses domains from studio names to find official sites. Every rejection criterion must be able to state a counterexample, and also guard against hurting real sites:

- Block parked pages (`kawaii.com - domain for sale`: the keyword is far down in the body yet written in the title).
- Block pages that declare themselves unavailable (return 200, the body has all the adult words, and the title is only `Site Unavailable`). The alternative path of "domain derived from studio name + is an adult site" would
  confirm them as official sites, so `BROKEN_TITLE` must block after the parked-page criterion.
- Block generic sites whose title merely echoes the domain (`prestige.com`'s title is just `prestige.com`, and the real site is `prestige-av.com`). The criterion is "the title prints the domain verbatim
  and says nothing besides the domain"; one cannot compare the normalised title against the normalised host, otherwise real sites like `NATURAL HIGH（ナチュラルハイ）`
  would inevitably be judged as echoes.
- Before judging "no official site", first tell whether it is the site's answer or a network blip. `probe` retries only transport-layer exceptions, by the convention of `page_cache.Site`
  (`retries=2, backoff=2.0`); an HTTP status code is the site's answer and is not retried. A row marked `未取得` (not obtained) has each attempt's verdict concatenated in order into an evidence chain written into `note`.
- Studios with no Latin letters in the name (`一本道`, `カリビアンコム` ...) take part in comparison through kanji and kana themselves: `normalise` keeps kanji, hiragana, katakana and
  the long-vowel mark `ー`; `・` (U+30FB) is a separator, stripped like full-width parentheses and `【】`. The domain of such studios cannot be derived, and `--seeds` is the only entry.
- `entity_alias` also takes part in the "page self-declares the studio name" check: the canonical name of `东京热` is Simplified, the page writes 「東京熱」, and the ledger has had that alias all along. Comparing against aliases does not
  loosen the criterion. The verdict reads "matched alias 'X'" and not "page writes 'X'", because after normalise it is no longer the page's original text.
- Adult-context words include 「アダルト動画」 and 「無修正」 written by uncensored sites. Non-adult sites with the same name (Hunter Engineering, Bazooka, Madonna) never contain these two words.
- **Information not on the page can only be confirmed by hand.** The official site of `SOD Create` is the parent company's site `www.sod.co.jp`, and this string appears nowhere on the whole site; loosening the generic criterion to catch it
  would let `hunter.com`, `bazooka.com` and `madonna.com` in as well. So it goes through `studio_sites.CONFIRMED_SITES`: one studio per row, stating the address,
  the date of manual confirmation and the reason. It replaces only the last check, "the page must self-declare the studio name"; the four checks for status code, empty shell, parked page/self-declared unavailable, and domain echo still apply; confirmed
  addresses rank ahead of all derived candidates.
- A studio the ledger records in romanization but the site uses only in Japanese goes in no `CONFIRMED_SITES`: that is a wrong name in the ledger, and after changing it to the Japanese name the page's self-declaration will match (`えむっ娘ラボ`).
  The allowlist keeps only information absent from the page such as "which company the studio belongs to"; if there is an alias, go through `aliases`.
- Studios with few works still appear in the prime slot of the studio page. `--min-assets` is only the threshold for a full scan; targeted fills go through `--only <canonical_name>...`, where naming ignores
  the work count, and a name that doesn't match fails outright and is not silently skipped.

### Social Account Avatars as Logos

The source of AV studio logos is the studio's own social account avatar: social avatars are naturally square and published by the brand itself.

1. Evidence order: handle → `unavatar.io` resolves the platform CDN's real address → download from the CDN → measure. unavatar is used only to resolve the address, and provenance
   records both (`scripts/fetch_studio_avatar_candidates.py`).
2. Candidates use a content-addressed cache, SHA-256, a same-studio perceptual hash and a cross-studio exact-duplicate gate. A scaled or re-encoded same image is recorded as unchanged, and only a true upstream visual change
   re-enters `/review`. No handle, no image, unchanged and duplicate are written only to the health report and do not occupy the manual queue.

- Being resolvable does not mean it's the right brand: `@bazooka` does exist and yields a 400×400 avatar, but it is a generic account registered in 2007 and not this AV studio.
  So handles must be confirmed with evidence one by one, and the script doesn't guess by default; the output of `--guess-handles` is always marked `needs_confirmation`, never adopted automatically, and left blank
  if nothing is found.
- The r18.dev detail JSON has only `maker.name`/`label.name` and work covers, with no logo asset.
- **The size suffix on `pbs.twimg.com` is not evidence that "it's this big".** The suffix-less one is the uploaded original (the largest tier); a suffixed address returns the original when the original is smaller:
  for `セレブの友`, both `_400x400` and the suffix-less are 242×242, while unavatar gives `_200x200` (8068 B vs 12302 B).
  So always start from the suffix-less original and step down per the tiers of `peach.social_links.twimg_tiers` (some old avatars survive only as thumbnails), with `resolved_url` recording the tier actually
  obtained, and image fetching counts as failed only when all tiers are missing. Studio logos (`fetch_studio_avatar_candidates.py`) and performer social avatars
  (`harvest_social_avatars.py`) share this one criterion.

### Directory Sources

The studio directories of distribution platforms and publishers themselves are the breadth source for official wordmarks. Entries are registered in `harvest_maker_directories.DIRECTORIES`.
**Store the directory entry, not image addresses**: image addresses often carry timestamps and change whenever the studio changes its mark, and a rerun fetches the current one.

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
