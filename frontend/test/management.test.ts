import { describe, expect, it } from 'vitest';
import { cleanupSkeletonHtml, REPAIR_CARD_TEXT, SCAN_CARD_TEXT } from '../src/management';

describe('数据管理首屏', () => {
  const skeleton = () => {
    const root = document.createElement('div');
    root.innerHTML = cleanupSkeletonHtml();
    return root;
  };
  it('读数卡复用最终排版，名字与图标立即呈现，只有读数画占位', () => {
    const stats = skeleton().querySelectorAll('[inert] > div:first-child > div');
    expect([...stats].map(card => card.querySelector('i use')?.getAttribute('href')))
      .toEqual(['#i-square-check-big', '#i-sparkles', '#i-file-stack', '#i-file-archive', '#i-trash']);
    expect([...stats].map(card => card.firstElementChild?.textContent))
      .toEqual(['人工复核', '高清版', '重复文件', '垃圾文件', '回收站']);
    for (const card of stats) {
      expect(card.querySelector('strong > .skeleton-text')).not.toBeNull();
      expect(card.lastElementChild?.querySelector('.skeleton-text')).not.toBeNull();
    }
  });
  it('任务卡按最终顺序排好：扫描与采集、媒体修复两张岛卡，再是整理', () => {
    const grid = skeleton().querySelector('[inert] > div:nth-child(2)')!;
    expect([...grid.children].map(card => card.id))
      .toEqual(['libraryProcessing', 'mediaRepair', 'organize']);
    for (const card of grid.querySelectorAll(':scope > #libraryProcessing, :scope > #mediaRepair')) {
      expect(card.firstElementChild?.classList.contains('peach-react')).toBe(true);
    }
    const scan = grid.querySelector('#libraryProcessing')!;
    expect(scan.querySelector('p')?.textContent).toBe(SCAN_CARD_TEXT);
    expect(scan.querySelector('.skeleton')).toBeNull();
    expect(scan.querySelector('footer > a')?.getAttribute('href')).toBe('/sources');
    expect(grid.querySelector('#mediaRepair p')?.textContent).toBe(REPAIR_CARD_TEXT);
  });
  it('等数据才能执行的键保持最终变体与尺寸，用原生 disabled 挡住并标成骨架操作键', () => {
    const root = skeleton();
    const split = root.querySelector('#libraryProcessing [data-split-button]')!;
    expect(split.getAttribute('data-variant')).toBe('primary');
    expect([...split.querySelectorAll('button')].map(button => button.classList.contains('bg-button-primary')))
      .toEqual([true, true]);
    expect(split.querySelector('button:first-child svg')).toBeNull();
    expect(split.querySelector('button:last-child use')?.getAttribute('href')).toBe('#i-chevron-down');
    const repair = root.querySelector('#mediaRepair footer > button')!;
    expect(repair.textContent).toBe('开始修复');
    expect(repair.classList.contains('bg-button-primary')).toBe(true);
    expect(repair.hasAttribute('data-skeleton-action')).toBe(true);
    const actions = root.querySelectorAll('button:not([aria-haspopup="listbox"])');
    for (const button of actions) {
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.hasAttribute('data-skeleton-action')).toBe(true);
    }
  });
  it('链接管理标题与读数立即呈现，条件面板等待真实状态', () => {
    const root = skeleton();
    expect(root.querySelector('#link-manager h3')?.textContent).toBe('链接管理');
    expect([...root.querySelectorAll('.link-stat-grid > div > span')].map(term => term.textContent))
      .toEqual(['链接总数', '官网/事务所', '社交账号', '作品资料站']);
    expect(root.querySelector('#resource-sync')).toBeNull();
  });
});
