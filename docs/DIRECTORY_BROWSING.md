# Directory Browsing

The "Folder mode" switch in the works area of the home and profile pages turns on the directory tree and breadcrumbs. The tree is grouped by the top-level directories in the media library configuration, shows the directories already registered in the database, and keeps the original directory names and hierarchy. A profile page's directory filter intersects with the current person, studio, creator or tag scope; turning the switch off keeps the page's other filters.

The "Cards / List" toggle on the right switches the library display mode, shared by the works area on the home page and profile pages; the current browser remembers the choice. The list shows cover, name, ownership, duration, size, and view count, with rows separated by straight lines; on narrow screens duration and size move under the name.

The list shows 20 works per page by default, with 10, 20, 50 or 100 selectable. Sort buttons for release date, rating, duration and so on stay at the top, sharing the current sort with the list's sort menu and column headers; sorting applies to the whole filtered result. Select all affects only the current page, selected works persist across pages, and the bulk actions at the bottom use all selected works. Returning from a detail page keeps the page number and sort within the same filter scope.

The count and action controls share one row; when the width is insufficient the whole row scrolls horizontally, and the count and buttons keep their full width. Work cards are sized to their actual text and tags. The completion hint is followed by "View processing details →", with the completion button on its own line below.

## Finding Content

Click a directory name to enter that scope, and click the arrow to expand subdirectories. Breadcrumbs go back to ancestor directories, and "All folders" returns to the media library root list. Search, tags, unwatched, watch later, marked, sort, card layout, and work details follow the library home page.

"Include subfolders" decides whether the works list includes lower-level directories. On desktop the tree sits to the left of the content; when space is tight, a directory button next to the breadcrumbs opens a popover. The directory location goes into the address bar, so refresh and browser back restore it.

The subfolder entries show the first 12 by default, and offer "Show all" and "Collapse folders" beyond that. Entering another directory restores the collapsed state.

The directory tree reads paths from Peach's database, so an offline mount can still browse what is already registered. Unscanned files and empty directories must be ingested first; a path only indicates where something is stored.

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
