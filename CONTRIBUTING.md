# Contributing to Peach

Issues and pull requests are welcome. Maintainer-authored changes follow the same PR workflow. Small fixes (bugs, copy, documentation, tests) can go straight to a PR; complex bugs and large changes — new features, default behavior, connectors, contract or data-layer changes, anything an ADR covers — should have an issue first. Read [`AGENTS.md`](AGENTS.md) before opening a PR: it is the single entry point for development rules, and reviews follow it. Each platform has exactly one test entry point: `& .\scripts\test.ps1` on Windows and `./scripts/test.sh` on macOS/Linux. By submitting a contribution you agree to license it under AGPL-3.0-or-later. The rest of this document is in Chinese.

Peach 是单人自托管应用，由一个人维护。欢迎提 Issue 和 PR。维护者自己的改动也遵循同一套流程，通过 PR 保留审阅与验证记录。

- 小修（修缺陷、改文案、补文档、补测试）可以直接提 PR。
- 复杂缺陷和大改动（新功能、新页面、新连接器、默认行为、接口约定或数据层、涉及 ADR 的方向）先有 issue，复用已有问题记录。

By submitting a contribution you agree to license it under AGPL-3.0-or-later.

## Opening an issue

公开截图、录屏和附件使用不含露骨画面的演示资料，并遮盖隐私信息；不要上传影片、封面原图或数据库。公开内容与素材许可要求见[文档规范](docs/WRITING.md#公开与私有记录)。

Use demo data without sexually explicit imagery in public screenshots, recordings and attachments. Redact private information, and do not upload videos, original cover images or databases.

- **报缺陷**：写清 Peach 版本或构建、系统版本及架构、安装方式、复现步骤、期望结果和实际结果，附上完整报错。无法稳定复现时说明发生条件，不要求自行判断根因。Python 版本仅用于源码部署，可选；`/healthz` 返回也可选，服务无法启动时写「无法访问」即可。贴日志或诊断报告前先遮盖本机路径、网络地址、账号及凭据。
- **提需求**：写清问题和使用场景。开放需求见 [公开路线图](https://github.com/orgs/peach-mitao/projects/7)，设计边界见 [总体架构](docs/ARCHITECTURE.md#明确不做)。涉及多用户、云托管、微服务或 PostgreSQL 的提案，先讨论是否需要新增 ADR。
- **安全问题**：不要开公开 issue，按 [`SECURITY.md`](SECURITY.md) 私下报告。

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

1. 不用 `git add .`、`git add -A`、目录路径或通配符，只暂存这次改动的文件。
2. 实现和它的测试放在同一个提交里。
3. 一个 PR 对应可独立验收的目标。同一目标的实现、测试及必要的 CI、升级补修放在同一个 PR，按逻辑分提交并共享验证；无关需求独立评审，确需拆分时说明独立交付或隔离的理由。在「影响面」表里说明数据层、API、页面、契约、测试和文档的实际影响，不适用的写明原因。

### 变更性质与行为边界

修复说明具体触发、实际错误和既有预期的依据；新功能、主动调整默认行为或设计时说明使用场景、现有能力的不足与取舍，取得维护者对方向的确认。恢复已确认预期的修复按常规验证与集成流程处理。混合 PR 分别说明各部分，不能仅凭 `fix` 标题或测试通过判定为修复。

范围按实际资源和操作判断：同一作品不代表所有版本共享同一份图片；共享资源与独立资源分别验证。改变图片内容、数据归属或处理范围时说明对既有用户的影响，控制项按实际场景设计，不要求所有行为都新增开关。

### AI 参与与提交责任

允许 AI 辅助方案、代码、测试、文档和 PR 文字。使用时简短说明参与范围，以及提交者实际检查的内容；不要求提供提示词或模型名称，提交里也不需要加 AI 署名。

维护者采纳社区补丁时保留原作者为提交作者，用 `Source-PR`、`Original-Commit` 记录来源，不替贡献者补加 AI 署名。提交里的智能体署名表示维护侧智能体的改写或补充，只在它确实改动了代码时出现，不代表贡献者使用了 AI。署名门槛只检查维护者本机提交者自己的提交，见工作树交付约定。

提交者对最终内容负责，能够解释设计与取舍，并核对代码、说明和验证结果。未运行的测试、跳过项、未取得的样本和待原环境验收的部分在「测试结果」中明确标注，不把推测写成已验证结论。维护者按影响和风险评审，授权与确认边界见 `AGENTS.md`。

是否使用 AI 不凭文风、标签或提交通道推断；反馈按事实、上下文和可追查证据处理。报告者无需先使用 AI 排查，也无需自行确定根因。

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
