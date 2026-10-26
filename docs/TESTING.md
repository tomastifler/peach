# Testing and dependencies

This document covers three things: how to install and upgrade dependencies; which tests to run after changing code and how CI splits them; and what new tests should look like.

The in-place upgrade of Windows release artifacts is run manually in Actions under "Windows 覆盖升级验收" (the workflow name, "Windows in-place upgrade acceptance"): fill in the published starting version, the target version and the full build commit of the target artifact. The workflow separately verifies in-place ZIP extraction and in-place installer installation, covers both the default data directory and a directory given by `PEACH_DATA_ROOT` for each path, and uploads logs. It uses published artifacts and does not rebuild or publish; online update and failure rollback are still verified separately by `scripts/smoke_online_update.py`.

The Release workflow also runs `smoke_update_tasks.py --apply` on a clean Windows runner, using a temporary ledger to verify that the installer accepts a running collection task, pauses it while keeping the task identifier, resumes automatically after the overwrite, and preserves configuration. The script only does a dry run by default; locally the ZIP and installer helper protocol can be verified, but real installer installation is limited to clean Actions runners.

## Environment and lock files

Dependencies are reproduced exactly from the lock file by uv. Source installs use `uv sync --locked`. Development, testing and building create their own `.venv` in an isolated worktree, and the worktree does not touch the environment that is serving; dependency sync and migration of the main checkout are handled by the restart flow, see the section "Refresh the source runtime" in [Operation and configuration](OPERATIONS.md) (ADR-0091).

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

`release_tag.py --bump auto --apply` calls `release_review.py` before writing the version. It checks available updates for the two Python lock files and the two npm manifests, pending Dependabot PRs, sha-pinned runtime dependencies and their latest stable releases, and all non-manual reference sources in the registry. The standalone entry is `scripts/release_review.py`; the report is stored at `build/release-review.json` and contains commit, time, diff and per-item errors. Docker and GitHub Actions updates are tracked through Dependabot PRs as leads; an empty PR list is not taken to prove everything is up to date.

A network failure is recorded as "not obtained" and the other checks continue; when the checks are incomplete the version files stay unchanged. Discovered updates are only reported, and the agent decides the adoption scope by comparing real consumers, field semantics and licenses; upgrading dependencies follows the isolated worktree and full verification. Source-text evidence is accepted after review per `peach-reference-evidence`, and manual notes are not overwritten by web pages.

## Verification frequency

Tests use the project entry points directly and set no machine-level resource slots, CPU, memory or process-count limits. Concurrency per run is chosen with `-Jobs` / `--jobs`, defaulting to at most four lanes by local core count, and an explicit positive integer has no machine-level cap. On cancel only the child process trees of this run, by the PIDs already created, are cleaned up; full tests and integration remain mutually exclusive as code consistency requires.

Python static checking uses the development dependency Ruff, scanning all of the repository's own Python files with each formal test domain, covering the application, scripts, tests and packaging entry points. The rules are Pyflakes (`F`), the Pylint error rules supported by Ruff (`PLE`), and the mutable default argument, `finally` jump, useless expression and loop closure rules (`B006`, `B012`, `B018`, `B023`). The generated `downloads_clouddrive_pb2.py` is excluded; publicly exported imports are declared with explicit same-name aliases. Preferences for naming, line count, blank lines and complexity are not part of this lint gate.

Documentation and copy checks include seiso's stable rules and a final-state check, and run with the formal entry. For categories, scope, standalone checks and preview rules see [Documentation and UI copy](WRITING.md#checking-and-review). seiso is pinned by the development dependencies and the lock file; running Peach does not need it.

The full suite is not run every time: locally, tests are selected by the domains the change touches, and CI decides how wide the coverage is by commit type.
For debugging, run the relevant cases first, and once the code is frozen run `auto` once; do not hand-write per-domain loops that repeat the shared cases. When a test fails, reproduce it in a targeted way first, and after the fix `auto` decides which domains need to be re-tested.

| Scenario | Verification |
| --- | --- |
| Local change | The formal entry defaults to `auto`, taking the union by impact domain; valid records with the same code, environment and scope can be reused |
| Ordinary PR | Python 3.14: macOS and Windows both verified by impact domain |
| Ordinary mainline commit | Python 3.14: full regression on macOS, Windows, frontend, browser and wheel |
| Actual dependencies, migrations, shared test infrastructure, unknown impact | Full Python 3.14 run on Windows and macOS |
| Manual CI | Full system matrix |
| wheel | One standalone minimal install on each of Windows and macOS with Python 3.14 |
| Release | Reuse the successful mainline CI for the same SHA; the Windows standalone EXE and the Apple Silicon and Intel DMGs are built and accepted separately |

The full Python run is stably sharded by file, four shards on Windows and two on macOS, each shard on its own runner; the summary job requires all shards and the planned selected tasks to succeed. Shard subprocesses do not issue records.

The `web-bundle` job of the Test workflow runs tsc, lint, Vitest, the build and the artifact diff check uniformly on Ubuntu; lint also checks that there are no diagnostics and that the number of scanned files is greater than zero. In CI the Python jobs hand these three tool cases to the frontend job and the two real-browser cases to the browser matrix; contract tests in the same module still run. Job identity is recognized by fixed workflow and job names, and unknown jobs and the local machine keep the full tests. A run that takes on part of CI's duties does not issue a local test record.

Browser cases are shared across the six Windows runners of `web-e2e`, each shard with its own service, demo library and logs. `ci_plan.py` assigns files according to the measured seconds in `ci-browser-timings.json`, new files use a default weight, and each file runs exactly once. Each shard runs its assigned browser files through the project entry's `-Focus`, and the first-launch file always belongs to the first-setup service. It installs Node 24, frontend dependencies and ffmpeg, and specifies Chrome through `PEACH_E2E_CHROME`. The local browser entry and concurrency semantics remain complete.

The PR plan selects frontend, vendor, wheel and browser jobs according to the change, and a documentation PR runs only the applicable checks; mainline, dependencies, unknown impact and manual verification include all jobs. `frontend-ready` aggregates the selected frontend checks and, on failure, does not start the following full regression; a plan that selects no frontend job runs normally. Artifact diffs are shown as file statistics. `verified` checks the required jobs against the plan, and a missing, failed, cancelled or skipped required job counts as failure. The Actions workflows themselves are checked by a pinned version of actionlint for syntax, expressions, dependencies and scripts. A PR update cancels stale runs of the same PR, and mainline Test keeps its result for each commit.

Python shards upload the full test output; browser shards upload the TAP, service logs and redacted network logs, retained for 14 days. The npm audit fails directly on a high or critical vulnerability; only temporary network errors are requested up to three times, waiting 15 and 30 seconds after the first two failures, and an unknown response is not treated as a pass.

Release checks the mainline CI of the same SHA before compiling the media tools; the cache key is bound to the media tool source manifest and build script, and the cache contents include both binaries and the corresponding source packages; artifacts and standalone out-of-the-box acceptance remain prerequisites to publishing. Docker runs only on image-related mainline changes, matching PRs, version tags or manual requests, and pushes the same local image after acceptance. Version release and in-place upgrade acceptance do not cancel in-progress runs for the same target; an in-place upgrade needs the target version and the full build commit chosen explicitly.

Browser cases cover all `*.test.ts` under `frontend/e2e`, including subdirectories. `setup.test.ts` is run by `SetupE2ETests` on the first-setup service, and the other files run on the configured demo-library service concurrently across files and serially within a file. The concurrency is taken from `PEACH_E2E_CONCURRENCY`; when unset, locally it is a quarter of the logical cores with a cap of 4, and in CI (`GITHUB_ACTIONS=true`) it is 1. A concurrent batch has at most 12 files, a serial batch has one file per batch, and each obtains its full TAP result. Files that measure animation, density switching and replacement of waiting states (`TIMING_SENSITIVE_SUITES` in `tests/test_web_e2e.py`) run serially after the concurrent batches; when concurrency is 1 they are ordered as design decisions, interaction regressions and route smoke tests. Each batch is limited to 600 seconds, and if any batch fails the whole verification round fails. Concurrent files share one service and demo library: write requests triggered by a case may only land on state that other cases do not assert, otherwise intercept them with `page.route` or move them into the serial batch. The console prints the file names batch by batch; the full TAP log and the service access log `serve.log` are saved in `build/agent-verification/browser/`, and CI uploads the TAP log from there after the tests finish.

Cases that need external prerequisites (Node, ffmpeg, Chrome, etc.) are skipped locally when a prerequisite is missing and fail in CI (`GITHUB_ACTIONS=true`); the decision is centralized in `missing_prerequisite` in `tests/support/conditions.py`. That is why rows of the `python` matrix other than `core` also install Node, and the Windows rows additionally install ffmpeg and Chrome.

Local parallelism is on by default: pass `--jobs auto` to the entry (`-Jobs` on Windows), and the runner splits the same stable sharding into four times as many shards as the concurrency; each child process takes one shard and, when done, the next one; the parent process summarizes success or failure, case counts and per-case timings, and issues one record under the original criteria; one red shard makes the whole round red. `-Jobs 1` falls back to serial. There are no shared ports or global directories between tests, and the ledger and repository fixtures are all in their own temporary directories, so parallelism is safe; new tests keep it that way.

Windows paths, mounts, tray, certificates, process encoding, updates, authentication and migrations belong to `core`. Build and workflow changes select `packaging` and `tooling`; the test scheduling itself still runs the full suite. A change only in the uv tool version or in project display fields does not count as a change in the dependency graph; when it cannot be parsed, run the full suite.

Business tests such as performer name mapping are kept: they run when the related domain changes and also in the full mainline run. The test database is generated as a template from real migrations, and each case copies its own temporary database; migration tests run migrations directly. Retry tests inject a sleeper and assert the backoff sequence. Tests that are repeated through inheritance are kept only once.

## What tests to write

Pure HTTP request contracts can use `route_client` from `tests/support/web.py`: requests go through the real routes, middleware and dependencies without starting background services; the caller must still prepare a complete temporary ledger. Service start, recovery and shutdown semantics use the normal lifespan and are covered by integration tests.

The browser entry saves Chromium network event logs through `PEACH_E2E_NET_LOG_DIR`; the mode is `HeavilyRedacted`, the files are in `build/agent-verification/browser/network/`, and CI uploads them together with the TAP. A failed network request still fails the test; when investigating `ERR_NO_BUFFER_SPACE`, check the TAP together with that browser's network events, do not infer the machine's resource state from the error text, and do not add a pass-through retry.

A test should fail when behavior the user can perceive is wrong. Requests, caching, selection, error feedback and routing of a page are verified by component tests and browser tests; CSS cascade, theme, size and post-interaction styles are verified by the browser reading computed values.

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

Local full verification and `integrate` share `full-suite.lock`, held from taking the code and environment snapshot until the record is written.
When the lock is busy it prints the holder and waits for up to 30 minutes; on timeout it exits without running tests or merging. The integration transaction itself is still serialized by
`integration.lock`. Partial-domain verification and CI shards do not issue a standalone local full record.

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

## Targeted debugging and partial records

On Windows `-Focus` accepts a Python module, class, method or repository-relative path, and can take an array; on macOS/Linux repeat `--focus` for each selector. The entry prepares the isolated dependencies and checks the source. It refuses to run if a selector does not exist, a browser path is outside `frontend/e2e`, or it is mixed with shards.

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

Targeted debugging issues no record and cannot serve as acceptance proof for `ready` / `integrate`. Browser file selection takes effect only in the debugging environment; the formal entry rejects leftover `PEACH_TEST_FOCUS` / `PEACH_E2E_FILES` to prevent a partial run from being signed as a whole domain. After a browser batch fails or times out, that round of browser checks ends immediately, keeping the full TAP and service logs.

The browser keeps Playwright's default process model and mute settings, does not limit renderer processes, and does not force the GPU or audio service into the browser process. Native browser launch is limited to 60 seconds, the page body wait to 15 seconds, and each batch to 600 seconds; process startup and page behavior are accepted separately. Pages that need task-state stubs install responses through the preparation callback of `visit` before the first navigation, and check the task state only after the corresponding React body appears; an in-progress task is not treated as a body waiting state. When the page body wait fails, the URL, closed state, collected runtime issues and the accessibility tree are kept, and the fixture closes this browser context.

The Windows Release workflow prepares the full dependencies with `uv sync --locked --all-extras`. The installation directory regression and the PyInstaller build share this venv, and the test entry verifies dependencies against the full lock file.

macOS Release builds on `macos-15` (Apple Silicon) and `macos-15-intel` (Intel) separately, and the interpreter, dependencies and target architecture must match. The standalone acceptance job downloads only the candidate artifact and the smoke script, mounts the read-only DMG, checks the Applications link, license, signature and native architecture, and then runs `scripts/smoke_macos.py`. The script moves the app out of the source tree and, with a PATH from which development tools have been removed, verifies first setup, migration, single-machine ledger, login, frontend assets and configuration saving, with all data in temporary directories. Publishing happens only when acceptance succeeds on all platforms; an ordinary push does not build installers, and a manually run Release does not upload public assets.

`auto` computes the difference from records in the same environment within 24 hours: a valid full baseline keeps its original timestamp; a valid partial baseline reuses only the domains that are unaffected by the difference and needed this time. The same code state fills in missing domains. Added, deleted and modified files all take part in the comparison; shared infrastructure, unknown impact and environment differences cannot reuse partial records. A partial record never becomes a full one, and an inherited timestamp does not extend validity. A single-domain failure revokes that domain and the full proof, keeping the original success times of the other domains; the failed domain must be re-tested and cannot be restored from an old baseline. A full failure revokes all proofs. `-Fresh` and an explicit `full` always actually execute.

Test selection compares file contents: when a Python change is only comments or formatting, an npm manifest change is only description/keywords, or a TOML change is only comments or formatting, `checks` is selected. Python docstrings, runtime strings and type annotations count as effective content. Python build metadata changes select `packaging`; actual dependency changes, file mode changes, parse failures and unknown impact keep full verification.

Added and deleted files are selected by the functional domain they belong to; execute-permission changes and symbolic links on existing files stay at `full`.

When a full batch passes but a partial change occurred during the run, the results and original times of unaffected test files are kept; it exits with `4`, and `auto` then fills in only the missing domains. `full` is restored only when the same full batch covers all test files; partial batches cannot be stitched into a full proof. A change in environment, shared logic or unknown scope clears the retained results; failed and expired results cannot be reused.

When the test record format is upgraded, the main checkout's entry may not recognize the new format. First pass `ready` in the worktree, then have the main checkout call the already-accepted `scripts/agent_worktree.py` from that worktree, specifying the main checkout with `--repo` and running `integrate`. This way still checks the test record, the README statement, the target branch and the integration lock; do not hand-edit the record or bypass the gates. After integration the main checkout uses the same version of the entry.

The browser CI of a PR is selected according to UI, Web API, authentication and browser cases; ordinary backend unit tests do not trigger a browser job on their own. Workflows are selected by responsibility, release workflows trigger packaging verification, and management workflows such as boards trigger only tool checks. Mainline pushes and manual full verification continue to cover all CI jobs.

## Environment identity of records

A record can be reused only when all three of "code, environment, scope" match, and the environment item is computed by `environment()` in `scripts/test_evidence.py`
into one digest: the interpreter and installed packages, the platform, environment variables such as `PEACH_*`, the frontend
`node_modules` lock, and six external tools: node / npm / git / ffmpeg / ffprobe / openssl.

uv is only probed and is not part of the fingerprint: it builds the environment, and the interpreter and packages it installs are already recorded one by one in the digest, while uv itself
is auto-upgraded by winget. If its version were counted too, all records would be invalidated together on the day of an upgrade,
though not one byte of the verified environment had changed.

A tool's identity takes the **version it reports itself**, not the path resolved on PATH or the file bytes. The same Git installation resolves to `Git\cmd\git.exe` in
PowerShell and to `Git\mingw64\bin\git.exe` in Git Bash:
the two launcher binaries differ in bytes while the version and behavior are the same; recording identity by path would tie records to the shell: a record produced in one shell, and then `integrate` run from another shell, reports "缺少有效测试记录" (the literal error message, "valid test record missing"),
while going back to the worktree and running `auto` says "reusing record" instead; the two statements check two different keys, at the cost of an unnecessary full run.

When changing the algorithm of `environment()` itself, the main checkout's code cannot compute the new key and so cannot verify a branch carrying the new algorithm.
In that case `integrate` is run with the branch's own script and the repository pointed at the main checkout. `--repo` is a top-level argument,
placed before the subcommand; placed after it, argparse rejects it:

```powershell
& .\.venv\Scripts\python.exe -X utf8 <worktree>\scripts\agent_worktree.py `
  --repo <main-checkout> integrate --branch <branch>
```
