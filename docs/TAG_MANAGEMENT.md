---
kind: howto
---

# Managing Tags

On the Tags page choose "Local" or "Online", and click the pencil icon next to the title to enter management mode; click the same icon again to return to browsing.

Both modes share the page header search bar and the tag filter bar; in management mode the filter bar can switch between "In use / Hidden", and tags can be browsed by category, tag cloud or alphabet. Search in management mode supports names and aliases.

Both local and online tags can be favorited or unfavorited with the star button. The tag categories of "My favorites" include both kinds of favorites; online tags show their vocabulary, and clicking one opens the corresponding tag filter on the Follow page. Online favorites update with renames and merge groupings.

## Renaming

In management mode, click the pencil icon inside a tag, enter a name, and click "Preview impact". After confirming the resource count and the name, click "Rename tag". Browse mode keeps the favorite button; the edit entry shows only in management mode.

The tag ID stays stable, and the old name is kept as an alias. Work annotations, source term mappings, favorite names and per-item hide choices migrate with it; when later collection recognizes the old name, it is filed under this tag. When the name already belongs to another tag, use the merge operation.

## Merging

In management mode, select at least two tags, click "Merge", and choose the tag to keep. The preview shows the resource count and the number of overlapping associations; execute after confirming.

A resource shows a tag only once, source relationships and old names are saved with the kept tag, and the kept tag's global hidden state becomes the merge result. A merge cannot be undone directly, and a SQLite backup is created automatically before writing.

"Tidy duplicate tags" shows only when duplicates exist, and its scope is limited to deterministic rules such as registered synonyms, display names and character width. Tags with similar meanings are left for the user to decide whether to merge.

## Hiding and Restoring

After selecting tags, click "Hide", preview the scope and confirm. The hide choice covers existing resources and later collection, and the source evidence is kept. Switch to "Hidden", select tags and click "Restore" to bring back the browse and filter entries. Hide choices on a single resource are kept independently.

## Manual Tags on Online Content

Tag browsing and tag management show 100 tags per page by default, switchable to 50, 100 or 200. Paging reads and shows only the current page; selections in management persist across pages, and when the search, category, state or view changes the selection is cleared and you return to the first page. The tag tab of follow management provides its own search.

Local and online details share the tag row. Click the plus of "Add tag", search existing tags or enter a name to create one; the pencil on the right of a tag renames it, and the cross hides the tag from the current content. A rename previews its impact, and after confirmation applies to all content of the same tag, with the old name kept as an alias.

Manual tags and single-item hide choices are saved in the local user settings by source and content number, retained when the source updates, while the source metadata keeps the original terms. When a work has several versions, the card and filter items show each version's manual tags; adding and deleting in the detail apply to the current version, and can be undone after success.

## Blocking Content by Online Tag

On the "Tag management" tab of "Follow management", select tags and click "Block content"; the online management mode of the Tags page can also be used. After previewing the impact and confirming, content carrying any of the selected tags, along with its other versions, is hidden from follow lists, creators' online works and filter items; later updates follow this choice.

In management mode switch to "Blocked content", select tags and click "Restore content" to lift the block. Tag renames and aliases keep the same identity; a merged tag keeps the content-block choice of any member. Opening a content detail directly still lets you view and manage tags.

"Hide tag" controls the tag's display and filter entries; "Block content" controls whether works appear in browse lists. The two choices are saved independently.

## Interface and Maintenance

Renames, merges and hides of online tags are saved in the local user settings, and source records keep the original terms. The Tags page, Follow page cards, details and filters share this grouping; old names can still be used for filtering, and later source updates follow the grouping of existing members. Online merging accepts only tags of the same source type, with the target tag's hidden state as the result; different types stay independent. Hidden tags can be restored under "Hidden" in management mode.

`GET /api/tag-management` returns tag ID, name, category, aliases, resource count, hidden state and duplicate groups. `POST /api/tag-management/preview` is a read-only preview; `POST /api/tag-management` writes only when it receives the preview's `token`. The plan expires when data changes, and a new preview is required. The interface keeps the login verification and the ledger write role gate.

Without `limit`, `GET /api/tag-management` returns the complete `items` and `duplicate_groups`; with `limit` it enables paging and supports the following parameters:

| Parameter | Meaning |
| --- | --- |
| `scope` | `local` or `online`, default `local` |
| `limit` / `offset` | Page size and starting position; the page size is limited to 1 to 600, with 20 used when the format is invalid; the start is at least 0, with 0 used when the format is invalid |
| `q` | Search names and aliases, normalizing character width, whitespace and case |
| `category` | Category key; empty or `all` means all categories |
| `state` | `active`, `hidden` or `blocked`, default `active`; blocked state takes precedence over hidden state |
| `view` | `cloud` sorts by resource count descending, `alphabet` by normalized name; default `cloud`, with ties sorted stably by name and tag identity |

The paged response contains the current page `items`, the filtered `total`, `has_more`, the actual `limit` and `offset`. `categories` is the category count under the current search and state, and does not shrink with the selected category; `duplicate_groups` keeps the full local duplicate groups, and is an empty list online. Search, state, category and sorting all come before paging, and past the last page `items` is empty and `total` is kept. The full vocabulary reuses the query cache, stored separately for local and online; it is read again after a ledger version change or a write invalidates the cache.

The browse endpoints `GET /api/index?kind=tags` and `GET /api/follow/tags?types=all` return `total`, the full tag count after search and category filtering, and after search and source-type filtering, respectively.

Writes check foreign key changes and reject association violations newly introduced by this operation; existing historical reference records stay independent.

The read parameters and operation requests of the online vocabulary use `scope=online`; an online tag ID is a stable source-term key, and a local tag ID is an entity ID.

Online management supports the `block` / `unblock` operations, and the returned tags carry a `blocked` state. `POST /api/follow/tag` accepts `id`, `operation=add|remove|restore` and `tag`, and returns the current item and its work group; `remove` saves a single-item hide choice, and `restore` undoes the hiding of a source tag. The interface keeps the login, same-origin and ledger write role gates. A tag name is 1 to 80 characters with no commas or control characters; each content item has at most 100 manual tags. Ordinary content responses include `custom_tags` and `blocked_tags`, and source metadata keeps the original terms.

The maintenance script `scripts/repair_duplicate_tags.py` generates a review CSV by default; a real write requires both `--apply` and `--backup`. The script and the page reuse the same criteria and write logic. For backup and real-database operation conventions see [Operations and configuration](OPERATIONS.md).
