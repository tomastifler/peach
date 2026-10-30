# Peach design guidelines

This file is for designing and reviewing pages, controls, media viewers and task feedback. For component choice and tokens see the [component contracts](UI_COMPONENT_CONTRACTS.md), for execution and acceptance the [Web UI skill](../.claude/skills/peach-web-ui/SKILL.md), and for BoardUI's adoption scope [BoardUI adaptation](BOARD_UI.md). These guidelines guide later implementation, and do not mean every page has been accepted item by item.

Open Claude UI provides supplementary reference for this file. The adopted scope and source gaps are in [Reading and trade-offs](reference-snapshots/open-claude-ui.md); its description of Claude's official implementation is third-party self-description, and Peach adopts only the principles that explain its own needs. Actual parameters obey the project's existing tokens, component contracts, and local acceptance.

## 1. Build hierarchy with content

- First separate regions with whitespace, headings, alignment, and existing surface colors. Closed borders are for the edges of independent objects, input controls, or overlays; the body text, toolbar, and secondary groups inside one container usually use whitespace or a one-way divider.
- "A single outer frame" is the default judgment for reducing repeated decoration. The borders needed by independent editable fields, accessible focus rings, and data tables are kept per the component contract.
- Keep the existing object boundaries of independent task, creator, and metric cards. Before adopting a reference principle, name the specific reading or operation problem and compare using the same data; reducing the number of cards is not in itself grounds for improvement.
- Normal, hover, selected, focus, and busy states keep control geometry stable. When a border takes part in layout, reserve the same width; focus uses the existing outline／ring and does not change size by thickening the border.
- Check body text, secondary text, dividers, and overlays separately in light and dark. Subtle surface contrast must keep controls and focus recognizable; color, weight, radius, and shadow all reuse Peach's semantic tokens.

Bad example: the title details' shell, summary, action bar, and every paragraph of explanation each wrapped in a closed card. Good example: the details keep the shell, the summary is laid out naturally, the action bar uses whitespace or one divider, and independent fields keep their own input borders.

## 2. Let typography fit the content

- Continuously changing readouts such as time, counts and progress use tabular (monospaced) numerals, with stable units and precision; labels, names and body text keep using their corresponding text styles.
- Choose wrapping and truncation by content: titles and descriptions keep semantic reading, while resource identifiers such as paths, file names and URLs use the existing middle ellipsis; a full value that needs review has a clear view or copy entry.
- Long strings wrap safely in the content area that actually holds them, and flex/grid children are allowed to shrink. Buttons, badges and short labels must not turn into single-character vertical stacks under container squeeze.
- Icons on the same line as text (leading icons in text buttons, bylines, labels, navigation, site marks) use `--icon-inline` (`1.2em`), scaling with the surrounding font size. The basis is measurement: in 14px body text a Chinese character's ink is about 13px, a sprite's strokes take about 75% of the 24 frame, and a `1.2em` frame makes the two equal in height. `cap` measures only Latin capitals (about 10px at 14px), and Chinese UIs do not use it to size icons.
- Standalone icons (icon-only buttons, play and fast-forward on covers, status dots, avatars, color balls) do not follow the text, and take a fixed value by the size tier of the control they sit in. When the sidebar navigation collapses to an icon column it still uses `--icon-inline`, and the icon size does not change between expanded and collapsed.
- Links to outside the site (source pages, official sites, profile sites, documentation, another Peach's write endpoint) always open in a new tab with `rel="noopener noreferrer"`, using `<a>` or a link button, not a button plus `window.open`, so middle-click opening and address copying work. A text external link is followed by the external-link glyph (`RiExternalLinkLine` on the React side, `icon('external-link', 'ui-externalmark')` for HTML strings, both sized `--icon-inline`); the ready-made form on the settings page is `ExternalLink`; links with only a site mark or brand icon do not add it. When Peach changes port or returns to its own entry after first-run setup, the jump still happens in the current page, and external player protocol links do not open a new page either. The external-link glyph means only "leaving Peach", and in-site navigation does not use it.
- Check icons and text against the actual baseline of the current font; numeral scaling, fixed negative offsets and variable font axes are adjusted only when the actual font and pixel evidence are obtained. Keep the project's existing Chinese font fallback and the mobile input font-size criteria.

## 3. Adapt to the component's available width

- Page layout is decided by the viewport; reusable components that can be embedded in a sidebar, details, or overlay are decided by their own container width. Take breakpoints at the boundary where content fits, and do not copy the screen widths of external products.
- When a toolbar tightens, in order: reduce auxiliary information, shorten labels that remain understandable, and move secondary actions into the existing menu; the primary action, the current selection, and the recovery entry stay reachable.
- Hide text only when the icon's meaning is clear and it has an accessible name. For mutually exclusive options keep the visible name of the current one; a row that cannot be compressed clearly uses local horizontal scroll or wrapping.
- Verify the same component in a narrow container within a wide page, plus desktop, phone, long Chinese text, long resource names, and enlarged text. When the necessary content of each column does not fit in a split layout, switch to a single column or the existing overlay.

## 4. Input and focus first

- During input method composition, Enter, arrow keys, and Escape serve the candidate words first; search, submit, and suggestion menus must not take over by mistake. Use composition events and native `isComposing`; when compatibility truly requires it add a `keyCode === 229` check, and verify with Chinese and Japanese input.
- Escape is handled by the current interaction layer: first exit the input candidates, suggestion menu, or drag, then handle the outer dialog. Intercepting the outer close must not interfere with the input method finishing its own operation.
- A group of mutually exclusive options uses the corresponding Tabs／radio contract; after arrow-key navigation the option is visible within its own scroll area, and Tab can leave the group. Menus skip unavailable items, and empty lists and dynamically removed items have a clear focus destination.
- Modal layers reuse the native dialog or React Aria focus management; on entry give a meaningful focus, and on close return it to the trigger if it still exists. When the trigger is gone, return to a reasonable entry in the current region.
- Secondary actions that appear on hover are also reachable on keyboard focus and on touch; hidden or collapsed content leaves no Tab stops behind.

## 5. Keep the user's reading position

- Appended content, background refresh, and local state changes do not seize the scroll position. Keep following only when the user is already following the latest content; active wheel, touch, or keyboard browsing releases following immediately.
- Task logs that need to auto-follow offer a "Jump to latest" entry. The cooldown and bottom tolerance are for filtering programmatic scrolls, and must not forcibly pull a reading person back to the bottom when the timer ends.
- An edge fade only hints that there is still content in that direction; when there is no overflow or the scroll has reached the edge, remove the corresponding fade. Keep visible room for the first and last text, focus rings, and actions, and recompute when content or container size changes.
- A multi-stop opacity curve is an optional visual approach for fades, and its strength and distance must be verified on Peach's themes and media backgrounds; scroll state and unmount cleanup continue to be handled by the existing Scroller／overlay scrollbar.

## 6. Gestures are interruptible and recoverable

- Distinguish click from drag with an explicit displacement threshold. After a drag starts, show the dragged object and the real drop position; when the drag completes, the object's click action is not triggered again.
- Pointer capture, `pointercancel`, lost capture, Escape, and unmount all have cleanup paths. Cancelling returns to the starting state; reordering also provides a keyboard or touch alternative entry.
- Geometry during a drag follows the pointer directly, and only the snap after release uses the existing motion. An interrupted motion continues from the currently visible state, avoiding restarting the whole displacement.
- The minimum size, collapse, and expand entries of a resizable split are decided by the real content. Dragging across an iframe must verify event continuity; a transparent overlay that does not receive events cannot serve as evidence of event shielding.
- Optimistic display is used only for preferences or order that can be restored exactly; when persistence fails, restore a consistent state and keep the reason. The result of ledger writes and irreversible actions is decided by the server.

## 7. Media viewing keeps space and cost continuous

- Zoom anchors at the mouse pointer position or the gesture center, so the detail being viewed stays nearby. The zoom limit and the definitions of original size and fit-to-window continue to use the existing lightbox contract.
- Coordinate computation uses a consistent image and viewport space, distinguishing the original fitted size from the transformed display size; dragging is computed as start position plus displacement, avoiding accumulating the same displacement.
- A shared-element transition from thumbnail to large image is used only when the source, target, and media identity are clear, and computes the actual image display extent, cropping, and radius. When the source is unmounted, the API is unavailable, or reduced motion is on, open and close directly and restore focus.
- Lightbox, carousel, and playback reuse Swiper, MediaCarousel, the stage, and the shared player. The preload range is decided by source cost and the local cache; hidden media does not play because of preloading, and closing and switching stop media per the existing lifecycle.

## 8. Feedback comes from real state

- An action area first shows the object, scope and current state, and expands details on demand. Pending, running, waiting for source, success, failure, cancelled and partially complete keep their own semantics; authorization prompts appear only where a real permission boundary needs them.
- Spinner, Loading Dots, Skeleton, Progress, Toast and persistent errors are chosen by the component contracts. A known total shows a real readout, and an estimate is clearly labeled; animation timing and simulated responses cannot produce a success conclusion.
- A failure keeps the input, the object and the reason, and offers a recovery action that is currently feasible. Automatic retry is used only for operations an existing policy allows, and the UI shows the actual waiting state from the server; refreshing or opening a panel does not start extra retries.
- Collapsing details does not change a task's running state. Streaming output can keep the region structure stable, and the user can still collapse logs they need not keep reading; not everything is forced open just because the task is running.
- Incremental content updates only the affected region, async results bind to the current request and object, keeping the reading position and selection; the whole content area is not rebuilt for every new fragment.

## 9. Motion serves the operation

- Use motion to explain position, selection relationships, and hierarchy changes; high-frequency controls give feedback as fast as possible. Reuse the existing Motion and CSS tokens, and verify parameters with real distances, reverse operations, and continuous input.
- Reduced motion covers both CSS and JavaScript animation; continuous pulses, Canvas, and per-character blur do not carry the only state information. Hiding and unmounting stop this region's animation, and the operation can still be completed when a transition API fails or is missing.
- Text and tables put clear reading first. Ambient light, success bounce, notification sounds, and the like are adopted only with a clear product purpose and a user setting; media volume and notification sounds are managed separately.

## 10. Controls State What They Select

- Controls whose value tells what is being selected carry no name: icon buttons, name boxes, and dropdowns where every item explains itself ("20 per page", "Last 30 days"). The sort dropdown's "Duration" and "Rating" are unclear on their own, and get a prefix per the next rule.
- A single form field: put the name above the control (`FolderField`, `SettingsRow`, `FieldLabel`).
- A dropdown side by side in a row in a toolbar or repeated block whose value alone is unclear: write the name into the trigger as a light prefix before the value (the `prefix` of `Select` in `frontend/src/react/components/select.tsx`; a custom trigger likewise uses a `text-text-tertiary` prefix). This way repeated blocks need no extra label row each.
- A title at the top of a popover is given only to grid-style pickers (icons, color balls): the cells contain no text, so a title is needed to say what is being selected. A list dropdown already has its name written outside, and the popover does not write it again.

Bad example: the dropdown in a library title row shows only "Auto-complete", and only after opening do you see "Choose how to process"; "Move to library" has a label above it, and the popover also says "Move to which library". Good example: `Processing Auto-complete ▾`, `Source color ● Jade`, with "Move to library" keeping only the label above.

## 11. Control Height Has Four Tiers

Not one height across the whole site, but controls of the same kind that sit next to each other share a tier. The four tiers are defined in `:root`, and BoardUI sizes correspond to them:

| token | Height | BoardUI | Where it is used |
| --- | --- | --- | --- |
| `--control-h-inline` | 28px | The inner core of Chip, segmented control and tabs | Labels in body text and cards, tag deletion, small tools next to titles, rating click areas; not a toolbar row on its own |
| `--control-h-compact` | 32px | `size="small"`, Select `sm` | Table row actions, pagination, card hover actions, secondary actions inside cards, filter bars |
| `--control-h` | 36px | Default size, Select `md` | Form fields and button groups beside them, Save configuration, page and section actions, table toolbars, the outer frame of segmented controls and tabs, sidebar and settings navigation |
| `--control-h-large` | 40px | Top bar `.ib` | Top bar search and icon buttons, the player control bar, home studio capsules |

When mixed in the same row:

- In a row with an input or dropdown, buttons and icon buttons share their tier; form rows default to 36px. An icon button shares the tier of the text buttons on the same row.
- Segmented controls, button groups and tab groups align by outer frame: the frame takes this row's tier, and the inner core takes the next tier down (36 with 28).
- The same action uses one tier on the same page; secondary actions inside cards and row actions take the compact tier.
- Labels, badges, ratings and avatars do not take part in this row alignment; the inline tier is not placed in the same toolbar as the compact tier or above. When unsure, go up one tier.

Bad example: in a library card, a row of 36px dropdowns is followed by a 32px "Add folder"; the credentials card's "Save configuration" on the settings page is 32px while everywhere else is 36px. During acceptance, collect the heights of the visible controls row by row in the browser, and two or more tiers of controls of the same kind in one row is a problem.

## Acceptance Questions

| Where to check | Questions that must be answerable |
| --- | --- |
| Area and controls | Do the boundaries express independent semantics? Does a state switch change the size? Are focus and dark-mode text distinguishable? Without opening them, can you tell what each dropdown selects? Do controls of the same kind in one row share one height tier? |
| Containers and text | Is a narrow panel in a wide page usable? Are long Chinese text, long paths and enlarged text still readable? |
| Input and keyboard | Does IME confirmation submit or close the window? Can Tab move in and out? Where does focus go after closing? |
| Scrolling and gestures | Does new content steal the reading position? Can a canceled drag be restored? Can hidden controls still be focused? |
| Media | Does zooming keep the position of detail? Are missing images and failed transitions recoverable? Does preloading trigger extra playback or unbounded origin fetches? |
| State and motion | Which result does the final state come from? What does a failure keep? Are quick reverse actions, reduced motion and unmounting complete? |

Pick behavior or layout acceptance from the table according to the actual change, using the project's unified test entry. When only these guidelines are edited, check the docs, the source lock, and the context gate; when a page adopts one of the principles, verify the corresponding real behavior and visuals.
