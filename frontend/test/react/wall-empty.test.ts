import { describe, expect, it } from 'vitest';
import { wallEmptyHtml } from '../../src/react/video-wall/wall-empty';

function content(options: Parameters<typeof wallEmptyHtml>[0]) {
  const host = document.createElement('div');
  host.innerHTML = wallEmptyHtml(options);
  return host;
}

describe('播放墙空状态', () => {
  it('空媒体库提供添加视频入口', () => {
    const host = content({ libraryEmpty: true, matches: 0, hasMore: false,
      catalogEmpty: '<h2>还没有视频</h2><button>添加内容</button>' });
    expect(host.querySelector('h2')?.textContent).toBe('还没有视频');
    expect(host.querySelector('button')?.textContent).toBe('添加内容');
    expect(host.textContent).not.toContain('封面');
  });

  it('筛选无结果提供清除条件入口', () => {
    const host = content({ libraryEmpty: false, matches: 0, hasMore: false });
    expect(host.textContent).toContain('没有符合筛选条件的视频');
    expect(host.querySelector('a')?.textContent).toBe('清除筛选');
    expect(host.textContent).not.toContain('封面');
  });

  it('已有匹配视频时说明封面缺失', () => {
    const host = content({ libraryEmpty: false, matches: 13, hasMore: false });
    expect(host.textContent).toContain('这些视频还没有封面');
    expect(host.textContent).toContain('为作品补充封面');
    expect(host.textContent).not.toContain('没有符合筛选条件');
  });
});
