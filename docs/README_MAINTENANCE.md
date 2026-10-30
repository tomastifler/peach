# README maintenance

默认入口 `README.md` 使用英文，简体中文版为 `README.zh-CN.md`；两种语言同批核对。

1. 按下表核对本次涉及的能力、安装方式与限制。
2. 同批核对中英文 README，修改需要调整的内容，保留使用入口和安全说明。
3. 用 documd 提供当前稿的可视化预览，取得用户明确确认后才能推送 README；继续修改时确认对应的新稿。
4. 按 [文档与界面文案](WRITING.md#检查与复核) 检查，再运行 [正式测试入口](TESTING.md#正式入口)。

README 面向初次访问项目的人，依次讲它是什么、界面导览与截图、能做什么、怎么装、常见问题、
问题反馈和文档入口。用使用者的话写：说能做什么、会不会动文件，不写账本、候选、实体这类内部
概念，内部机制与开发流程只留链接。中英文同批维护，平台支持、安装方式和能力限制保持一致。主线能力、已安装运行态和发行制品分别
以实现、本机健康检查和 Releases 为准，README 不填写本机 IP、端口归属、真实馆藏数字或动态版本号。

| Content | Where to verify |
| --- | --- |
| Python and desktop commands | `pyproject.toml`, `src/peach/cli.py`, `src/peach/tray.py` |
| Frontend tooling and artifacts | `frontend/package.json`, [docs/FRONTEND.md](FRONTEND.md) |
| Desktop packages and platform scope | [docs/TESTING_DESKTOP.md](TESTING_DESKTOP.md), `.github/workflows/release.yml` |
| Current behavior and deployed scope | The implementation and tests, [Operations and configuration](OPERATIONS.md), [public roadmap](https://github.com/orgs/peach-mitao/projects/7) |
| Sources, configuration, and data boundaries | [docs/SOURCING.md](SOURCING.md), [docs/OPERATIONS.md](OPERATIONS.md), [docs/CLOUDDRIVE.md](CLOUDDRIVE.md) |

README iteration is tied to the worktree delivery flow shared by Codex and Claude. Before each commit, check the staged diff,
and when user-visible capabilities, installation, platform, or build requirements are involved, update both the Chinese and English versions in the same batch. When only internal implementation changes and the README is kept as is,
state the reason in the Git trailer of the last commit on the delivery branch:

| Judgment | Standalone field at the end of the commit message |
| --- | --- |
| 已更新两份 README | `README-Impact: updated; 同步了哪些用户说明` |
| 只需修改中文 README | `README-Impact: updated; 中文修改原因`，另加 `README-Reviewed: README.md; 英文无需修改的原因` |
| 只需修改英文 README | `README-Impact: updated; 英文修改原因`，另加 `README-Reviewed: README.zh-CN.md; 中文无需修改的原因` |
| 不影响 README | `README-Impact: none; 具体原因` |

The declaration is written together with other trailers such as `Co-Authored-By` in one contiguous block at the end of the commit message, with no blank lines between them.
For the attribution form within the same block see "Staging and committing" in `.claude/skills/peach-worktree/SKILL.md`.
`git interpret-trailers --parse` parses only that final block, so a `README-Impact` separated by a blank line belongs to the body paragraphs;
`commit-msg` will point out fields that are not in the same block at the end, and `ready` will also reject a delivery without a single declaration.

`scripts/check_readme_impact.py` reads the actual diff from the target branch to the delivery HEAD, and uses
`git interpret-trailers --parse` to read the declaration of the last commit. A declaration is required when runtime code, frontend, migrations, resources,
dependencies, or installation notes are involved; pure tests and other internal docs do not trigger it. The trigger list is maintained centrally by the script.
A README change must check both languages; `updated` must correspond to at least one real diff, and `none` must not come with a README change.
When only one needs adjusting, state the unchanged file and the reason with a single `README-Reviewed`; do not change a correct translation just to satisfy the check.
Staged content after the commit cannot satisfy the requirement. The truthfulness of the reason is still the responsibility of code review, and the script does not replace semantic judgment.

`agent_worktree.py preflight` 在耗时验证前核对这一门槛；`ready/integrate` 在接受测试记录前复用同一检查。检查覆盖本次分支交付，
允许在最后交付提交统一核对整批差异。仓库 `scripts/githooks/commit-msg` 在 `agent/*`
分支提交时检查署名，以及消息中已有 README 声明的格式与分段；中间提交可以不写 README 声明。
合并消息免除署名检查，amend 使用同一套字段判据；钩子只读消息。README 声明与整个分支差异
的一致性由交付门槛检查，未通过的分支不能经项目入口集成。
无需定时任务、账号专属 hook 或额外模型调用。Python 下限、文案和快照校验继续复用现有测试。
结构或品牌调整时重读已登记的参考快照，上游变化只作为参考，计划功能不得写成已实现。

## Demo dataset

Screenshots for the README, tutorials, and website come from the demo library by default. Using a classification model to screen "harmless-looking" frames from the real library is not
an alternative: what gets screened out is mostly black frames and title cards, and the product codes, names, and studios on the cards still leak the source.

公开 README 复用官网已发布的电影演示库截图，展示馆藏、人物、关注、统计与播放器；界面导览链接到官网 `#live`，仅嵌入已核对内容、来源和许可的视频。截图与文案明确区分演示数据、实际功能和影片访问权，保留来源的年龄、地区和访问限制，不把外部来源的访问权说成 Peach 提供的能力。展示素材的来源、署名与许可链接到官网[素材来源与许可](https://peach.video/credits/)，软件许可不替代第三方素材许可。项目定位与公开附件边界见[文档规范](WRITING.md#公开与私有记录)。

公开画面不得出现访问凭据、局域网地址、隧道地址、文件系统完整路径或个人馆藏。截图由官网静态资源提供 WebP 展示图与无损 PNG 原图，README 的图片链接指向 PNG，避免 Release 附件的下载响应。WebP 展示图须小于 4 MB，并核验 GitHub 图片代理返回图片且浏览器完整解码；原图保持 3840×2160。更新链接时核对官网实际发布范围，不能只因本地文件存在就认为线上可用。截图不进仓库：`resources/` 会被整个打进安装包。仓库里确需
留存的少量演示媒体放 `docs/assets/`，单个文件压到 8 MB 以内（`tests/test_repo_hygiene.py`）。

本地测试另有生成器 `scripts/demo_dataset.py`，只写目标目录，不碰任何账本；以下人像生成模式不作为当前公开 README 的素材来源：

```powershell
& .\.venv\Scripts\python.exe -X utf8 scripts\demo_dataset.py --output <directory> --count 24
```

Covers are decided by `--art`. The default is `portrait`: portraits come from the Gfriends image library, covers and galleries are laid out from that portrait, and performers use the canonical stage names in the manifest, so the interface looks like a real library. `synthetic` is Pillow geometric
posters, needs no network, and scale benchmarks and tests use it. In both modes the short clips are FFmpeg lavfi gradients, test patterns, and fractals,
only as placeholders, not to be used as demo video.
In both modes the titles, studios, series, and tags are all fictional: real stage names paired with fictional titles, so the demo material never asserts
that "someone appeared in some title", something it has no standing to assert.

`tests/test_demo_dataset.py` guards that the title vocabulary and the `catalog_rules` adult vocabulary are disjoint, that the directory layout
conforms to the `library_nfo` sidecar rules, that `process_library` makes no external requests when it finishes, and that the portrait manifest's
shape and "the name on the card is the person on the cover" hold. `--seed` fixes the content, and `--video stub` uses placeholder bytes instead of
encoding, for the scale tier of performance benchmarks.

### Portrait manifest

The manifest is `scripts/demo-portraits.json`: where to fetch from and what hash the fetched file should have. Image bytes do not go into the repository
(ADR-0026); the generator fetches once at run time and caches in `.portrait-cache/` of the output directory; a mismatch between the bytes and the manifest's
SHA-256 is a hard error and is not downgraded to pass.

**The manifest may only be updated after a person has looked at each image; do not fetch automatically in image-library order.** The library sorts directory prefixes as source priority,
and being first answers "which to try first", not "which can go into public docs": in practice the large images ranked first are mostly studio
promotional material, with underwear, swimwear, and even exposed nipples in them, and tiers like `8-GRAPHIS` that look like photo-book agencies are likewise mixed with
semi-nude shots. The manifest must be reviewed by a person, and public images must not show exposed nipples. The review of 2026-09-16 covered 42 people; for the actual list see the [portrait manifest](../scripts/demo-portraits.json).

When swapping an image or adding a person: fetch the candidates, assemble a contact sheet and look through it at once, remove the out-of-bounds ones, then write the **file name** matching the name (not
the key name in the index, which may be an alias or short form) and the byte hash into the manifest, and finally deduplicate by content hash, because one person
often has several keys in the library pointing to the same file.

The three shapes correspond to three product paths: the product-code type (`<code>/<code>.mp4` with NFO and `-poster.jpg`, some with a
`P/` gallery) goes through local metadata intake; the creator type (`<creator>/<title>.mp4` with PNG and a code-less NFO) goes through
the `posters/<id>_4.jpg` local poster; the bare-file type demonstrates entries with neither a product code nor a sidecar, which are only registered and raise no issues. To let Peach see it: `peach init`
creates a demo Peach data directory, declare this directory in `[media.locations]` of the settings file, run `peach scan local` and
`peach process local`, and on the review page approve all candidates or land them by field with `scripts/apply_metadata_tags.py --source local_nfo`;
for contact sheets run `scripts/probe.py` and `scripts/sheets.py`. When the generator finishes it prints these steps together with
the settings lines for the current platform.

Entities in a new library come only from review landing; scanning itself derives no creators and attaches no images to entities, so the demo library's
creator pages and entity galleries are empty; this is the product's current state, not a gap in the dataset.

## Reference basis

- **README 结构（2026-09-06）**：取 Immich、Bruno、Hoppscotch 当时的 README 原文作参照，
  URL、日期与 SHA-256 见 `docs/reference-sources.json` 的 `readme-*` 条目。
  采用短定位、小尺寸具象 Logo、集中下载导航和精简能力分组；仅沿用 Peach 自有图标，
  不复制外部商标、截图、功能承诺或宣传内容。上游快照仅为取证，保留原文及上游许可入口。
- **同类项目的 README（2026-09-26）**：映库、OpenAver、amane、Stash、MetaTube、MDCx，
  登记同在 `docs/reference-sources.json`。借的是信息顺序：页头链接行、
  视频与截图靠前、功能一行一条、下载三步走、常见问题、反馈要附什么。不借文案、截图和附加
  使用条款，Peach 的边界以 AGPL 与 `SECURITY.md` 为准。
- **演示素材**：README 里任何截图或视频都按上面「演示数据集」一节的边界取图，换素材时重新核对
  那几条边界。
- **篇幅取舍（2026-10-27）**：参考 amane 的一行一功能与安装入口，以及 SakuraMedia 的主图与折叠截图。README 保留六条特色、安装表、文档导航和必要限制；参数、缓存、任务恢复、诊断与升级细节由专题文档承载。当前原文版本见 `docs/reference-sources.json`，不复制外部文案或使用条款。
- **截图与 Star 历史（2026-10-27）**：五张电影演示库截图保留，首页主图直接展示，其余四张折叠；WebP 均链接 PNG 原图。Star History 由 `scripts/render_star_history.py` 按逐日记录生成，横轴从第一个 Star 开始，采用蜜桃色霓虹描边、线性绝对值坐标和深浅主题（2026-10-28 起取代 Star Chart 的周粒度图）。独立 GitHub Actions 每日生成 SVG，仅写入 `star-history` 分支，README 不承诺即时刷新；取数与取舍见 [复用记录](REUSE.md)。
