/* Components can bind the overlay scrollbar ahead of time; the site-wide incremental entry takes over scroll areas not explicitly bound. */
import { useEffect, useRef } from 'react';

import { attachOverlayScrollbar } from '@peach/legacy/ui';

/** The ref of a scrollable element. The track of a normal content area is a sibling of the container, and the track of a positioned overlay is carried by itself. */
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
