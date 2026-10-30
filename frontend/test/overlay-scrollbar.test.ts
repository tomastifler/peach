import { afterEach, expect, it, vi } from 'vitest';
import { attachOverlayScrollbar, pruneOverlayScrollbars } from '../src/ui-kit/overlay-scrollbar';
import { observeScrollRegions, wireOverlayScrollbars } from '../src/ui-kit/scroll';

afterEach(() => { document.body.replaceChildren(); pruneOverlayScrollbars(); vi.restoreAllMocks(); });

it('连续滚动按帧更新位置，内容尺寸变化后刷新滑块比例', async () => {
  const host=document.createElement('div'),container=document.createElement('div');
  host.append(container);document.body.append(host);
  const clock=document.createElement('span');clock.textContent='0:00';container.append(clock);
  let height=100,content=500;
  const measure=vi.fn(()=>height),measureContent=vi.fn(()=>content);
  Object.defineProperties(container,{
    clientHeight:{get:measure},scrollHeight:{get:measureContent},
    clientWidth:{get:()=>200},scrollWidth:{get:()=>200},
  });
  const frame:FrameRequestCallback[]=[];
  vi.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frame.push(callback);return frame.length});
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(function(this:HTMLElement){
    return this.classList.contains('ov-y')?84:0;
  });
  const sync=attachOverlayScrollbar(container)!;
  // 挂上时不量，第一次尺寸观察回调才量；这里直接走同一个函数。
  expect(host.querySelector<HTMLElement>('.ov-y')!.hidden).toBe(true);
  expect(measure).not.toHaveBeenCalled();expect(measureContent).not.toHaveBeenCalled();
  sync();
  const thumb=host.querySelector<HTMLElement>('.ov-y .ovthumb')!;
  expect(thumb.style.height).toBe('24px');
  measure.mockClear();measureContent.mockClear();
  clock.textContent='0:01';
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(measure).not.toHaveBeenCalled();expect(measureContent).not.toHaveBeenCalled();
  container.scrollTop=100;container.dispatchEvent(new Event('scroll'));
  container.scrollTop=200;container.dispatchEvent(new Event('scroll'));
  expect(frame).toHaveLength(1);
  frame.shift()!(16);
  expect(thumb.style.transform).toBe('translateY(30px)');
  expect(measure).not.toHaveBeenCalled();expect(measureContent).not.toHaveBeenCalled();
  expect(host.querySelector('.ui-ov-edges')!.classList.contains('ui-can-scroll-top')).toBe(true);
  content=300;sync();
  expect(thumb.style.height).toBe('28px');
  expect(thumb.style.transform).toBe('translateY(56px)');
  expect(host.querySelector('.ui-ov-edges')!.classList.contains('ui-can-scroll-bottom')).toBe(false);
  height=300;sync();
  expect(host.querySelector<HTMLElement>('.ov-y')!.hidden).toBe(true);
  expect(container.hasAttribute('data-scroll-edges')).toBe(false);
});

it('短轨道的滑块保持在可见范围内', () => {
  const host=document.createElement('div'),container=document.createElement('div');
  host.append(container);document.body.append(host);
  Object.defineProperties(container,{
    clientHeight:{get:()=>32},scrollHeight:{get:()=>500},
    clientWidth:{get:()=>32},scrollWidth:{get:()=>500},
  });
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(function(this:HTMLElement){
    return this.classList.contains('ov-y')?16:0;
  });
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(function(this:HTMLElement){
    return this.classList.contains('ov-x')?16:0;
  });
  container.scrollTop=468;container.scrollLeft=468;
  attachOverlayScrollbar(container)!();
  const vertical=host.querySelector<HTMLElement>('.ov-y .ovthumb')!;
  const horizontal=host.querySelector<HTMLElement>('.ov-x .ovthumb')!;
  expect(vertical.style.height).toBe('16px');
  expect(horizontal.style.width).toBe('16px');
  expect(vertical.style.transform).toBe('translateY(0px)');
  expect(horizontal.style.transform).toBe('translateX(0px)');
});

it('浮层轨道留在同一层级并补偿滚动位移，卸载后可以重新绑定', () => {
  const floating=document.createElement('div');
  floating.style.position='fixed';document.body.append(floating);
  Object.defineProperties(floating,{
    clientHeight:{get:()=>100},scrollHeight:{get:()=>500},
    clientWidth:{get:()=>200},scrollWidth:{get:()=>200},
  });
  const control=attachOverlayScrollbar(floating)!;
  control();
  const track=floating.querySelector<HTMLElement>(':scope > .ov-y')!;
  expect(track.hidden).toBe(false);
  floating.scrollTop=150;control();
  expect(track.style.transform).toBe('translate(0px,150px)');
  floating.replaceChildren(document.createElement('span'));
  pruneOverlayScrollbars();control();
  expect(floating.querySelector(':scope > .ov-y')).toBe(track);
  expect(floating.querySelectorAll(':scope > .ovtrack')).toHaveLength(2);
  control.destroy();
  expect(floating.hasAttribute('data-overlay-scrollbar')).toBe(false);
  expect(floating.querySelector('.ovtrack')).toBeNull();
  expect(attachOverlayScrollbar(floating)).not.toBeNull();
});

it('动态出现及样式启用的滚动区自动接管，销毁后不留下轨道', async () => {
  const host=document.createElement('div');document.body.append(host);
  const stop=observeScrollRegions(host);
  try{
    const region=document.createElement('div');region.style.overflowY='auto';host.append(region);
    await vi.waitFor(()=>expect(region.dataset.overlayScrollbar).toBe('true'));
    const delayed=document.createElement('div');host.append(delayed);
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(delayed.hasAttribute('data-overlay-scrollbar')).toBe(false);
    delayed.style.overflowX='auto';
    await vi.waitFor(()=>expect(delayed.dataset.overlayScrollbar).toBe('true'));
    region.remove();
    await vi.waitFor(()=>expect(region.hasAttribute('data-overlay-scrollbar')).toBe(false));
  }finally{stop()}
  expect(host.querySelector('.ovtrack')).toBeNull();
});

it('横向手势与纵向滑块各自保留对应方向的操作', () => {
  const host=document.createElement('div'),region=document.createElement('div');
  host.append(region);document.body.append(host);
  region.style.overflowX='auto';region.style.overflowY='auto';
  wireOverlayScrollbars(host);
  expect(host.querySelectorAll('.ovtrack')).toHaveLength(2);
  region.dataset.horizontalScroll='';
  wireOverlayScrollbars(host);
  expect(host.querySelectorAll('.ov-y')).toHaveLength(1);
  expect(host.querySelector('.ov-x')).toBeNull();
  region.style.overflowY='hidden';
  delete region.dataset.horizontalScroll;
  wireOverlayScrollbars(host);
  expect(host.querySelectorAll('.ovtrack')).toHaveLength(2);
});

it('影院模式改变 overflow 后自动接管已有容器', async () => {
  const host=document.createElement('div');
  host.innerHTML='<style>[data-theater] .cinema-scroll-region{overflow-y:auto}</style><div class="cinema-scroll-region"></div>';
  document.body.append(host);
  const region=host.querySelector<HTMLElement>('.cinema-scroll-region')!;
  const stop=observeScrollRegions(host);
  try{
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(region.hasAttribute('data-overlay-scrollbar')).toBe(false);
    host.setAttribute('data-theater','');
    await vi.waitFor(()=>expect(region.dataset.overlayScrollbar).toBe('true'));
    expect(host.querySelectorAll('.ovtrack')).toHaveLength(2);
  }finally{stop()}
});

for(const marker of ['data-skeleton','data-skeleton-tier'])it(`${marker} 移除旧轨道，内容恢复后重新接管`, async () => {
  const host=document.createElement('div'),region=document.createElement('div');
  region.style.overflowY='auto';host.append(region);document.body.append(host);
  const stop=observeScrollRegions(host);
  try{
    await vi.waitFor(()=>expect(region.dataset.overlayScrollbar).toBe('true'));
    host.setAttribute(marker,'');host.setAttribute('inert','');
    await vi.waitFor(()=>expect(host.querySelector('.ovtrack')).toBeNull());
    expect(region.hasAttribute('data-overlay-scrollbar')).toBe(false);
    host.removeAttribute(marker);host.removeAttribute('inert');
    await vi.waitFor(()=>expect(region.dataset.overlayScrollbar).toBe('true'));
    expect(host.querySelectorAll('.ovtrack')).toHaveLength(2);
  }finally{stop()}
});

it('影院模式只改变内容长度时刷新已绑定轨道', async () => {
  const host=document.createElement('div'),region=document.createElement('div');
  region.style.overflowY='auto';host.append(region);document.body.append(host);
  let content=100;
  Object.defineProperties(region,{
    clientHeight:{get:()=>100},scrollHeight:{get:()=>content},
    clientWidth:{get:()=>200},scrollWidth:{get:()=>200},
  });
  const stop=observeScrollRegions(host);
  try{
    await vi.waitFor(()=>expect(region.dataset.overlayScrollbar).toBe('true'));
    const track=host.querySelector<HTMLElement>('.ov-y')!;
    expect(track.hidden).toBe(true);
    content=500;host.setAttribute('data-theater','');
    await vi.waitFor(()=>expect(track.hidden).toBe(false));
    content=100;host.removeAttribute('data-theater');
    await vi.waitFor(()=>expect(track.hidden).toBe(true));
  }finally{stop()}
});
