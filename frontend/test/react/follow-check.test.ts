import { describe, expect, it } from 'vitest';
import { entityCheckSources, validCheckSources } from '../../src/react/follow-feed/follow-check';

describe('空态检查来源范围', () => {
  const sources = [
    { id: 1, author_key: 'one', entity_id: 12 },
    { id: 2, author_key: 'two', entity_id: 12 },
    { id: 3, author_key: 'other', entity_id: 99 },
  ];
  it('实体只包含绑定在名下的来源', () => {
    expect(entityCheckSources(sources, 'entity:12')).toEqual([1, 2]);
    expect(entityCheckSources(sources, 'one')).toEqual([1]);
  });
  it('未绑定署名和无效来源不退回全来源检查', () => {
    expect(entityCheckSources(sources, '')).toEqual([]);
    expect(entityCheckSources(sources, 'missing')).toEqual([]);
    expect(validCheckSources([0, -1, NaN, 1.5, Infinity])).toEqual([]);
    expect(validCheckSources([2, 2, 3])).toEqual([2, 3]);
  });
});
