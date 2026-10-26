# Contributing to Peach

Issues and pull requests are welcome. Small fixes (bugs, copy, documentation, tests) can go straight to a PR; large changes — new pages, new connectors, contract or data-layer changes, anything an ADR covers — should be discussed in an issue first. Read [`AGENTS.md`](AGENTS.md) before opening a PR: it is the single entry point for development rules, and reviews follow it. Each platform has exactly one test entry point: `& .\scripts\test.ps1` on Windows and `./scripts/test.sh` on macOS/Linux. By submitting a contribution you agree to license it under AGPL-3.0-or-later.

Peach is a single-user, self-hosted application maintained by one person. Issues and PRs are welcome.

- Small fixes (bugs, copy, documentation, tests) can go straight to a PR.
- Large changes (new pages, new connectors, changes to contracts or the data layer, directions covered by an ADR) should be discussed in an issue first, so you do not finish the work only to find it conflicts with the established design.

By submitting a contribution you agree to license it under AGPL-3.0-or-later.

## Opening an issue

- **Reporting a bug**: state the Peach version or build, OS version and architecture, installation method, reproduction steps, expected result and actual result, and attach the full error. If you cannot reproduce it reliably, describe the conditions under which it happens; you are not expected to work out the root cause. The Python version applies to source deployments only and is optional; the `/healthz` response is also optional, and if the service cannot start, write "unreachable". Before pasting logs or diagnostic reports, mask local paths, network addresses, account names and credentials.
- **Requesting a feature**: describe the problem and the use case. Open requests are on the [public roadmap](https://github.com/orgs/peach-mitao/projects/7); design boundaries are in [Overall architecture](docs/ARCHITECTURE.md#explicitly-not-doing). For proposals involving multiple users, cloud hosting, microservices or PostgreSQL, first discuss whether a new ADR is needed.
- **Security issues**: do not open a public issue; report privately per [`SECURITY.md`](SECURITY.md).

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

1. Do not use `git add .`, `git add -A`, directory paths or wildcards; stage only the files changed in this work.
2. Put the implementation and its tests in the same commit.
3. One PR does one thing, and the "Impact" table in the PR template covers each item (data layer, API, pages, contracts, tests, docs), including those that do not apply.

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
