import type { FollowSource } from './follow-feed';

/** 空来源集合不能转换成后端的全来源检查。 */
export const validCheckSources = (ids: readonly number[]): number[] =>
  [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0);

/** 资料页只检查当前署名或绑定实体对应的来源。 */
export function entityCheckSources(sources: readonly Pick<FollowSource, 'id' | 'author_key' | 'entity_id'>[], author: string): number[] {
  if (!author) return [];
  return validCheckSources(sources.filter(source => source.author_key === author
    || (author.startsWith('entity:') && String(source.entity_id) === author.slice(7))).map(source => source.id));
}
