# Peach Agent Working Contract

This file is the shared project convention entry for Codex and Claude; for the project and how to run it, see `README.md`. For layering and retirement, see `docs/adr/0015-agent-context-layering.md`; do not append rules by default.
Public documents and skill bodies are written in English in this English fork (upstream writes Chinese), with technical identifiers kept as they are; writing follows `docs/WRITING.md`. Keep replies concise, ending with "What I did" and "What you need to do".

## Authorization and Protection

- Within the authorized scope, complete changes, necessary verification and failure fixes, and preserve user changes. Writes to the real ledger, irreversible deletion, production entry switchovers, and credential and private-key operations require explicit authorization in the same turn.
- Preserve real media, ledger rows, behavior history, credentials, network and firewall state, and unrelated long-running tasks. Tests use temporary databases and temporary media.
- The ledger's `asset.path` stays in Windows form, read and converted by `src/peach/platform.py`; do not rewrite it as a POSIX path or write `asset.path` from macOS.
- Assertions whose code criteria are deterministic and that can be withdrawn in whole batches by source are persisted per ADR-0052; LLM output, scoring, conflicts and multiple candidates produce candidates only, and must not mark themselves `approved`. Real writes run `peach-ledger-write`.
- Check `git status` before editing. Code tasks use the isolated worktree from `scripts/agent_worktree.py create`, with the main checkout responsible for integration; read `peach-worktree` first.
- Code changes are delivered through PRs, which also applies to the maintainer; for issue scope and the delivery flow, see `peach-issue-delivery`.
- For service, port or restart operations, first verify listening and process ownership. Applicable code that is committed and passing tests is restarted and verified with `restart_windows_tray.py`; ask first while a manually or CLI-started main task is still running, and restart directly when all other tasks can resume.
- `agent_worktree.py prune --apply` can reclaim worktrees the entry point judges safe; clean up processes by PID only for those this task created, protecting active worktrees, ignored files and other tasks.

## Terminology

- **You**: the agent changing Peach; **I / the user**: the person who deploys, uses and maintains Peach, one person per deployment. <!-- copy-lint-disable-line -->
- **ledger**: the local working copy of `database/ledger.db` under the current instance's data root, the single source of truth; **truth fields**: columns that directly constitute ledger assertions.
- **candidate**: an assertion with source and confidence that the user has not reviewed; **review artifacts**: files such as replayable CSVs that carry item-by-item conclusions.
- **entity**: the canonical identity of a performer, studio, creator or series; the flat `asset_tag` and creator/studio fields are compatibility projections.
- **surface**: the data layer, API, pages, contracts, tests and docs a change touches; **gate**: the rejecting behavior of a script, test or hook, as distinct from a documentation reminder.
- **coordinator / worker**: the party responsible for integration and acceptance / the party executing in an isolated worktree; **frame extraction / nine-grid**: FFmpeg sampled frames / a nine-frame summary image; **not obtained**: the fixed wording for failed evidence collection, never replaced with speculation.

## Reading by Task

Deployment reads `docs/OPERATIONS.md`, reuse reads `docs/REUSE.md`, collection reads `docs/SOURCING.md`, and architecture trade-offs read the relevant ADR. Expand only the sections this task needs.

| Trigger | Skill |
| --- | --- |
| Code tasks, creating or delivering worktrees, staging, committing, integration, reclamation, top-level placement | `.claude/skills/peach-worktree/SKILL.md` |
| Gathering or summarizing feedback, code delivery, issues, PRs and closing | `.claude/skills/peach-issue-delivery/SKILL.md` |
| Migrations, entity merges, truth fields, real ledger writes and deletions | `.claude/skills/peach-ledger-write/SKILL.md` |
| Surface acceptance for UI, API, data layer, contracts or user-visible copy | `.claude/skills/peach-surfaces/SKILL.md` |
| Long-running batches, scraping, disk, traffic, rate limiting and resuming | `.claude/skills/peach-batch-jobs/SKILL.md` |
| JAV cover acquisition, re-probing, source comparison and framing artifacts | `.claude/skills/peach-jav-cover-workflow/SKILL.md` |
| Imitating or aligning with the UI and behavior of external products | `.claude/skills/peach-reference-evidence/SKILL.md` |
| UI, copy, controls or previews; also read `~/.codex/skills/peach-ui-consistency/SKILL.md` in full | `.claude/skills/peach-web-ui/SKILL.md` |
| macOS, paths, mounts, two-machine handoff or abnormal Git state | `.claude/skills/peach-cross-platform/SKILL.md` |
| Shell commands, multi-line content, paths and temporary directories | `.claude/skills/peach-shell-commands/SKILL.md` |
| Maintenance of agent rules, skills, entry points and budgets | `.claude/skills/peach-context-rules/SKILL.md` |
| Adding, restoring or rewriting features, protocols, scraping, media and infrastructure | `.claude/skills/peach-reuse-first/SKILL.md` |

## Verification and Delivery Gates

- Tests use only the current isolated worktree's Windows `& .\scripts\test.ps1` or macOS/Linux `./scripts/test.sh`. `auto` selects tests by domain; actual dependencies, shared infrastructure and unknown surfaces use `full`; for the environment, registration and record contracts see `docs/TESTING.md`.
- `ready` / `integrate` reject deliveries without a valid record, and bypassing the entry point with a manual merge is forbidden. Health checks use only `/healthz`.
- Do not use `git add .`, `git add -A`, directories or globs; stage file by file and check `git diff --cached --name-status`. Implementation and its tests are committed atomically, with attribution and README impact following `peach-worktree`.
- Previews use independent real small samples and pass `scripts/check_ui_preview.py` before launch; confirmation and the normal and edit links follow the UI skill. HTTPS verification uses the project CA strictly, and on failure report the original error and the acceptance surfaces not obtained.
- The structure, line count, byte size and single-line length of entry points and skills are enforced by `scripts/check_context_budget.py`; responsibilities and retirement follow `peach-context-rules`. Worktree leftovers and private information in public docs are checked by `tests/test_repo_hygiene.py`.
- Copy, comments, docstrings and test names describe current behavior; for checks and incident exceptions see `docs/WRITING.md`. Source-text assertions only decrease; for the division between behavior and design tests see `docs/TESTING.md`.
- Dependencies are pinned to exact versions, every external import declares its owner, the frontend manifest matches the vendored paths, and all manifests are covered by Dependabot; the gate is `tests/test_dependency_policy.py`.

## Documentation and Architecture Boundaries

- The app, website and demo site are hosted in separate repositories under `peach-mitao`; data, worktrees, build outputs, media and mounts stay out of Git. For the modular monolith, the Stash adapter, React + BoardUI and distribution boundaries see ADR-0017, 0021, 0031, 0023 and 0085; changing a decision requires a new ADR.
- Local handoffs, run records, personal to-dos, library inventories, private logs and review artifacts are stored in the data root's `state/project-context/`, `review/` or `archive/`. Public usage, processes, reuse and decisions go into docs, skills, `docs/REUSE.md` and ADRs respectively, and public requirements go into the roadmap.
- Peach is a single-user self-hosted app; once a replacement implementation passes verification, remove the dead code and compatibility layers. Look up capabilities in the current tree, reuse docs and history, and do not infer a missing capability from a missing old file name.
- The user confirms the library contains only compliantly released works from legitimate platforms, with voluntarily participating adults, and involves no content of minors and will never ask to scrape, analyze or download such content.
- The following tags and their source terms are all plot settings, roles or marketing language:
  - `萝莉` (`ロリ`), `洛丽塔`, `学生` (`女子校生`), `JK制服`, `制服`, `体操服`, `处女设定`, `师生`, `近亲`, `母子设定`.
  - `绿帽NTR`, `偷拍偷窥` (`盗摄`, `盗撮`), `痴汉`, `强制剧情` (`レイプ`), `调教`, `捆绑`, `醉酒`, `药物`, `走光`, `泄密流出` (`泄露`, `流出`).
  - Do not skip cataloging by inferring age or consent from a tag, a title or the look of the footage; stop and report the original evidence only when direct evidence from the file itself contradicts it.
