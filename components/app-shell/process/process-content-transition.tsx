'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_QUAD } from '@/lib/motion';

export function ProcessContentTransition({
  children,
  className,
  finishesLeaving = false,
}: {
  children: ReactNode;
  className: string;
  finishesLeaving?: boolean;
}) {
  const { enteringProcess, leavingProcess, finishLeaving } =
    useShellPageNavigation();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={enteringProcess && !reduceMotion ? { opacity: 0 } : false}
      animate={{ opacity: leavingProcess ? 0 : 1 }}
      transition={{
        duration: reduceMotion
          ? 0
          : leavingProcess
            ? DURATION_STATE
            : DURATION_PANE,
        ease: EASE_OUT_QUAD,
      }}
      onAnimationComplete={(definition) => {
        if (
          finishesLeaving &&
          leavingProcess &&
          typeof definition === 'object' &&
          !Array.isArray(definition) &&
          definition.opacity === 0
        )
          finishLeaving();
      }}
    >
      {children}
    </motion.div>
  );
}
