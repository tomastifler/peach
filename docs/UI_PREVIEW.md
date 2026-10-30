# UI Acceptance Preview

A user-visible UI acceptance preview uses an independent copy of a small sample of the real ledger, keeping the original works, people and their relationships, and reusing the existing image cache. Fixtures in isolated automated tests are not used as user acceptance previews, nor do they enter the demo site's data sources.

At the start of work, first search project memory for "UI preview and real samples", read `<data root>/state/project-context/UI_PREVIEW.md` and the coverage list, and reuse the registered generation and launch entry points. When real samples are not obtained, state the missing source and add real records, and do not substitute synthetic works, forged names or assembled relationships.

## Source Verification

The preview launch entry calls `scripts/check_ui_preview.py` before listening on a port, specifying `--source-data`, `--sample-data` and an `--output` outside the repository. The original ledger and the sample are both opened with SQLite `mode=ro`; verification modifies neither database.

Verification requires the sample data root to be independent and to contain a `sample-manifest.json` pointing at the original ledger. It checks work identity and title fields, person identity, work-entity associations and manifest counts item by item, and verifies the original paths and file digests of the image cache. When a source is missing or inconsistent, the exit code is 2, and launch and delivery stop. When the sample snapshot and the current original ledger show real field changes, extract again from the original ledger, keeping the facts complete, and do not hand-edit sample fields to fit a scenario.

After passing, it produces a `real-ledger-subset` report with counts, the number of cached images and a digest of the sample content. The report proves only the data source; avatars, covers, lists, details and target interactions still need the actual pixels and state viewed in a browser. Neither a successful launch nor a normal `/healthz` response can substitute for visual verification on its own.

Image digest verification covers avatar, cover, poster, logo and photo caches; the responsive thumbnails of avatars and covers are derived by the app from the cached originals, and the actual cropping and display are verified visually separately.

The sample coverage list enumerates, by actual records, landscape, portrait, image, audio, archive, other resources, multiple performers, long titles, watch later, watched, rated, recycle bin, file lost, play queue and playlists. The covers and person identities referenced by new-release discovery and wanted records must also be kept, and caches must not be copied by library assets alone. Resources the source has but the sample lacks should be filled in from the original data; images the source itself did not obtain keep their real missing state, noted in the list. Types with no real records are listed as uncovered, and no assembled data stands in for them.

## Confirmation and Delivery

Provide an accessible preview, and state the conventions read, the real samples used and the scenes viewed. The original ledger, original media and credentials stay independent; the preview intercepts business-modifying requests, and turns off background scheduling, ledger sync, mDNS and automatic playback in details.

UI regression may run only after the user explicitly confirms the current preview; after a new correction, stop this task's running and queued tests, fix, and provide the preview again. Test, production switchover and release results are reported separately, and a preview does not stand in for a conclusion that has taken effect.

## Copy Editing

Every page preview handed to the user comes in both a normal version and a copy-editing version, normal first, including first-run setup, login, error pages, the main UI, new routes and the demo site. The normal version drops the `edit` parameter; the editing version adds `?edit` when there are no query parameters and `&edit` when there are. Both links keep the other query parameters and the fragment.

Reuse the core, adapters and save endpoints of [text editing in a source environment](OPERATIONS.md#editing-text-in-a-source-environment). Injection in the main UI does not automatically cover standalone page shells such as first-run setup; when a target page lacks the hookup, add the shared entry point within the current UI task. The mere presence of the parameter must not be taken as enabled, and no separate editor is built.

The page, `PROJECT_ROOT`, copy sources, backups and build artifacts of a source preview must point at this task's isolated worktree. The preview still intercepts business writes, and lets only `POST /dev/copy-save` and `POST /dev/copy-apply` through to the local same-origin editor; authentication, source digest verification and backups are retained. Reloading Python copy applies only to this task's preview process and is not handed to the production tray. The demo site keeps browser drafts and does not claim write-back to the source.

Before providing a preview, confirm on the target page that the "Copy editing" floating bar, hover scope, in-place input and cancel operation work. On first hookup or when the save path changes, use an isolated temporary source copy to verify save, build or reload, taking effect after refresh and retention of the `edit` parameter; valid evidence for the same worktree and entry point can be reused. After verification, restore the temporary copy and keep the user's edits. When a capability is not obtained, state the specific page and the error, and do not claim the editable preview is ready.

Layout acceptance and control operation use the normal viewing state; the copy-editing version can operate the page through "Pause editing". Source changes produced by the editor are included in the current task's diff, regression and integration, and neither write to the real ledger nor modify the production configuration.

The copy-editing toolbar, styles, source selection and modal following are shared through `createTools()` in `frontend/src/copy-editor-core.js`; adapters provide sources, drafts, save and action callbacks. The toolbar, hover scope and source selection follow the current modal layer, and return to the page after the layer closes. The toolbar leaves room for the page's bottom selection action bar.
