# Testing and dependencies

This document covers three things: how to install and upgrade dependencies; which tests to run after changing code and how CI splits them; and what new tests should look like.

The in-place upgrade of Windows release artifacts is run manually in Actions under "Windows 覆盖升级验收" (the workflow name, "Windows in-place upgrade acceptance"): fill in the published starting version, the target version and the full build commit of the target artifact. The workflow separately verifies in-place ZIP extraction and in-place installer installation, covers both the default data directory and a directory given by `PEACH_DATA_ROOT` for each path, and uploads logs. It uses published artifacts and does not rebuild or publish; online update and failure rollback are still verified separately by `scripts/smoke_online_update.py`.

The Release workflow also runs `smoke_update_tasks.py --apply` on a clean Windows runner, using a temporary ledger to verify that the installer accepts a running collection task, pauses it while keeping the task identifier, resumes automatically after the overwrite, and preserves configuration. The script only does a dry run by default; locally the ZIP and installer helper protocol can be verified, but real installer installation is limited to clean Actions runners.

## Environment and lock files

纯文档 CI 仍在 Windows 和 macOS 执行 checks，但不安装前端依赖、FFmpeg 或配置 Chrome；混合运行时改动与未知输入保留完整工具。集成按同一选测边界识别文档，显式映射到运行时验收的 Markdown 不豁免全量锁。代码集成先等待全量锁，再取得集成锁，避免等待中的代码任务阻挡文档交付。

依赖由 uv 按锁文件精确复现。源码安装用 `uv sync --locked`。开发、测试和构建在隔离工作树里建自己的 `.venv`，工作树不碰正在服务的环境；主检出的依赖同步与迁移由重启流程负责，见 [运行与配置](OPERATIONS.md) 的「刷新源码运行态」一节（ADR-0091）。

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

依赖升级是定版前的固定批次。发版授权包含检查、适用升级、兼容修改、派生产物、验证和集成，不能只列出可用更新就进入定版。

1. 开工先做只读发版审阅和两份 npm 高危审计，覆盖两份 Python 清单与锁、两份 npm 清单、Docker 镜像、GitHub Actions、SHA 固定的运行依赖及登记的参考来源。`scripts/release_review.py` 的 `--public-github` 模式匿名读取 GitHub 元数据；审计使用 `scripts/npm_audit.py`，分别指定根目录和 `frontend`。审阅先于升级方案、全量回归与制品构建。
2. 在隔离工作树中优先接管 Dependabot 的独立差集，保留来源，再核对稳定版本和未被 PR 覆盖的更新。审阅大版本迁移、真实消费者、字段语义、许可证和平台兼容性，固定版本与锁并重算 vendor 和前端产物。运行时遵守平台范围和官方支持周期；参考变化只作证据。不能升级的逐项记录新旧版本、具体兼容问题、失败证据和恢复条件，其余升级继续完成。
3. 完成定向回归和适用预览确认后，在重型验证前复核依赖及安全更新，记录提交、清单、锁与固定来源，冻结本批输入。检查未完成或仍有待处理安全更新时，先处理输入，不启动全量回归或制品构建；不能把冻结检查推迟到集成、打包或生产重启后。
4. 对冻结输入完成 Windows、macOS 正式全量与适用制品验证，再走 ready / integrate 和运行核验。同环境的有效测试按正式入口复用，只补受变更影响的检查；制品按其实际源码、锁、构建入口和目标平台判断能否复用。文档或维护 CLI 改动不触发运行内容未变的桥和 Docker 验证制品重建。版本提交的 CI 演练和标签发布仍遵守既有门槛。
5. 在干净 master 上运行 `release_tag.py --bump auto --apply`，保留定版及标签前的安全复查，再确认发行说明并继续 `--ship --apply`。冻结后出现的普通更新登记到后续批次；发现必须处理的安全更新时返回独立补充，重新冻结并验证实际影响，不整批无差别重跑。

`release_tag.py --bump auto --apply` 在写版本前调用 `release_review.py`，检查两份 Python 锁、两份 npm 清单的可用更新、Dependabot 待处理 PR、SHA 固定的运行依赖及其最新稳定发布，以及登记表中全部非 manual 参考来源。独立检查入口为 `scripts/release_review.py`；报告存于 `build/release-review.json`，含提交、时间、差异与逐项错误。Docker 与 GitHub Actions 的更新以 Dependabot PR 为线索，不据空 PR 列表断言全部最新。

网络失败记为「未取得」，其余检查继续；检查不全时版本文件保持原样。审计门槛仍由发布入口执行，不能用暂缓升级的说明放过高危漏洞。原文证据按 `peach-reference-evidence` 审阅后接受，人工笔记不被网页覆盖。升级批次是发布工作流程；现有 `release_tag.py` 不自动改依赖或创建升级分支。

用户手动提供的公开参考正文可通过 `--reference-evidence SOURCE=FILE` 明确用于本次检查。报告记录用户取证渠道、原始 URL 与正文 SHA-256，直接网络取证仍标为「未取得」；参数不修改来源登记、快照或后续发版的默认检查。

## Verification frequency

Tests use the project entry points directly and set no machine-level resource slots, CPU, memory or process-count limits. Concurrency per run is chosen with `-Jobs` / `--jobs`, defaulting to at most four lanes by local core count, and an explicit positive integer has no machine-level cap. On cancel only the child process trees of this run, by the PIDs already created, are cleaned up; full tests and integration remain mutually exclusive as code consistency requires.

Python static checking uses the development dependency Ruff, scanning all of the repository's own Python files with each formal test domain, covering the application, scripts, tests and packaging entry points. The rules are Pyflakes (`F`), the Pylint error rules supported by Ruff (`PLE`), and the mutable default argument, `finally` jump, useless expression and loop closure rules (`B006`, `B012`, `B018`, `B023`). The generated `downloads_clouddrive_pb2.py` is excluded; publicly exported imports are declared with explicit same-name aliases. Preferences for naming, line count, blank lines and complexity are not part of this lint gate.

无效转义由 Ruff `W605` 阻断，Windows 路径使用原始字符串或双反斜杠。正式入口和定向调试都将未处理的后台线程异常记为测试错误，保留原始 traceback；临时账本须在线程退出后清理。Starlette TestClient 使用开发依赖 `httpx2`，应用的 HTTP 客户端仍按运行时清单安装。

前端通过 `allowScripts` 逐项登记安装脚本策略，未登记脚本由 `frontend/.npmrc` 拒绝安装。`@sentry/cli` 使用锁文件中的平台二进制包，禁用额外下载脚本；`fsevents` 的可选原生构建也禁用，文件监听沿用 Node 提供的能力。升级后核对实际安装、构建和 CLI 可用性，不批量放行脚本。

文档与文案检查包含 seiso 稳定规则和最终状态检查，随正式入口执行。分类、范围、独立检查与预览规则用法见 [文档与界面文案](WRITING.md#检查与复核)。seiso 由开发依赖与锁文件固定，运行 Peach 不需要它。

The full suite is not run every time: locally, tests are selected by the domains the change touches, and CI decides how wide the coverage is by commit type.
For debugging, run the relevant cases first, and once the code is frozen run `auto` once; do not hand-write per-domain loops that repeat the shared cases. When a test fails, reproduce it in a targeted way first, and after the fix `auto` decides which domains need to be re-tested.

| Scenario | Verification |
| --- | --- |
| 本机修改 | 正式入口默认 `auto`，按影响域取并集；同代码、环境与范围的有效记录可复用 |
| 普通 PR | Python 3.14：macOS 与 Windows 均按影响域验证 |
| 普通主线提交 | Python 3.14：相对最近成功且属于当前祖先的主线 Test，选择 macOS、Windows 的影响域及适用前端、浏览器与 wheel |
| 实际依赖、迁移、共享测试设施、未知影响面 | Windows 与 macOS 的 Python 3.14 全量 |
| 手动 CI | 完整系统矩阵 |
| wheel | Windows 与 macOS 各一次 Python 3.14 独立最小安装 |
| Release | 复用同 SHA 主线成功 CI；Windows 独立 EXE 与 Apple Silicon、Intel DMG 分别构建和验收 |

Python 全量按文件稳定分片，Windows 四片、macOS 两片。`auto` 按影响域选择文件；唯一选测文件达到 150 个时，Windows 复用四片分配，macOS 仍用单片；更小的 `auto` 两端均用单片。每片使用独立 runner，仍按同一基线和影响域运行，汇总任务要求所有分片和计划选择的任务成功。分片子进程不签发记录。

The `web-bundle` job of the Test workflow runs tsc, lint, Vitest, the build and the artifact diff check uniformly on Ubuntu; lint also checks that there are no diagnostics and that the number of scanned files is greater than zero. In CI the Python jobs hand these three tool cases to the frontend job and the two real-browser cases to the browser matrix; contract tests in the same module still run. Job identity is recognized by fixed workflow and job names, and unknown jobs and the local machine keep the full tests. A run that takes on part of CI's duties does not issue a local test record.

Browser cases are shared across the six Windows runners of `web-e2e`, each shard with its own service, demo library and logs. `ci_plan.py` assigns files according to the measured seconds in `ci-browser-timings.json`, new files use a default weight, and each file runs exactly once. Each shard runs its assigned browser files through the project entry's `-Focus`, and the first-launch file always belongs to the first-setup service. It installs Node 24, frontend dependencies and ffmpeg, and specifies Chrome through `PEACH_E2E_CHROME`. The local browser entry and concurrency semantics remain complete.

PR 与普通主线计划按改动选择前端、vendor、wheel 与浏览器任务，文档只执行适用检查；实际依赖、未知影响、无已验证基线与手动验证包含全部任务。`frontend-ready` 汇总所选前端检查，失败时不启动后续完整回归；未选择前端任务的计划可正常执行。产物差异以文件统计显示。`verified` 根据计划核对必需任务，缺失、失败、取消及必需任务跳过均判失败。Actions 工作流本身由固定版 actionlint 检查语法、表达式、依赖与脚本。PR 更新取消同 PR 的过期运行，主线 Test 按提交各自保留结果。GitHub 的计划任务与 Python 任务使用同一个已验证基线，不以最近一次失败的推送提交代替。

独立 Star 图工作流只生成图表并写入专用分支，改动选择 `tooling` 与工作流检查；混合提交仍按其他文件补齐影响域，未知工作流保留全量判断。

Python shards upload the full test output; browser shards upload the TAP, service logs and redacted network logs, retained for 14 days. The npm audit fails directly on a high or critical vulnerability; only temporary network errors are requested up to three times, waiting 15 and 30 seconds after the first two failures, and an unknown response is not treated as a pass.

GitGud 流水线（`.gitlab-ci.yml`）的 `verify-linux`、`verify-windows`、`verify-macos` 在分支与合并请求上跑改动域加本平台的平台敏感用例：基线是最近一条成功的主线流水线里、作为本提交祖先的那个提交，由 `scripts/ci_scope.py` 判定；先用正式入口跑 `auto --base <基线>`，选域与退回全量的规则同本机 `auto`，再用 `-Focus` 跑 `PLATFORM_TESTS` 里本平台的用例。取不到基线（首次推送、强推、接口不可达）、改了 `.gitlab-ci.yml` 本身，或改动落到必须全量的面时只跑一次全量。版本提交（`chore(release): 版本 X`）的主线流水线是发布演练：三平台全量、媒体构建、桌面安装升级与镜像验收都成功后登记候选；`--ship` 等演练成功才打标签。标签核对同一提交、验证任务和产物 SHA-256，发布已验收的相同文件与镜像，不重新构建。候选身份、保留与回收见 [ADR-0127](adr/0127-verified-release-artifact-promotion.md)，全量范围见 [ADR-0119](adr/0119-mainline-changed-scope-release-full-suite.md)。

演练先读取发布桶真实占用，媒体编译可与正式回归并行；构建清单齐备后在安装冒烟前核对包含暂存与公开副本的精确峰值，候选登记与正式上传仍复查。媒体缓存身份绑定固定源码、构建脚本、工具链、平台与架构，二进制和对应源码均逐文件校验；缓存不代替独立制品验收。Docker 发布核对演练记录的 image ID、提交与版本，在桌面包和 Release 就绪后推送。版本发布与覆盖升级验收不取消进行中的同目标运行；覆盖升级需明确选择目标版本及完整构建提交。

浏览器用例覆盖 `frontend/e2e` 下全部 `*.test.ts`，包括子目录。`setup.test.ts` 由 `SetupE2ETests` 在首次设置服务上执行，其余文件在已配置的演示库服务上按文件并发、文件内串行。并发数取 `PEACH_E2E_CONCURRENCY`；未设时本机取逻辑核数的四分之一、上限 4，CI（`GITHUB_ACTIONS=true`）为 1。每个文件单独起一次 Node，限时 600 秒，取得自己的完整 TAP；空出的通道马上领下一个文件，没有批与批之间的等待。并发时文件按 `scripts/ci-browser-timings.json` 的实测秒数先长后短排队（没测过的按 30 秒算），测量动画、密度切换与等待态替换的文件（`tests/test_web_e2e.py` 的 `TIMING_SENSITIVE_SUITES`）在并发文件全部结束后逐个串行；并发为 1 时按设计决定、交互回归和路由冒烟的顺序逐个执行。任一文件失败或超时，整轮验证失败。并发的文件共用一个服务和演示库：用例触发的写请求只能落在别的用例不断言的状态上，否则用 `page.route` 拦下或归进时序敏感的串行文件。控制台在每个文件结束时输出成败与耗时；每个文件的 TAP 日志 `e2e-<文件名>.tap`、首启的 `setup.tap` 与服务访问日志 `serve.log` 保存在 `build/agent-verification/browser/`，CI 在测试结束后上传其中的 TAP 日志。

Cases that need external prerequisites (Node, ffmpeg, Chrome, etc.) are skipped locally when a prerequisite is missing and fail in CI (`GITHUB_ACTIONS=true`); the decision is centralized in `missing_prerequisite` in `tests/support/conditions.py`. That is why rows of the `python` matrix other than `core` also install Node, and the Windows rows additionally install ffmpeg and Chrome.

本机默认并行：入口传 `--jobs auto`（Windows `-Jobs`）。选中的快速检查先执行，包含仓库与资源位置、参考资料登记，以及前端类型、样式和文案检查；失败时不启动后续测试。普通测试切成并发数四倍的片，按实测耗时分配，每个子进程各领一片、先完成的接着领下一片。内部已并行的 Vitest 与浏览器容器分别独立执行，不与普通分片或彼此重叠。`-Jobs 1` 使用同一阶段顺序，普通分片串行运行。父进程汇总成败、用例数与耗时后签发一份记录，一片红整轮红。

每次运行把各测试文件的墙钟（含类级准备）并进共享记录目录的 `test-timings.json`，普通分片按它先长后短装进当前最空的一片（没测过的文件取中位数）。父进程把划分交给子进程，父子用同一份；CI 的独立分片仍按文件名轮转。测试账本、仓库夹具与端口须彼此隔离。运行器为每次运行创建 `peach-test-run-<时间戳>-*` 目录，`TEMP`、`TMP`、`TMPDIR` 与 `tempfile.tempdir` 指向它，分片子进程沿用同一目录，结束时删除；中断遗留超过一天的运行目录在下次启动时清扫。用例仍负责回收自己的临时资源。

正式记录的 `phases` 保存输入快照、历史记录读取、恢复规划、测试执行和结束核验耗时；测试执行内另列快速门槛、普通测试及各前端容器。父子阶段有包含关系，不能相加。`elapsed` 从取得输入快照前开始计时，不包含入口安装依赖、工具预检与取得全量锁前的等待。恢复规划在同一输入快照内复用域集合、测试导入图与路径影响；检查点发现输入改变时重新规划，不沿用旧图。

Windows paths, mounts, tray, certificates, process encoding, updates, authentication and migrations belong to `core`. Build and workflow changes select `packaging` and `tooling`; the test scheduling itself still runs the full suite. A change only in the uv tool version or in project display fields does not count as a change in the dependency graph; when it cannot be parsed, run the full suite.

Business tests such as performer name mapping are kept: they run when the related domain changes and also in the full mainline run. The test database is generated as a template from real migrations, and each case copies its own temporary database; migration tests run migrations directly. Retry tests inject a sleeper and assert the backoff sequence. Tests that are repeated through inheritance are kept only once.

## What tests to write

Pure HTTP request contracts can use `route_client` from `tests/support/web.py`: requests go through the real routes, middleware and dependencies without starting background services; the caller must still prepare a complete temporary ledger. Service start, recovery and shutdown semantics use the normal lifespan and are covered by integration tests.

The browser entry saves Chromium network event logs through `PEACH_E2E_NET_LOG_DIR`; the mode is `HeavilyRedacted`, the files are in `build/agent-verification/browser/network/`, and CI uploads them together with the TAP. A failed network request still fails the test; when investigating `ERR_NO_BUFFER_SPACE`, check the TAP together with that browser's network events, do not infer the machine's resource state from the error text, and do not add a pass-through retry.

Windows 隔离 E2E 浏览器对 [Chromium 572515601](https://issuetracker.google.com/issues/572515601) 的回环建连缺陷禁用 `TcpPortRandomizationWin`，保留当前锁定 Playwright 的全部默认禁用特性。同名开关的最后一个值会覆盖先前值，不能只追加此单项；`browser-launch.test.ts` 用真实 Chrome 启动参数与原生 Playwright 对照，依赖升级后也验证默认列表没有漂移。生产浏览器、页面断言、请求失败判据及机器网络配置不变；独立的启动超时不能据此标为已修复。

测试应在用户可感知的行为错误时失败。页面的请求、缓存、选择、错误反馈和路由由组件测试与浏览器测试验证；CSS 层叠、主题、尺寸和交互后的样式由浏览器读取计算值。

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

### 采集、任务与资料的回归边界

只覆盖本次真实风险，复用既有样本和适当测试层；相关修复可共享临时样本与验证，不把每个任务分别扩成全量。

| 修改范围 | 验证内容 |
| --- | --- |
| 番号解析与来源匹配 | 从真实失败文件名经过规范番号、站点查询到候选身份。覆盖确需等价的分隔符、前后缀和补零写法，以及不能合并的反例；只用站内写法不能证明流水线输入有效。同番号多作品不以字符串等价直接合并。 |
| 暂停、取消与恢复 | 按已声明的控制边界分别核对父任务、已开始的工作、后继任务、浏览器及检查点；页面或状态字段显示暂停不能单独证明执行停止。 |
| 来源失败与诊断 | 区分成功、正常无结果和失败；相关记录能关联任务、影片或文件、来源、阶段、异常原因及适用的构建/采集器版本，并验证脱敏。与故障无关的字段不强制填充。 |
| 人工资料与来源刷新 | 按[人工资料与身份边界](SOURCING.md#人工资料与身份边界)验证字段保护，以及清空、恢复来源、修改归属和身份合并各自的语义。 |

旧编号、快照或已完成断点可能挡住修复时，按[升级生效范围](../.claude/skills/peach-worktree/SKILL.md#修复的升级生效范围)验证定向补修。测试结论说明实际环境、覆盖范围、跳过及未取得项，不以用例数量代替原场景验收。

## 正式入口

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

测试入口不取得机器级重负载锁。全量验证与集成只按下文的仓库代码一致性锁互斥；浏览器和 Vitest 的阶段顺序由测试入口安排。

全量先单独跑一片秒级检查（`test_runner.GATE_TESTS`：仓库策略、编码、文案终态、上下文预算、源码断言棘轮、复杂度、Python lint、外发代理、仓库整洁与依赖清单，合计约 1 分钟），有一项不过就不起其余分片。

全量失败后，入口从逐条结果里取出失败的 Python 用例、e2e 文件与 vitest 文件，不超过 6 个文件时用定向入口逐个单独重跑一次。单独重跑通过的，记录照样签为通过，名字写进记录的 `flaky` 字段并打印出来；单独重跑仍失败、失败面更大、或浏览器容器整个没起来的，按真实失败处理。同一用例反复出现在 `flaky` 里，说明它的等待写法或时限需要修。

本机全量验证与代码集成共用 `full-suite.lock`，从取得代码和环境快照一直持有到记录写入完成。仅修改两份 README 或 `docs/` 下 Markdown 的集成只取得 `integration.lock`，仍核对工作树、验证记录、README 声明与冲突，不等待无关全量测试。
锁忙时按到达先后排队：等待者在锁旁的 `full-suite.lock.queue/` 放一张以纳秒时刻开头的票，
前面没有活票时才去抢锁，拿到即撤票；提示里打印持有者与前面排队的个数。票主进程退出后，
它的票由后来者清掉。最长等 30 分钟；超时撤票退出，不执行测试或合并。集成事务本身仍由
`integration.lock` 串行保护。部分域验证与 CI 分片不签发独立的本机全量记录。

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

### 交付预检与 PR 绑定

最后交付提交完成后，先在当前隔离工作树根目录运行元数据预检，再开始耗时验证或推送。预检核对工作树干净、目标分支已纳入，以及提交主题、署名和 README 声明。

Windows（PowerShell 7）运行预检：

```powershell
& .\.venv\Scripts\python.exe -X utf8 .\scripts\agent_worktree.py preflight
```

macOS/Linux（zsh）运行同一预检：

```zsh
./.venv/bin/python -X utf8 scripts/agent_worktree.py preflight
```

`preflight` 不安装依赖、不计算测试环境身份、不读取或签发测试证明，也不访问远端 PR。退出码为 `0` 只表示元数据通过；`tests` 与 `pull_request` 仍是 `not_checked`。`ready` 和 `integrate` 继续使用相同元数据判据，并核对当前内容对应的正式测试记录。

`integrate` 在合并前通过工作树的 GitHub CLI 仓库上下文取得 PR。PR 必须开放，`headRefOid` 等于工作者当前提交，`baseRefName` 等于集成目标分支；成功回执保留 PR 链接及这两个身份。未取得 PR、字段无效或身份不匹配时停止，不改变主线内容。此核对不替代 PR 审阅、对应提交的 CI 与既有预览确认。

## 定向调试与局部记录

Windows 的 `-Focus` 接受 Python 模块、类、方法或仓库相对路径，可传数组；通过 `pwsh -File` 调用时也接受一个逗号分隔参数。macOS/Linux 对每个选择器重复传 `--focus`。入口统一去重，拒绝空项并核对源码及隔离依赖。选择器不存在、浏览器路径超出 `frontend/e2e` 或与分片混用时拒绝执行。浏览器用例只收单个 `frontend/e2e/*.test.ts` 文件，不收目录；要跑全部 e2e 时把文件逐个列进数组。

浏览器冒烟逐个文件执行，一个文件失败仍跑完其余文件，最后把各失败文件的输出与日志路径一起报出；一轮全量就能看到所有 e2e 失败。搜索建议、键盘列宽调整和嵌套弹层的失败输出另保留当时的输入、焦点、弹层、等待态与无障碍树，原异常作为 cause 保留。取证不延长等待、不重试交互，也不忽略运行期错误。

React Aria 表格首次取得焦点时先建立行导航。键盘列宽测试先进入行并确认公开焦点状态，再聚焦手柄，核对真实 `activeElement` 后按 Enter；不把直接调用 `focus()` 已返回当成焦点仍在手柄的证明，也不用等待时长或重复按键消除竞态。

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

定向调试一个或几个 vitest 文件（路径从 `frontend/test/` 起），只跑这几个文件：

```powershell
& .\scripts\test.ps1 -Focus frontend/test/jav-card-title.test.ts
```

定向调试不签发记录，不能作为 `ready` / `integrate` 的验收证明。浏览器文件选择只在调试环境生效；正式入口拒绝残留的 `PEACH_TEST_FOCUS` / `PEACH_E2E_FILES` / `PEACH_VITEST_FILES`，防止局部运行被签成整域。浏览器文件失败或超时时保留它的完整 TAP 与服务日志。

The browser keeps Playwright's default process model and mute settings, does not limit renderer processes, and does not force the GPU or audio service into the browser process. Native browser launch is limited to 60 seconds, the page body wait to 15 seconds, and each batch to 600 seconds; process startup and page behavior are accepted separately. Pages that need task-state stubs install responses through the preparation callback of `visit` before the first navigation, and check the task state only after the corresponding React body appears; an in-progress task is not treated as a body waiting state. When the page body wait fails, the URL, closed state, collected runtime issues and the accessibility tree are kept, and the fixture closes this browser context.

The Windows Release workflow prepares the full dependencies with `uv sync --locked --all-extras`. The installation directory regression and the PyInstaller build share this venv, and the test entry verifies dependencies against the full lock file.

Windows 独立制品验收的宿主从同一检出的 `scripts/` 加载辅助验证模块，并按发行锁核对随包采集工具。临时应用与采集工具自检清除 `PYTHONPATH`，使用移除开发工具的 PATH；源码路径只供验收宿主使用。

macOS Release 使用 `macos-15`（Apple Silicon）和 `macos-15-intel`（Intel）分别构建，解释器、依赖与目标架构必须一致。独立验收任务只下载候选制品与冒烟脚本，挂载只读 DMG，核对 Applications 链接、许可证、签名与原生架构，再执行 `scripts/smoke_macos.py`。该脚本将应用移到源码树外，在移除开发工具的 PATH 下验证首次设置、迁移、单机账本、登录、前端资源与配置保存，数据全部使用临时目录。所有平台验收成功才发布；普通 push 不构建安装包，手动运行 Release 不上传公开资产。

`auto` 扫描同环境的有效记录，按测试文件合并 24 小时内、未受输入差异影响的成功结果；记录数量没有固定搜索上限。每项保留原通过时间，最新的失败或未完成状态阻止旧成功结果恢复。缺少、损坏、过期或未来时间的证明不计入覆盖；单份损坏记录不影响其他候选。`-Fresh` 始终实际执行请求范围，显式 `full` 默认也实际执行；`-Resume` / `--resume` 允许全量验证按完整批次来源续跑，与 `Fresh` 互斥。

在当前隔离工作树根目录续跑全量验证：

```powershell
& .\scripts\test.ps1 -Scope full -Resume
```

macOS/Linux 使用相同的恢复规则：

```sh
./scripts/test.sh full --resume
```

GitGud 的三平台验证使用正式恢复入口，通过 GitLab 原生缓存保存证明 JSON。缓存按作业、分支和保护状态隔离，成功或失败后均保存；锁文件不进入缓存。重试作业恢复缓存后，仍逐项核对当前代码、依赖、环境、通过时间和完整批次。缓存缺失或证明无效时执行必要测试，不能仅凭缓存存在取得通过结论。并行分片在预计总耗时相同时按文件数分配，实测耗时为零的文件也会分散到非空分片。

正式父运行在开始时原子保存待验证状态，每个分片完成后立即保存检查点。失败批次仍保留成功文件、成功补充用例及其时间；整文件状态不覆盖已取得的单项结果。共享输入变化和 `Fresh` 同时作用于文件及其补充用例。快速门槛失败时，其余文件保持未完成。进程中断后，下一次 `auto` 在所需范围内补齐缺少的文件，串行与并行使用相同结果模型。分片报告必须完整且格式有效，结束码须与报告一致；异常退出不能产生该片的成功证明。分片写出完成报告后仍未退出的进程，等待 15 秒后回收该片的进程树，不给尚在执行的测试设置额外时限。

浏览器与 Vitest 容器内按外部测试文件保存完成结果，只有逐条输出不能证明整个文件完成。恢复计划绑定当前输入快照、完整文件集合及每个省略项的成功时间。Python 容器用例自身也必须有成功证明，才能连同其外部文件一起省略；容器的后置检查失败仍需补测。选择参数只在对应容器用例执行期间启用，普通 Python 用例不继承这些参数；失败或退出时恢复环境。外部选择仅由正式父运行生成，`Focus` 和独立 CI 分片不签发正式记录。

全量证明还要求所有文件与容器检查属于同一个完整批次。独立局部运行可以补齐所需域，不能拼成 `full`；有完整批次来源的中断或失败运行，补齐缺少项后可恢复全量证明。每次写入时清退写盘超过 24 小时的记录、持锁说明与残留临时文件；锁文件和非记录文件不动。

Test selection compares file contents: when a Python change is only comments or formatting, an npm manifest change is only description/keywords, or a TOML change is only comments or formatting, `checks` is selected. Python docstrings, runtime strings and type annotations count as effective content. Python build metadata changes select `packaging`; actual dependency changes, file mode changes, parse failures and unknown impact keep full verification.

Added and deleted files are selected by the functional domain they belong to; execute-permission changes and symbolic links on existing files stay at `full`.

只在 `SCOPES` 的现有域末尾追加精确 `test_*.py` 文件名、且登记表外的 AST 完全不变时，选择新增测试所属域、checks 与 tooling；这两项保留选测计划、登记完整性和证明协议回归。删除、改序、通配符、新域、既有路径映射和执行逻辑变化仍按完整验证处理。普通 `scripts/` 脚本已有 tooling 前缀映射，同域时不再添加重复的 `AUTO_SCOPE_FILES` 条目。记录快照和 CI 使用同一内容判据；无法识别的旧记录保持保守判断。

`src/peach/` 的已知模块合并直接导入它的测试所在域，名称或显式映射不排除直接消费者。按名字推不出测试文件的模块，还并上直接导入它的源码文件按同一套规则推出的域；互相导入的一组模块合起来算。导入者推不出域、谁都不导入它，或未知模块被共享测试设施 `tests/support` 使用时仍 `full`。不沿导入链一路扩散：函数里的延迟导入把几乎所有模块连成一团，传递闭包等于全量。随应用分发的 `resources/` 按加载它的模块与打包面选域；`.gitlab-ci.yml` 与 `MANIFEST.in` 在本机选 `packaging` 与 `tooling`（主线流水线改 `.gitlab-ci.yml` 时三平台仍跑全量）；只登记在 `core` 或 `packaging` 的测试文件改动时跑登记它的那个域。

README 的 Python 下限和双语入口由 checks 的安装契约检查，普通文档不选择整个 tooling。静态文件输入识别以仓库根及其别名为依据，临时夹具的同名写入不属于仓库读取。缺失文件不进入当前快照，删除由前后文件集合识别，暂存或提交相同删除不会改变内容证明。

运行中输入改变时，无论该批次是否全部通过，都按差异保留未受影响的成功结果和原时间；退出 `4`，随后 `auto` 补齐缺少项。独立 Python 测试文件的逻辑变化使该文件、直接或间接导入它的测试及公共门槛失效；浏览器测试文件变化使该文件及相应容器检查失效。共享设施、未知范围、执行模式或环境变化仍按完整影响范围重新验证。

首次设置目录 `frontend/src/react/pages/setup/`、素材 `resources/setup/` 和独立页面产物 `web/dist/peach-pages.js`、`web/dist/peach-pages.css` 的补测保留主应用浏览器结果，仍检查首次设置浏览器流程、全部相关 Python 契约、组件与打包。首次设置浏览器用例集中在 `frontend/e2e/setup.test.ts`；新增独立页面浏览器容器时须同步扩充这份对应关系。主应用产物、共享样式或公共组件同时改变时，主应用浏览器结果照常失效。

When the test record format is upgraded, the main checkout's entry may not recognize the new format. First pass `ready` in the worktree, then have the main checkout call the already-accepted `scripts/agent_worktree.py` from that worktree, specifying the main checkout with `--repo` and running `integrate`. This way still checks the test record, the README statement, the target branch and the integration lock; do not hand-edit the record or bypass the gates. After integration the main checkout uses the same version of the entry.

PR 与普通主线的浏览器 CI 根据界面、Web API、认证与浏览器用例选择；普通后端单测不单独触发浏览器任务。工作流按职责选测，发布工作流触发打包验证，看板等管理工作流只触发工具检查。无可用基线、未知影响与手动完整验证覆盖全部 CI 任务，发布演练和制品验收按其独立门槛执行。

## Environment identity of records

记录只在「代码、环境、范围」三项都匹配时可复用，环境那一项由 `scripts/test_evidence.py`
的 `environment()` 算成一个摘要：Python 版本、实现与运行时文件内容、规范化的已安装包名称和版本、平台、影响行为的环境变量、前端安装锁的规范化 JSON、实际 Chrome 文件内容，以及 node／npm／git／ffmpeg／ffprobe／openssl 六个外部工具。相同运行时和依赖位于不同工作树、安装锁只有排序或缩进差异、CI 运行编号或工作目录变化，不改变环境身份。CI 工作流和 job 职责、浏览器安装状态与内容变化仍参与判断。
测试入口强制设置的 `PEACH_REPORTING_TEST_MODE` 防外发标记不参与环境选择；入口源码仍参与代码快照。

GitLab 的作业令牌、容器仓库密码和依赖代理密码按是否存在记录；`CI_REPOSITORY_URL` 保留协议、主机、路径、用户名及认证存在性，密码值不参与身份。`CI_JOB_RETRY_COUNT`、`CI_JOB_STARTED_AT_SLUG` 和 `CI_BUILD_NETWORK_NAME` 表示本次运行的计数、时间与网络名称；`CI_TRACEPARENT` 和 `CI_TRACESTATE` 标识作业的分布式追踪上下文。这些运行元信息不参与身份。作业职责、覆盖模式和应用行为变量仍参与判断。变量含义见 [GitLab 预定义变量](https://docs.gitlab.com/ci/variables/predefined_variables/)。

uv is only probed and is not part of the fingerprint: it builds the environment, and the interpreter and packages it installs are already recorded one by one in the digest, while uv itself
is auto-upgraded by winget. If its version were counted too, all records would be invalidated together on the day of an upgrade,
though not one byte of the verified environment had changed.

A tool's identity takes the **version it reports itself**, not the path resolved on PATH or the file bytes. The same Git installation resolves to `Git\cmd\git.exe` in
PowerShell and to `Git\mingw64\bin\git.exe` in Git Bash:
the two launcher binaries differ in bytes while the version and behavior are the same; recording identity by path would tie records to the shell: a record produced in one shell, and then `integrate` run from another shell, reports "缺少有效测试记录" (the literal error message, "valid test record missing"),
while going back to the worktree and running `auto` says "reusing record" instead; the two statements check two different keys, at the cost of an unnecessary full run.

改环境身份、内容签名或记录结构时，主检出的旧算法可能算不出新键或读不了新记录，无法验证带着新格式的分支。
那一次的 `integrate` 用分支自己的脚本和判据，并把仓库指到主检出；不重复执行已取得有效记录的测试。`--repo` 是顶层参数，
放在子命令前面，放后面会被 argparse 拒收：

```powershell
& .\.venv\Scripts\python.exe -X utf8 <worktree>\scripts\agent_worktree.py `
  --repo <main-checkout> integrate --branch <branch>
```

## 测试结果历史

正式入口与定向调试每次运行都把逐条结果追加进测试结果历史，用来统计每条测试抓到回归的比率，并区分抖动、期望过时与环境失败。实现在 `scripts/test_history.py`。

文件是 Git common directory 上一级的 `build/test-history/YYYY-MM.jsonl`：本机落在主检出的 `build/` 下，与测试记录 `build/agent-verification/` 同级，所有工作树共用；CI 上就是作业目录的 `build/test-history/`，由流水线作为 artifact 上传。JSON Lines 按月分文件、只追加，多个进程同时写时由旁边的 `.lock` 串行。

每次运行先写一行运行头：

| 字段 | 含义 |
| --- | --- |
| `type` | 固定为 `run` |
| `run` | 本次运行的编号，逐条结果用它关联 |
| `time` | 写入时刻 |
| `scope` | 请求与实际范围，如 `auto:catalog web`、`full:full`、`focus:<选择器>`；CI 独立分片带 `shard i/n` |
| `platform`、`python` | 平台与解释器版本 |
| `head`、`branch`、`worktree` | 提交、分支（分离头指针时取 CI 的分支变量）与工作树路径 |
| `ci` | `CI`、`GITLAB_CI`、`GITHUB_ACTIONS` 任一非空即为真 |
| `files`、`count` | 本次跑到的测试文件模块名与用例总数 |

之后逐条写 `type` 为 `test` 的行：`run`、`id`、`outcome`（`pass`、`fail`、`error`、`skip`）与 `seconds`，失败与报错另有 `message`，取最后一行异常，遮掉 `token=`、`password=` 一类的值，截断到 200 字。Python 用例名为 `模块.类.方法`，vitest 为 `vitest:文件 > 分组 > 标题`，浏览器用例为 `e2e:文件 > 分组 > 标题`。

为控制体积，只逐条写非通过的用例与耗时不少于 5 秒的通过用例。一次全量约一万条结果，全部逐条写约 2.4 MB；按这个口径约 250 行、75 KB。某条用例跑了几次，用运行头的 `files` 推算：文件在场、没被记成 `skip` 的用例都跑过；逐文件耗时另见 `test-timings.json`。

写历史失败只打印一行告警，不改变测试判定。历史不经环境变量传递，也不在被快照的工作树里，测试记录的环境指纹与有效期不受影响。用例里调用运行器的那些测试不写真实历史，也不取走外层运行收集中的 vitest 与浏览器结果。
