# Project Board and Delivery Linking

[Peach Requirements and Roadmap](https://github.com/orgs/peach-mitao/projects/7) is the only continuously synced public board, showing project Issues, planned scope, and delivery status. Project tasks arranged by maintainers and feedback submitted by users are distinguished by "Source" and views. Personal library fixes, account sign-in, and device maintenance stay on the private list.

"Requirements Board" shows all project requirements, "Maintainer To-do" and "User Feedback" filter by source respectively, and "Roadmap" shows planned phase and priority. The top of the README and the repository Projects provide entry points. Views do not change public scope, and each item is maintained in one place only.

Issues belong to two public repositories: [User feedback](https://github.com/peach-mitao/peach/issues) goes in the app repository, and [maintainer to-dos](https://github.com/peach-mitao/peach-roadmap/issues) go in the planning repository. The app repository's Issues page presents feedback directly, and the same public Project aggregates items from both. After signing in, the Issues overview can query by repository and be saved as a personal view.

Issues in public repositories are always visible per repository permissions; adding one to a private board does not hide the original Issue. Formal items use GitHub Issue numbers; drafts keep their confirmed scope and priority, and related items use accessible links to describe the association.

## Status and Version

| Field | Meaning |
| --- | --- |
| Status | To triage, To schedule, In progress, To verify, Done, Cancelled; PRs also have Closed without merging, describing the real outcome |
| Source | Planning repository means maintainer to-do, app repository means user feedback; unrelated to the submitter's account |
| Priority | P0 urgent, P1 high, P2 normal, P3 low |
| Planned phase | Near term, Later, Exploring; not a commitment to a delivery date |
| Waiting on | The specific condition blocking the next step; left empty when nothing blocks |
| Implementation link | The linked PR or a verified implementation commit |
| Delivery progress | No implementation linked, Not yet merged, Merged awaiting release, Released |
| Release version, Release notes | The first downloadable version that actually includes the implementation, and its link |
| Milestone | Planned delivery scope; recorded separately from the actual release version |

A merged PR means the code is integrated. An open requirement moves to To verify; only after acceptance is complete and the Issue is closed does it become Done. When the close reason is "not planned" it becomes Cancelled. A release version does not substitute for acceptance in the target environment or by the reporter.

## Automatic Sync

The app repository's `.github/workflows/project-board.yml` responds to this repository's Issue open/close and label changes, PR creation and merge, mainline pushes, Release publishing and changes, and checks both repositories every 6 hours. Issue open/close and creation in the planning repository are synced by the scheduled check. It uses mainline code and does not check out or run code from external PRs. All syncs run serially, each reading current facts, so repeated runs do not create duplicate cards or advance status twice.

- The public roadmap automatically collects Issues from the two configured repositories; the app repository backfills open items and the planning repository backfills all statuses, so items created and closed between two scheduled checks are still collected. PRs are used to compute implementation links, and internal drafts are not copied to the public Project.
- Sources sync per the repositories configured in `.github/project-board.json`; the category views use the same Issues.
- Reopened items return to To schedule or To verify depending on the actual implementation, and items with a linked open PR are In progress.
- Implementation links are built from an app-repository PR's GitHub linking and separate reference lines. Planning tasks use `Refs peach-mitao/peach-roadmap#number`, app feedback can use `Refs #number`, and full Issue URLs are also supported. Only configured repositories are accepted; an ordinary mention of a number in the body is not treated as delivery.
- The repository name and number together identify an Issue; `issue_aliases` stores migration mappings so reference lines from before a migration still point to the matching task. A native GitHub transfer keeps the discussion history, and the original Issue URL redirects automatically.
- An open requirement whose PR has merged moves to To verify; `status:needs-info` and `status:needs-verification` keep their meanings of waiting for information and for acceptance respectively.
- From published Releases that have downloadable artifacts, the tag commit ancestry is checked and the first version including the implementation is filled in. A bare tag, a failed build, or a release draft does not count as released.
- Creating a Release through the Actions repository token does not trigger another Release workflow; after publishing, the release workflow explicitly calls the same sync entry.
- It does not close Issues, merge PRs, or change priority, schedule, or archive status. Archived items are not restored automatically.

For historical implementations integrated directly without a PR, register the full commit SHA in `implementation_commits` of `.github/project-board.json`, keyed by `org/repo#number`; the sync likewise verifies whether it belongs to the app mainline and release tag, and does not declare completion on text alone.

## Credentials and Verification

The organization Project does not accept the repository's default `GITHUB_TOKEN`. `PROJECT_BOARD_TOKEN` must have read access to both repositories and Project write access, and is injected only in the app repository through a GitHub Actions Secret; it must not be written into code, logs, or event bodies. The planning repository does not store this credential. A GitHub App can replace the long-lived token following the [official method](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions).

Running `scripts/project_board.py` locally only previews differences by default; it writes only when `--apply` is passed explicitly. Regression covers open/close, merge, to-verify, release ancestry, and cross-repository references; live acceptance uses a manual trigger and reading the actual board back.
