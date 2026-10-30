# Contributing to Peach

Issues and pull requests are welcome. Maintainer-authored changes follow the same PR workflow. Small fixes (bugs, copy, documentation, tests) can go straight to a PR; complex bugs and large changes — new features, default behavior, connectors, contract or data-layer changes, anything an ADR covers — should have an issue first. Read [`AGENTS.md`](AGENTS.md) before opening a PR: it is the single entry point for development rules, and reviews follow it. Each platform has exactly one test entry point: `& .\scripts\test.ps1` on Windows and `./scripts/test.sh` on macOS/Linux. By submitting a contribution you agree to license it under AGPL-3.0-or-later. The rest of this document is in Chinese.

Peach is a single-user self-hosted app, maintained by one person. Issues and PRs are welcome. The maintainer's own changes follow the same process, keeping review and verification records through PRs.

- Small fixes (bug fixes, copy changes, docs, tests) can go straight to a PR.
- Complex bugs and large changes (new features, new pages, new connectors, default behavior, interface contracts or the data layer, directions touching an ADR) start with an issue, reusing existing issue records.

By submitting a contribution you agree to license it under AGPL-3.0-or-later.

## Opening an issue

Public screenshots, screen recordings and attachments use demo material with no explicit imagery, with privacy information masked; do not upload videos, original cover images or databases. For the requirements on public content and material licenses, see the [documentation guide](docs/WRITING.md#public-and-private-records).

Use demo data without sexually explicit imagery in public screenshots, recordings and attachments. Redact private information, and do not upload videos, original cover images or databases.

- **Reporting a bug**: state the Peach version or build, OS version and architecture, installation method, reproduction steps, expected result and actual result, and attach the complete error. If it cannot be reproduced reliably, describe the conditions under which it occurs; you are not required to work out the root cause yourself. The Python version applies only to source deployments and is optional; the `/healthz` response is also optional, and if the service cannot start, write "unreachable". Mask local paths, network addresses, accounts and credentials before pasting logs or diagnostic reports.
- **Requesting a feature**: state the problem and the usage scenario. For open requests see the [public roadmap](https://github.com/orgs/peach-mitao/projects/7), and for design boundaries the [overall architecture](docs/ARCHITECTURE.md#explicitly-not-doing). For proposals involving multi-user, cloud hosting, microservices or PostgreSQL, first discuss whether a new ADR is needed.
- **Security issues**: do not open a public issue; report privately following [`SECURITY.md`](SECURITY.md).

## Issue handling rules

Maintainers and agents helping maintain follow this section when handling issues. Reply in the reporter's language; the submission templates and label descriptions are provided in Chinese and English. Without explicit authorization, do not edit the title, body or comments of someone else's issue; write a separate maintainer summary when one is needed. Classification, linking, assignee and open/close operations on existing issues follow the authorization of the current task and are not changed in bulk just because these rules were tidied up.

### Replies, mentions and formatting

- The first reply briefly acknowledges the problem, states the facts already confirmed or the judgments still to be verified, and then gives the next step. When more information is needed, list all required items at once and do not ask the user to run environment checks unrelated to the problem.
- A fix reply states the cause, what was fixed, a link to the downloadable version, and the scope of verification. Report code passing tests and a retest in the original user's environment separately, and never write a guess as a confirmed cause.
- Use `@mention` only when a specific person needs to supply information, retest or act, and say what the action is; do not repeat mentions in ordinary replies, to avoid notifying unrelated people and teams.
- Titles describe the symptom briefly, without stacked type, status or version prefixes. The body uses short paragraphs and lists where needed; logs go in code blocks, and long logs are folded with `<details>`. Check screenshots, logs and diagnostic reports for private information first.
- Links use explicit text, for example "0.40.1 download" or "fix PR #123"; when linking other issues, state the relationship.

### Sidebar fields

| Field | Convention |
| --- | --- |
| Type | `Bug`: abnormal behavior; `Feature`: feature suggestion; `Task`: a well-defined maintenance task. The bug and feature templates set `Bug` and `Feature` respectively; maintenance tasks created by maintainers use `Task`. |
| Labels | Add `platform:*` for platform, `area:*` for module and `status:*` for handling conditions as needed. Multiple affected platforms or modules may be listed side by side; do not guess at unconfirmed impact. Label definitions are in the [label list](.github/labels.json). |
| Assignees | Set the person who actually claims and handles it; leave empty when unclaimed, and do not treat the reporter as the owner. |
| Milestone | Link only a confirmed target version or phase; leave empty when there is no release commitment. When fixing a released version, also give the link in the reply. |
| Projects / Priority | Maintain only when project scheduling is actually in use; pick one place to record status and one for priority, and do not express the same thing in both a project field and a label. |
| Relationships | Record only explicit parent-child and blocking relationships; do not infer dependencies from similar titles. |
| Development | Link the PR that actually fixes the issue, not PRs kept only for reference or comparison. |

`status:needs-info` means information needed for diagnosis is missing, and the reply should list the specific gaps; `status:needs-verification` means a downloadable fixed version exists and is waiting for verification in the target environment. The two are mutually exclusive; remove them when the condition goes away. There are no status labels for unhandled, in progress or closed. The platform or module may be left empty when no impact is clear.

`bug` and `enhancement` are reserved for PRs and issues without a Type set; new issues that use Type do not also get a synonymous label. `dependencies`, `javascript`, `github_actions` and `python:uv` are for the corresponding dependency updates, and `documentation`, `accessibility` and similar are used according to actual content. Label names stay stable; colors and bilingual descriptions follow the list. When changing the list, sync it to GitHub and read it back to verify, and do not bulk-delete or rename existing labels.

### Closing, reopening and linking

- After a fix is released and has corresponding verification evidence, reply with the resolved version and verification result, then close as Completed. While the original user's environment is still unconfirmed, keep it Open with `status:needs-verification`; a merged PR alone is not evidence of resolution.
- If the same problem still reproduces in the fixed version, reopen it and add the version and reproduction evidence; for a different problem, open a separate issue and cross-reference them.
- For duplicates, first link to the issue that continues to track it and state the basis for the duplication, then close as Not planned. When something is clearly out of project scope or not planned, state the reason and also close as Not planned; do not label these as fixed.
- While waiting for information, keep the issue Open; do not auto-close it for lack of a reply, and do not set up automatic expiry or bulk closing.
- Fix PRs and commits reference issues with plain numbers, for example `Refs #123`. This project closes issues manually based on release and verification results, and does not use `Fixes #123`, `Closes #123` or `Resolves #123`, which would auto-close on merge to the default branch.

For GitHub's field and template mechanisms, see [Issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization), [issue template configuration](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository) and [linking a PR to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).

## Before opening a PR

Read [`AGENTS.md`](AGENTS.md) first; it is the single entry point for development rules, and PR review follows it. For branch, staging and commit details, see [`.claude/skills/peach-worktree/SKILL.md`](.claude/skills/peach-worktree/SKILL.md). The three rules most easily broken:

1. Do not use `git add .`, `git add -A`, directory paths or wildcards; stage only the files changed this time.
2. Keep an implementation and its tests in the same commit.
3. One PR corresponds to an independently acceptable goal. The implementation, tests and necessary CI and upgrade repairs for the same goal go in the same PR, split into commits logically and sharing verification; unrelated needs are reviewed independently, and when a split is truly needed, state the reason for independent delivery or isolation. In the "Impact" table, state the actual impact on the data layer, API, pages, contracts, tests and docs, and give the reason for any that do not apply.

### Nature of the Change and Behavior Boundaries

A fix states the specific trigger, the actual error and the basis for the existing expectation; a new feature or a deliberate change to default behavior or design states the usage scenario, the shortfall of existing capabilities and the trade-offs, and obtains the maintainer's confirmation of the direction. A fix that restores a confirmed expectation follows the normal verification and integration flow. A mixed PR describes each part separately, and cannot be judged a fix merely from a `fix` title or passing tests.

Scope is judged by the actual resources and operations: the same work does not mean all versions share one image; shared and independent resources are verified separately. When changing image content, data ownership or processing scope, state the impact on existing users; design controls for the actual scenario, and not every behavior needs a new switch.

### AI Involvement and Submitter Responsibility

AI assistance with plans, code, tests, docs and PR text is allowed. When used, briefly state the scope of involvement and what the submitter actually checked; prompts or model names are not required, and no AI attribution is needed in commits.

When the maintainer adopts a community patch, the original author is kept as the commit author, and `Source-PR` and `Original-Commit` record the source; no AI attribution is added on the contributor's behalf. An agent attribution in a commit means a rewrite or addition by the maintainer-side agent, appears only when it actually changed the code, and does not mean the contributor used AI. The attribution gate checks only the commits of the maintainer's own local committer, see the worktree delivery conventions.

The submitter is responsible for the final content, can explain the design and trade-offs, and checks the code, descriptions and verification results. Tests not run, skipped items, samples not obtained and parts awaiting acceptance in the original environment are marked explicitly in "Test results", and speculation is not written up as verified conclusions. The maintainer reviews by impact and risk; for the authorization and confirmation boundaries see `AGENTS.md`.

Whether AI was used is not inferred from writing style, labels or the submission channel; feedback is handled by facts, context and traceable evidence. Reporters need not use AI to investigate first, nor determine the root cause themselves.

## Testing

Each platform has exactly one test entry point:

```powershell
& .\scripts\test.ps1            # Windows
```

```bash
./scripts/test.sh               # macOS / Linux
```

Without arguments, the test scope is chosen automatically from the changed files, and the full suite runs when it cannot tell. You can also specify the scope manually, for example `-Scope follow` (on macOS/Linux, `./scripts/test.sh follow`); options include `follow`, `catalog`, `media`, `sync`, `metadata`, `web` and `tooling`. When a change spans several scopes, touches database migrations, shared test infrastructure or dependencies, or is large, run the full suite with `full`.

The script finds the virtual environment and checks import paths itself; do not assemble venv paths by hand or write separate test commands. The test framework is the standard-library `unittest`.

## Frontend changes

`frontend/` requires Node 24 or later.

Running Peach does not need Node: the Python service and the installers read the built `web/dist/` directly, so it is committed to Git. After changing `frontend/src`, run `npm --prefix frontend run build` in the same PR and commit `web/dist/`; the CI `web-bundle` job checks that the build output matches the source. For directory structure and style conventions, see [`docs/FRONTEND.md`](docs/FRONTEND.md).

## Commit messages and changelog

- Commit subjects use `type(scope): description in Chinese`, for example `fix(web): 修正列表滚动`; type and scope are checked by the project's commit checker.
- Mark breaking changes with `!` in the subject, or add a `BREAKING CHANGE:` footer.
- PRs do not need to edit [`CHANGELOG.md`](CHANGELOG.md). Versions, the changelog and releases are handled together by `scripts/release_tag.py`; see [Operations and configuration](docs/OPERATIONS.md) for the process.

## Copy and wording

- Document responsibilities, ownership of facts and UI text follow [Documentation and UI copy](docs/WRITING.md). The official test entry runs the stable seiso rules; the preview rules are for manual review.
- Documents, comments, UI text and test names are all written in Chinese; code identifiers, commands, protocol names and library names stay in English.
- Write only the current state, not "before and after" comparisons, and do not keep rejected approaches. `tests/test_copy_final_state.py` checks this; for incident text that genuinely must be recorded, add `copy-lint-disable-line` to each line to let it through.
- Do not commit media, databases, credentials, logs, build caches or personal information (LAN addresses, hostnames, account names, personal directories).
