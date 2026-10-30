import { afterEach, expect, it, vi } from 'vitest';
import { stopAutoScroll, wireAutoScroll } from '../src/ui-kit/scroll';

let row:HTMLElement;
afterEach(()=>{stopAutoScroll(row);document.body.removeAttribute('data-detail-open');document.body.innerHTML='';vi.unstubAllGlobals()});

it('详情打开时背景自动滚动停止，关闭后从当前位置继续',async()=>{
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('innerHeight',800);
  row=document.createElement('div');document.body.append(row);
  Object.defineProperties(row,{scrollWidth:{value:2000},clientWidth:{value:200}});
  const measure=vi.spyOn(row,'getBoundingClientRect').mockReturnValue({width:200,top:10,bottom:100} as DOMRect);
  const tick=(now:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(now))};
  wireAutoScroll(row);tick(100);tick(2200);
  expect(row.scrollLeft).toBeGreaterThan(0);const held=row.scrollLeft;
  document.body.setAttribute('data-detail-open','');measure.mockClear();tick(2250);
  expect(frames.size).toBe(0);expect(measure).not.toHaveBeenCalled();expect(row.scrollLeft).toBe(held);
  document.body.removeAttribute('data-detail-open');
  await vi.waitFor(()=>expect(frames.size).toBe(1));
  tick(2300);tick(2350);expect(row.scrollLeft).toBeGreaterThan(held);
});

it('滚出视口或被播放墙盖住时停下，循环里不量几何；回到视口接着走',async()=>{
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  let sight:(entries:Partial<IntersectionObserverEntry>[])=>void=()=>{};
  vi.stubGlobal('IntersectionObserver',class{constructor(callback:typeof sight){sight=callback}observe(){}unobserve(){}disconnect(){}});
  row=document.createElement('div');document.body.append(row);
  Object.defineProperties(row,{scrollWidth:{value:2000},clientWidth:{value:200}});
  const measure=vi.spyOn(row,'getBoundingClientRect');
  const tick=(now:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(now))};
  wireAutoScroll(row);tick(100);tick(2200);
  expect(row.scrollLeft).toBeGreaterThan(0);
  sight([{target:row,isIntersecting:false}]);tick(2250);
  expect(frames.size).toBe(0);const held=row.scrollLeft;
  sight([{target:row,isIntersecting:true}]);expect(frames.size).toBe(1);
  tick(2300);tick(2350);expect(row.scrollLeft).toBeGreaterThan(held);
  document.body.setAttribute('data-wall-open','');tick(2400);
  expect(frames.size).toBe(0);
  document.body.removeAttribute('data-wall-open');
  await vi.waitFor(()=>expect(frames.size).toBe(1));
  expect(measure).not.toHaveBeenCalled();
});
