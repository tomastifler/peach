# Directory Browsing

The "Folder mode" switch on the right of the library filter bar turns on the directory tree and breadcrumbs. The tree is grouped by the top-level directories in the media library configuration, shows the directories already registered in the database, and keeps the original directory names and hierarchy. Turning the switch off returns to all works.

The "Cards / List" toggle on the right switches the library display mode, shared by the works area on the home page and profile pages; the current browser remembers the choice. The list shows cover, name, ownership, duration, size, and view count, with rows separated by straight lines; on narrow screens duration and size move under the name.

The list defaults to 20 works per page, with 10, 20, 50, and 100 as options. Click a column header to sort, or use the sort menu to pick added time, release date, rating, and other fields; sorting applies to the entire filtered result. Select all only affects the current page, selected works persist across pages, and the bottom bulk actions use all selected works. Returning from a detail page keeps the page number and sort within the same filter scope.

On narrow screens the count and action controls share one row and scroll horizontally. Work cards size their height to the actual text and tags. The enrichment hint is followed by "View processing details →", with the enrich button on its own next row.

## Finding Content

Click a directory name to enter that scope, and click the arrow to expand subdirectories. Breadcrumbs go back to ancestor directories, and "All folders" returns to the media library root list. Search, tags, unwatched, watch later, marked, sort, card layout, and work details follow the library home page.

"Include subfolders" decides whether the works list includes lower-level directories. On desktop the tree sits to the left of the content; when space is tight, a directory button next to the breadcrumbs opens a popover. The directory location goes into the address bar, so refresh and browser back restore it.

The directory tree reads paths from the Peach database, so offline mounts can still browse registered content. Unscanned files and empty directories must be ingested first; a path only indicates where something is filed.

## Setting a Directory Purpose

After selecting a directory, click "Set directory purpose" to the right of the breadcrumbs.

| Purpose | What is saved |
| --- | --- |
| Personal category | Directory scope and category purpose |
| Person | Association between works and a person |
| Creator / account | Association between works and a creator account |
| Seller | Association between works and an account, plus the user-confirmed seller purpose |
| Studio | Association between works and a studio |

Association purposes require entering a canonical name. An existing canonical entity or unique alias resolves to the matching identity; when ambiguous, the canonical name must be used. A new name can be created when the user confirms the directory purpose.

First choose "Apply to subfolders" and "New files follow this rule", then click "Preview impact". The preview shows the current scope, the number that can be applied, and ownership conflicts; after confirming the scope, click "Save directory purpose". Changing any option requires previewing again.

Per-item confirmations, differing file-level ownership, and ownership rejections are preserved. When a rule has conflicts, an entry to view them appears under the directory title; the detail and directory purpose popovers can separately inspect the works and the conflict reasons.

## New Files and Removing a Rule

"New files follow this rule" only applies to files registered later. A scan judges ownership by the nearest matching directory rule; a personal-category rule in a subdirectory can stop inheritance from upper-level rules. When not enabled, a scan only registers the path and file information.

"Remove rule" withdraws the associations created by that directory rule. Associations from other sources, later per-item edits, and media files are kept. The profile page of a person, creator, seller, or studio still uses the same canonical entity.

Neither directory browsing nor ownership confirmation moves or renames media files. Physical organizing uses "Organize" in data management. For the boundary of using directory names as identity hints, see [ADR-0013](adr/0013-folder-names-are-candidate-evidence.md).
