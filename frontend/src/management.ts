import { icon } from '@peach/legacy/core';

import { islandButton, islandGlyph, islandSelect } from './island-skeleton';

/* 「扫描与采集」「媒体修复」两张卡的正文。卡片本体由 React 画，骨架与遗留层的取数占位
   画的是同一段话：写两份的话，骨架上的那句会比真卡短一截，接管时整张卡跳一次。 */
export const SCAN_CARD_TEXT = 'Syncs files and video metadata and generates local video previews per your settings. Use the dropdown to scan files only, sync imported videos, generate previews, or fill in missing metadata.';
export const REPAIR_CARD_TEXT = 'Repairs MP4s that are missing a timestamp table (stuttering playback) or an index (will not open). Videos you watch often are repaired first.';

const bar = '<span class="skeleton skeleton-text" aria-hidden="true"></span>';
/* 要等数据才能执行的键是真的按不了：原生 `disabled` 挡住点击与聚焦，`data-skeleton-action`
   让各档按键在骨架里统一成同一副禁用面（`board.css`），尺寸仍是最终那一档，数据一到只换颜色。 */
const waiting = 'type="button" disabled data-skeleton-action';

/* 两张 React 卡的骨架包在同一层 `.peach-react` 里，按键与下拉照 Board UI 的尺寸画（见
   `island-skeleton.ts`）。卡片这一层的结构照 React 那两张卡抄：外面一列 `gap-4`，标题与正文
   同一对字级。下拉框里只是一截占位条，不是控件，留 `aria-disabled` 就够。 */
const waitingAction = 'disabled data-skeleton-action';
const unavailable = 'aria-disabled="true"';
const island = (card: string) => `<div class="peach-react"><div class="flex flex-col gap-4">${card}</div></div>`;
const cardText = (title: string, text: string) => `<div data-geist-fieldset-content>
          <h3 class="text-title-2-medium text-text-primary">${title}</h3>
          <p class="text-body-2-regular text-text-secondary">${text}</p></div>`;

/** 「扫描与采集」卡：与 React `LibraryProcessingCard` 同一副容器、同一段正文、同一组键。
 *  「复核资料」只在有候选时出现，这里不预画。 */
export function scanCardSkeletonHtml(): string {
  return island(`<section aria-label="Scan and collect" data-geist-fieldset data-cleanup-task data-cleanup-processing data-fieldset-stack>
        ${cardText('Scan and collect', SCAN_CARD_TEXT)}
        <footer data-geist-fieldset-footer><a href="/sources" class="inline-flex items-center justify-center gap-1 whitespace-nowrap font-sans rounded-sm text-body-medium text-accent-600"><span>Sources &amp; credentials</span>${islandGlyph('arrow-up', 'size-[18px] shrink-0 rotate-90')}</a><span data-button-group data-split-button data-variant="primary">${islandButton({ glyph: 'database', label: 'Sync library', attrs: waitingAction })}${islandButton({ glyph: 'chevron-down', attrs: `${waitingAction} aria-label="More sync options"` })}</span></footer>
      </section>`);
}

/** 「媒体修复」卡：页脚的媒体库下拉框先按最终尺寸画出来，库名要等数据；「开始修复」要等选定
 *  媒体库，骨架里是禁用态。 */
export function repairCardSkeletonHtml(): string {
  return island(`<section aria-label="Media repair" data-geist-fieldset data-cleanup-task data-cleanup-processing>
        ${cardText('Media repair', REPAIR_CARD_TEXT)}
        <footer data-geist-fieldset-footer>${islandSelect(bar, { className: 'w-48', attrs: unavailable })}${islandButton({ label: 'Start repair', attrs: waitingAction })}</footer>
      </section>`);
}

/** 首屏复用读数卡、三张任务卡、链接管理与资源同步的最终容器；静态标题、正文和键立即呈现。 */
export function cleanupSkeletonHtml(): string {
  const stats = [['Manual review', 'square-check-big'], ['HD versions', 'sparkles'], ['Duplicate files', 'file-stack'], ['Junk files', 'file-archive'], ['Trash', 'trash']];
  const presets = `<span class="geist-button ui-organize-preset-skeleton">${bar}</span>`.repeat(3);
  const organizeField = (label: string) => `<div class="ui-organizefield"><span>${label}</span>
            <span class="geist-input ui-organize-input-skeleton">${bar}</span></div>`;
  return `<div class="ui-cleanuppage" data-skeleton="cleanup" aria-busy="true" aria-label="Loading data management status">
    <div class="ui-cleanupstats">${stats.map(([title, glyph]) => `
      <button type="button" class="board-plain-stat" disabled>
        <span class="ui-board-plain-stat-head"><span class="ui-board-stat-tile">${icon(glyph!)}</span>${title}</span>
        <strong>${bar}</strong><span class="cleanupmeta">${bar}</span></button>`).join('')}</div>
    <div class="cleanupgrid">
      <div class="cleanupscraping">${scanCardSkeletonHtml()}</div>
      <div class="cleanupmediarepair">${repairCardSkeletonHtml()}</div>
      <section class="cleanupfieldset cleanuporganize" data-geist-fieldset data-cleanup-task aria-labelledby="cleanup-loading-organize">
        <div class="geist-fieldset-content"><h3 class="geist-fieldset-title" id="cleanup-loading-organize">Organize</h3>
          <p>Renames files by template and moves them into folders. Preview first, then confirm to run; a completed batch can be rolled back as a whole.</p>
          <div class="ui-organizefields">
            <div class="organizesource"><span class="ui-gselect"><span class="gselectfield organize-source-skeleton">${bar}${icon('chevron-down')}</span></span></div>
            ${organizeField('File name template')}
            ${organizeField('Folder template')}
            <div class="ui-organizepresets">${presets}</div>
            <p class="cleanupmeta">${bar}</p>
          </div></div>
        <footer class="geist-fieldset-footer" data-geist-fieldset-footer><button class="geist-button primary" ${waiting}>Preview</button></footer>
      </section></div>
    <section class="ui-resourcesync" aria-labelledby="cleanup-loading-links">
      <h2 id="cleanup-loading-links">Link management</h2>
      <div class="resourcesyncbox" data-geist-fieldset data-cleanup-task data-fieldset-stack>
        <div class="resourcesyncbody geist-fieldset-content"><h3 class="geist-fieldset-title">External links</h3>
          <div class="linksummary"><div class="ui-linkstats"><div><span>Total links</span><b>${bar}</b><small>${bar}</small></div>${['Official sites / agencies', 'Social accounts', 'Work databases'].map(title => `<div><span>${title}</span><b>${bar}</b></div>`).join('')}</div>
          <div class="ui-linkhosts"><span>Main sites</span><b>${bar}</b></div></div></div>
        <div class="resourcesyncfooter geist-fieldset-footer" data-geist-fieldset-footer><button class="resourceaction primary" ${waiting}>${icon('unlink')}<span>Check dead links</span></button></div>
      </div></section>
    <section class="ui-resourcesync" aria-labelledby="cleanup-loading-sync">
      <h2 id="cleanup-loading-sync">Resource sync</h2>
      <div class="resourcesyncbox" data-geist-fieldset data-cleanup-task>
        <div class="resourcesyncbody geist-fieldset-content"><h3 class="geist-fieldset-title">Reconcile files and records</h3>
          <p>Checks each library record against files on local disks and cloud drives, and lists records whose files no longer exist, empty folders, and caches no longer referenced.</p></div>
        <div class="resourcesyncfooter geist-fieldset-footer" data-geist-fieldset-footer><button class="resourceaction primary" ${waiting}>${icon('git-compare')}<span>Check files</span></button></div>
      </div></section></div>`;
}
