/* A readout that changes with polling: when a new value arrives it rolls from the old value to the new one, rather than jumping in one frame.
 *
 * On first mount it draws the final value directly, and only transitions when the value changes; the transition writes the text frame by frame with Motion's `animate`,
 * and when the system has reduced motion enabled it draws the final value directly. Digits are always tabular, so the whole row does not jitter while rolling. */
import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion';
import { useReducedMotion } from 'motion/react';

/** Transition duration, in seconds. Shorter than the fastest polling interval anywhere (1.5 seconds), so it has surely settled before the next new value arrives. */
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
