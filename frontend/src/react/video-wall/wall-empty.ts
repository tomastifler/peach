import { emptyStateHtml } from '@peach/legacy/ui';
import { unfilteredWallAddress } from './wall-route';
import { catalogEmptyHtml } from '../../catalog-onboarding';

/** The library, filter results and covers each express the current empty state. */
export function wallEmptyHtml({ libraryEmpty, matches, hasMore, catalogEmpty }: {
  libraryEmpty: boolean; matches: number; hasMore: boolean; catalogEmpty?: string;
}): string {
  if (libraryEmpty) return catalogEmpty || catalogEmptyHtml();
  if (!matches) return emptyStateHtml('search', 'No videos match the filters', 'Clear the filters to see all videos.', {
    actions: `<a class="geist-button primary" href="${unfilteredWallAddress()}">Clear filters</a>`,
  });
  return emptyStateHtml('image', 'These videos have no covers yet', hasMore
    ? 'Load more works to keep browsing.' : 'After you add covers to works, they can be viewed on the playback wall.', {
    actions: '<a class="geist-button primary" href="/data-cleanup">Complete covers</a>'
      + (hasMore ? '<button type="button" class="geist-button" data-wall-load-more>Load more</button>' : ''),
  });
}
