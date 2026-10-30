'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import { SettledLayer } from '@/components/ui/screen-settled';
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
  const [settled, setSettled] = useState(!enteringProcess || !!reduceMotion);

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
        if (typeof definition !== 'object' || Array.isArray(definition)) return;
        if (definition.opacity === 1) setSettled(true);
        else if (finishesLeaving && leavingProcess && definition.opacity === 0)
          finishLeaving();
      }}
    >
      <SettledLayer settled={settled}>{children}</SettledLayer>
    </motion.div>
  );
}
