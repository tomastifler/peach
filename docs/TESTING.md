# Testing and dependencies

This document covers three things: how to install and upgrade dependencies; which tests to run after changing code and how CI splits them; and what new tests should look like.

The in-place upgrade of Windows release artifacts is run manually in Actions under "Windows 覆盖升级验收" (the workflow name, "Windows in-place upgrade acceptance"): fill in the published starting version, the target version and the full build commit of the target artifact. The workflow separately verifies in-place ZIP extraction and in-place installer installation, covers both the default data directory and a directory given by `PEACH_DATA_ROOT` for each path, and uploads logs. It uses published artifacts and does not rebuild or publish; online update and failure rollback are still verified separately by `scripts/smoke_online_update.py`.

The Release workflow also runs `smoke_update_tasks.py --apply` on a clean Windows runner, using a temporary ledger to verify that the installer accepts a running collection task, pauses it while keeping the task identifier, resumes automatically after the overwrite, and preserves configuration. The script only does a dry run by default; locally the ZIP and installer helper protocol can be verified, but real installer installation is limited to clean Actions runners.

## Environment and lock files

Docs-only CI still runs checks on Windows and macOS, but does not install frontend dependencies or FFmpeg or set up Chrome; mixed runtime changes and unknown inputs keep the complete tooling. Integration identifies docs by the same test-selection boundary, and Markdown explicitly mapped to runtime acceptance is not exempt from the full lock. Code integration first waits for the full lock and then takes the integration lock, so that a waiting code task does not block docs delivery.

Dependencies are reproduced exactly from lock files by uv. Source installs use `uv sync --locked`. Development, testing and builds create their own `.venv` in the isolated worktree, and the worktree does not touch the environment being served; dependency sync and migration of the main checkout are handled by the restart flow, see the section "Refreshing the Source Runtime" in [Operations and configuration](OPERATIONS.md) (ADR-0091).

Install all test dependencies (finish installing and building the frontend dependencies first, then start the formal verification):

```text
uv sync --locked --all-extras
```

Add a direct dependency and update both the manifest and the transitive lock file; versions must be pinned exactly:

```text
uv add "package==version"
```

The build environment selects only the build dependencies:

```text
uv sync --locked --extra build
```

Commit `pyproject.toml` and `uv.lock`. CI uses `--locked` to reject a stale lock file; Dependabot's `uv` ecosystem handles updates. `uv pip install` is used only for temporary environments or installing build outputs, not for maintaining project dependencies. A separate smoke test with plain pip installing the wheel verifies the packaging declarations independently.

### Taking over Dependabot upgrades

Dependabot PRs are always taken over locally, never merged on the web:

A dependency upgrade must also commit the derived artifacts. If only the npm manifest and lock file change, the vendor version record or build output may disagree with the files in Git, and the related gate rejects it; this by itself does not mean the dependency has a compatibility problem. The Test workflow first completes the selected frontend checks, and only after they pass does it start the Python, browser and wheel regressions. When artifacts are missing, take over locally and regenerate them first; do not skip the consistency check and merge directly.

- Each of the two npm manifests has a layer of derived artifacts: the root `package.json` corresponds to `web/vendor/**` and the version comment in `web/index.html`, and `frontend/package.json` corresponds to the main UI and standalone page bundles in `web/dist/`. Dependabot cannot compute these, and the token its workflow gets is read-only, so it cannot push back to `dependabot/**`; hence `npm run check:vendor` or the frontend artifact check fails.
- uv and github-actions have no derived artifacts, but master is integrated locally and is usually ahead of origin. Merging on the web would make the two sides diverge, and merging back on master in the main checkout is rejected by `scripts/githooks/`.

The weekly upgrades are taken over in one go in an isolated worktree:

1. Run `scripts/adopt_dependency_bump.py --all-open --co-author '<tool> (<model>) <vendor noreply>'` and look at the PRs it lists and their manifests.
2. Add `--apply`; in ascending PR number, one commit per PR: fetch the branch, three-way merge only its own manifest changes into place, regenerate derived artifacts for npm, and run `uv lock --check` for uv.
3. When two PRs touch adjacent lines the script stops, reports the conflicting files and prepares the commit message in `build/adopt-pr-<number>.txt`. Resolve the conflict, regenerate and commit following the steps it prints, then run `--all-open --apply` again; PRs already taken over are skipped according to the commit message.
4. Run `test.ps1 full`, go through ready / integrate, and after pushing master close the PRs one by one with the `gh pr close` commands it prints. The PRs show as Closed rather than Merged because the commits were redone locally.
5. In the same round run `scripts/check_reference_updates.py check --cadence weekly --diff` to check upstreams Dependabot cannot cover: whether the sha-pinned amane has moved forward, and whether reference sources that Peach code consumes directly or copies verbatim have changed. Review and `accept` follow the `peach-reference-evidence` skill; an amane advance is upgraded on its own branch.

For a single PR use `--pr <number>`, with the same flow. `.github/dependabot.yml` merges the minor and patch updates of each ecosystem into one PR, and semver-major still gets one PR per package; read the release notes before taking over. Major versions that need code changes are migrated and verified in an isolated worktree; major versions of TanStack Table are also checked by Dependabot.

The version comes from `src/peach/__init__.py` and is part of the uv cache key; syncing again after a source version update refreshes the installation metadata. The cache rule follows [uv's official dynamic metadata mechanism](https://docs.astral.sh/uv/concepts/cache/#dynamic-metadata).

### Checks for every release

Dependency upgrades are a fixed batch before a release is cut. Release authorization includes checks, applicable upgrades, compatibility changes, derived artifacts, verification and integration; you cannot go to release after merely listing the available updates.

1. At the start, do a read-only release review and two npm high-severity audits, covering the two Python manifests and locks, the two npm manifests, the Docker image, GitHub Actions, SHA-pinned runtime dependencies and the registered reference sources. The `--public-github` mode of `scripts/release_review.py` reads GitHub metadata anonymously; the audit uses `scripts/npm_audit.py`, specifying the root and `frontend` separately. The review comes before the upgrade plan, full regression and artifact builds.
2. In the isolated worktree, first take over Dependabot's independent difference sets, keeping the source, then check stable versions and updates not covered by a PR. Review major-version migrations, real consumers, field semantics, licenses and platform compatibility, pin versions and locks, and recompute vendor and frontend artifacts. Runtimes obey the platform scope and official support cycle; reference changes serve only as evidence. For anything that cannot be upgraded, record item by item the old and new versions, the specific compatibility problem, the failure evidence and the recovery condition, and complete the remaining upgrades.
3. After finishing targeted regression and applicable preview confirmation, recheck dependencies and security updates before heavy verification, record the commit, manifests, locks and pinned sources, and freeze this batch's inputs. When checks are incomplete or security updates are still pending, handle the inputs first, and do not start full regression or artifact builds; the freeze check must not be postponed until after integration, packaging or production restart.
4. For the frozen inputs, complete the official Windows and macOS full runs and the applicable artifact verification, then go through ready / integrate and runtime verification. Valid tests in the same environment are reused through the official entry, adding only the checks affected by the change; artifacts are judged reusable by their actual source, lock, build entry and target platform. Docs or maintenance CLI changes do not trigger rebuilding the bridge and Docker verification artifacts whose runtime content is unchanged. The CI rehearsal of the version commit and the tag release still obey the existing gates.
5. On a clean master, run `release_tag.py --bump auto --apply`, keeping the security recheck before the release cut and the tag, then confirm the release notes and continue with `--ship --apply`. Ordinary updates appearing after the freeze are registered for a later batch; when a security update that must be handled is found, return a separate supplement, freeze again and verify the actual impact, without rerunning the whole batch indiscriminately.

`release_tag.py --bump auto --apply` calls `release_review.py` before writing the version, checking the available updates of the two Python locks and two npm manifests, pending Dependabot PRs, SHA-pinned runtime dependencies and their latest stable releases, and all non-manual reference sources in the registry. The standalone check entry is `scripts/release_review.py`; the report is stored in `build/release-review.json`, with the commit, time, differences and item-by-item errors. Docker and GitHub Actions updates take Dependabot PRs as the lead, and an empty PR list is not used to assert everything is latest.

A network failure is recorded as "not obtained" and the other checks continue; when checks are incomplete, the version files stay as they were. The audit gate is still enforced by the release entry, and a note of deferred upgrades cannot be used to let a high-severity vulnerability through. Original-text evidence is accepted after review per `peach-reference-evidence`, and manual notes are not overwritten by web pages. An upgrade batch is a release workflow; the existing `release_tag.py` does not change dependencies or create upgrade branches automatically.

Public reference text provided manually by the user can be explicitly used for this check through `--reference-evidence SOURCE=FILE`. The report records the user's evidence channel, the original URL and the text's SHA-256, direct network forensics are still marked "not obtained"; the parameter does not modify the source registry, snapshots or the default checks of later releases.

## Verification frequency

Tests use the project entry points directly and set no machine-level resource slots, CPU, memory or process-count limits. Concurrency per run is chosen with `-Jobs` / `--jobs`, defaulting to at most four lanes by local core count, and an explicit positive integer has no machine-level cap. On cancel only the child process trees of this run, by the PIDs already created, are cleaned up; full tests and integration remain mutually exclusive as code consistency requires.

Python static checking uses the development dependency Ruff, scanning all of the repository's own Python files with each formal test domain, covering the application, scripts, tests and packaging entry points. The rules are Pyflakes (`F`), the Pylint error rules supported by Ruff (`PLE`), and the mutable default argument, `finally` jump, useless expression and loop closure rules (`B006`, `B012`, `B018`, `B023`). The generated `downloads_clouddrive_pb2.py` is excluded; publicly exported imports are declared with explicit same-name aliases. Preferences for naming, line count, blank lines and complexity are not part of this lint gate.

Invalid escapes are blocked by Ruff `W605`, and Windows paths use raw strings or double backslashes. Both the official entry and targeted debugging record unhandled background thread exceptions as test errors, keeping the original traceback; temporary ledgers must be cleaned up after the thread exits. Starlette TestClient uses the development dependency `httpx2`, and the app's HTTP client is still installed per the runtime manifest.

The frontend registers install-script policy item by item through `allowScripts`, and unregistered scripts are refused installation by `frontend/.npmrc`. `@sentry/cli` uses the platform binary package in the lock file, with extra download scripts disabled; the optional native build of `fsevents` is also disabled, and file watching uses the capabilities Node provides. After an upgrade, check the actual installation, build and CLI availability, and do not allow scripts in bulk.

Docs and copy checks include seiso's stable rules and the final-state check, run with the official entry. For usage of classification, scope, standalone checks and preview rules see [Documentation and UI copy](WRITING.md#checking-and-review). seiso is pinned by development dependencies and the lock file, and running Peach does not need it.

The full suite is not run every time: locally, tests are selected by the domains the change touches, and CI decides how wide the coverage is by commit type.
For debugging, run the relevant cases first, and once the code is frozen run `auto` once; do not hand-write per-domain loops that repeat the shared cases. When a test fails, reproduce it in a targeted way first, and after the fix `auto` decides which domains need to be re-tested.

| Scenario | Verification |
| --- | --- |
| Local changes | The official entry defaults to `auto`, taking the union by impact domain; valid records for the same code, environment and scope can be reused |
| Ordinary PR | Python 3.14: both macOS and Windows verify by impact domain |
| Ordinary mainline commit | Python 3.14: relative to the latest successful mainline Test that is an ancestor of the current commit, select the impact domains for macOS and Windows and the applicable frontend, browser and wheel |
| Real dependencies, migrations, shared test infrastructure, unknown impact | Full Python 3.14 on Windows and macOS |
| Manual CI | Full system matrix |
| wheel | One standalone minimal install each on Windows and macOS with Python 3.14 |
| Release | Reuses the mainline successful CI at the same SHA; the Windows standalone EXE and the Apple Silicon and Intel DMGs are built and accepted separately |

The full Python run is sharded stably by file, four shards on Windows and two on macOS. `auto` selects files by impact domain; when the unique selected test files reach 150, Windows reuses the four-shard allocation and macOS still uses a single shard; smaller `auto` runs use a single shard on both. Each shard uses its own runner, still running against the same baseline and impact domain, and the summary job requires all shards and planned selected jobs to succeed. Shard subprocesses do not issue records.

The `web-bundle` job of the Test workflow runs tsc, lint, Vitest, the build and the artifact diff check uniformly on Ubuntu; lint also checks that there are no diagnostics and that the number of scanned files is greater than zero. In CI the Python jobs hand these three tool cases to the frontend job and the two real-browser cases to the browser matrix; contract tests in the same module still run. Job identity is recognized by fixed workflow and job names, and unknown jobs and the local machine keep the full tests. A run that takes on part of CI's duties does not issue a local test record.

Browser cases are shared across the six Windows runners of `web-e2e`, each shard with its own service, demo library and logs. `ci_plan.py` assigns files according to the measured seconds in `ci-browser-timings.json`, new files use a default weight, and each file runs exactly once. Each shard runs its assigned browser files through the project entry's `-Focus`, and the first-launch file always belongs to the first-setup service. It installs Node 24, frontend dependencies and ffmpeg, and specifies Chrome through `PEACH_E2E_CHROME`. The local browser entry and concurrency semantics remain complete.

PR and ordinary mainline plans select frontend, vendor, wheel and browser jobs by change, docs run only the applicable checks; real dependencies, unknown impact, no verified baseline and manual verification include all jobs. `frontend-ready` summarizes the selected frontend checks, and on failure the later full regression does not start; a plan with no frontend job selected runs normally. Artifact differences are shown as file statistics. `verified` checks the required jobs against the plan, and missing, failed, cancelled and skipped required jobs all fail. The Actions workflows themselves are checked by a pinned actionlint for syntax, expressions, dependencies and scripts. A PR update cancels the stale runs of the same PR, and mainline Tests keep their results per commit. GitHub's scheduled jobs and the Python jobs use the same verified baseline, and the most recent failed push commit does not stand in for it.

The standalone Star chart workflow only generates the chart and writes to a dedicated branch, and its change selects `tooling` and the workflow check; a mixed commit still fills in the impact domains by its other files, and unknown workflows keep the full judgment.

Python shards upload the full test output; browser shards upload the TAP, service logs and redacted network logs, retained for 14 days. The npm audit fails directly on a high or critical vulnerability; only temporary network errors are requested up to three times, waiting 15 and 30 seconds after the first two failures, and an unknown response is not treated as a pass.

The GitGud pipeline (`.gitlab-ci.yml`) jobs `verify-linux`, `verify-windows` and `verify-macos` run the changed domains plus the platform-sensitive cases of this platform on branches and merge requests: the baseline is the commit, among the latest successful mainline pipeline, that is an ancestor of this commit, determined by `scripts/ci_scope.py`; first run `auto --base <baseline>` through the official entry, with domain selection and fallback-to-full rules the same as local `auto`, then run the cases of this platform in `PLATFORM_TESTS` with `-Focus`. When the baseline cannot be obtained (first push, force push, interface unreachable), `.gitlab-ci.yml` itself changed, or the change lands on a surface that must run in full, only one full run is done. The mainline pipeline of a version commit (`chore(release): version X`) is a release rehearsal: the candidate is registered after the three-platform full runs, media build, desktop install and upgrade and image acceptance all succeed; `--ship` waits for the rehearsal to succeed before tagging. The tag checks the same commit, the verification jobs and the artifact SHA-256, and publishes the same accepted files and images without rebuilding. For candidate identity, retention and reclamation see [ADR-0127](adr/0127-verified-release-artifact-promotion.md), and for the full-run scope [ADR-0119](adr/0119-mainline-changed-scope-release-full-suite.md).

The rehearsal first reads the actual usage of the release bucket, and media compilation can run in parallel with the official regression; once the build manifest is complete, before the install smoke test, the exact peak including staging and the public copy is checked, and candidate registration and the official upload recheck. The media cache identity binds the pinned source, build scripts, toolchain, platform and architecture, binaries and corresponding sources are verified file by file; the cache does not replace standalone artifact acceptance. Docker publishing checks the image ID, commit and version recorded by the rehearsal, and pushes after the desktop packages and the Release are ready. Version release and overwrite-upgrade acceptance do not cancel in-progress runs of the same target; an overwrite upgrade needs an explicitly chosen target version and the full build commit.

Browser cases cover all `*.test.ts` under `frontend/e2e`, including subdirectories. `setup.test.ts` is run by `SetupE2ETests` on the first-run setup service, and the other files run concurrently per file on the configured demo-library service, serially within a file. The concurrency is taken from `PEACH_E2E_CONCURRENCY`; when unset, locally it is a quarter of the logical core count capped at 4, and on CI (`GITHUB_ACTIONS=true`) it is 1. Each file starts its own Node with a 600-second limit and gets its own complete TAP; a freed lane immediately takes the next file, with no waiting between batches. Under concurrency, files are queued longest first by the measured seconds in `scripts/ci-browser-timings.json` (unmeasured ones count as 30 seconds), and files measuring animation, density switching and waiting-state replacement (`TIMING_SENSITIVE_SUITES` in `tests/test_web_e2e.py`) run serially one by one after all concurrent files finish; with concurrency 1, they run one by one in the order of design decisions, interaction regression and route smoke. If any file fails or times out, the whole verification round fails. Concurrent files share one service and demo library: write requests triggered by a case may land only on states other cases do not assert, otherwise they are intercepted with `page.route` or moved into the timing-sensitive serial files. The console prints success or failure and elapsed time at the end of each file; each file's TAP log `e2e-<file name>.tap`, the first-run `setup.tap` and the service access log `serve.log` are saved in `build/agent-verification/browser/`, and CI uploads the TAP logs among them after the tests.

Cases that need external prerequisites (Node, ffmpeg, Chrome, etc.) are skipped locally when a prerequisite is missing and fail in CI (`GITHUB_ACTIONS=true`); the decision is centralized in `missing_prerequisite` in `tests/support/conditions.py`. That is why rows of the `python` matrix other than `core` also install Node, and the Windows rows additionally install ffmpeg and Chrome.

Local runs are parallel by default: the entry takes `--jobs auto` (`-Jobs` on Windows). The selected fast checks run first, including repository and resource locations, reference registration, and frontend type, style and copy checks; on failure the later tests do not start. Ordinary tests are cut into four times as many slices as the concurrency, allocated by measured time, with each subprocess taking one slice and the one finishing first taking the next. The internally parallel Vitest and the browser container are run independently, and do not overlap with ordinary shards or each other. `-Jobs 1` uses the same stage order, with ordinary shards run serially. The parent process summarizes success or failure, case count and elapsed time and issues one record; one red shard turns the whole round red.

Each run merges the wall clock of each test file (including class-level setup) into `test-timings.json` in the shared record directory, and ordinary shards are packed longest first into the currently emptiest shard (files never measured take the median). The parent process hands the partition to the subprocesses, so parent and child use the same one; CI's standalone shards still rotate by file name. Test ledgers, repository fixtures and ports must be isolated from each other. The runner creates a `peach-test-run-<timestamp>-*` directory for each run, with `TEMP`, `TMP`, `TMPDIR` and `tempfile.tempdir` pointing to it, shard subprocesses share the same directory, and it is deleted at the end; run directories left by an interruption for more than a day are swept at the next startup. Cases remain responsible for reclaiming their own temporary resources.

The `phases` of an official record store the time of the input snapshot, history record reading, recovery planning, test execution and end verification; within test execution the fast gate, ordinary tests and each frontend container are listed separately. Parent and child phases overlap, so they cannot be added. `elapsed` starts timing before the input snapshot is taken, and excludes the entry's dependency installation, tool pre-checks and the wait before getting the full lock. Recovery planning reuses the domain set, test import graph and path impact within the same input snapshot; when a checkpoint finds that the input changed, it replans and does not reuse the old graph.

Windows paths, mounts, tray, certificates, process encoding, updates, authentication and migrations belong to `core`. Build and workflow changes select `packaging` and `tooling`; the test scheduling itself still runs the full suite. A change only in the uv tool version or in project display fields does not count as a change in the dependency graph; when it cannot be parsed, run the full suite.

Business tests such as performer name mapping are kept: they run when the related domain changes and also in the full mainline run. The test database is generated as a template from real migrations, and each case copies its own temporary database; migration tests run migrations directly. Retry tests inject a sleeper and assert the backoff sequence. Tests that are repeated through inheritance are kept only once.

## What tests to write

Pure HTTP request contracts can use `route_client` from `tests/support/web.py`: requests go through the real routes, middleware and dependencies without starting background services; the caller must still prepare a complete temporary ledger. Service start, recovery and shutdown semantics use the normal lifespan and are covered by integration tests.

The browser entry saves Chromium network event logs through `PEACH_E2E_NET_LOG_DIR`; the mode is `HeavilyRedacted`, the files are in `build/agent-verification/browser/network/`, and CI uploads them together with the TAP. A failed network request still fails the test; when investigating `ERR_NO_BUFFER_SPACE`, check the TAP together with that browser's network events, do not infer the machine's resource state from the error text, and do not add a pass-through retry.

The Windows isolated E2E browser disables `TcpPortRandomizationWin` for the loopback connection defect in [Chromium 572515601](https://issuetracker.google.com/issues/572515601), keeping all the default-disabled features of the currently locked Playwright. The last value of a switch of the same name overrides earlier ones, so this single item cannot just be appended; `browser-launch.test.ts` compares real Chrome launch arguments with native Playwright, and also verifies after dependency upgrades that the default list has not drifted. The production browser, page assertions, request failure criteria and machine network configuration are unchanged; a separate startup timeout cannot be marked fixed on this basis.

Tests should fail on behavior errors the user can perceive. Page requests, caching, selection, error feedback and routing are verified by component tests and browser tests; CSS cascade, theme, size and post-interaction styles are read as computed values by the browser.

Source inspection is concentrated on general conventions, privacy boundaries, artifacts, dependencies and cross-language constant consistency. Component names, variable names, whether a function is called, how many times an endpoint literal appears and the exact wording of documents get no gate of their own. A failure mode is preferably verified at the cheapest layer that can actually trigger it; a business branch already verified by a component is not compared line by line against its source in Python. The browser keeps checks that only hold in a browser, such as real navigation, layout, focus and stacking.

Write them according to this division of labor:

- Behavior (what request a click sends, how state changes, what value is computed) goes into vitest (`frontend/test/`) or `tests/test_web_js.py`; the backend calls real functions or real interfaces.
- Design decisions the user has settled go into the `frontend/e2e/design-*.test.ts` of the corresponding area (sharing `design-fixture.ts`), reading `getComputedStyle`; layout and runtime invariants go into `smoke.test.ts`.
- Source-text assertions only decrease, never increase, enforced by `tests/test_source_assertion_ratchet.py` counting per file. Implementation-text assertions already covered by behavior or browser verification are removed outright; add a case only when there is a real behavior gap, and lower the baseline accordingly.
- List the failure modes before writing cases. Verify the intermediate state of an async request with a manually released Promise; a fake fetch that answers within the same `act` hides timing problems while the request is still incomplete.
- To fix a defect, first write a case that fails, see it go red, then fix; after the fix, search elsewhere the same way, and if there are similar cases consolidate them into a shared implementation. Changes with no behavior gap (copy, pure styling) do not get a regression case.
- Tests that use the application lifespan should prepare ledger state explicitly: normal background services use a fully migrated temporary ledger, and scenarios with a missing or unmigrated ledger verify that background services stay stopped. Use `assertNoLogs("peach", level="ERROR")` to cover service start, requests and normal exit; fault injection uses `assertLogs` to check the expected cause, a successful interface return alone must not let an unexpected background error pass, and error logs must not be masked globally.
- The temporary repository from `support.gitrepo.seed_repository` completes Git auto-maintenance before the command returns; the repository-local settings `maintenance.autoDetach=false` and `gc.autoDetach=false` prevent background writes from racing with template copying and temporary directory reclamation. Normal maintenance and cleanup errors are kept, and the machine's Git configuration is not modified.
- Do not write tautological cases: asserting a constant equals itself, or mocking out the object under test and asserting the mock was called, prove nothing.

### Regression boundaries for collection, tasks and metadata

Cover only the real risks of this change, reusing existing samples and appropriate test layers; related fixes can share temporary samples and verification, without expanding every task into a full run separately.

| Change scope | What to verify |
| --- | --- |
| Product code parsing and source matching | From a real failing file name through the canonical code and site queries to the candidate identity. Cover the separators, prefixes, suffixes and zero-padding forms that truly must be equivalent, and the counterexamples that must not merge; using only in-site spellings cannot prove the pipeline input valid. Multiple works under one code are not merged directly by string equivalence. |
| Pause, cancel and resume | Check the parent task, work already started, follow-up tasks, the browser and the checkpoint separately by the declared control boundaries; a page or status field showing paused cannot alone prove execution has stopped. |
| Source failure and diagnostics | Distinguish success, normal no result and failure; the related records can link the task, video or file, source, stage, exception cause and the applicable build/collector version, and sanitization is verified. Fields unrelated to the fault are not forced to be filled. |
| Manual data and source refresh | Verify, per [manual data and identity boundaries](SOURCING.md#manual-data-and-identity-boundaries), field protection and the respective semantics of clearing, restoring a source, changing ownership and identity merging. |

When old numbers, snapshots or completed breakpoints may block a repair, verify the targeted repair per [upgrade-effective scope of repairs](../.claude/skills/peach-worktree/SKILL.md#upgrade-effective-scope-of-repairs). A test conclusion states the actual environment, coverage, skipped items and items not obtained, and does not use the number of cases in place of acceptance of the original scenario.

## Formal entry

Tests are run only from the two entries below; the entry handles test selection, issuing test records and environment preflight, and hand-assembled commands do not get a valid record.

Verify by impact domain on Windows:

```powershell
& .\scripts\test.ps1
```

Verify by impact domain on macOS:

```sh
./scripts/test.sh
```

For an explicit full run use `-Scope full` on Windows or `full` as the first argument on macOS. The entry prepares Python dependencies through `scripts/test_environment.py`, then checks the source location, selects tests and records slow tests. An isolated worktree syncs its own `.venv` with `uv sync --locked --all-extras`; when the local environment is missing, preparation starts with the main checkout's Python, and the tests still run in the newly created local environment. The sync keeps the Python version of the launching interpreter, ignores the external `VIRTUAL_ENV` and `UV_PROJECT_ENVIRONMENT`, and rejects a worktree environment pointing at the main checkout.

The main checkout only checks dependencies read-only per ADR-0091; on a missing package or a failed check it exits with `3`, and dependency changes are performed by the restart flow. A missing uv, a stale lock file or a failed sync also stops the tests. Frontend dependencies and the build are still installed as above. Start the final verification after installation and editing are complete; if changes occur during the run, the full batch keeps the results of unaffected files according to the rules below.

The test entry takes no machine-level heavy-load lock. Full verification and integration are mutually exclusive only by the repository code consistency lock below; the stage order of browsers and Vitest is arranged by the test entry.

A full run first runs a single second-level slice of checks (`test_runner.GATE_TESTS`: repository policy, encoding, copy final state, context budget, source assertion ratchet, complexity, Python lint, outbound proxy, repository hygiene and dependency manifests, about 1 minute in total), and if any item fails, the other shards do not start.

After a full run fails, the entry takes the failed Python cases, e2e files and vitest files from the item-by-item results, and when there are no more than 6 files, reruns each separately once through the targeted entry. Those that pass on the separate rerun are still signed as passed in the record, with their names written into the record's `flaky` field and printed; those that still fail on the separate rerun, whose failure surface is larger, or where the browser container did not start at all, are treated as real failures. A case repeatedly appearing in `flaky` means its waiting approach or time limit needs fixing.

Local full verification and code integration share `full-suite.lock`, held from taking the code and environment snapshot until the record is written. An integration that modifies only the two READMEs or Markdown under `docs/` takes only `integration.lock`, still checking the worktree, verification records, README declaration and conflicts, without waiting for unrelated full tests.
When the lock is busy, waiters queue in order of arrival: a waiter places a ticket beginning with a nanosecond timestamp in `full-suite.lock.queue/` beside the lock,
and goes to grab the lock only when no live tickets are ahead, withdrawing the ticket once it gets it; the prompt prints the holder and the number queued ahead. After a ticket owner's process exits,
its ticket is cleared by later arrivals. It waits at most 30 minutes; on timeout the ticket is withdrawn and it exits, running no tests or merge. The integration transaction itself is still serialized by
`integration.lock`. Partial-domain verification and CI shards issue no standalone local full record.

The holder information next to the lock is protected by its own file lock for reads, writes and cleanup; the main lock still handles mutual exclusion between verification and integration. The holder deletes the record only after the lock-waiting thread has closed the record file, avoiding Windows file-sharing conflicts.

Test entry exit codes: `0` verification valid, `1` a case failed, `2` argument or lock wait failure, `3` environment preflight failure,
`4` code or dependencies changed during verification and a complete record of the current state has not yet been obtained. On `4` the Windows tray runs at most three rounds of full verification,
and continues to packaging only after a valid record is obtained; a failed case stops directly.

Before creating test shards, the formal entry probes the external tools on PATH. When a tool path exists but the current permissions cannot launch it,
the entry exits with a single environment conclusion rather than scattering the same `CreateProcess` permission error across many cases. The whole
`scripts/test.ps1` must run with normal PowerShell permissions; on insufficient permissions, grant them and rerun as is,
without splitting into single tests or skipping cases.

Only tools that the selected domains of this run will actually use count as failures; other tools that are restricted from launching just print a one-line notice: in a restricted environment
ffmpeg failing to start is a fact, but it should not block a `checks` run that only changes documentation. The domains are derived from the selected test source.
When you have confirmed they are irrelevant to this run, skip the preflight as a whole with `PEACH_SKIP_PREFLIGHT=1`; shard subprocesses do not repeat the preflight.

### Delivery preflight and PR binding

After the final delivery commit is complete, first run the metadata preflight at the root of the current isolated worktree, then start time-consuming verification or pushing. The preflight checks that the worktree is clean, the target branch is included, and the commit subject, attribution and README declaration.

Windows (PowerShell 7) runs the preflight:

```powershell
& .\.venv\Scripts\python.exe -X utf8 .\scripts\agent_worktree.py preflight
```

macOS/Linux (zsh) runs the same preflight:

```zsh
./.venv/bin/python -X utf8 scripts/agent_worktree.py preflight
```

`preflight` installs no dependencies, computes no test environment identity, reads or issues no test proof, and does not access the remote PR. Exit code `0` means only that metadata passed; `tests` and `pull_request` remain `not_checked`. `ready` and `integrate` continue to use the same metadata criteria and also check the official test record corresponding to the current content.

Before merging, `integrate` gets the PR through the worktree's GitHub CLI repository context. The PR must be open, `headRefOid` equal to the worker's current commit, and `baseRefName` equal to the integration target branch; the success receipt keeps the PR link and these two identities. When no PR is obtained, fields are invalid or identities do not match, it stops without changing mainline content. This check does not replace PR review, CI for the corresponding commit and the existing preview confirmation.

## Targeted debugging and partial records

Windows `-Focus` accepts a Python module, class, method or repository-relative path, can take an array; when called via `pwsh -File` it also accepts one comma-separated argument. macOS/Linux repeat `--focus` for each selector. The entry deduplicates uniformly, rejects empty items and checks the source and isolated dependencies. It refuses to run when a selector does not exist, a browser path goes outside `frontend/e2e` or is mixed with shards. Browser cases accept only a single `frontend/e2e/*.test.ts` file and no directories; to run all e2e, list the files one by one into the array.

Browser smoke runs file by file, and when one file fails the remaining files still run, with the output and log paths of each failing file reported together at the end; one full run shows all e2e failures. The failure output of search suggestions, keyboard column-width adjustment and nested popovers additionally keeps the input, focus, popover, waiting state and accessibility tree at that time, with the original exception kept as the cause. Forensics do not lengthen waits, retry interactions or ignore runtime errors.

When a React Aria table first gets focus, it builds row navigation first. The keyboard column-width test first enters a row and confirms the public focus state, then focuses the handle, checks the real `activeElement` and presses Enter; a direct `focus()` call having returned is not taken as proof that focus is still on the handle, and neither wait durations nor repeated key presses are used to eliminate races.

Targeted debugging of a Python regression:

```powershell
& .\scripts\test.ps1 -Focus test_test_evidence
```

Targeted debugging of one browser file, including its desktop and phone cases:

```powershell
& .\scripts\test.ps1 -Focus frontend/e2e/jav-detail.test.ts
```

The same entry on macOS/Linux:

```sh
./scripts/test.sh auto --focus frontend/e2e/jav-detail.test.ts
```

To debug one or several vitest files targeted (paths starting from `frontend/test/`), run only those files:

```powershell
& .\scripts\test.ps1 -Focus frontend/test/jav-card-title.test.ts
```

Targeted debugging issues no record and cannot serve as acceptance proof for `ready` / `integrate`. Browser file selection takes effect only in the debugging environment; the official entry refuses leftover `PEACH_TEST_FOCUS` / `PEACH_E2E_FILES` / `PEACH_VITEST_FILES`, to prevent a partial run from being signed as a whole domain. When a browser file fails or times out, its complete TAP and service log are kept.

The browser keeps Playwright's default process model and mute settings, does not limit renderer processes, and does not force the GPU or audio service into the browser process. Native browser launch is limited to 60 seconds, the page body wait to 15 seconds, and each batch to 600 seconds; process startup and page behavior are accepted separately. Pages that need task-state stubs install responses through the preparation callback of `visit` before the first navigation, and check the task state only after the corresponding React body appears; an in-progress task is not treated as a body waiting state. When the page body wait fails, the URL, closed state, collected runtime issues and the accessibility tree are kept, and the fixture closes this browser context.

The Windows Release workflow prepares the full dependencies with `uv sync --locked --all-extras`. The installation directory regression and the PyInstaller build share this venv, and the test entry verifies dependencies against the full lock file.

The host for Windows standalone artifact acceptance loads the helper verification modules from the `scripts/` of the same checkout, and checks the bundled collection tools against the release lock. The temporary app and the collection tool self-checks clear `PYTHONPATH` and use a PATH with development tools removed; the source path serves only the acceptance host.

The macOS Release builds on `macos-15` (Apple Silicon) and `macos-15-intel` (Intel) separately, and the interpreter, dependencies and target architecture must match. The standalone acceptance job downloads only the candidate artifact and the smoke script, mounts the read-only DMG, checks the Applications link, license, signature and native architecture, then runs `scripts/smoke_macos.py`. This script moves the app out of the source tree and, under a PATH with development tools removed, verifies first-run setup, migration, single-machine ledger, login, frontend resources and configuration saving, with all data using temporary directories. Publishing happens only when all platform acceptance succeeds; an ordinary push builds no installer, and a manual Release run uploads no public assets.

`auto` scans valid records of the same environment, merging by test file the successful results within 24 hours that are not affected by input differences; there is no fixed search limit on the record count. Each item keeps its original pass time, and the latest failed or incomplete state blocks restoring an old success. Proofs that are missing, corrupt, expired or time-stamped in the future do not count toward coverage; a single corrupt record does not affect other candidates. `-Fresh` always actually executes the requested scope, and an explicit `full` also actually executes by default; `-Resume` / `--resume` allows full verification to continue from a complete batch source, and is mutually exclusive with `Fresh`.

Resume full verification at the root of the current isolated worktree:

```powershell
& .\scripts\test.ps1 -Scope full -Resume
```

macOS/Linux use the same recovery rules:

```sh
./scripts/test.sh full --resume
```

GitGud's three-platform verification uses the official recovery entry, saving the proof JSON through GitLab's native cache. The cache is isolated by job, branch and protected state, saved after both success and failure; lock files do not enter the cache. After a retried job restores the cache, it still checks item by item the current code, dependencies, environment, pass time and the complete batch. When the cache is missing or a proof is invalid, the necessary tests are run, and a pass cannot be concluded merely because a cache exists. Parallel shards are allocated by file count when the estimated total time is the same, and files with zero measured time are also spread across non-empty shards.

The official parent run atomically saves the pending-verification state at the start, and saves a checkpoint immediately after each shard completes. A failed batch still keeps the successful files, successful supplementary cases and their times; a whole-file state does not overwrite individual results already obtained. Shared input changes and `Fresh` act on files and their supplementary cases together. When the fast gate fails, the other files stay incomplete. After a process interruption, the next `auto` fills in the missing files within the required scope, with serial and parallel using the same result model. A shard report must be complete and well-formed, and the exit code must match the report; an abnormal exit cannot produce a success proof for that shard. A process still not exited after the shard writes its completion report has its process tree reclaimed after waiting 15 seconds, without setting an extra time limit on tests still executing.

Browser and Vitest containers save completion results per external test file, and item-by-item output alone cannot prove a whole file complete. The recovery plan binds the current input snapshot, the complete file set and the success time of each omitted item. Python container cases themselves must also have success proofs to be omitted together with their external files; a container's post-check failure still requires retesting. Selection parameters are enabled only while the corresponding container cases execute, ordinary Python cases do not inherit them, and the environment is restored on failure or exit. External selection is generated only by the official parent run, and `Focus` and standalone CI shards issue no official record.

A full proof also requires all files and container checks to belong to the same complete batch. A standalone partial run can fill in the required domains but cannot be assembled into `full`; an interrupted or failed run with a complete batch source can resume a full proof after filling in the missing items. On each write, records older than 24 hours since being written to disk, lock descriptions and leftover temporary files are retired; lock files and non-record files are left alone.

Test selection compares file contents: when a Python change is only comments or formatting, an npm manifest change is only description/keywords, or a TOML change is only comments or formatting, `checks` is selected. Python docstrings, runtime strings and type annotations count as effective content. Python build metadata changes select `packaging`; actual dependency changes, file mode changes, parse failures and unknown impact keep full verification.

Added and deleted files are selected by the functional domain they belong to; execute-permission changes and symbolic links on existing files stay at `full`.

Only when an exact `test_*.py` file name is appended to the end of an existing domain in `SCOPES`, and the AST outside the registry is completely unchanged, are the new test's domain, checks and tooling selected; these two keep regressions of the selection plan, registry integrity and proof protocol. Deletion, reordering, wildcards, new domains, changes to existing path mappings and execution logic are still handled as full verification. Ordinary `scripts/` scripts already have a tooling prefix mapping, and when in the same domain no duplicate `AUTO_SCOPE_FILES` entry is added. Record snapshots and CI use the same content criteria; old records that cannot be recognized keep a conservative judgment.

Known modules under `src/peach/` merge the domains of tests that import them directly, and a name or explicit mapping does not exclude direct consumers. For modules whose test files cannot be inferred by name, also merge in the domains inferred by the same rules for the source files that directly import them; a group of modules importing each other counts together. When the importer's domain cannot be inferred, nobody imports it, or an unknown module is used by the shared test infrastructure `tests/support`, it is still `full`. Impact does not spread along the import chain: lazy imports inside functions link almost all modules into one mass, and the transitive closure equals full. `resources/` shipped with the app selects domains by the module that loads it and the packaging surface; `.gitlab-ci.yml` and `MANIFEST.in` select `packaging` and `tooling` locally (when the mainline pipeline changes `.gitlab-ci.yml`, the three platforms still run in full); when a test file registered only in `core` or `packaging` changes, the domain registering it runs.

The README's Python floor and bilingual entries are checked by the install contract of checks, and ordinary docs do not select the whole of tooling. Static file input recognition is based on the repository root and its aliases, and same-name writes by temporary fixtures do not count as repository reads. Missing files do not enter the current snapshot, deletions are recognized by comparing file sets before and after, and staging or committing the same deletion does not change the content proof.

When input changes during a run, whether or not the batch passed entirely, unaffected successful results and their original times are kept by difference; it exits `4`, and `auto` then fills in the missing items. A logic change in a standalone Python test file invalidates that file, the tests that import it directly or indirectly and the common gates; a change in a browser test file invalidates that file and the corresponding container checks. Shared infrastructure, unknown scope, execution mode or environment changes are still re-verified at the full impact scope.

Supplementary tests for the first-run setup directory `frontend/src/react/pages/setup/`, the assets `resources/setup/` and the standalone page artifacts `web/dist/peach-pages.js` and `web/dist/peach-pages.css` keep the main app's browser results, still checking the first-run setup browser flow, all related Python contracts, components and packaging. The first-run setup browser cases are concentrated in `frontend/e2e/setup.test.ts`; when adding a standalone page browser container, this correspondence must be extended in step. When the main app artifacts, shared styles or common components change at the same time, the main app browser results are invalidated as usual.

When the test record format is upgraded, the main checkout's entry may not recognize the new format. First pass `ready` in the worktree, then have the main checkout call the already-accepted `scripts/agent_worktree.py` from that worktree, specifying the main checkout with `--repo` and running `integrate`. This way still checks the test record, the README statement, the target branch and the integration lock; do not hand-edit the record or bypass the gates. After integration the main checkout uses the same version of the entry.

Browser CI for PRs and ordinary mainline is selected by UI, Web API, authentication and browser cases; ordinary backend unit tests do not trigger browser jobs on their own. Workflows are selected by responsibility, release workflows trigger packaging verification, and management workflows such as boards trigger only tooling checks. No usable baseline, unknown impact and manual full verification cover all CI jobs, and release rehearsals and artifact acceptance run by their own independent gates.

## Environment identity of records

A record is reusable only when all three of "code, environment, scope" match, and the environment item is computed by `environment()` in `scripts/test_evidence.py`
into one digest: Python version, implementation and runtime file contents, normalized installed package names and versions, platform, behavior-affecting environment variables, the normalized JSON of the frontend install lock, the actual Chrome file contents, and the six external tools node / npm / git / ffmpeg / ffprobe / openssl. The same runtime and dependencies in different worktrees, an install lock differing only in ordering or indentation, and a changed CI run number or working directory do not change the environment identity. CI workflow and job responsibilities, browser install state and content changes still take part in the judgment.
The `PEACH_REPORTING_TEST_MODE` outbound-blocking flag that the test entry forcibly sets does not take part in environment selection; the entry's source still takes part in the code snapshot.

GitLab's job token, container registry password and dependency proxy password are recorded by whether they exist; `CI_REPOSITORY_URL` keeps the protocol, host, path, username and whether authentication exists, and the password value does not take part in identity. `CI_JOB_RETRY_COUNT`, `CI_JOB_STARTED_AT_SLUG` and `CI_BUILD_NETWORK_NAME` represent this run's count, time and network name; `CI_TRACEPARENT` and `CI_TRACESTATE` identify the job's distributed tracing context. This run metadata does not take part in identity. Job responsibilities, coverage mode and app behavior variables still take part in the judgment. For the meaning of the variables see [GitLab predefined variables](https://docs.gitlab.com/ci/variables/predefined_variables/).

uv is only probed and is not part of the fingerprint: it builds the environment, and the interpreter and packages it installs are already recorded one by one in the digest, while uv itself
is auto-upgraded by winget. If its version were counted too, all records would be invalidated together on the day of an upgrade,
though not one byte of the verified environment had changed.

A tool's identity takes the **version it reports itself**, not the path resolved on PATH or the file bytes. The same Git installation resolves to `Git\cmd\git.exe` in
PowerShell and to `Git\mingw64\bin\git.exe` in Git Bash:
the two launcher binaries differ in bytes while the version and behavior are the same; recording identity by path would tie records to the shell: a record produced in one shell, and then `integrate` run from another shell, reports "缺少有效测试记录" (the literal error message, "valid test record missing"),
while going back to the worktree and running `auto` says "reusing record" instead; the two statements check two different keys, at the cost of an unnecessary full run.

When changing the environment identity, content signature or record structure, the main checkout's old algorithm may be unable to compute the new key or read the new records, and cannot verify a branch carrying the new format.
That `integrate` uses the branch's own scripts and criteria, and points the repository at the main checkout; tests that already have valid records are not run again. `--repo` is a top-level argument,
placed before the subcommand, and after it argparse would reject it:

```powershell
& .\.venv\Scripts\python.exe -X utf8 <worktree>\scripts\agent_worktree.py `
  --repo <main-checkout> integrate --branch <branch>
```

## Test result history

Every run of the official entry and of targeted debugging appends item-by-item results to the test result history, used to compute the rate at which each test catches regressions and to distinguish flakiness, outdated expectations and environment failures. The implementation is in `scripts/test_history.py`.

The file is `build/test-history/YYYY-MM.jsonl` one level above the Git common directory: locally it sits under the main checkout's `build/`, at the same level as the test records `build/agent-verification/`, shared by all worktrees; on CI it is the job directory's `build/test-history/`, uploaded by the pipeline as an artifact. JSON Lines is split into monthly files, append-only, and when several processes write at once the neighboring `.lock` serializes them.

Each run first writes a run header line:

| Field | Meaning |
| --- | --- |
| `type` | Fixed as `run` |
| `run` | This run's number, used to link item-by-item results |
| `time` | Time of writing |
| `scope` | Requested and actual scope, such as `auto:catalog web`, `full:full`, `focus:<selector>`; CI standalone shards carry `shard i/n` |
| `platform`, `python` | Platform and interpreter version |
| `head`, `branch`, `worktree` | Commit, branch (when HEAD is detached, taken from CI's branch variable) and worktree path |
| `ci` | True when any of `CI`, `GITLAB_CI`, `GITHUB_ACTIONS` is non-empty |
| `files`, `count` | Module names of the test files run this time and the total number of cases |

After that, rows with `type` `test` are written item by item: `run`, `id`, `outcome` (`pass`, `fail`, `error`, `skip`) and `seconds`, and failures and errors also have `message`, taking the last line of the exception, masking values such as `token=` and `password=`, truncated to 200 characters. Python case names are `module.class.method`, vitest is `vitest:file > group > title`, and browser cases are `e2e:file > group > title`.

To limit size, only non-passing cases and passing cases taking 5 seconds or more are written item by item. A full run has about ten thousand results, and writing all item by item would be about 2.4 MB; by this basis it is about 250 lines and 75 KB. How many times a case ran is inferred from the run header's `files`: cases whose file is present and not recorded as `skip` have all run; per-file times are also in `test-timings.json`.

A failure to write history prints only one warning line and does not change the test verdict. History is not passed through environment variables and is not in the snapshotted worktree, so the environment fingerprint and validity period of test records are unaffected. Tests that call the runner do not write real history, nor take away the vitest and browser results collected by the outer run.
