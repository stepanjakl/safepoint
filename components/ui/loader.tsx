'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';

import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import { useScreenSettled } from '@/components/ui/screen-settled';
import {
  WORKING_TURN_MS,
  WorkingMark,
  type LoaderPhase,
} from '@/components/ui/working-mark';
import { cx } from '@/lib/cx';
import { DURATION_PANE } from '@/lib/motion';

/*
  A wait: the working mark and its words, the words crossed by one pass of
  the mark's colour each turn of its petals (the glint, loader.css). Three sizes --
  page:   a whole pane with nothing in it yet (the rulebook, the process sheet);
  panel:  a drawer or aside waiting for its content;
  inline: a line in a flow that is otherwise there (a status, a count).
  Driven by useLoader: 'waiting' draws nothing, so a quick reply never shows
  it, and 'slow' says it is taking long.
*/
export type LoaderSize = 'page' | 'panel' | 'inline';

const SIZES: Record<LoaderSize, { box: string; mark: string; words: string }> =
  {
    page: {
      box: 'my-auto grid justify-items-center gap-7 py-16 text-center',
      mark: 'size-16',
      words: 'text-title text-primary font-medium text-balance',
    },
    panel: {
      box: 'my-auto grid justify-items-center gap-4 py-10 text-center',
      mark: 'size-10',
      words: 'text-dense text-muted-strong font-medium text-balance',
    },
    inline: {
      box: 'inline-flex items-center gap-2',
      mark: 'size-4.5 shrink-0',
      words: 'text-muted',
    },
  };

// The words' pass takes one turn of the mark's petals.
const TURN = { '--loader-turn': `${WORKING_TURN_MS}ms` } as CSSProperties;

// "Loading the read…" becomes "Still loading the read…".
const still = (label: string) =>
  `Still ${label.charAt(0).toLowerCase()}${label.slice(1)}`;

export function Loader({
  phase,
  label,
  slowLabel = still(label),
  size = 'inline',
  announce = true,
  className,
}: {
  phase: LoaderPhase;
  label: string;
  slowLabel?: string;
  size?: LoaderSize;
  // False where a status region around it already says the words.
  announce?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const settled = useScreenSettled();
  const box = useRef<HTMLElement>(null);
  const shown = phase !== 'waiting';
  // The pass on the document's clock, as the petals are (WorkingMark), so it
  // crosses the words at the same point of every turn.
  useLayoutEffect(() => {
    box.current?.getAnimations({ subtree: true }).forEach((pass) => {
      if (pass instanceof CSSAnimation) pass.startTime = 0;
    });
  }, [shown]);
  if (!shown) return null;
  const look = SIZES[size];
  const words = phase === 'slow' ? slowLabel : label;
  const Box = size === 'inline' ? motion.span : motion.div;
  return (
    <Box
      ref={box as never}
      role={announce ? 'status' : undefined}
      className={cx(look.box, className)}
      style={TURN}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: settled ? 1 : 0 }}
      transition={{ duration: DURATION_PANE }}
    >
      <WorkingMark className={look.mark} />
      <span className={cx('loader-words', look.words)}>
        <MorphingText text={words} duration={MORPH_WORDS_MS} />
        <span aria-hidden="true" className="loader-glint">
          <MorphingText text={words} duration={MORPH_WORDS_MS} />
        </span>
      </span>
    </Box>
  );
}
