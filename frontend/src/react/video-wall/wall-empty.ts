import { emptyStateHtml } from '@peach/legacy/ui';
import { unfilteredWallAddress } from './wall-route';
import { catalogEmptyHtml } from '../../catalog-onboarding';

/** 媒体库、筛选结果与封面各自表达当前的空状态。 */
export function wallEmptyHtml({ libraryEmpty, matches, hasMore, catalogEmpty }: {
  libraryEmpty: boolean; matches: number; hasMore: boolean; catalogEmpty?: string;
}): string {
  if (libraryEmpty) return catalogEmpty || catalogEmptyHtml();
  if (!matches) return emptyStateHtml('search', '没有符合筛选条件的视频', '清除筛选条件后查看全部视频。', {
    actions: `<a class="geist-button primary" href="${unfilteredWallAddress()}">清除筛选</a>`,
  });
  return emptyStateHtml('image', '这些视频还没有封面', hasMore
    ? '载入更多作品后继续浏览。' : '为作品补充封面后，可在播放墙中查看。', {
    actions: '<a class="geist-button primary" href="/data-cleanup">补全封面</a>'
      + (hasMore ? '<button type="button" class="geist-button" data-wall-load-more>加载更多</button>' : ''),
  });
}
