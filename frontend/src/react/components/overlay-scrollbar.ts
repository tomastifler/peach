/* 组件可提前绑定覆盖式滚动条；全站增量入口会接管未显式绑定的滚动区。 */
import { useEffect, useRef } from 'react';

import { attachOverlayScrollbar } from '@peach/legacy/ui';

/** 会滚的元素的 ref。普通内容区的轨道与容器同级，定位浮层的轨道由自身承载。 */
export function useOverlayScrollbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const owned = useRef<{ node: T; control: ReturnType<typeof attachOverlayScrollbar> } | null>(null);
  /* 每次渲染都试一次，不给依赖数组：`attachOverlayScrollbar` 自带「已挂过」标记，
     而这一块常常是内容到位的那一次渲染才出现在 DOM 里。 */
  useEffect(() => {
    if(owned.current?.node===ref.current)return;
    owned.current?.control?.destroy();
    owned.current=ref.current?{node:ref.current,control:attachOverlayScrollbar(ref.current)}:null;
  });
  useEffect(()=>()=>{owned.current?.control?.destroy();owned.current=null},[]);
  return ref;
}
