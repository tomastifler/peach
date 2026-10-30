# Directory Browsing

首页和资料页作品区的「文件夹模式」开关打开目录树和面包屑。目录树按媒体库配置中的顶层目录分组，展示数据库中已登记的目录，保留原目录名与层级。资料页的目录筛选与当前人物、厂牌、创作者或标签范围相交；关闭开关保留当前页面的其他筛选。

The "Cards / List" toggle on the right switches the library display mode, shared by the works area on the home page and profile pages; the current browser remembers the choice. The list shows cover, name, ownership, duration, size, and view count, with rows separated by straight lines; on narrow screens duration and size move under the name.

列表默认每页 20 部，可选 10、20、50、100 部。顶部保留发行时间、评分、时长等排序按钮，与列表排序菜单和列标题共用当前排序；排序作用于整个筛选结果。全选只影响本页，已选作品跨页保留，底部批量操作使用全部已选作品。详情返回保留同一筛选范围内的页码和排序。

计数与操作控件共用一行，宽度不足时整行横向滚动查看，计数和按钮保留完整宽度。作品卡片按实际文字和标签定高。补全提示的说明后接「查看处理详情 →」，补全按钮单独放在下一行。

## Finding Content

Click a directory name to enter that scope, and click the arrow to expand subdirectories. Breadcrumbs go back to ancestor directories, and "All folders" returns to the media library root list. Search, tags, unwatched, watch later, marked, sort, card layout, and work details follow the library home page.

"Include subfolders" decides whether the works list includes lower-level directories. On desktop the tree sits to the left of the content; when space is tight, a directory button next to the breadcrumbs opens a popover. The directory location goes into the address bar, so refresh and browser back restore it.

子文件夹入口默认显示前 12 个，超过时提供「展开全部」和「收起文件夹」。进入另一目录时恢复收起状态。

目录树读取 Peach 数据库中的路径，离线挂载仍可浏览已登记内容。未扫描的文件和空目录需要先经过入库；路径只表示收纳位置。

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
