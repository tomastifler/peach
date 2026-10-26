# Peach design guidelines

This file is for designing and reviewing pages, controls, media viewers, and task feedback. For component choice, tokens, and mandatory gates see the [Web UI skill](../.claude/skills/peach-web-ui/SKILL.md), and for the scope of BoardUI adoption see [BoardUI adaptation](BOARD_UI.md). These guidelines guide later implementation; they do not mean every page has been checked item by item.

Open Claude UI provides supplementary reference for this file. The adopted scope and source gaps are in [Reading and trade-offs](reference-snapshots/open-claude-ui.md); its description of Claude's official implementation is third-party self-description, and Peach adopts only the principles that explain its own needs. Actual parameters obey the project's existing tokens, component contracts, and local acceptance.

## 1. Build hierarchy with content

- First separate regions with whitespace, headings, alignment, and existing surface colors. Closed borders are for the edges of independent objects, input controls, or overlays; the body text, toolbar, and secondary groups inside one container usually use whitespace or a one-way divider.
- "A single outer frame" is the default judgment for reducing repeated decoration. The borders needed by independent editable fields, accessible focus rings, and data tables are kept per the component contract.
- Keep the existing object boundaries of independent task, creator, and metric cards. Before adopting a reference principle, name the specific reading or operation problem and compare using the same data; reducing the number of cards is not in itself grounds for improvement.
- Normal, hover, selected, focus, and busy states keep control geometry stable. When a border takes part in layout, reserve the same width; focus uses the existing outline／ring and does not change size by thickening the border.
- Check body text, secondary text, dividers, and overlays separately in light and dark. Subtle surface contrast must keep controls and focus recognizable; color, weight, radius, and shadow all reuse Peach's semantic tokens.

Bad example: the title details' shell, summary, action bar, and every paragraph of explanation each wrapped in a closed card. Good example: the details keep the shell, the summary is laid out naturally, the action bar uses whitespace or one divider, and independent fields keep their own input borders.

## 2. Let typography fit the content

- Continuously changing readouts such as time, count, and progress use tabular numerals, with stable units and precision; labels, names, and body text keep using their corresponding text styles.
- Choose wrapping and truncation by content: titles and descriptions keep semantic reading, resource identifiers such as paths, file names, and URLs use the existing middle ellipsis; a full value that needs review has a clear way to view or copy it.
- Long strings wrap safely in the content area that actually holds them, and flex／grid children are allowed to shrink. Buttons, badges, and short labels must not turn into vertical single-character stacks when the container is squeezed.
- Verify icons and text against the actual baseline of the current font; number scaling, fixed negative offsets, and variable font axes are adjusted only when actual font and pixel evidence is obtained. Keep the project's existing Chinese font fallback and the mobile input font size criteria.

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

- An action area first shows the object, scope, and current status, with details expanded on demand. Pending, running, waiting on source, success, failure, cancelled, and partially complete keep their own semantics; authorization prompts appear only when a real permission boundary requires them.
- Spinner, Loading Dots, Skeleton, Progress, Toast, and persistent errors are chosen per the Web UI skill. A known total shows the real readout, and estimates are labeled clearly; animation timing and simulated responses must not produce a success conclusion.
- A failure keeps the input, the object, and the reason, and gives a currently feasible recovery action. Automatic retry is used only for operations that existing policy allows, the interface shows the server's actual waiting state; refreshing or opening a panel does not start extra retries.
- Collapsing details does not change the task's running state. Streaming output can keep the region structure stable, and the user can still collapse logs they do not need to keep reading; not all content is forced open just because a task is running.
- Incremental content updates only the affected region, async results bind to the current request and object and keep the reading position and selection; the whole content area is not rebuilt for each new fragment.

## 9. Motion serves the operation

- Use motion to explain position, selection relationships, and hierarchy changes; high-frequency controls give feedback as fast as possible. Reuse the existing Motion and CSS tokens, and verify parameters with real distances, reverse operations, and continuous input.
- Reduced motion covers both CSS and JavaScript animation; continuous pulses, Canvas, and per-character blur do not carry the only state information. Hiding and unmounting stop this region's animation, and the operation can still be completed when a transition API fails or is missing.
- Text and tables put clear reading first. Ambient light, success bounce, notification sounds, and the like are adopted only with a clear product purpose and a user setting; media volume and notification sounds are managed separately.

## Acceptance questions

| Where to check | Questions that must be answerable |
| --- | --- |
| Regions and controls | Does the border express independent semantics? Does a state change alter the size? Are focus and dark-mode text recognizable? |
| Container and text | Can a narrow panel within a wide page be used? Are long Chinese text, long paths, and enlarged text still readable? |
| Input and keyboard | Does confirming with the input method submit or close the window? Can Tab get in and out? Where does focus go after closing? |
| Scroll and gestures | Does new content seize the reading position? Can a cancelled drag recover? Can hidden controls still be focused? |
| Media | Does zoom preserve the detail position? Are a missing image and a failed transition recoverable? Does preloading trigger extra playback or unbounded origin fetches? |
| State and motion | Which result does the final state come from? What does a failure keep? Are quick reverse operations, reduced motion, and unmount complete? |

Pick behavior or layout acceptance from the table according to the actual change, using the project's unified test entry. When only these guidelines are edited, check the docs, the source lock, and the context gate; when a page adopts one of the principles, verify the corresponding real behavior and visuals.
