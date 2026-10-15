'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BiomorphicSymbol } from '@/components/ui/biomorphic-symbol';
import {
  StateIllustration,
  type StateIllustrationName,
} from '@/components/ui/state-illustration';
import { cx } from '@/lib/cx';
import { DURATION_PANE } from '@/lib/motion';

/*
  The mark's three petals let go and light again one after another, clockwise
  from the top, so the light travels round without ever resetting. It starts
  whole, as the resting icon is, and empties from there. Each frame lists
  which petals are lit, in the order the mark draws them. The tab's icon
  (useWorkingFavicon) steps through these; the page's mark fades between them.
*/
export const WORKING_FRAMES = [
  [true, true, true],
  [false, true, true],
  [false, false, true],
  [false, false, false],
  [true, false, false],
  [true, true, false],
];
export const WORKING_FRAME_MS = 280;
// An unlit petal is still there, faintly, so the mark keeps its shape.
export const WORKING_RESTING = 0.3;

// Each petal's opacity through one turn, closed on the first frame to loop.
const PETAL_OPACITY = [0, 1, 2].map((petal) =>
  [...WORKING_FRAMES, WORKING_FRAMES[0]!].map((lit) =>
    lit[petal] ? 1 : WORKING_RESTING,
  ),
);

/* The workspace intro's mark, at its size, lighting its petals in turn. */
export function WorkingMark({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <BiomorphicSymbol
      variant="soft-radial"
      className={cx('text-brand-mark size-16', className)}
      renderPiece={(piece, index) =>
        reduceMotion ? (
          piece
        ) : (
          <motion.g
            animate={{ opacity: PETAL_OPACITY[index] }}
            transition={{
              duration: (WORKING_FRAMES.length * WORKING_FRAME_MS) / 1000,
              ease: 'linear',
              repeat: Infinity,
            }}
          >
            {piece}
          </motion.g>
        )
      }
    />
  );
}

/*
  When a loader shows. Most replies land before LOADER_DELAY_MS, and a loader
  that appears and goes at once reads as a flicker, so until then the room
  stays empty. Once shown it stays LOADER_MIN_MS, for the same reason, holding
  back what arrived. Past LOADER_SLOW_MS it says it is taking long, where a
  reader starts to wonder whether it stopped.
*/
export const LOADER_DELAY_MS = 300;
export const LOADER_MIN_MS = 500;
export const LOADER_SLOW_MS = 10_000;

export type LoaderPhase = 'waiting' | 'shown' | 'slow';

/*
  What a panel should draw for a load: nothing yet ('waiting'), its loader
  ('shown', then 'slow'), or its content (null). Null only once `loading` is
  false and a shown loader has had its minimum. `fadeIn` once the panel has
  waited, so its content arrives rather than cuts in; content it already
  had, as on a revisit, is simply there.
*/
export function useLoader(loading: boolean): {
  phase: LoaderPhase | null;
  fadeIn: boolean;
} {
  const [phase, setPhase] = useState<'shown' | 'slow' | null>(null);
  const shownAt = useRef<number | null>(null);
  const [waited, setWaited] = useState(loading);
  if (loading && !waited) setWaited(true);

  useEffect(() => {
    if (!loading) return;
    const show = setTimeout(() => {
      shownAt.current ??= performance.now();
      setPhase((current) => current ?? 'shown');
    }, LOADER_DELAY_MS);
    const slow = setTimeout(() => setPhase('slow'), LOADER_SLOW_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
    };
  }, [loading]);

  useEffect(() => {
    if (loading || phase === null) return;
    const shownFor = performance.now() - (shownAt.current ?? 0);
    const release = setTimeout(
      () => {
        shownAt.current = null;
        setPhase(null);
      },
      Math.max(0, LOADER_MIN_MS - shownFor),
    );
    return () => clearTimeout(release);
  }, [loading, phase]);

  return { phase: phase ?? (loading ? 'waiting' : null), fadeIn: waited };
}

/* A panel's content, faded in when it arrives after a wait (useLoader). */
export function Arrival({
  fadeIn,
  className,
  children,
}: {
  fadeIn: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={fadeIn && !reduceMotion ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION_PANE }}
    >
      {children}
    </motion.div>
  );
}

/*
  A panel with nothing to show yet, centred in the room its panel leaves: the
  working mark while it loads (behind useLoader), the outline otherwise. Its words read as the
  run view's empty state does.
*/
export function EmptyState({
  role,
  loading = false,
  fadeIn = loading,
  title,
  illustration = 'isometric',
  children,
}: {
  role: 'status' | 'alert';
  loading?: boolean;
  // A loader always fades in; a state that ends a wait does too (useLoader).
  fadeIn?: boolean;
  title: string;
  /** What stands above the title once the wait is over. */
  illustration?: StateIllustrationName;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      role={role}
      className="my-auto grid justify-items-center gap-7 py-16 text-center"
      initial={fadeIn && !reduceMotion ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION_PANE }}
    >
      {loading ? (
        <WorkingMark />
      ) : (
        <StateIllustration name={illustration} className="text-muted" />
      )}
      <div className="grid max-w-88 gap-3">
        <p className="text-title text-primary font-medium text-balance">
          {title}
        </p>
        {children ? (
          <p className="text-dense text-muted-strong text-balance">
            {children}
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
