# README maintenance

The default entry `README.md` is in English, and the Simplified Chinese version is `README.zh-CN.md`; the two languages are checked in the same batch.

1. Check the capabilities, installation methods and limits involved in this change against the table below.
2. In the same batch, check the English and Chinese READMEs, edit whatever needs adjusting, and keep the usage entry points and security notes.
3. Provide a visual preview of the current draft with documd, and push the README only after the user's explicit confirmation; when editing continues, confirm the corresponding new draft.
4. Check against [Documentation and UI copy](WRITING.md#checking-and-review), then run the [official test entry](TESTING.md#formal-entry).

The README is for people visiting the project for the first time, and in order covers what it is, a UI tour with screenshots, what it can do, how to install, FAQ,
issue reporting and the documentation entry points. Write in the user's words: say what it can do and whether it touches files, and do not write internal
concepts such as ledger, candidate or entity; for internal mechanisms and development flow, leave only links. The English and Chinese versions are maintained in the same batch, with platform support, installation methods and capability limits kept consistent. Mainline capabilities, the installed runtime state and release artifacts are each
governed by the implementation, the local health check and Releases, and the README does not state local IPs, port ownership, real library numbers or dynamic version numbers.

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
| Both READMEs updated | `README-Impact: updated; which user-facing notes were synced` |
| Only the Chinese README needs changes | `README-Impact: updated; reason for the Chinese change`, plus `README-Reviewed: README.md; why the English needs no change` |
| Only the English README needs changes | `README-Impact: updated; reason for the English change`, plus `README-Reviewed: README.zh-CN.md; why the Chinese needs no change` |
| No README impact | `README-Impact: none; specific reason` |

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

`agent_worktree.py preflight` checks this gate before time-consuming verification; `ready/integrate` reuse the same check before accepting a test record. The check covers this branch's delivery,
and allows the final delivery commit to check the whole batch of differences together. The repository's `scripts/githooks/commit-msg` checks attribution on commits to `agent/*`
branches, and the format and sections of any README declaration already in the message; intermediate commits may omit the README declaration.
Merge messages are exempt from the attribution check, and amend uses the same set of field criteria; the hook only reads the message. The consistency between the README declaration and the whole branch difference
is checked by the delivery gate, and a branch that does not pass cannot be integrated through the project entry point.
No scheduled tasks, account-specific hooks or extra model calls are needed. The Python floor, copy and snapshot checks continue to reuse the existing tests.
When structure or branding is adjusted, re-read the registered reference snapshots; upstream changes serve only as reference, and planned features must not be written as implemented.

## Demo dataset

Screenshots for the README, tutorials, and website come from the demo library by default. Using a classification model to screen "harmless-looking" frames from the real library is not
an alternative: what gets screened out is mostly black frames and title cards, and the product codes, names, and studios on the cards still leak the source.

The public README reuses the movie demo library screenshots published on the website, showing the library, people, follows, statistics and the player; the UI tour links to the website's `#live`, and embeds only videos whose content, source and license have been checked. Screenshots and copy clearly distinguish demo data, actual features and access to films, keep the source's age, region and access restrictions, and do not present access rights on an external source as a capability Peach provides. The source, credit and license of the display material link to the website's [asset sources and licenses](https://peach.video/credits/), and the software license does not replace third-party material licenses. For the project positioning and the boundaries of public attachments, see the [documentation guide](WRITING.md#public-and-private-records).

Public images must not show access credentials, LAN addresses, tunnel addresses, full filesystem paths or personal libraries. Screenshots are provided by the website's static assets as WebP display images and lossless PNG originals; the README's image links point to the PNG, avoiding the download response of Release attachments. WebP display images must be under 4 MB, and you must verify that the GitHub image proxy returns the image and the browser decodes it completely; the originals stay 3840×2160. When updating links, check the website's actual published scope, and do not assume something is online merely because a local file exists. Screenshots stay out of the repository: `resources/` is packaged into the installer as a whole. The few demo media files the repository truly needs
to keep go in `docs/assets/`, each compressed to within 8 MB (`tests/test_repo_hygiene.py`).

Local testing also has the generator `scripts/demo_dataset.py`, which writes only the target directory and touches no ledger; the following portrait generation modes are not a material source for the current public README:

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

- **README structure (2026-09-06)**: took the then-current README text of Immich, Bruno and Hoppscotch as reference,
  with URLs, dates and SHA-256 in the `readme-*` entries of `docs/reference-sources.json`.
  Adopted a short positioning, a small concrete logo, centralized download navigation and slimmed-down capability groups; only Peach's own icon is reused,
  and no external trademarks, screenshots, feature promises or promotional content are copied. Upstream snapshots are for evidence only, keeping the original text and the upstream license entry.
- **READMEs of similar projects (2026-09-26)**: 映库, OpenAver, amane, Stash, MetaTube and MDCx,
  registered likewise in `docs/reference-sources.json`. What was borrowed is the information order: a header link row,
  video and screenshots up front, one feature per line, three-step download, FAQ, and what feedback should attach. No copy, screenshots or additional
  terms of use are borrowed; Peach's boundaries follow the AGPL and `SECURITY.md`.
- **Demo material**: any screenshot or video in the README takes its images within the boundaries of the "Demo dataset" section above, and those
  boundaries are re-checked when the material is replaced.
- **Length trade-offs (2026-10-27)**: referenced amane's one-feature-per-line layout and install entry, and SakuraMedia's main image and collapsed screenshots. The README keeps six highlights, the install table, documentation navigation and the necessary limits; parameters, caches, task recovery, diagnostics and upgrade details are carried by topic documents. The current text version is in `docs/reference-sources.json`, and no external copy or terms of use are copied.
- **Screenshots and Star history (2026-10-27)**: the five movie demo library screenshots are kept, with the home main image shown directly and the other four collapsed; the WebPs all link to the PNG originals. The Star History is generated by `scripts/render_star_history.py` from day-by-day records, with the horizontal axis starting at the first Star, a peach neon outline, linear absolute-value coordinates and light and dark themes (replacing Star Chart's weekly-granularity chart from 2026-10-28). An independent GitHub Actions job generates the SVG daily and writes only to the `star-history` branch, and the README does not promise instant refresh; for data retrieval and trade-offs see the [reuse record](REUSE.md).
