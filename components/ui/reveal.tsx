'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { DURATION_PANE, DURATION_STATE } from '@/lib/ui/motion';
import { cx } from '@/lib/ui/cx';

/*
  Content that comes and goes in place -- a status line, an alert, a box of
  controls -- arrives height first: the space opens, then the content fades
  into it; it leaves the other way round, so nothing below jumps and nothing
  is drawn over a gap still opening. What is there when its screen arrives
  shows at once (`initial={false}`). The gap above it is its own padding
  (`gap`), so a closed one takes no space: in a container with a gap of its
  own, cancel it with a negative margin (`className`, as -mt-4 with pt-4). SmoothHeight is for content that changes height while it stays; Arrival
  (working-mark.tsx) fades a panel in after a load.
*/
const FOLD_EASE = [0.4, 0, 0.2, 1] as const;

export function Reveal({
  show,
  gap,
  className,
  children,
}: {
  show: boolean;
  // On the box that opens: a negative margin that cancels a container's gap.
  className?: string;
  // The space above it while it is there: a spacing utility, such as pt-4.
  gap?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const still = reduceMotion ? { duration: 0 } : null;
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="reveal"
          className={cx('overflow-y-clip', className)}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: 'auto',
            opacity: 1,
            transition: still ?? {
              height: { duration: DURATION_PANE, ease: FOLD_EASE },
              opacity: { duration: DURATION_STATE, delay: DURATION_PANE },
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: still ?? {
              opacity: { duration: DURATION_STATE },
              height: {
                duration: DURATION_PANE,
                ease: FOLD_EASE,
                delay: DURATION_STATE,
              },
            },
          }}
        >
          <div className={gap}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
