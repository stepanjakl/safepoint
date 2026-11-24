'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { DURATION_PANE, DURATION_STATE } from '@/lib/ui/motion';
import { cx } from '@/lib/ui/cx';
import { useScreenSettled } from './screen-settled';

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
  as = 'div',
  enterOnMount = false,
  onEntered,
}: {
  show: boolean;
  // On the box that opens: a negative margin that cancels a container's gap.
  className?: string;
  // The space above it while it is there: a spacing utility, such as pt-4.
  gap?: string;
  children: ReactNode;
  as?: 'div' | 'li';
  enterOnMount?: boolean;
  onEntered?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const settled = useScreenSettled();
  const entering = enterOnMount && !reduceMotion;
  const hold = entering && !settled;
  const Root = as === 'li' ? motion.li : motion.div;
  const still = reduceMotion ? { duration: 0 } : null;
  return (
    <AnimatePresence initial={entering}>
      {show ? (
        <Root
          key="reveal"
          className={cx(
            (as === 'div' || entering) && 'overflow-y-clip',
            className,
          )}
          inert={entering || undefined}
          initial={{ height: 0, opacity: 0 }}
          animate={
            hold
              ? { height: 0, opacity: 0 }
              : {
                  height: 'auto',
                  opacity: 1,
                  transition: still ?? {
                    height: { duration: DURATION_PANE, ease: FOLD_EASE },
                    opacity: { duration: DURATION_STATE, delay: DURATION_PANE },
                  },
                }
          }
          onAnimationComplete={(target) => {
            if (
              typeof target === 'object' &&
              'opacity' in target &&
              target.opacity === 1
            )
              onEntered?.();
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
          {as === 'li' && !gap ? (
            children
          ) : (
            <div className={gap}>{children}</div>
          )}
        </Root>
      ) : null}
    </AnimatePresence>
  );
}
