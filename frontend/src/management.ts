import { islandButton, islandGlyph, islandSelect } from './island-skeleton';
import { FIELDSET_FACE, FIELDSET_BODY, FIELDSET_FOOT, fieldsetClass, type FieldsetLayout } from './react/components/fieldset-layout';

/* 「扫描与采集」「媒体修复」两张卡的正文。卡片本体由 React 画，骨架与遗留层的取数占位
   画的是同一段话：写两份的话，骨架上的那句会比真卡短一截，接管时整张卡跳一次。 */
export const SCAN_CARD_TEXT = '发现新文件，补全新增及未完成影片的资料和预览。需要检查全部影片时，使用全库维护。';
export const REPAIR_CARD_TEXT = '部分视频文件可能播放卡顿、打不开，修复缺时间戳表和缺索引的问题。';

const bar = '<span class="skeleton skeleton-text" aria-hidden="true"></span>';
/* 要等数据才能执行的键是真的按不了：原生 `disabled` 挡住点击与聚焦，`data-skeleton-action`
   让各档按键在骨架里统一成同一副禁用面（`board.css`），尺寸仍是最终那一档，数据一到只换颜色。 */

/* 两张 React 卡的骨架包在同一层 `.peach-react` 里，按键与下拉照 Board UI 的尺寸画（见
   `island-skeleton.ts`）。卡片这一层的结构照 React 那两张卡抄：外面一列 `gap-4`，标题与正文
   同一对字级。下拉框里只是一截占位条，不是控件，留 `aria-disabled` 就够。 */
const waitingAction = 'disabled data-skeleton-action';
const unavailable = 'aria-disabled="true"';
const island = (card: string) => `<div class="peach-react"><div class="flex flex-col gap-4">${card}</div></div>`;
const cardText = (title: string, text: string, layout: FieldsetLayout) => `<div class="${FIELDSET_BODY[layout]}"><div class="flex flex-col gap-2">
          <h3 class="text-title-2-medium text-text-primary">${title}</h3>
          <p class="text-body-2-regular text-text-secondary">${text}</p></div></div>`;

/** 「扫描与采集」卡：与 React `LibraryProcessingCard` 同一副容器、同一段正文、同一组键。
 *  「复核资料」只在有候选时出现，这里不预画。 */
export function scanCardSkeletonHtml(): string {
  return island(`<section aria-label="扫描与采集" class="${fieldsetClass('stack')}" data-cleanup-task data-cleanup-processing>
        ${cardText('扫描与采集', SCAN_CARD_TEXT, 'stack')}
        <footer class="${FIELDSET_FOOT.stack}"><a href="/sources" class="inline-flex items-center justify-center gap-1 whitespace-nowrap font-sans rounded-sm text-body-medium text-accent-600"><span>来源和凭证</span>${islandGlyph('arrow-up', 'size-(--icon-inline) shrink-0 rotate-90')}</a><span data-button-group data-split-button data-variant="primary">${islandButton({ label: '同步新增文件', attrs: waitingAction })}${islandButton({ glyph: 'chevron-down', attrs: `${waitingAction} aria-label="更多同步方式"` })}</span></footer>
      </section>`);
}

/** 「媒体修复」卡：页脚的媒体库下拉框先按最终尺寸画出来，库名要等数据；「开始修复」要等选定
 *  媒体库，骨架里是禁用态。 */
export function repairCardSkeletonHtml(): string {
  return island(`<section aria-label="媒体修复" class="${fieldsetClass('split')}" data-cleanup-task data-cleanup-processing>
        ${cardText('媒体修复', REPAIR_CARD_TEXT, 'split')}
        <footer class="${FIELDSET_FOOT.split}">${islandSelect(bar, { className: 'w-48', attrs: unavailable })}${islandButton({ label: '开始修复', attrs: waitingAction })}</footer>
      </section>`);
}

/** 首屏复用读数卡、三张任务卡、链接管理与资源同步的最终容器；静态标题、正文和键立即呈现。 */
export function cleanupSkeletonHtml(): string {
  const stats = [['人工复核', 'square-check-big'], ['高清版', 'sparkles'], ['重复文件', 'file-stack'], ['垃圾文件', 'file-archive'], ['回收站', 'trash']];
  const face = FIELDSET_FACE;
  const body = FIELDSET_BODY.stack;
  const title = (label: string, gap = 'mb-2') => `<h3 class="text-title-2-medium text-text-primary ${gap}">${label}</h3>`;
  const footer = (label: string) => `<footer class="${FIELDSET_FOOT.stack}">${islandButton({ label, attrs: waitingAction })}</footer>`;
  const input = (label: string) => `<div class="flex flex-col gap-1.5"><span class="text-body-medium text-text-primary">${label}</span><span class="skeleton ui-configuration-skeleton-input"></span></div>`;
  return `<div class="peach-react" data-skeleton="cleanup" aria-busy="true" role="status" aria-label="正在读取数据管理状态"><div aria-hidden="true" inert class="mx-auto flex w-full max-w-board flex-col gap-8">
    <div class="inline-grid w-full grid-cols-5 gap-4 max-plain-stat-pair:grid-cols-2 max-plain-stat-single:grid-cols-1">${stats.map(([label, glyph]) => `<div class="min-w-0 bg-background-secondary-default rounded-2xl flex min-h-33 flex-col gap-2 p-4 text-left"><span class="flex min-w-0 items-center gap-2 text-body-medium text-text-secondary"><i class="flex size-8 shrink-0 items-center justify-center rounded-md bg-background-primary-default text-text-primary">${islandGlyph(glyph!, 'size-4')}</i>${label}</span><strong class="text-title-1-medium">${bar}</strong><span class="text-caption-1-regular">${bar}</span></div>`).join('')}</div>
    <div class="flex flex-col gap-4 max-cleanup-tight:gap-3">
      <div id="libraryProcessing">${scanCardSkeletonHtml()}</div><div id="mediaRepair">${repairCardSkeletonHtml()}</div>
      <section id="organize" class="${face} flex flex-col" data-cleanup-organize><div class="${body}">${title('整理', 'mb-3')}<p class="text-body-regular text-text-secondary">清理文件名中的特殊符号与乱码，也可按模板改名并归入目录。先预览，确认后执行；执行过的一批可以整批退回。</p>
        <div class="mt-3 flex flex-col gap-3"><div class="flex min-w-0 flex-wrap items-start gap-2">${islandSelect(bar)}<span class="skeleton ui-configuration-skeleton-input min-w-0 basis-64 flex-1"></span></div><p class="text-caption-1-regular text-text-secondary">指定路径时包含子目录，目录模板以该路径为起点。模板均留空时只清理文件名。</p>${input('文件名模板')}${input('目录模板')}<div class="flex flex-wrap gap-2">${Array.from({ length: 3 }, () => islandButton({ variant: 'secondary', label: bar, attrs: waitingAction })).join('')}</div></div></div>${footer('预览')}</section>
    </div>
    <section id="link-manager" class="flex scroll-mt-20 flex-col gap-4"><div class="${face} flex flex-col"><div class="${body}">${title('链接管理')}<div class="link-stat-grid mt-4 gap-x-8 gap-y-3">${['链接总数', '官网/事务所', '社交账号', '作品资料站'].map(label => `<div class="flex min-w-0 flex-col gap-0.5"><span class="text-caption-1-regular text-text-secondary">${label}</span><b class="text-title-2-semibold">${bar}</b></div>`).join('')}</div><div class="mt-4 flex flex-col gap-0.5"><span class="text-caption-1-regular text-text-secondary">主要站点</span>${bar}</div></div>${footer('检查死链')}</div></section>
    </div></div>`;
}
