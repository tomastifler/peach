# Documentation and UI Copy

Peach uses [seiso](https://github.com/scarletkc/seiso) to check Markdown responsibilities, links, and rule exceptions. Chinese prose follows tech-doc-style-chinese; UI text is also reviewed against the actual operations, error states, and available recovery options.

## Document Responsibilities

File classification is maintained in [seiso.toml](../seiso.toml). A new document must choose one responsibility; when an existing path mapping does not match the content, declare `kind` in the frontmatter.

| Content | Belongs to | kind |
| --- | --- | --- |
| Product purpose, install entry, doc navigation | [README](../README.md), with the English version maintained in sync | `readme` |
| Install, configuration, testing, and maintenance steps | Operations docs such as [Operations and Configuration](OPERATIONS.md) and [Testing and Dependencies](TESTING.md) | `howto` |
| Architecture, terminology, interface constraints, reuse rationale | [Architecture](ARCHITECTURE.md), [Development Conventions](../AGENTS.md), [Reuse List](REUSE.md) | `reference` |
| Decision background, choices, and costs | Numbered decision files under `adr/` | `adr` |
| Work not yet done | [Public roadmap](https://github.com/orgs/peach-mitao/projects/7) | `plan` |
| User-facing release records | [Changelog](../CHANGELOG.md) | `changelog` |

Maintain each fact in one place and link to the file or section from other pages. For versions, file counts, and deployment status, prefer pointing to a manifest, code, or query entry; when keeping an observed value, state the verification date. A code version cannot be used to infer that a service has been updated.

The README keeps the information needed to get started. Put field definitions in reference docs, procedures in howtos, and design rationale in ADRs. Keep existing section anchors; when moving content, fix references at the same time.

## Public and Private Records

- Local handoffs, run status, personal to-dos, session retrospectives, library inventories, and item-by-item review records are saved to `<Peach data directory>/state/project-context/`, `review/`, or `archive/`, and do not enter Git.
- Public docs use neutral accounts, placeholder paths such as `<project directory>`, and RFC 5737 documentation addresses. Hostnames, network layout, media file names, and library counts are not copied from a real deployment.
- Public reference evidence keeps the source, license, and reproduction method; local sample lists, raw logs, and account information stay in private records.

## UI Text

- Buttons state the action and object, such as "Save settings" and "Delete playlist". The same concept uses the same name across navigation, buttons, and hints.
- Empty states distinguish not yet created, filter with no results, no permission, and read failure. When describing the next step, only write operations the page actually provides.
- An error title names the object; the body keeps the cause and states the feasible recovery. A request timeout does not show that the background task has stopped; check the task status first and then decide whether to retry.
- Confirmation text for delete, clear, uninstall, and similar actions states the object, what is kept, and the range that can be undone; keep the existing safety conditions.
- The UI explains behavior to the user. Database columns, internal status codes, and implementation details go in development docs; paths, domains, and fields needed for configuration stay accurate.
- Chinese text uses Chinese punctuation, with spaces between numbers and units and between Chinese and English left according to meaning. Code identifiers, API fields, URLs, original site names, quotations, and original third-party license text are not replaced.

Shared request errors are provided by [requestErrorMessage](../frontend/src/core/index.ts), and React's [API wrapper](../frontend/src/api.ts) reuses it; pages add the operation object to the error title. Copy edits do not change field values, routes, task status, or data write conditions.

The descriptions of external entries on the settings page are maintained in [configuration-copy.ts](../frontend/src/configuration-copy.ts) and shared by the first-screen skeleton and the final form. When editing a description, line breaks and heights in both places must also match, verified by the browser geometry test.

## Checking and Review

First install the locked dev environment per [Testing and Dependencies](TESTING.md#environment-and-lock-files). Run the following commands from the repository root to check all project Markdown:

```text
uv run --locked --extra dev seiso check
```

View experimental rule hints, and check facts and context one by one:

```text
uv run --locked --extra dev seiso check --preview --output-format concise
```

View the actual classification, excluded scope, and enabled rules:

```text
uv run --locked --extra dev seiso policy
```

The copy check in the official test entry runs seiso's stable rules and keeps the [final-state checker](../scripts/check_copy_final_state.py). Preview rules are for manual review only and are not a CI gate; a seiso pass also cannot prove language style, content accuracy, or UI fit.

The final-state check shares `scripts/copy-rules.json`. It rejects text that plainly narrates implementation changes or test names that describe a change process; words that may be conditional statements only prompt manual verification. Legitimate conditional statements need no exemption marker. Incident wording that must be kept still explains the exception line by line with `copy-lint-disable-line`.

The Python check reads AST strings, static parts of f-strings, and comments; HTML reads body text, comments, and visible attributes. JS/TS is parsed by `frontend/scripts/copy-check.mjs` using Oxc for comments, strings, templates, and JSX, ignoring variable names, static property keys, and module paths. The frontend copy check runs with the official entry's frontend lint case, CI runs it through `web-bundle`; the pure-Python doc check does not require installing Node.

Commit templates are not finished text; `docs/reference-snapshots/upstream/` holds original third-party text, and its relative links belong to the upstream repository. These two categories are excluded in the configuration. Forensic summaries, ADRs, skills, and dependency source notes that Peach writes itself are still checked; build directories and dependency install directories are not project docs.

Necessary exceptions follow [seiso's exception syntax](https://github.com/scarletkc/seiso/blob/main/docs/guides/checking.md#explain-an-exception), stating the full rule ID and the reason. A rule hint must first be judged for whether it holds; do not hide project problems by widening the exclusion scope.
