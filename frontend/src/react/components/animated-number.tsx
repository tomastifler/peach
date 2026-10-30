/* 会跟着轮询变的读数：新值到达时从旧值滚到新值，而不是一帧跳过去。
 *
 * 首次挂载直接画终值，只有值变了才过渡；过渡用 Motion 的 `animate` 逐帧写文字，
 * 系统开了减弱动态效果时直接画终值。数字一律等宽，滚动时整行不抖。 */
import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion';
import { useReducedMotion } from 'motion/react';

/** 过渡时长，秒。短于各处最快的轮询间隔（1.5 秒），下一次新值到达前一定已经停稳。 */
const DURATION = 0.6;

export function AnimatedNumber(
  { value, format = (at) => Math.round(at).toLocaleString(), className }:
  { value: number; format?: (value: number) => string; className?: string },
) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: DURATION, ease: 'easeOut',
      onUpdate: (at) => { from.current = at; setShown(at); },
    });
    return () => controls.stop();
  }, [value, reduced]);
  return <span className={className ? `tabular-nums ${className}` : 'tabular-nums'}>{format(shown)}</span>;
}
