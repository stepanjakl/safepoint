'use client';

import { motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import { EASE_OUT_QUAD } from '@/lib/motion';
import { BiomorphicSymbol } from './biomorphic-symbol';
import {
  BRAND_TURN_DURATION,
  BRAND_TURN_ROTATION,
  BRAND_TURN_TIMES,
} from './brand-turn';

/** A fixed brand family, independent of the interface typeface settings. */
export function Brand({ markCellClassName }: { markCellClassName?: string }) {
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const turning = useRef(false);

  function turnMark() {
    if (reduceMotion || turning.current) return;
    turning.current = true;
    void controls
      .start({
        rotate: [...BRAND_TURN_ROTATION],
        transition: {
          duration: BRAND_TURN_DURATION,
          times: [...BRAND_TURN_TIMES],
          ease: EASE_OUT_QUAD,
        },
      })
      .then(() => {
        controls.set({ rotate: 0 });
        turning.current = false;
      });
  }

  return (
    <span
      className="font-brand text-wordmark text-brand-wordmark inline-flex flex-none items-center gap-1.25 [font-feature-settings:normal] font-bold whitespace-nowrap uppercase"
      aria-label="Safepoint"
    >
      <span className={markCellClassName} aria-hidden="true">
        <motion.span
          className="block size-7 flex-none"
          animate={controls}
          onHoverStart={turnMark}
        >
          <BiomorphicSymbol
            variant="soft-radial"
            className="text-brand-mark block size-full"
          />
        </motion.span>
      </span>
      <span aria-hidden="true">Safepoint</span>
    </span>
  );
}
