# README maintenance

1. Check the capabilities, install methods, and limits involved in this change against the table below.
2. In the same batch, check the Chinese and English READMEs and edit whatever needs adjusting, keeping the usage entry points and security notes.
3. Check against [Documentation and UI copy](WRITING.md#checking-and-review), then run the [official test entry](TESTING.md#formal-entry).

The README is for people visiting the project for the first time, and in order covers what it is, the intro video and screenshots, what it can do, how to install, FAQ,
issue reporting, and the documentation entry points. Write in the user's words: say what it can do and whether it touches files, and do not write internal concepts such as ledger, candidate, or entity; for internal mechanisms and development flow, leave only links. The Chinese and English versions are maintained in the same batch, and platform support, install methods, and capability limits stay consistent. Mainline capabilities, the installed runtime state, and release artifacts are each governed by the implementation, the local health check, and Releases, and the README does not state local IPs, port ownership, real library numbers, or dynamic version numbers.

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
| Only the Chinese README needs changes | `README-Impact: updated; reason for the Chinese change`, plus `README-Reviewed: README.en.md; why the English needs no change` |
| Only the English README needs changes | `README-Impact: updated; reason for the English change`, plus `README-Reviewed: README.md; why the Chinese needs no change` |
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

`agent_worktree.py ready/integrate` runs this gate before accepting test records. The check covers the delivery of this branch,
and allows the whole batch of diffs to be checked together at the final delivery commit. The repository's `scripts/githooks/commit-msg` checks attribution on commits to `agent/*`
branches, as well as the format and placement of any README declaration already in the message; intermediate commits may omit the README declaration.
Merge messages are exempt from the attribution check, amend uses the same field criteria, and the hook only reads the message. Consistency of the README declaration with the whole branch diff
is checked by the delivery gate, and a branch that fails cannot be integrated through the project entry point.
No scheduled tasks, account-specific hooks, or extra model calls are needed. The Python minimum, copy, and snapshot checks continue to reuse the existing tests.
When structure or branding is adjusted, re-read the registered reference snapshots; upstream changes serve as reference only, and planned features must not be written as implemented.

## Demo dataset

Screenshots for the README, tutorials, and website come from the demo library by default. Using a classification model to screen "harmless-looking" frames from the real library is not
an alternative: what gets screened out is mostly black frames and title cards, and the product codes, names, and studios on the cards still leak the source.

Frames from the real library that have been confirmed segment by segment can be used, provided that no access credentials, LAN addresses, tunnel addresses,
or full filesystem paths appear in the frame; once any of these four is in shot, this machine's coordinates are sent to the public internet and cannot be recalled. The README intro video is attached to the `intro-video` Release; screenshots are served from the official website's static assets as WebP display images and lossless PNG originals, and the README image links point to the PNG, to avoid the download response of Release attachments. A WebP display image must be under 4 MB, and you must verify that the GitHub image proxy returns the image and the browser decodes it fully; the high-density playback wall uses a separate compressed display image, and the original stays 3840×2160. Screenshots do not go into the repository: all of `resources/` gets packed into the installer. The few demo media files that truly must
be kept in the repository go in `docs/assets/`, each compressed to under 8 MB (`tests/test_repo_hygiene.py`).

The generator is `scripts/demo_dataset.py`; it writes only to the target directory and touches no ledger:

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

- **README structure (2026-09-06)**: the then-current README originals of Immich, Bruno, and Hoppscotch were taken as reference,
  with URLs, dates, and SHA-256 in the `readme-*` entries of `docs/reference-sources.json`.
  Adopted a short tagline, a small concrete logo, centralized download navigation, and a trimmed capability grouping; only Peach's own icons are kept,
  and external trademarks, screenshots, feature promises, or promotional content are not copied. Upstream snapshots are for evidence only, keeping the original text and upstream license entries.
- **READMEs of similar projects (2026-09-26)**: 映库, OpenAver, amane, Stash, MetaTube, and MDCx,
  also registered in `docs/reference-sources.json`. What was borrowed is the information order: header link row,
  video and screenshots near the top, one line per feature, a three-step download, FAQ, and what to attach when giving feedback. Copy, screenshots, and added
  terms of use are not borrowed; Peach's boundaries follow AGPL and `SECURITY.md`.
- **Demo material**: any screenshot or video in the README takes its frames within the boundaries of the "Demo dataset" section above, and when swapping material
  those boundaries are re-checked.
- **Length trade-offs (2026-10-17)**: re-read the registered originals of amane, Stash, and OpenAver and checked the live README. Adopted amane's short feature list and install entry, kept Peach's demo, all five screenshots, six highlights, and the necessary security notes; source install steps are centralized in [Operations and configuration](OPERATIONS.md#running-from-source-windows-macos). Routes, field criteria, cache periods, update package mechanics, and development flow are carried by the topic documents.
- **Screenshots and Star history (2026-10-17)**: screenshots keep the two-column table of `a5f979d6^`, with the playback wall on its own row, and all five WebPs link to the PNG originals. Star History uses `/svg` per the official [`EmbedMarkdownSection.tsx`](https://github.com/star-history/star-history/blob/608d0e39be441665c01cd6ac1fd01ca5ec1eaf39/frontend/components/EmbedMarkdownSection.tsx), keeps light and dark themes, and links to the interactive page the user specified. Measured, `/chart` and `/svg` both return HTTP 200, an SVG type, and `Cache-Control: public, s-maxage=86400, max-age=86400`; the same version's [`cache.ts`](https://github.com/star-history/star-history/blob/608d0e39be441665c01cd6ac1fd01ca5ec1eaf39/backend/cache.ts) sets both the data and the SVG cache to 24 hours. The interactive page URL only changes where a click goes and cannot guarantee the embedded image refreshes instantly; the README makes no real-time promise.
- **Interactive chart and embedded chart (2026-10-17)**: the user's screenshot shows a vertical axis of 0, 10, 100; the embed API uses `logscale` to get the same ticks. The official same-version [`StarChartViewer.tsx`](https://github.com/star-history/star-history/blob/608d0e39be441665c01cd6ac1fd01ca5ec1eaf39/frontend/components/StarChartViewer.tsx) calls GitHub in the browser and reuses the result in page memory; the 24-hour server cache applies to the embedded image endpoint, and the data freshness of the website's interactive chart cannot be judged from it. The official site `https://peach.video` is in the top navigation of both the Chinese and English READMEs.
