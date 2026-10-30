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

来源失败的问题记录保留阶段、规范番号、来源与脱敏异常链，完整问题日志和刮削诊断导出共用这些证据。界面仍显示简短失败原因；来源未取得不写成正常无结果，也不缓存成已经确认没有封面。模型加载等本地处理故障与来源登录、网络冷却分别定位。HTTP 客户端被拒绝后转用浏览器前，仍检查当前馆藏任务的暂停和停止意图；此控制不接管其他独立任务。

「同步媒体库」与 `scripts/scrape_codes.py` 共用正式来源链。来源设为「直连」时使用直连客户端；设为跟随 Peach 代理时，使用配置页保存的直连、自定义代理或跟随环境设置。在线封面使用同一来源传输，amane 桥把代理及逐站直连设置传给子进程。浏览器取页也遵循显式直连和自定义代理；代理地址带用户名时退回 HTTP 客户端。

默认外网 HTTP 请求共用「Peach 代理」，覆盖发现页与作品详情资料、关注媒体、封面与头像、字幕搜索、PikPak API、更新检查与下载、模型下载和远程诊断。独立采集、链接检查、参考资料与发行下载脚本也复用这份设置。来源显式选择「直接连接」、自定义元数据的独立连接策略和注入的传输继续优先。
`tests/test_outbound_proxy_policy.py` 扫描 `src/peach` 的每个客户端构造：要么展开 Peach 代理设置，要么写明 `trust_env=False`（回环、局域网服务与注入的传输）；裸 `urlopen`、不带 `ProxyHandler` 的 `build_opener` 和裸名导入的客户端一律拒收。`trust_env=False` 指向的是不是本机或局域网，扫描器判断不了，由评审核对。

连不上外网时，每个页面顶部出现一条横幅，指向「网络与访问 → Peach 代理」。判定来自服务端：有页面读取 `/api/network-status` 后，后台按 Peach 代理设置访问 `www.msftconnecttest.com` 与 `captive.apple.com` 两个系统联网检测地址，任一个返回预期正文就算联网；正常十分钟、断网时一分钟复查一次，保存代理设置后立即重探。

跟随环境时，HTTP 客户端读取进程代理环境变量，浏览器使用系统代理；两者不保证采用相同出口。应用直连不能排除操作系统 TUN。设置对新建客户端生效，已经运行的任务或长连接沿用创建时的设置。浏览器直接加载的外站图片与用户打开的外链由浏览器自身网络设置决定。

本机健康检查、浏览器控制接口、writer 镜像、用户自配 Torznab 索引器和 CloudDrive 挂载连接使用各自的网络边界。CloudDrive 的 API／数据代理仍在媒体库设置中管理；Git、glab、rclone、cloudflared 与构建工具的联网由各工具配置负责。可独立构建的 FFmpeg 对应源码归档不包含 Peach 应用，归档内下载脚本使用系统环境代理。

Probing, the 3x3 grid, the timeline and playback of cloud-drive media read video data; the network connection of a mounted path is the job of the CloudDrive2 or OpenList mount tool. Peach's directory "media read policy" limits background reads and the confirmation boundary, and does not modify the mount tool's proxy. Fetching work text and covers online uses the source settings above, configured separately from the cloud drive that holds the video.

## Iwara 视频作者订阅

在关注管理粘贴 Iwara 作者主页或作者的视频列表链接，或用 `provider=iwara` 与作者用户名登记来源。订阅按发布时间读取作者视频，支持检查更新和抓取更早内容；图片、播放列表和全站视频列表不属于这个来源。条目保留标题、作者、时间、标签、时长和封面；使用外部播放器的条目提示打开来源页面。

通用标签词表与筛选仅接纳 Iwara 明确标为 `general` 的标签。`category`、`source`、未知及未提供类型的标签保留来源原词；分类对应关系未确认时不推断为题材。

公开作者视频无需登录。有访问限制的视频须由具备访问权的账号提供有效 `access_token`，在「来源与订阅」设置中填写。令牌只保存在本机凭据文件，不进账本或同步；失效时重新登录并按设置页说明复制。Peach 不求解浏览器验证。播放时按需解析短效视频地址，默认选择最高分辨率，可切换来源提供的清晰度；私有或已删除视频、接口结构变化与限流会显示具体失败。没有更早内容是正常的历史终点。

## 采集判据

Collection results must keep the data source and the basis for the judgment. Data that code rules can determine and that can be withdrawn in bulk by source is saved under the existing rules; LLM output, source conflicts and multiple possible outcomes are kept as pending-confirmation data. A site name alone is never enough to judge data correct.

- A collection script that needs human confirmation outputs a pending-confirmation CSV, and the user's confirmation result is saved as a file that can be read again. Writing `entity.canonical_name`, `asset.studio`, `entity_link` or avatar files must follow `peach-ledger-write`; pending-confirmation data cannot be treated directly as a result the user has confirmed.
- javdb, laoshi, jae and R18 are references only, each with its own credibility. A name on a profile page may have been altered by a repost channel.
- A fact given by two unrelated sources is the strongest evidence. A fact stated by only one source is always a candidate.
- When two sides conflict, do not rank by site name; see whether the fact can be corroborated by yet another source. The same applies to the side already in the ledger:
  it too was once just one source's single judgment.

Example: to judge whether an X account is the person's own official account, follower count is the first filter, and a clearly low count should raise suspicion. Two opposite cases have actually occurred:
in one the ledger's existing account pair was right and javdb's was wrong; in the other javdb's account was live and the ledger's existing one was already suspected dead. So a conflict cannot be settled with a blanket
"the ledger wins" or "the new source wins".

### 人工资料与身份边界

修改资料编辑、候选采用或来源刷新时，分别说明来源事实、人工值和最终展示值的归属。人工采用不删除来源证据；来源刷新不能覆盖受保护字段，继续复用现有字段所有权与复核机制。

清空字段、解除人工保护和恢复来源值分别定义。恢复需要可追溯的来源值，没有相应证据时不能用空值或猜测伪造恢复成功。显示名称或头像编辑、影片归属调整、人物/作品身份合并是不同操作，不通过改显示值暗中改变身份或关联。

## Seesaa Wiki 作品证据

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

- 上一趟存下的原始快照（`<Peach 数据目录>/sources/library-metadata/<番号>-<来源>.json`）还新鲜就直接用，不发请求。
  有效期与「说过没有」的记忆同为 7 天，两边同时到期，才不会出现「没有」已过期而「有」还压着旧值。
  错误提示里的「立即重试」只补未完成项，要的就是新答复，强制重问。
- 「说过没有」按站记（`state/library-metadata-misses.json`，`library_processing._MissCache`）：一档里说过没有
  的站摘掉，全档都说过才整档跳过。文件记着每站第一次出现的时刻；「封面没有」那条的链上有一站晚于它接入，
  这条就不作数。有码番号的记忆不会因为 FC2 链上接了新站而作废。
- 只有待批候选的字段照样算缺：免复核要两家一致，只有一家给过的字段正该再问下一家。已经给过这一行候选的
  来源不再问（`_answered_sources`），每家对一行最多问出一次候选；链上每站都给过候选或说过没有之后，这一行
  在读盘之前就跳过。依据：2026-09-25 有 410 条 FC2 演员候选待批，把待批候选当成已有着落的话，它们会把
  FC2PPV-DB 整个挡在门外。
- 封面那一步接着用资料那一步的快照：r18.dev 快照里的作品 JSON 直接给出原图地址，社区那几家的快照直接交给
  图源印证；手上有一张候选宽到 700 就不再问 r18.dev 与 MGS（`best_cover` 的 `sites_when_needed`）。r18.dev
  不在这个番号的链上时，封面那一步也不问它。
- 浏览器来源（FC2PPV-DB、JAVten）一条请求给 45 秒，不按剩余预算往下裁。第一次弹验证窗口时等人点的那段
  时间记进 `LibraryMetadataProvider.excused`，不算进这部片的动作预算（ADR-0065 第二条）。

### Manually Replacing a Chain

A user can replace the whole chain of one type: `process_library(route_overrides='censored=r18dev,javdb')`. The text form is
`type=source,source`, with multiple entries separated by semicolons; a mapping of the same shape is also accepted.

- Replacement is wholesale, not item-by-item merging. Item-by-item merging would become "cannot remove a site": to drop javdb you would first have to know the built-in table contains it.
- A misspelled type or source name raises an error directly. Silently ignoring it shows up as "the setting changed but nothing happened", which is far harder to trace than an error.

The trade-offs of the source chains drew on amane's `docs/dev/content-routes.md`, and the evidence is registered in `docs/reference-sources.json` under
`amane-content-routes`.

### Sites Reached via the amane Bridge

有些站不是 Peach 自己的解析器，由 amane 经 `tools/amane-bridge/` 的子进程回答（ADR-0043）。桥的 venv 在
「来源和凭证」页那张卡上重建，钉住的版本只由人改。venv 里读到 amane 的包元数据才算已安装，重建中途失败留下的
半截环境照旧显示未安装。Docker 部署见 [Docker 部署](DOCKER.md#amane-刮削站点)。

桥的标准输出与错误输出固定为 UTF-8，源码运行和独立制品使用相同协议。主程序严格解码；编码不符时记录 `bridge_stdio_decode`、番号、来源、运行方式、字节位置与 SHA-256，不把替换字符当成正常资料。来源快照中的 `collection_diagnostics` 随诊断包与刮削记录导出，包含编码和采集器版本，不包含代理凭据或响应正文。

升级补修会定向失效包含 `�` 的来源文字快照，保留原文件供诊断，并安排受影响影片重新采集；已有旧补修回执或已完成断点不会挡住新规则。正常缓存和人工资料保留，付费或需下载的来源仍等待显式处理。已入库文字沿用升级补修与人工复核，不通过删字或猜测编码还原。

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

- 作品地址里夹着站内文章号和标题（`/926949-FC2-PPV-4137487-…-pn.html`），拼不出来，所以先问
  `/search?q=<番号>` 再取作品页。商品号按数字边界比，`4137487` 不能命中 `41374870`。
- 搜索结果只有标题和一张缩略图，标签、发行日、时长和封面位只在作品页，所以这一跳省不得。
- 这一档给标题、封面，以及转存者在正文资料里填了的标签、発行日与时长。填不填由转存者决定，抽查多数整块空着。
  卖家、商品说明和演员栏站上没有；正文余下几段是转载来的网盘链接，一概不取。
- 同一个商品站上常有好几条，由不同转存者各发一次，文章号、番号写法、标题和图都不同，先后没有质量含义。
  搜索命中的每一条都取，第一条那张未必还在。地址里的标题有的已编码、有的是原字，拼之前统一编一遍。
- `robots.txt` 全站放行。
- 封面在 `img.javstore.net` 上，**认位置不认文件名**：`div.fisrst_sc` 里那张排前，schema.org 的 `image` 排后。
  转存者的命名不统一，按名字认的话多数一张都取不到。`_s.jpg` 结尾的排除，那是标着 `Preview` 的多帧长条拼图。
- 文件名不用来认，只用来否：名字里五到七位的独立数字段都不是本番号时，那是别的作品的图，
  `is_cross_product_cover` 按这条拦。
- 那里存的 GIF 多是预览动画。官方档的 `best_cover` 与社区档的 `picture()` 下完整张后一律不收，卡片封面只要静态图。
- 它的封面通常比官方原图差一档，所以排在最后。

### 封面

- 资料那一步答上就停，封面那一步把链问到底。给出地址的那一档常常下不来图：站上标着没有商品图，或者地址
  还在、FC2 存储上那张已经删了。这一层判不出来，要等 `best_cover` 量过才知道，所以封面要的是链上全部图源，
  由它择优；资料那步问过的档不再问第二遍，多问那一档顺带多一批标签（ADR-0030）。
- 官方页、镜像与 JAVten 的封面都指向 `storage*.contents.fc2.com` 上卖家自己传的那个文件，所以按官方图对待，
  不走社区来源的两图源印证（ADR-0030）。JAVten 那两处地址与发行方商品页是同一个文件，下架后可能已删，
  由封面层量过才知道。
- 镜像有时给的是 `contents-thumbnail*.fc2.com/w276/` 包装过的地址，解析器拆掉包装取原件。
- 镜像上没有商品图的条目挂的是它自己那张 `no-image.jpg` 占位件，还是站内相对地址，当封面交下去只会换来
  「来源连接未取得」，所以解析时就判成没有图。

### 演员

- 官方商品页和 JavArchive 都没有演员栏，标题里的名字是卖家写的宣传语。所以官方页答上、这一行还缺演员时，
  接着问 fc2cmadb 和 FC2PPV-DB 要这一栏（`FC2_CAST_SITES`）。
- **fc2cmadb 的女優栏**在浏览器里只对登录用户显示，采集带上「来源和凭证」里配的登录 Cookie；游客补问这一栏
  眼下也回。那一栏是 Inertia 的延迟 prop，首屏 HTML 里没有，要带上这一页自报的握手版本号点名 `actresses`
  单独再问一次。响应里另附一串曾用名，只取正名，否则一位女优摊进演员栏就成了十几个人。
- **FC2PPV-DB 的女优栏**按片中人整理、写日文原名，优先级排在 fc2cmadb 之后、javdb 之前。
- 演员栏上镜像排在 javdb 前面（`metadata_policy.FIELD_SOURCE_PRIORITY`）：javdb 那一侧常是转载站起的称呼
  （英文昵称或中文译名），镜像写的是原名。
- 一家写 `Xちゃん`、另一家写 `X` 算两家一致，按 `X` 自动落库，条件与留痕见 ADR-0086。
- 账本里已有的演员社区来源换不动。两边不一的由 `scripts/fc2_cast_review.py` 列进
  `generated/fc2-cast-candidates.csv`，在复核页「资料字段」里逐条批。
- 评论区那条线走 `scripts/fetch_fc2_metadata.py`，另有等价标记与合集判定。
- 带分段后缀的番号（`FC2-PPV-3312576-1`）认不出商品号，一处都不问：合集封面套给每一段，就是内容各不相同的
  每一段都顶着同一张图。
- freejavbt 不进这条链：它改版后 amane 的解析器认不出作品页，作品页上演员栏写的是「暫無女優資料」。

## 一本道作品资料与封面

无码番号在 r18.dev 上没有；目录站给日期式番号的发行日是转售商的上架日，和番号自己写的日期对不上。
一本道的前端读的就是一份公开 JSON，不用解析 HTML，也不要凭据：
`www.1pondo.tv/dyn/phpauto/movie_details/movie_id/<id>.json`。

- 一次请求给标题、说明、女优（日文与罗马字）、系列、发行日、时长和站内标签。解析器在 `peach.sources.onepondo`。
- 下架的作品直接 404，落到社区来源（javdb 收了一部分）。
- **问不问由本机证据决定。** 一本道与カリビアンコム 都按 `MMDDYY_nnn` 编号，番号本身分不出是谁家的；分隔符是
  压制组的文件名带进来的，不是片商标识。所以只有这一行的路径、文件名或账本厂牌里出现 `1pon`／`一本道` 时
  才问官网，否则照旧走社区来源。依据：本机カリビアンコム 番号在一本道全部 404，一本道番号全部命中。
- 封面只有站点自己那张 16:9 剧照（`str.jpg`，960×540）。无码片商不出封套，`thum_b.jpg` 是 120×197 的列表
  缩略图；两张都不是 JAV 那种竖版封面，取大的那张，按官方图对待。

## javdb、AVBase 与 JavBus 的限流与封禁

这节讲三个社区来源什么时候问、多快问、被封了怎么办。库内采集只在官方渠道落空时按番号问它们；资料与封面的
比对规则见 ADR-0030、ADR-0032。

### 库内采集的节奏

- javdb 的主机间隔由用户定：`library_processing.SOURCE_INTERVALS` 里 `javdb.com` 与 `jdbstatic.com` 都是 3 秒，
  两个主机要一起改。这份间隔由 `SOURCE_LIMITER` 整个进程共用：资料处理、取想要的资料、取新作资料与订阅检查
  同时跑时，问同一主机仍按一条队排。
- **FC2 的商品号在三家里只问 javdb**（`community_catalog.community_sources_for`）。本机来源证据里 AVBase 与 JavBus
  对 FC2 一份都没给过；javdb 能补约一半的演员与发行日，厂牌、标签、封面不给，所以它问得慢却砍不掉。
- 一轮采集的长短约等于 javdb 请求数乘这个间隔（实测相差约一成）。`HostLimiter` 等的是「距上次满 N 秒」，别家的
  往返落在这个窗口里被吸收，所以跳过两家省的是配额和撞 Cloudflare 的次数，不是时间；改成并行也省不出时间。

### 撞上 403 或验证页之后

- javdb、AVBase 与 JavBus 回 403 或验证页就整源停下。AVBase 回的是 Cloudflare 验证页；JavBus 那道 403 的原因
  未取得。
- 停多久按次数翻倍：第一次停 `scraping_access.FIRST_BLOCKED_PAUSE`（15 分钟），连着再撞才翻倍，上限是
  `SOURCES` 里的 `blocked_pause`（javdb 24 小时，AVBase 与 JavBus 6 小时）。通了一趟就清掉记录，重新起算。
- **上限不能当首停时长。** 实际封期常常短得多：javdb 记下 24 小时冷却的那次，不到 7 小时就全回 200，而那一轮
  的失败全部写着「来源正在冷却」。
- 只剩状态码可看的 403 不当登录墙报：它可能是凭据失效，也可能是出口 IP 被封（javdb 那次封了 3～7 日，换 Cookie 没用）。
  `metadata.auth_wall_reason` 的措辞因此只说两种可能，不劝人换凭据；带着登录页地址或正文的才直说换凭据。
- 冷却期抛的是 `SourcePaused` 而不是 `NotFound`，所以「7 天内不再问」的记忆（`library-metadata-misses.json`）
  一条都不记，下一轮从头再问同样这批。
- 问题清单把这类项记成「本趟没轮到」（`severity: paused`）。自写来源带 `cooldown_action` 的失败（验证页、
  封禁、地区限制、限流）也归这一档。一档里出错的几家全在冷却才算没轮到；有一家是别的原因，就是「未取得」。

### javdb 的 403 是按出口 IP 计的配额

javdb 判的是「这个出口发得太快」，不是「你是不是机器人」。所以**不给它换 curl_cffi 指纹**。

- 依据：不在冷却期时，HTTPX 与 curl_cffi 的 `chrome136` 指纹、带不带 Cookie 四种组合取搜索页、详情页和资料页
  全部 200，没有挑战页也没有登录页，差别只在界面语言（带 Cookie 回简体，不带回繁体）。指纹识别会在第一次请求就拒；
  而一整轮几百次请求能跑完、打到一定量才被封，是按出口 IP 计配额的形状。
- **未取得**：封期之内两种 transport 的对照。要取得就得先把出口 IP 打进封锁，这一条不做，所以「被封之后换
  指纹能不能立刻通」仍然未知。脚本与原始结果在仓库外的 `<私有验证记录>`；
  对照起因见 [docs/reference-snapshots/amane-crawlers-poc.md](reference-snapshots/amane-crawlers-poc.md)。

**配额和机器人判定是两件事，处理不同。** Cloudflare 与验证墙判的是「你是不是机器人」，绕过它要伪装成另一种
客户端，一律放弃。javdb 这道判的是出口速率，换节点只是换一条线路重新计配额，没有伪装，所以换出口可以。
但配额本身照守：来源下限不许压，撞 403 仍然整个来源收工，不在封禁期里换着节点连打，那等于拿多个出口凑一个
超速批次。

- 脚本允许经环境代理出网：`Site` 的 `via_proxy` 让 HTTPX 读环境代理，不保证读取系统代理或 PAC。应用路由与
  实际出口要分开验证，新用户的配置边界见 ADR-0024。

### 目录采集对 javdb 的限速

`scripts/harvest_directory_links.py` 按名字逐人问 javdb（见「目录型来源与社媒链接」），节奏比库内采集更保守。

- 实际被封过一次：约一秒一页连取一百多页后，整站每条路径都回 403，页面写「基於你的異常行為」并建议换节点，
  出口 IP 被封了 3～7 日。封之前不发 `Retry-After`、不降速、不给验证码，中途停顿几分钟也没换回额度；额度按出口
  IP 累计、不按路径，触发点在每分钟 40～50 页这个量级。
- 所以限速是硬编码的来源下限，不是命令行默认值：`harvest_directory_links.SOURCE_INTERVAL` 给 javdb 定 5.0 秒
  （每分钟 12 页），`--interval` 只能往上加、压不过它。
- **撞上 403／429／503 就整个来源收工。** `Site.request()` 对状态码不重试；封了之后接着翻，只会让每位女优的
  每个名字写法各撞一次 403。`rate_limited()` 命中即 `break`，已取到的页照常进判定，不丢这一轮的成果。
- 已取的页缓存在 `state/directory-links/javdb/`，判定可以离线重放。封禁期过后调大 `--limit` 接着跑，缓存命中
  不花请求，不需要断点参数。

### 封面失败的几种原因与年龄门

- 官方各版本只回「准备中」占位图：作品多半已下架（MIDE-594）。
- 两个图源各有图但 dHash 对不上：「不是同一张图」，不用。
- 社区来源的图只出自一个图源时照样装上，`.scraping.json` 的 `verified_by` 为空即未经印证（IPX-060 只有 javdb）。
- JavBus 有年龄门，番号页不带 Cookie 回答题式年龄验证页；javdb 有登录墙。两家的 Cookie 由用户在浏览器里过门
  或登录后贴进采集设置，公开采集随请求带上。
- JavBus 的共享来源传输发送 `Accept-Language: zh-CN,zh;q=0.9`，连接检查、作品资料和本站封面请求共用这一语言偏好。年龄验证仍由用户在浏览器完成，请求头不代替登录或年龄确认。
- `sources/metadata/javinizer-go/` 下的 JavBus、javdb 旧快照只借厂牌选官方渠道，封面不当官方候选：JavBus 搜不到
  原番号时返回的是别的作品。

## 本机采集入口

这节讲 GUI 与命令行取封面的共用入口，以及它的连接、Cookie 和写入规则。

GUI 与 `scripts/fetch_jav_covers.py` 共用 `peach.jav_cover_fetch`。不需要把开发者的映射文件或 Cookie 复制到
新用户电脑。已有成功的元数据快照优先，缺快照时公开来源可以联网查询。

- **连接方式**：R18、DMM、Prestige、MGStage 的封面 HTTP 路径按来源使用系统代理、应用直连或自定义代理。
  DMM 连接检查分别报告页面与高清 CDN。HTTPX 的环境代理不等于系统 PAC；应用直连也不能排除 TUN。
- **Cookie**：收 Cookie 的来源（JavDB、JavBus、FC2CMADB、Instagram）的粘贴与 Netscape 文件导入复用
  CredentialStore，只保存当前来源域内未过期的项目。保存本身不校验登录会话是否有效。
- **单次任务上限**：GUI 封面任务每次只接受馆藏命中的一个番号，复用 BackgroundJob；最多 80 个请求、32 MiB，
  请求发出前检查 180 秒截止时间。
- **替换规则**：只在完整图与探测尺寸相同、能完整解码且面积更大时原子替换。原始字节不降采样。成功边车记录
  原图与安装摘要，24 小时内摘要匹配就不重复下载。
- **失败与重启**：429 的 Retry-After 冷却写进本机文件，新建的 transport 也遵守；失败不删除已有封面。程序重启
  不自动重放写入任务，未完成的由用户重新发起。
- 即时 r18 厂牌证据与本机快照用同一套来源路由，Prestige 与 MGS 都参加候选比较；原始图片没有派生降采样。

这套连接配置覆盖封面 HTTP 与 FC2 CLI。amane 桥子进程、其他采集脚本与 curl_cffi 连接器各用自己的配置。
Instagram 的独立用户登录会话未取得，自动适配器不进正式依赖。

测试步骤见 [Windows 测试版](TESTING_DESKTOP.md)，架构要求见 [ADR-0024](adr/0024-mark-manifest-not-bundled-bytes.md)。

## 无番号视频的联网识别

`scripts/scrape_codes.py` 只认番号。没有番号的视频（推特、Telegram 来源的资源等）走
`scripts/identify_resources.py` 的两段式流程，识别结果同样进 `/review` 的「资料字段」，确认后才写入数据库中的对应资料项：

1. `worklist` 只读账本，按文件名生成搜索写法：原样名、摘掉推广头尾、分隔符换空格、无空格英文按大小写拆词、
   剥掉尾部画质标签。同时标出同目录的配套图片，可以直接当海报。`metadata_hits` 数出创作者、标题、厂牌、
   系列、演员里已有几项，默认把少的排前面；`--sparse-only` 只留一项都没有的条目，识别优先做这些。
2. 智能体或人联网核对后，按 `asset_id,field,value,source_url,confidence,note` 填回 CSV。
3. `ingest` 合并进 `generated/library-metadata-field-candidates.csv`，候选来源记 `websearch`，`asset_path` 钉住
   具体文件。

- 字段限于 title、original_title、performers、studio、series、release_date。
- 有番号的视频仍走 `scrape_codes.py` 的 JAV 来源。
- 网页搜索在智能体一侧执行，脚本不发请求、不写账本。

## 命名与身份合并

这节讲规范名怎么选、别名怎么登记、同一个人存成两条时怎么合并。

### 规范名与别名

- 规范名优先用有出处的简体中文通行名，暂无可靠中译时保留日文。旧艺名、罗马字、假名和繁体名降为别名。
  `no_avatar` 只表示没取得合格图片，不阻止已核实的姓名落库。
- 「这一页只有一位女优」不构成证据：库里大量番号是 BEST 合集，搜索无结果的页面也会渲染推荐文章。精确回配
  命中优先于任何「唯一」推断，「唯一」要两个番号同证才作数。
- r18.dev 的罗马字字段是「现用名 (曾用名, 曾用名)」这种渲染格式，一个字段装着一个人的几个艺名；假名与汉字
  写法各自成行，罗马字只有这一份。落库时按 `peach.entities.split_composite_person_name` 拆开，签名是「括号前
  有空格、括号内逗号分隔、两侧都是罗马字」。同一个字面形状在账本里还用于厂牌消歧（`AV DEBUT（本物人妻）`）、
  角色出处（`アスナ(SAO)`）、接稿状态和去重后缀，只能靠这条签名收窄。
- `XX XX` 是来源节点文字重复，不是合法别名。person 名进入 CSV、兼容字段或 `upsert_asset_entity` 之前先收敛
  完整重复串；清理时同时审计 `asset.creator`、`演员:` 标签和 `entity_alias`。
- 判断「账本已经有这个名字」要连罗马字一起看，不能用 `peach.entities.name_chain`。那条链按设计剔掉罗马字
  （拿罗马字去日文站查是白跑），拿它当「已有」判据会把 `entity_alias` 里明摆着的 `Rin Natsuki` 再报一遍新别名。
  要全量就直接读 `canonical_name` 加 `entity_alias`。
- 上游名字里的零宽字符在 `canonicalize_entity_name` 一处剥掉，不在各脚本里各修一遍。`str.strip()` 不认它们是
  空白，`normalized_name` 就会带着一个看不见的字符：界面上和普通名字一模一样，`upsert_asset_entity` 却按
  `normalized_name` 找不到已有实体，同一个人存成两条，按名字搜也搜不到。剥 U+200B／U+200C／U+2060／U+FEFF；
  **U+200D 不剥**，emoji 的家庭与职业序列靠它连字，剥掉会把创作者名字里的一个字形拆成两三个。

别名按来源分三类，界面上只有用户自己敲的那一类可撤销（`user:alias`，写入端点 `/api/entity-alias`）：

- 刮削（`r18:performer` 等）和合并（`merge:*`、`avdb-actor-mapping@<rev>`）留下的是这条实体为什么长这样的
  记录，不给一次点击删掉。
- 自由文本保存到别名表；`canonical_name` 是页面显示的人物或厂牌名称，只能从该档案已有的名字中选择
  （`/api/entity-name`）。
- 头像图库按整条名字链逐个查、取并集，所以少一行别名就少一批候选。同一个人常按好几种写法各存一批，命中即停
  会让排在后面那几个名下的图整批出不来。

### 合并实体

- `entity(kind, normalized_name)` 的唯一约束冲突通常不是 bug，而是同一人新旧艺名的信号。合并走
  `peach.entities.merge_entity`：保留作品多的一侧，迁移关系、别名、外部引用、链接和搜索词，旧称全留作别名。
- 被并入的 id 在 `entity_redirect` 留一条墓碑指向保留的一侧，链式合并写入时压平成一跳；关注源、Feed 订阅与
  发现关联随合并改指。按 id 取数的入口（`/entity-image`、换头像、Feed 发现、复核候选）经
  `entities.resolve_entity_id` 先认活实体、再认墓碑；目标实体被删时触发器删掉指向它的墓碑。
- `entity_external_ref` 每个 provider 只留一条，同源的第二条被丢弃并报告，不静默覆盖。
- creator 与 performer 跨类重复不用「作品多的一侧」规则。只有两边非空作品集合完全相同，并且 performer 别名
  精确命中 creator 名、或 creator 名由 performer 本名与账号别名组成时，才自动归并。
- `r18:performer`／`javbus:performer` 是正式发行的出演元数据，保留 performer；通用 `performer` 是压平后的兼容
  断言，保留 creator。合并要同步 `asset.creator` 与 `演员:` 投影，否则已删的实体仍会在详情页伪造链接。
- `merge_entity` 的两个陷阱：sqlite 连接默认 `foreign_keys=OFF`，子表行必须在函数内显式 DELETE；计数用
  `SELECT changes()`，不用连接累计的 `total_changes`。合并不可逆，合并后 `PRAGMA foreign_key_check` 应为 0。

### 女优别名与资料的自动登记

- **补别名后继**（`peach.performer_alias_followup`，ADR-0055）自动登记女优的其他艺名。`source` 是批次号
  `auto:performer-alias@<任务行 id>`，`revert_auto_landing.py --source auto:performer-alias` 整批撤回。判词写进
  `generated/performer-alias-landing.csv`，被别的实体占用的写法只记不写。
  - 只读 minnano-av 资料表的「別名」行，与 av_neme 人物页「プロフィール」一节的名字栏。
  - minnano-av 检索页上同一人的几个别名各占一行，判唯一按编号去重；唯一命中时站点直接跳到资料页，编号看页头
    canonical。
  - av_neme 的系列页、月份页也写「名前(女優名)」，页名等于主名才算人物页。改过名的旧页只剩一句
    「女優名が【甲】から【乙】へ変更」，第一节不是「プロフィール」，不读。
- **有 FC2 作品的女优先问 fc2cmadb 女优栏**（ADR-0061）：从她自己的作品页进到站上那位人物，只收站上主名；
  曾用名串里混着卖家商品名，不收。卖家称呼当规范名的实体（`たぬき顔サラサラ黒髪ロング`）靠这一站接上真名。
- GirlsDelta（`girlsdelta.com/model/<id>`）有名录与宣传照，但比脸能确认的太少，只当单人佐证链接，不进流水线。
- **补女优资料后继**（`peach.performer_profile_followup`，ADR-0067）把资料写进 `performer_profile`，批次号
  `auto:performer-profile@<任务行 id>`，`revert_auto_landing.py --source auto:performer-profile` 撤回。判词在
  `generated/performer-profile-landing.csv`。
  - minnano-av 资料页 `actress<编号>.html`：表的每格以 `<span>标签</span>` 起头、值到 `</td>`；只读
    `act-profile` 那一块，评论区的同名格子不算。
  - `生年月日` 那格的 `<p>` 里夹着一个多余的 `</td>`，值截到那里正好不带星座后的杂项。
  - `サイズ` 形如 `T156 / B86( Eカップ ) / W58 / H85 / S`，数字就是厘米；末尾那个 `S` 含义未取得，只留原文。
    资料没填的页没有生年月日、血液型、出身地那几行。
  - `ブログ` 那格显示 `http://`、`href` 是 `https://`，取 `href`。站内头像 `/p_actress_125_125/` 只有 125×125。
  - avwikidb.com 直连 httpx 带 Chrome UA 就回整页（登记在 `scraping_access.SOURCES`，拒绝访问停 6 小时）。作品页
    `/work/<番号>/` 头里的 JSON-LD `Movie.actor` 每项给 `name`、罗马字 `alternateName` 与 `/actor/<编号>/`，编号
    从这里取。女优页 JSON-LD `Person.alternateName` 前两项是读音与罗马字，后面混着站上归并的其他名义（含男优
    名），不收。三围只在正文「身長・スリーサイズ」一格（`T148 B83(B) W55 H85`）。女优图是 DMM `actjpgs` 的
    125×125，不作头像；站内搜索是 `⌘K` 弹层，地址形态未取得。
  - 出生日期与身高和 minnano-av 不一致时，只记进外部编号的 `metadata_json.conflicts`。

## 番号目录、创作者与水印

这节讲怎样从文件名和目录里认出番号、怎样确认来源返回的是同一部片，以及谁算创作者。

### 从文件名提取番号

- 番号目录被投影成创作者时，判据只能是文件级证据，不能看名字形态：唯一可靠的区分是目录内媒体文件名是否
  解析出同一个番号（`scripts/audit_code_creators.py`），存疑一律留复核 CSV。
- 番号只补给目录里的视频。发行目录里还混着论坛文宣、下载器广告和封面图（`Tokyo-Hot n0780-HD` 里有两张）。
  番号写到它们头上有两个后果：库里它们冒充这部片的文件；垃圾复核又因为「自己带真番号」判定目录证据不成立，
  把它们挡在队列外。写入走 `field_owners` 署名 `script:code-creators`，用户改过的格子不再被覆盖。
- 发行目录里的推广短片由 `scripts/find_ads.py` 按五条判据记分、只出 CSV 交人处置；javm 的 `find_ad_videos` 按关键词识别，可作对照（ADR-0092）。
- 画质前缀（`HD`／`FHD`／`4K`／`1080P`）和版本后缀（`-C`／`-CH`／`-UC`／`-SUB`）不是番号的一部分，提取器先剥
  这两层再匹配。界面把版本语义投影成「中字」「无码」「无码破解」，原始 `name`／`code` 留给文件操作。缺连字符
  的紧凑 code 只有同时具备片商、发行日或 performer／studio／series 实体证据才恢复。
- 推广域名会出现在番号的头、尾和方括号里（`www.98t.la@ABW-358-U`、`ABP-762-fuckbe.com`、`[xxx.cc]ABC-123`）。
  番号提取与目录判重共用 `strip_promo_markers` 这一层；各剥一半，叠了两层的 `[98t.tv][98t.tv]ABW-251` 就会在
  其中一处漏网。
- 只说明「这是什么文件」的词（`IMG`、`VID`、`VIDEO`、`NO`、`PART`）与番号主体同形，集中在
  `catalog_rules.CODE_BODY_STOPWORDS`；画质词归 `_QUALITY_HEAD`，转载站标识归 `REPOST_SITE_LABELS`。三份名单
  各管一类，提取时依次过一遍。新增条目先用本机临时工具 `build/parse_shapes_audit.py`（不随仓库分发）的
  `stems` 核对误判证据。创作者昵称也可能撞这个形态，逐个塞进名单只会得到
  一张不收敛的表。

### 日期式、Tokyo-Hot 与西片的编号

- 素人系日期式番号（`MMDDYY_NNN`／`MMDDYY-NNN`）的分隔符是片商标识，属于身份：一本道、パコパコママ、
  カリビアンコムPR 用 `_`，カリビアンコム 用 `-`，同一天同一序号是两部不同影片。JavDB 自己也分开保存（仓库外
  `<私有验证记录>`：搜 `092415-001`，首位返回的是一本道的 `092415_001`）。
- 所以 `catalog_rules` 的归一化、身份比对和查询变体一律原样保留分隔符，也不生成另一种写法的变体：用错分隔符
  搜到的是别的片。只有来源给出不带分隔符的纯数字串时两种才都算命中，缺一个字符不是反证。
- 野生文件名的写法会漂移（同一部一本道既有 `1pon-092415-001-fhd1`，也有 `1pondo-092415_001-FHD`），所以剥番号
  显示标题时两种分隔符都放行，落进 `code` 的值保留文件名给出的那一个。
- 日期式番号的六位是 `MMDDYY`，月日必须成立才算这一形态。只看位数的话，手机录像
  `VID_20220818_125735_816.mp4` 里的 `125735_816`（12 月 57 日）就成了一条一本道番号。
- Tokyo-Hot 的编号没有厂牌字母段，规范写法是小写：本编 `n1234`／`k1234` 补零到四位，Red Hot 支线写成
  `red-123`。javbus 的作品页地址就是 `/n1234`，参考实现 NeoAVDC（MIT）的 `TOKYOHOT_NUM_RE` 同样输出小写
  `n####`。`k` 与 `red` 两支在本机账本里一条没有，它们在 javdb／javbus 上的写法**未取得**实证。编号只有一个字母，
  形态挡不住 `no0037_01` 这类名字，所以只在两个位置认它：名字开头，或名字里已经写着 `tokyo-hot`。
- 西片按「厂牌／系列 + 发行日」命名（`DorcelClub.24.12.02.Christy.White.XXX.1080p`），这是身份不是番号：
  `catalog_rules.western_release_identity` 给出 `DORCELCLUB.2024-12-02`，`release_identity` 认它，番号提取一律
  返回空。两位年份按 70 分界展开，四位年份照原样。只在 token 开头认，不在 token 中段搜：账本里的
  `E078. Redhead.Sucking.Big.Cock.And.Hard.Sex.2019.10.15` 中段搜会得到系列名 `Sex`。

### 确认来源返回的是同一部片

- JavDB 的相同番号可能对应多个来源 ID，不能靠番号、时长或搜索顺序认作同一作品。网页与匿名 API 都先汇总匹配的来源 ID；只有一个才取详情，多个时报告歧义。详情、图片及资源沿用这次确认的来源 ID，不在取资源时重新按番号选片。旧的番号缓存、发现边车和原始快照须通过来源专属规则才可复用。
- JavDB 的 `origin-title` / `origin_title` 是原标题，`current-title` 是本地化显示标题。有原题时优先原题，显示标题独立留证；缺原题时保留显示标题，不凭文字语言猜测或删改星号片段。
- 升级补修通过独立的文字规则回执定向失效旧 JavDB 库内快照，并选择对应影片重新取证；原 JSON、人工字段、既有取消和延期记录保留。旧 JavDB 候选不参与自动采纳，当前候选随来源身份和规则版本进入既有复核流程，不清空其他来源正常证据。
- 来源返回的番号必须和查询的番号比对过才算命中。javbus 一侧是拿番号做关键词搜索取首个结果，搜不到就返回
  近似的别人（`SA-104 → AVSA-104`、`AR-301 → STAR-3016`）。不比对时大部分匹配番号根本不对，整个 MIB 目录
  （韩国内容）曾因此被写上日本厂牌、系列和标题，还靠这些假证据升级成 JAV。
- 判据是 `catalog_rules.same_release_code()`。它只归一已核验的前缀别名、DMM 的 `h_` 标记、补零和重制尾字母
  这些良性差异；来源没给 id 的不拦（缺证据不是反证）。复核队列按同一条判据剔候选（ADR-0035）：候选全被剔掉
  的行整行不进队列，点了也写不进去的东西摆在那儿只是要人再认一遍。
- javbus 是备选来源（`metadata_policy.FALLBACK_SOURCES`）：同一个字段上还有别家可用时，它的取值不当证据；只有
  它一家时才轮到它。这一步排在番号日期判据之后。剔完之后来源全是官方的字段，自动写入可以替换账本已有的值，
  规则名记 `adr-0035-official-replaces-*`；community 来源仍然只补空（ADR-0035）。
- 韩国 MIB 的编号（`catalog_rules.KOREAN_MIB_PREFIXES`）资料与封面都不问 JAV 来源。`HA-101`、`MY-102` 撞上番号
  完全相同的日本作品，番号核验照样通过，只能按编号前缀整体不问。刮削、扫描与采集、页面取封面、封面批次和
  按日志恢复五个入口都按 `is_korean_mib_code()` 拦。封面的跨作品判据同时比字母段和数字段：`YUJ-101 → yuj00011`、
  `435MFC-135 → h_1711mfcc00027` 字母对上、数字不对，都是别的片。
- `catalog_rules.code_query_variants()` 只扩展搜索词，每次返回都以账本原始编号校验，缓存和网络结果同样受检。

前缀等价表与查询表是两张表：

- 已核验的 LUXU、BAZX、HA 与 9 个 MGStage 前缀（`_RELEASE_PREFIX_ALIASES`）可以归一，其他数字前缀保留。
- 登记一行要逐组取证：MGStage 商品页对 r18dev 快照比标题、时长、出演与封面；avbase 把两店条目归为同一作品；
  账本里该字母段只挂一个厂牌。
- MGStage 官方商品详情路径里的完整编号可以佐证它省略前缀的展示 id；封面、标题和搜索 URL 不作身份依据。
- DMM／r18dev 只给 `content_id` 时，其中的厂牌段可以用来核对裸番号，但不能抹掉查询里的 MGStage 前缀。
- `390JAC-040` 是 MGStage 配信，`JAC-040`／DMM `118jac040` 是另一部 DVD 合集，JNT 同样不得按裸编号合并。
- 无法证实的变体返回 `identity_mismatch`，保留原始快照，但不生成字段候选。

### 谁是创作者

- 创作者是频道主，不是出镜者。文件名里可以建创作者的只有 `RT_@X - 正文…`、明确标注的 `女主@X` 和正文里的
  中文名；末尾成串的裸 `@A @B @C` 是互推，`📷：@X` 是摄影师，都不建。
- **发行平台既不是厂牌也不是创作者。** FC2、myfans 这类是卖东西的地方，站上有实际卖主（出品者）的那个账号才是
  creator。平台本身只能当来源／平台实体，链接按 `catalog` 登记，不给它找「厂牌官网」：
  `studio_sites.PLATFORM_ENTITIES` 直接判「不适用（发行平台）」，一个请求都不发，也不静默跳过。
- 账本里有些 FC2 作品标着女优、有些评论里提到人，那是 **performer** 身份，不能顺手把平台记成创作者。一旦记了，
  这个平台下所有卖主的作品都会挂到同一个「创作者」名下，和给聚合目录打统一标签是同一类事故。
- 转载渠道水印不是创作者水印，目录名也可能是伪装。判定优先级：画面水印 > 作品名联网反查 > 文件名文本。
- 打创作者级标签之前，先按 ledger 路径的下级目录分布确认这个 creator 不是聚合目录。给聚合目录打统一风格标签
  就是 `asce` 事故的重演。
- **轮换出演者的发行命名是厂牌或系列。** 同一发行名称可能按编号轮换出演者，不能仅凭目录名认作个人账号。`classification.numbered_cast_shape` 认三种命名
  （前缀+编号+人名、出演者组合-编号-标题、驼峰人名连写加编号），同一账号下至少 3 部、过半文件命中、出演者至少
  3 位才报；前缀形态的人名须有 3 位是账本已有的出演者，同一人出现在八成以上命中文件里的是个人或情侣账号。
  归属审计把它报成 `label_shape`，只进复核，不生成修复计划。
- **身份调研先按页名查日本资料站。** 通用搜索不收 sougouwiki、av_neme 这类站，只搜通用引擎得出的「未取得」
  不算查过。`research_creator_identity_wikis.py` 只读账本，对身份待核验的创作者按规范名、去掉番号前缀的名字和
  文件名前缀，用 EUC-JP 页名直取两站（取页层是补别名后继的 `WikiSitePages`，页缓存、404 记忆与来源冷却与服务共用）。
  同名页是 3 位以上出演者的作品一览就记 `identity=release` 的 observed 并否掉 `unknown`；都不存在时 unknown 候选写明
  问过哪几页；没有页以外的取页失败是未取得，不进清单。清单交 `apply_entity_identity_research.py` 冻结预览、备份写入。
  处理任务结束时「查创作者身份」后继按同一判据自动问新登记和存量的创作者，命中直接落批次来源的 observed（ADR-0098）。
  改实体类型仍是用户复核。裏DVD村（uradvd-mura.com）是带会员登录的 DVD／下载商店，没有按页名寻址的系列页，
  未接入，只作人工查证线索。

## 女优名字与头像来源

这节讲头像从哪里取、怎么挑、怎么换，以及各个女优资料站能给什么。

### 取源方向与尺寸门槛

- 头像去精心整理的图库取；Logo 反过来只认品牌自己，官网与厂牌自有社交账号才是权威来源。
- 候选按实测像素判定（`peach.images.classify`）：短边 < 128 拒绝；头像另按长边 ≥ 500、短边 ≥ 300 判，竖构图
  人像套用方图门槛会拒掉最好的来源。只有 URL、没有实测尺寸的不算候选。
- **「长边 ≥ 500」是源头门槛，不是显示门槛。** 它拦的是缩略图级来源。拿它当显示门槛，会把一张脸宽 208px 的
  382×382 挡在门外，让在位那张脸只有 55px 的封面裁片继续占着位子。显示侧的尺寸约定见 [docs/FRONTEND.md](FRONTEND.md)。
- 可用来源：r18.dev、av-wiki.net、Gfriends。javlibrary、missav、xslist 被 Cloudflare 拦，njav 有验证墙，jav321 没有
  独立的女优字段。被 Cloudflare 拦的站一律放弃，不绕过机器人检测。javdb.com 抓得到，但按出口 IP 限速，见
  「javdb、AVBase 与 JavBus 的限流与封禁」。
- Gfriends 只按 `Filetree.json` 和单张 raw 媒体当外部 Provider 用，不克隆图库，不把图片放进 Git。索引缓存按
  mtime 计龄（一天），取不到新索引就用旧缓存并在输出里告警；那一轮的「未收录」记 error 不记 no_match，否则
  `--resume` 会把一次网络失败固化成永久答案。Gfriends 每人中位 1 张、缓存图中位 500×600，不按作品分组。
- 服务进程在头像框打开时检查索引缓存：缺失或过期就在后台取一份（`avatar_picker.IndexRefresher`），出网走采集
  统一出口与 Peach 代理设置。这一次照旧按旧缓存列候选；取不到只记日志、15 分钟内不再试，不进任务中心。
  索引不随安装包分发：上游每天更新，带快照会让快照之后收录的人一直显示查不到。

### 审计与补缺口

- `audit_performer_portraits.py` 把合格图放进候选专用的内容寻址缓存，每条另存 provider、名字命中档、上游
  ID/URL、尺寸、MIME、SHA-256 与 policy version。与当前头像字节相同的只留审计证据，不进 `/review`。这个脚本
  没有写 ledger 的路径。
- `fill_portrait_gaps.py` 走完从缺口到装上的这一段：没装过头像的人里，名字链在图库只命中一张的直接装上；
  命中好几张的一张都不装，改产一份对照表（`--sheet`），候选图并排摆着，旁边是她在这个库里的作品链接。装图
  复用挑图弹层那三步（`avatar_picker.choices`／`resolve`／`install`），证据、缓存与取景 sidecar 的口径和手工换图
  完全一致。默认 dry-run，`--apply` 才写头像文件；账本按只读打开，这一趟不写 ledger。
- **图库按名字存图，同名的是不同的人。** `ななみ` 这种单名命中的二十多张是二十多个人，自动挑等于随机给她安一张
  别人的脸，所以「只找出一张」是唯一敢自动装的判据。单名即使只命中一张，证据也只有「键完全相同」这一条，
  装上后仍要在资料页上认一眼；对着作品认人这件事机器做不了。
- **缺口的判据是「盘上没有 `performer-<id>.img`」，所以一张差图会把更好的源永久挡在门外。** 例：社媒采集把作品
  封面裁片装进了一批空槽位，这些人从此不算缺口，而 Gfriends 里有其中一部分的高清正脸照。缺口审计答不了
  「在位那张够不够好」，换源要另起一轮普查：按 provenance 的 `provider` 认出封面
  裁片，按 sidecar 认出检不出脸、脸太小、源图太小，再逐个问一次图库。

### 挑图：按脸的宽度，不按画布

头像最终落在 64–160 px 的圆框里，认不认得出是谁取决于那张脸有多少像素，与整张图多大无关。

- 判据在 `harvest_social_avatars.rank_key`，脸宽由 `peach.face_detect` 的 YuNet 量（同 SHA 只量一次），写进候选
  CSV 的 `face_width` 列供复核的人直接看。
- 反例：一张全身站姿照画布更大，脸却只有几十像素；同一个人的半身照画布小一些，脸宽大一倍多。按画布挑，赢的是
  看不清脸的那张。合照里那张脸同样可能远小于单人照。
- 检不出脸记 0，排在任何量得到的候选之后；检不出脸的一律不装，官方图也一样。整批都是 0（模型缺席、清一色
  侧脸）时按画布排，并在运行统计里说明本轮是按画布挑的。单人作品封面这条退路也用同一把尺：JAV 双联封面
  右半幅剧照里的脸常常只有几十像素。
- 换图只在赢家那张脸更宽时才动手。填不满圆框的赢家，只在在位那张检不出脸时当保底装上。
- **头像目录由几条管线共用，`--apply` 只往好里换。** `--force` 的意思是「已有头像也参加竞选」，它覆盖的却是
  **所有**已装头像，包括别的管线装的；而 `harvest_social_avatars.py` 的候选池（X 头像、名录人像、作品封面）比
  `verified-photo-page` 那类整版人像差一大截，不加判断地覆盖会让多数头像的脸变小。所以写盘前先按同一把
  `rank_key` 量一次盘上那张，脸没有更大就不覆盖，运行统计里报「在位的更好未覆盖」多少张。在位那张的脸宽
  优先读现成的取景 sidecar，没有才真检一遍。
- **换图必须换 sidecar。** 取景 sidecar 与选图判据来自同一次 YuNet 检出（`peach.avatar_face`），装头像时一并写出；
  给不出新记录就把旧的删掉。留着上一张图的脸框，页面会拿它给这一张取景、放大到一个空位置上，而这在界面上与
  「这张图本来就该这么显示」看不出区别。`/review` 的批准落地也检一次脸。`scripts/detect_avatar_faces.py` 只是
  补齐入口，检测与 sidecar 形状都不由它定义。

### 去水印

抓回来的头像带别人的水印（底部那条 `PRIVATE.com`、`TEAMSKEET.COM`），要在字节里去掉，不能靠取景遮住：
导出、换取景规则或任何改用整图的地方都会把它带出来。

1. `scripts/scrub_avatar_watermarks.py` 默认只看不写，产出一份候选 CSV 加一叠左右对照的标注图。
2. 检出器抓不到半透明水印，人工补框是正路：往 `--marks` 的 CSV 里补一行 `file,x,y,w,h`。人工框不受分数、尺寸
   和位置先验约束，那些判据是用来质疑检出器的，不该推翻已经看过图的判断。一个整条边框的人工框常能把几处水印
   一次裁掉。
3. 人确认后再 `--apply`：原图连三个边车整套搬进 `avatars-superseded/`，provenance 补一段 `watermark_scrubbed`，
   取景 sidecar 按新图重算。

- **能裁边就不 inpaint。** 裁切一个像素都不伪造，inpaint 会，而且常常只抹掉一半、留下半透明的残字。裁切线受
  两条约束：不许切进人脸框加留白（脸框取自 `peach.face_detect`），不许把图裁得只剩 70% 面积以下。逐边独立判定，
  一条边裁不动不影响别的边。
- **一张图检出超过 4 处文字就整张放过，一个像素都不动。** 那不是带水印的头像，是作品封面被当成头像装了进去，
  要的是换源，见上一小节的封面裁片。
- 检出与移除的判据、模型来源和实测数字见 REUSE.md「头像水印检出」。

### 各站能给什么

- **DMM 女优一览页可达，但头像只有 125×125，只适合身份绑定的首次头像。**
  `https://www.dmm.co.jp/mono/dvd/-/actress/=/keyword=<假名行>/` 经 Peach 的 `dmm` 来源设置回完整列表页（带站内
  actress id 与括号里的旧艺名），没有区域拦截；`pics.dmm.co.jp/mono/actjpgs/<罗马字>.jpg` 不带 Referer 也回 200。
  - 问题在尺寸：`actjpgs/<名>.jpg` 是 125×125、`actjpgs/medium/<名>.jpg` 是 100×100，过不了高清候选门槛和显示门槛。
    这批图 Gfriends 已经整批收着，排在质量档位的最后一档，所以不为它另起高清 provider。取证与重放脚本在仓库外的
    `<私有验证记录>`。
  - 例外：新导入时，r18.dev 同一人物对象直接给 DMM id、名字和文件名，缺头像的实体可以先装这张官方缩略图，
    随后由换头像页升级。页面上的日文名、旧艺名和站内 ID 继续用于名字链与消歧。
- **javdatabase 的入口必须是账本里的番号，不能按名字拼 slug。** 它一个艺名一页，slug 与人不是一对一：
  `/idols/rin-natsuki/` 打开的是 `Rin Oka` 的资料页；站内搜索也不给 idol 页，只回作品列表。
  - 查询顺序固定为 番号 → `/movies/<code>/` → 页面给出的 idol 链接 → 名字，每一步都由上一步的页面给出
    （`scripts/harvest_javdatabase_names.py`）。
  - 一部作品可以挂多位女优，番号对上不等于整页名字都属于这个人：idol 页的名字里至少有一个已在账本这个人的
    名字链上才收，对上账本多个人时记「需人工消歧」。
  - 它能给日文原名加旧艺名的罗马字。厂牌名不能用它，它自己就把 `セレブの友` 写成 `Celeb no Tomo`。

## 目录型来源与社媒链接

补女优社媒走「目录型来源整站抓一遍、离线比名、复核 CSV 装入」，不逐人搜索（`scripts/harvest_directory_links.py`）。
这节讲各目录站怎么抓、名字怎么对、链接怎么判、事务所怎么建。

### 抓取与比名

- laoshi.ink 按 sitemap 抓全部女优页（ld+json `sameAs` 加正文外链）；bstar-pro.com 过一次年龄门，抓 models 列表与
  每一页。HTML 按 URL sha1 缓存在 `peach-data/state/directory-links/<来源>/`，重跑不再打外站。
- 页面上的名字（中文名、日文名、别名）按 `peach.social_links.name_key`（NFKC、casefold、去空白）与账本
  `canonical_name` 及 `name_chain` 匹配。一页命中两个实体记「需人工消歧」，不猜。
- 站点自己的社媒账号（laoshi 首页那几枚）先从每页外链里减掉，否则会给每个女优都装上站方的 X。
- javmodel.com 不是社媒来源，不用再试：走代理能取到 200（直连超时），但唯一的 twitter 链接是分享按钮，本人账号
  一个都没有。Instagram↔X 互补要等目录数据装入后从账本自身做，不在采集脚本里做。

### 链接判定与验活

- 判词四种：`ok` 进装入队列；`已有`（同平台同 handle，不分主机写法与大小写）；`conflict`（账本同平台是另一个
  handle）；`未取得`（页面失败或没有社媒）。
- 来源本身可能是过期数据：目录站抄的 X 账号很多已封停，本人早换了新号。所以 X 的 `ok`／`conflict` 行都用登出
  页 og 标签验活：活号有 `og:title` 和指向 `profile_images` 的 `og:image`；不存在的 handle 只回一个没有任何 og 的
  JS 壳，看不出死活。拿不到 og 时，再不走缓存地取对照账号 `x.com/X`：对照正常才判「疑似失效」，对照也空就是
  限流，写「未取得」。Instagram、TikTok、YouTube 的登出页什么都不给，只能写「未验」。
- **X 显示名写着「応援」的是粉丝号，不是本人。** 名录页会把 `篠田ゆう様💝応援アカウント` 这种账号当本人账号
  挂着，验活也是「活」。证据里标一句不够，`installable()` 只看 verdict 和 alive，所以判据落在 `probe_rows`
  （`FAN_ACCOUNT`），命中就降级成 `应援账号` 这个单独的判定。名录型来源不核实社媒归属，这一道只能自己做。
- 判据（平台名单、handle 归一、`twitter.com→x.com` 别名、标签写法、X 死活）集中在 `peach.social_links`，
  `normalize_link_hosts.py`、`harvest_performer_links.py` 都从它取；`harvest_social_avatars.py` 还留着一份旧抄本。
- **主机名一律小写。** jae 的资料页上写着 `https://Instagram.com/…`，而 `entity_link` 的 UNIQUE 只认字面，照抄
  就是同一个账号的第二条记录（`social_links.canonical_url`）。路径和 handle 不动：X 的 handle 大小写不敏感，但那
  是用户当初复核过的写法。
- **页面写明是博客的就按博客算，不看主机名。** `classify()` 只认 `BLOG_HOSTS`，而 `alicejapan.co.jp` 的子域、
  `plaza.rakuten.co.jp`、`takasyo.blog.jp` 都是本人博客却不在名单里；页面上那行「公式ブログ」比主机名更接近
  事实。标签照账本现有写法记「博客」，页面另外点出博客名时（`公式ブログ「旬の果実」`）才带上那个名字；
  `オフィシャルブログ` 这类泛称照抄进去，会让同一件东西在界面上出现三种写法（`harvest_directory_links.owned_link`）。
- 装入用 `install_entity_links.py` 读 `directory-links-<日期>.csv`；`-review.csv` 是全部判词，供人看。两者都不直接
  写账本。

### official 链接的标签与事务所

- **一个字段的值只描述它自己那一行。** minnano-av 资料表里「所属事務所」和「公式サイト」是两件事：白石亚子的事务所是 T-POWERS，
  公式サイト填的却是 Prestige 的専属宣传页。拿事务所名当 official 链接的标签，就会出现一个文字写 T-POWERS、图标和落点都是
  Prestige 的控件。
- 所以 official 链接的标签按域名归属写（`peach.social_links.host_owners`）。证据按序：厂牌实体自己挂的官网链接直接指认；其次是
  女优 official 链接里的共识（同一域名上 `OWNER_QUORUM` 条以上写同一个名字）。孤证会自我确认，不算共识。归属未取得时才用
  事务所名。
- 事务所名存在 `entity.metadata_json.agency`，带 `source` 与 `checked_at`，女优移籍按最新覆盖。已入库的错标由
  `scripts/repair_link_labels.py` 修，默认只出复核 CSV。
- `scripts/install_agencies.py` 把这些名字装成 `entity.kind='agency'`，归属写进 `entity_membership`（主键在成员一侧，一个人只有一条
  现役归属，移籍是覆盖）。原文留在 `metadata.agency` 当证据，结论错了才有得回溯。事务所不进 `asset_entity`：给作品另存一个事务所
  字段会漂移，而漂移的那份没人会发现。
- 事务所名里的括号按同一条规则拆：括号外是现用名，括号里的读音和括号后的 `旧・`／`元・` 都是别名。旧称撞上另一家的现用名时不写
  别名：`GG(旧・Prime Agency)` 的旧称正是仍在营业的 `Prime Agency`。
- 事务所官网取成员 official 链接里标签等于本家名字的那些，用域名根地址，不用某位女优的个人页。名字拆过之后要按原文再查一次，
  否则 `ACT(アクト)` 这类有站的会查不到。
- 现站打不开的公司可以登记 Wayback 快照：link_kind 仍是 `official`，url 写完整的 `web.archive.org/web/<时间戳>/<原址>`，label 写
  `官网存档（YYYY-MM）`（不带公司名，页头已有），优先所属名单页。`peach.social_links.ARCHIVE_HOSTS` 让域名归属、事务所门面圆标
  和厂牌标识采集都跳过它；标识要从快照取时，把快照里那张图的 `id_` 原件地址登记进 `studio_icons.py` 的指定来源表。复核表改了
  label，重跑 `install_entity_links.py` 即对齐。

### 事务所名册与移籍

- 「这家有哪些人」走 `scripts/harvest_agency_rosters.py`，一次取一家，比按人逐个问少两个数量级的请求。
  - minnano-av 没有事务所索引页，站内编号只出现在女优页「所属事務所」那格的链接里。所以先拿这家已知成员搜出编号，并按上面的
    括号规则核对那格写的确实是这家（`KRONE(クローネ)` 拆开才对得上；`GG(旧・Prime Agency)` 里的旧名不作数）。编号写进
    `entity_external_ref(provider='minnano-av', external_kind='production')`，下一趟不必再问。
  - 名册页 `actress_list.php?production=<编号>` 一页 30 位，人名读 JSON-LD 的 `CollectionPage`；正文 `<a>` 的文字是
    「名字 + 女優情報」，对不上账本。
  - 翻页地址取 `<link rel="next">` 并还原 `&amp;`，但终点不能听它的：最后一页之后站点照旧给出下一页，内容是最后一页那几位的
    重复，所以走到「这一页没有新人」为止。人数和 `numberOfItems` 对不上时，分清是页数封顶还是站点名册有重号。
  - 名字对回账本要连别名一起对：对不上的记「不在库」（默认收成一行计数）；一个写法对上两个人记「重名」；已归属别家的记
    「另有归属」，留给人判。`--apply` 只补空着的那一位。
- 事务所会拆、会改名。移籍走 `scripts/resync_performer_agency.py`：按 `--agency` 选整家或 `--only` 点名，重问女优页的「所属事務所」，
  只覆盖 `entity.metadata_json.agency`；实体和归属仍由 `install_agencies.py` 的 REPLACE 落地，免得两边各拆一次名字得出两种结论。
  - 检索必须走 `name_chain`：账本规范名是简体中文，站点只认日文写法，只拿规范名去问大多会「未取得」。
  - 站上那格是空的记「站上没有事务所」，不清账本：解约和站点当天不显示这格，在页面上分不开。
- 「所属事務所」只记现在签在谁名下。退役后转进个人经纪公司的人，那格写的是她自己的公司（三上悠亜 → 株式会社Miss），不是 AV
  事务所。这种由 `scripts/reject_agency.py` 按复核 CSV 驳回：驳回记进她的 `metadata.agency_rejected` 并撤掉归属，那家没人了就删
  实体；查实了 AV 时期的事务所就在 `replacement` 列写上，同一次改挂过去。驳回记在人身上，写元数据、建实体、补名册三条路径都经 `peach.entities.rejected_agencies` 跳过它，判词记「已驳回」。
- 一家拆成两家时，两家都在括号后写「旧・某某」。名册采集器按括号规则拒绝把任何一家认成被拆的那家，这是对的：旧名
  同时属于两家继承者（例：LIGHT 拆成 `ELTRA(エルトラ)旧・LIGHT` 与 `EST(エスト)旧・LIGHT`）。

### jae.tokyo 女优名录

jae.tokyo（Japan Adult Expo）是人工指定的第三个目录来源，同一站的厂牌名录见「厂牌名与厂牌标识」。

- 三届的资料页结构各不相同：2014 是 `jae2014/actress/NNN.html`，社媒和博客混在正文的 `<a>` 里；2015 是 `jae2015/actress.html` 的
  `offActress` 弹层，`actressLinkBtn` 一个按钮一条链接；2017 是 `jae2017/actress/NNN.html`，人像在 `img_area`、链接在 `link_area`。
- **`jae2014/*` 直连会被重置**（`WinError 10054`），所以 jae 整个进了 `PROXY_SOURCES`，同一来源不分届走两套出口。
- **注释里的链接不算这个人的。** 有的页面 HTML 注释里留着上一届模板里别的女优的博客和 Instagram，按 `<a>` 硬取会把几个人的账号
  装到一个人头上，所以解析前先剥注释。
- **名录人像进的是头像竞赛，不是另一条装入路径。** `-portraits.csv` 由 `harvest_social_avatars.py` 的 `jae` 路线读走，和 X、
  babepedia 的候选在同一套内容寻址缓存里比大小；竖版全身宣传照的取景交给人脸 sidecar，见 REUSE.md「人脸取景」。

### javdb 演员页

- **javdb.com 是按名字进的来源，不是能翻的名录。** 站上没有可枚举的女优列表，入口是账本里的名字：逐个写法搜
  `search?f=actor&q=`，结果卡片的 `title` 一栏就是这个人在站上的全部写法，不点进去就能判身份。名字链要整条搜完再放弃：账本
  规范名多是简体，`name_key()` 不做简繁转换，只搜规范名常常一个都搜不到（`harvest_directory_links.collect_javdb`）。
- **演员 id 在作品详情页就拿得到，不必另走一趟资料页。** 演員一栏每个名字都挂着 `/actors/<id>`，`sources.javdb.actresses` 顺手
  带出；名字精确匹配到这条资产已关联的人物实体，才登记成 `entity_external_ref(provider='javdb', external_kind='performer')`，人物页
  的 JavDB 入口靠它拼（`peach.entry_links`）。历史数据走 `scripts/backfill_performer_entry_ids.py`：javdb 页面缓存与
  `review/agency-rosters.csv` 的 `actress_id` 各补一路，先出 dry-run CSV 再 `--apply`。
- **作品不是从 javdb 刮的女优，由补女优资料后继按名字搜演员卡补 id（ADR-0081）。** 卡片上的 id 就是资料页的 id，
  无碼那条的头像上有 `<span class="info">無碼</span>`；对上的卡每种记录类型至多一张才算同一个人（`javdb.one_person`）。
  回填脚本读搜索页缓存时用同一份判据。
- **同名两条记录不取第一个。** 同一位女优在站上常有「有碼」「無碼」两条，两页都进判定，撞上的账号落成 `conflict` 进复核表。
- **一部分资料页要登录，回的是登入页而不是 401。** 不注册账号。那一页记「未取得」并写明原因：「搜过、站上没有这个人」「搜到了
  但要登录」「没搜」是三件事，不分开写，下一轮还得重搜。要登录的那页都是「無碼」那条孪生记录，有碼那条公开，中文名从它就
  取得到，所以为了取名字去登录没有增量；無碼记录的作品列表仍在墙后。
- **社媒按钮只在 `section-addition` 那一块里。** 整页别处的站外链接是广告、姊妹站和 RTA 标签。Instagram 是这个来源的主要增量。
- **javdb 的圆头像 250×250，进不了头像竞赛**（正方需 ≥400），`harvest_social_avatars.py` 不接这个来源。
- 限速与封禁见「javdb、AVBase 与 JavBus 的限流与封禁」里的「目录采集对 javdb 的限速」。

### 追更来源的名字发现

按名字发现追更来源时，站上的标识符写法以站方接口为准，不由手柄推定。

- **敲半个名字就能出建议的，只有本机清单和 rule34.xxx 的公开补全两处**，都不需要凭据。
  - 本机那份是 `discover` 顺带下载的整站创作者清单（kemono、pawchive、coomer），按 casefold 排好表后二分取前缀区间。
    敲字这条路**不下载清单**，没下过就少一组。
  - 站上那份走 `api.rule34.xxx/autocomplete.php?q=`。同一路径挂在主域名下会被 Cloudflare 拦成 403，只有 `api.` 子域回 200 JSON。
    它回的是标签不是作者名录，界面要写明这一组是标签。一次只回十条，热门前缀会把完整写法挤掉，有凭据时改用直接查标签。
    只接受抹掉分隔符并折叠大小写后与查询词相同的那个，同前缀的别人不算命中。
- **rule34.xxx 上谁是作者只有站方分类说得准，而那要凭据。** 按词形猜会错（名字里带 `artist` 的也可能是巧合）。分类在
  `index.php?page=dapi&s=tag&q=index&name=`，不带 `user_id`＋`api_key` 回 `"Missing authentication"`。三个坑：`json=1` 被忽略、只回
  XML；`names=` 不被识别，会吐一批无关标签；`name_pattern=` 是两边通配的子串匹配且按 id 截断，`orderby` 也不生效。所以只能按
  精确名逐条问（每条约 0.3 秒，可并发）。分类是站上改一次就定的事实，问过就记住。
- **gelbooru 不是 rule34.xxx 的超集，不能拿它替换或前置。** 两站同源但各收各的，同名标签的帖数也不同。gelbooru 的
  `index.php?page=autocomplete2&term=` 公开且自带 `category`，但 `limit` 不生效、恒回 10 条，拿它给 rule34.xxx 的候选标分类只能
  覆盖很少几条。候选名单必须来自 rule34.xxx：Peach 在那一站建订阅，给出它没有的名字就是误导。
- **f95zone** 的 `latest_data.php` 只索引 Latest Updates 的五个分类，艺术家的 Collection 帖只有带登录 cookie 的站内
  搜索看得到（无 cookie 时 `/search/` 回 403）。没有 cookie 就跳过它并保留 Google 外链，不把「查不到」写成
  「站上没有」。
  - 站内搜索按整词匹配：`strauz` 命中 0 条，`strauz*` 与完整写法命中同样的帖。所以各种写法都空手之后补一轮 `词*`；四个字符
    以上才加，三个字母加通配等于把半个站搜回来。
  - 线程标题的作者在末尾方括号里，约定是 `作品名 [版本或日期] [作者]`。从右往左找第一个不像版本号、日期和
    `Completed`／`Unity` 这类站点标签的方括号段；并列两个手柄（`[LazyProcrastinator/LazyProcrast]`）时第一个当显示名、其余是
    别名候选。没有可用方括号时才用主体，剥掉 `[Collection Request]` 这类前缀标签和 `Models Collection` 这类容器措辞
    （`follow_store.f95_author_name`）。
  - 作者的头像与别处身份只在首楼的正文链接区，而且要登录才看得见。首楼发帖人是搬运工不是作者，XenForo 的发帖人头像不能当
    作者头像。游客态下正文的站外链接全被换成 `/login/`，有的版块对游客整个关闭。
  - 名片里有 FANBOX 创作者 id 或 pixiv 数字 id 时头像取 FANBOX；没有时取 X 与 Patreon，两家都不带凭据：X 登出页的 og:image 按
    「厂牌名与厂牌标识」里 `pbs.twimg.com` 尺寸后缀那条退档，Patreon 公开的 `api/campaigns?filter[vanity]=` 给
    `avatar_photo_image_urls.original`。两家各取能用的最大一档后比实际像素，留大的。SubscribeStar **未取得**。
  - 认哪些主机算身份写死在 `follow_sources.profile_link_identity`：论坛正文谁都能贴链接，放开主机等于把别人贴的
    地址当成作者。

### 从 javdb 取中文名（`harvest_javdb_cn_names.py`）

- **页面结构：`actor-section-name` 是现名，紧随的 `section-meta` 是旧艺名，最后一个是影片数。** 两者必须分开取：
  `JULIA` 那页的旧名里有 `京香じゅりあ`，混成一串就分不出「这是她的中文名」和「这是她用过的旧艺名」。解析在
  `peach.javdb`，与 `harvest_directory_links.py` 共用一份。
- **现名栏并列的两个名字不一定是同一个名字的两种写法，也可能是两个艺名。** `美空あやか` 那页的现名栏是
  `一之瀨亞美莉, 美空あやか`，当成「中文写法 + 日文写法」就会给美空あやか安上一之濑亚美莉的中文名。判据是首个
  汉字串必须能在对侧找到（`same_person`），对不上的落 `不同名`，规范名不在现名栏里的落 `改艺名` 单独看。
- **比名字时字形要折两次，opencc 一次不够。** 它只管繁简，日本新字体不归它管：`永瀬` 转不成 `永濑`、`姫川` 转不成
  `姬川`，少一层就把同一个人判成两个人。两层都走 `peach.kanji`＋opencc `t2s`，落库的写法另走 `simplify_kanji`。
- **`?locale=zh-CN` 只切界面语言。** 女优名是数据，不跟着变：`愛音麻里亞` 在简体界面下仍是繁体，简体要自己转。
- 判词分档：`ok`、`同形（站上只有日文名）`、`要登录`、`旧名`、`改艺名`、`未取得`、`不同名`。落库取 `ok`、`改艺名`、
  `旧名` 三档。
- **旧艺名的中译只有资料页有，账本一个字都没有。** 刮削源给日文与罗马字；avdb 映射表每人只给一个 `zh_cn`，它的
  `keyword` 逗号列表只用于匹配、从不写进 `entity_alias`；改统称时降为别名的又是日文原规范名。于是 `橋本ありな`
  在账本里、`桥本有菜` 不在，按后者搜不到人。
  - `--aliases` 在同一趟抓取里把现名底下那一栏的中文写法取成候选。那一栏站上不给标签，旧艺名与昵称混放，
    解析层分不开也不筛，候选只记 `origin=别名栏`，认不认得这个写法是复核的人的事。
  - `--scope all` 把范围放开到已经有中文规范名的人，她们才是缺第二个写法的那一批；`--only` 按名字链上任一写法或
    实体 id 点名一位，不受范围限制，两次请求出结论。
  - **搜到多页时一个别名候选都不产（`多页`）。** 规范名那一份把两页都记下来让人挑，别名不能：别名进的是身份，配错
    人比缺一个写法更难查回来。撞上另一条实体名下的写法记 `占用`，那是两条该不该合并的问题，不由采集决定。页面上
    没有新写法的也留一行 `无新写法`：查过没查出东西，和还没轮到她是两件事。
- 落库是另一个脚本、另一次授权：`apply_alias_candidates.py --candidates <csv> --revision <批次> --apply --backup`。
  - 来源记 `javdb-actor-page@<批次>`（`peach.javdb.ALIAS_SOURCE` 是这个前缀），与 `localize_performer_names.py` 写的
    `javdb-actor-page@javdb-202609` 同一形状，也与界面上可撤销的 `user:alias` 分得开。
  - 批次号必须在命令行里给：解析判错时，认得出批次才能按 `source` 把那一趟整批撤回。
  - 四种不写：这条实体已有这个写法；写法归另一条实体；账本里的统称已经不是 CSV 里那个（快照过期，该重抓）；实体
    不在或不是 performer。

## 厂牌名与厂牌标识

这节讲厂牌的日文原名、官网、Logo 从哪里来，以及怎样判断找到的东西真属于这家厂牌。

### 日文原名

厂牌的日文原名是查出来的，不是转写出来的：罗马音回日文没有唯一解（`Hon Naka` 可以是 `本中` 也可以是 `ほんなか`）。
所以 `scripts/localize_studio_names.py` 不做音译，而是拿该厂牌作品的番号打 `www.javbus.com/<CODE>`，读 `製作商` 字段。

- 一个厂牌尽量取两个不同前缀的番号，两页一致才提改名。同前缀必然同一家，证明不了什么。
- javbus 有年龄门，不带 `age=verified` 只回一张确认页；番号页必须走代理，直连超时。
- 番号页 404 是那一页的事，不是这家厂牌查不到。印证靠跨前缀，顶替 404 靠同前缀：`code_groups` 一个前缀一组、组内最多
  `--depth`（默认 3）个，组内后几个不参与印证，只在前一个取不到时接手。
- 一个厂牌所有前缀的番号都 404 时，先怀疑账本：常是英文文件名或韩国演员的片子被刮削器套上了同前缀的 JAV 厂牌名
  （`Crystal Eizo`／HA），那个厂牌名本来就不属于这些片子。

七种判词各是一件事：

- 来源给汉字或平假名才改名（`Celeb no Tomo→セレブの友`）。
- 纯片假名只是英文品牌的外来语写法，默认保留账本里的英文原名（`ムーディーズ` 不顶 `MOODYZ`）。
- 来源自己也写拉丁的（`V＆R PRODUCE→V＆RPRODUCE`）差的只是空格与符号，不是去罗马音。
- 账本里根本没有 JAV 番号的西方厂牌与 FC2-PPV 记「不适用（非番号体系）」，不能写成「未取得」冒充取证失败。
- 两个番号给出不同製作商记「不一致」交人处理：`K M Produce` 出 ケイ・エム・プロデュース 与 スクープ，是一个账本名
  底下混了两家。

番号站转写的罗马音和意译都不算英文，优先级低于日文原名；只有厂牌自己用的英文名才保留（用户定的例子：`PREMIUM`
用英文，`Celeb no Tomo` 用日文）。判据是厂牌自称：官网或官方 X 显示名写片假名、拉丁名只是它罗马音的，同样改回日文
（`Akinori→アキノリ`、`Milu→ミル`、`Das→ダスッ！`）；官网自己写拉丁的保留（`BALTAN`、`GENEKI`）。所以「纯片假名」
判词只是默认值，改判直接写进复核件的 verdict 列。`merge_studio_name_variants.py` 的 class B 用同一口径：日文侧含汉字
或平假名就保留日文侧，纯片假名保留英文侧。

判「改名」的行由 `scripts/apply_studio_name_localization.py` 落库：规范名、旧写法降别名、扁平 `asset.studio` 与
`--logo-root` 下的标识一起改。复核件过期（现名已变、实体已合并）或日文名撞上别家的行，只报不改。

### 重复实体合并

- 重复实体按写法与书写系统两类合并（`merge_studio_name_variants.py`）。
- 写法变体（`AVS collector's` 对 `AVS collector’s`）的比较键是 NFKC 加符号折叠，**一个假名都不能丢**：只留 ASCII 的
  折法会把 `シロウトTV` 与 `ラグジュTV` 双双折成 `tv`，合出来是两家真实厂牌搅在一起，不可逆。
- 日文名与罗马字名（`ムーディーズ` 对 `MOODYZ`）唯一的身份保证是共用番号前缀：前缀属于厂牌，是本机可核验的证据。
  转写不参与判断。撞上两家以上一律交人工。
- 合并同时改写扁平 `asset.studio`，否则下一次刮削会照着投影把旧实体再建一遍。
- **合并之后标识要跟着改挂。** 标识按 `logo_key(canonical_name)` 命名存盘，被丢弃那一侧的方标在合并那一刻起没人
  认领，保留方的大位空着就回落到补白字标。
  `merge_studio_name_variants.py --logo-root` 按复核件搬运：保留方缺哪个变体补哪个，已有的一个字节都不动；`.ct` 与
  `.provenance.json` 随图走（少了 `.ct`，`/logo` 答不出 Content-Type）。

### 找官网

厂牌官网与社媒链接分别登记。`find_studio_socials.py --db <账本> --output <扫描表>
--review-output <链接复核表>` 只读已有官网，连同已有社媒的厂牌一起查，按账号大小写去重并列出缺项。
复核表保留来源 URL、页面 SHA-256、锚文本与上下文；确认归属后交 `install_entity_links.py` 安装。
不能把官网上全部账号自动归给厂牌：商城客服、演员与旗下其他厂牌各有归属。S-Cute 官网的
`SCute_av` 标为 S-Cute 官方，`_scute` 标为其直营后继服务 nanairo 官方，后者的链接标签保留 nanairo。
采集只认账号主页锚点；帖子、分享按钮、脚本字符串不算。年龄门的文字、图片 alt 和文字间空白均参与判定，
只跟同站肯定入口；HTTP 失败与跨域重定向记为未取得。每站完成即保存进度，`--resume` 复用有账号证据的行，
空结果与失败重新检查；采集本身不写账本。

- 搜官网与 X 账号用日文名，不用罗马音：内置浏览器打开
  `html.duckduckgo.com/html/?kl=jp-jp&q=<日文名> AVメーカー 公式`。Google 弹机器人验证，不绕过；内置 WebSearch
  只回美国过滤结果，拿番号或罗马音搜只会回无关结果。
- AV 厂牌官网普遍先给年龄确认页，不穿过它只能拿到约 10 KB 的空壳。判据必须是锚文本而不是 URL：否定链接指向
  站外（`dasdas.jp`、`muku.tv` 的「いいえ」都指向 dmm.com），肯定链接「はい（入室する）」指向站内，两者的 href
  看不出区别。实现见 `scripts/find_studio_socials.py`，`test_age_gate_is_crossed_by_the_affirmative_link_only` 守这条线。

`scripts/harvest_studio_sites.py` 从厂牌名猜域名找官网。每一道拒绝判据都要说得出反例，也要防它误伤真站：

- 拦停放页（`kawaii.com - domain for sale`：关键词在正文很靠后，却写在标题里）。
- 拦自述不可用的页（回 200、正文成人词齐全，标题只有 `Site Unavailable`）。「域名由厂牌名推出 + 是成人站」那条替代路径会把
  它们确认成官网，所以 `BROKEN_TITLE` 必须拦在停放页判据之后。
- 拦标题只回显域名的通用站（`prestige.com` 的标题就是 `prestige.com`，真站是 `prestige-av.com`）。判据是「标题照原样印着域名，
  且除域名之外什么都没说」；不能拿 normalise 后的标题比 normalise 后的主机，否则 `NATURAL HIGH（ナチュラルハイ）` 这类真站
  必然被判成回显。
- 判「没有官网」之前先分清是站点的回答还是网络抖动。`probe` 只对传输层异常按 `page_cache.Site` 的口径重试
  （`retries=2, backoff=2.0`），HTTP 状态码是站点的回答，不重试。`未取得` 的行把每次尝试的判词按顺序拼成证据链写进 `note`。
- 名字里没有拉丁字母的厂牌（`一本道`、`カリビアンコム`……）靠汉字与假名自己参与比对：`normalise` 留下汉字、平假名、片假名和
  长音符 `ー`；`・`（U+30FB）是分隔符，和全角括号、`【】` 一样剥掉。这类厂牌的域名推不出来，`--seeds` 是唯一入口。
- `entity_alias` 一起参与「页面自述厂牌名」那一道：`东京热` 的规范名是简体，页面写「東京熱」，账本里早有这个别名。拿别名比不
  放松判据。判词写「对上的是别名『X』」，不写「页面写作『X』」，因为 normalise 之后不再是页面原文。
- 成人语境词包括无码站写的「アダルト動画」「無修正」。同名的非成人站（Hunter Engineering、Bazooka、麦当娜）不会出现这两个词。
- **页面上没有的信息只能人工确认。** `SOD Create` 的官网是母公司站 `www.sod.co.jp`，这个串整站不出现；放宽通用判据去接住它，
  等于把 `hunter.com`、`bazooka.com`、`madonna.com` 一起放进来。所以走 `studio_sites.CONFIRMED_SITES`：一行一个厂牌，写清地址、
  人工确认的日期和理由。它只替掉最后那道「页面得自述厂牌名」，状态码、空壳、停放页／自述不可用、域名回显四道照旧要过；确认
  地址排在所有推导候选前面。
- 账本记罗马音、站上只用日文原名的，不进 `CONFIRMED_SITES`：那是账本名字错了，改成日文名页面自述就对得上（`えむっ娘ラボ`）。
  白名单只留「厂牌属于哪家公司」这种页面上没有的信息；有别名就走 `aliases`。
- 作品数少的厂牌也照样出现在厂牌页的大位上。`--min-assets` 只是全量扫描的阈值；定点补走 `--only <canonical_name>...`，指名就不看
  作品数，名字对不上直接失败，不静默跳过。

### 社交账号头像当 Logo

AV 厂牌 Logo 的来源是厂牌自己的社交账号头像：社交头像天然是正方形，且由品牌本人发布。

1. 取证顺序：handle → `unavatar.io` 解析出平台 CDN 真实地址 → 从 CDN 下载 → 实测。unavatar 只用来解析地址，provenance
   两者都记（`scripts/fetch_studio_avatar_candidates.py`）。
2. 候选用内容寻址缓存、SHA-256、同厂牌感知哈希和跨厂牌精确重复门槛。同图缩放或重编码记 unchanged，上游视觉真变化
   才重新进 `/review`。无 handle、无图片、unchanged 和 duplicate 只写健康报告，不占人工队列。

- 能解析不等于是对的品牌：`@bazooka` 确实存在且能取到 400×400 头像，但那是 2007 年注册的通用账号，不是这个 AV 厂牌。
  所以 handle 必须逐个取证确认，脚本默认不猜；`--guess-handles` 的产出一律标 `needs_confirmation`、不自动采纳，查不到
  就留空。
- r18.dev 详情 JSON 只有 `maker.name`／`label.name` 和作品封面，没有 Logo 资源。
- **`pbs.twimg.com` 的尺寸后缀不是「有这么大」的证据。** 无后缀的那一份是上传原图（最大档）；带后缀的地址在原图更小时
  返回的仍是原图：`セレブの友` 的 `_400x400` 和无后缀都是 242×242，而 unavatar 给的是 `_200x200`（8068 B 对 12302 B）。
  所以一律从无后缀原图起，按 `peach.social_links.twimg_tiers` 的档位往下退（旧头像有只剩缩略图的），`resolved_url` 记实际
  取到的那一档，全档缺失才算取图失败。厂牌 Logo（`fetch_studio_avatar_candidates.py`）与演员社媒头像
  （`harvest_social_avatars.py`）共用这一份判据。

### 名录来源

发行平台与发行商自己的厂牌名录是官方字标的广度来源。入口登记在 `harvest_maker_directories.DIRECTORIES`。
**存名录入口，不存图片地址**：图片地址里常带时间戳，厂牌换一次标识地址就变，重跑一次拿到的才是当下那份。

| 名录 | 入口与规格 | 注意 |
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
