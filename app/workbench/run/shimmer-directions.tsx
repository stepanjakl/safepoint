'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { SegmentedRing } from '@/components/app-shell/thread/thread-step';
import { Button } from '@/components/ui/button';
import { SPEEDS, useSlowMotion } from './slow-motion';

type Direction = 'current' | 'count' | 'arcs' | 'letters' | 'quieten';

const DIRECTIONS: { id: Direction; name: string; note: string }[] = [
  {
    id: 'current',
    name: 'In use · A, the beat’s colour',
    note: 'Leaves with the swell of the beat in the mark’s blue and glides across in about 1.3s, fading to neutral. What the thread uses.',
  },
  {
    id: 'count',
    name: 'B · Into the count',
    note: 'The pass ends on the count and lifts it, and a tick of the count bumps it.',
  },
  {
    id: 'arcs',
    name: 'C · Follows the arcs',
    note: 'The band moves in step with the arcs lighting round the ring, so the light runs on from the ring into the name.',
  },
  {
    id: 'letters',
    name: 'D · Letters lift',
    note: 'A wave passes through the letters: each dims and rises a pixel, then settles.',
  },
  {
    id: 'quieten',
    name: 'E · Quiets down',
    note: 'Full strength for three beats, then every other beat and softer, so a long step stops calling for attention.',
  },
];

const NAME = 'Reading sources';
const TOTAL = 9;
// Two beats of the ring, so the ticks keep time with the rows' beats.
const TICK_MS = 4400;

/*
  The shimmer directions for the running step's name, side by side and in
  time with one another, each on a running step drawn with the thread's own
  classes. Restart remounts them all: they resync, and E shows its first
  beats again.
*/
export function ShimmerDirections() {
  const [rate, setRate] = useState(1);
  const [run, setRun] = useState(0);
  const [count, setCount] = useState(3);
  const figure = useRef<HTMLDivElement>(null);
  useSlowMotion(figure, rate);

  useEffect(() => {
    const timer = setInterval(
      () => setCount((at) => (at >= TOTAL ? 3 : at + 1)),
      TICK_MS / rate,
    );
    return () => clearInterval(timer);
  }, [rate, run]);

  return (
    <section aria-labelledby="shimmer-directions" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="shimmer-directions" className="text-title font-semibold">
          Shimmer directions
        </h2>
        <p className="text-meta text-muted max-w-3xl">
          The running step’s name, catching the beat of its mark. Every row
          keeps the same time, so they can be compared beat for beat.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onPress={() => {
            setRun((at) => at + 1);
            setCount(3);
          }}
        >
          Restart
        </Button>
        <div role="group" aria-label="Speed" className="flex gap-2">
          {SPEEDS.map((speed) => (
            <Button
              key={speed.rate}
              variant={speed.rate === rate ? 'primary' : 'secondary'}
              aria-pressed={speed.rate === rate}
              onPress={() => setRate(speed.rate)}
            >
              {speed.label}
            </Button>
          ))}
        </div>
      </div>
      <div
        key={run}
        ref={figure}
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3"
      >
        {DIRECTIONS.map((direction) => (
          <figure
            key={direction.id}
            className="shimmer-direction bg-surface-primary rounded-shell grid content-start gap-4 p-6"
            data-direction={direction.id}
          >
            <ShimmerRow direction={direction.id} count={count} />
            <figcaption className="grid gap-1">
              <span className="text-dense text-primary font-medium">
                {direction.name}
              </span>
              <span className="text-meta text-muted text-pretty">
                {direction.note}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function ShimmerRow({
  direction,
  count,
}: {
  direction: Direction;
  count: number;
}) {
  return (
    <ol
      className="thread workbench-mark-preview"
      data-look="proposed"
      aria-hidden="true"
    >
      <li className="thread-step" data-status="running" data-latest>
        <span className="thread-marker">
          <span className="thread-dot" data-status="running">
            <SegmentedRing count={3} />
          </span>
        </span>
        <div className="thread-step-row">
          <span className="thread-step-toggle">
            {direction === 'letters'
              ? [...NAME].map((letter, index) => (
                  <span
                    key={index}
                    className="shimmer-direction-letter"
                    style={{ '--letter': index } as CSSProperties}
                  >
                    {letter === ' ' ? ' ' : letter}
                  </span>
                ))
              : NAME}
          </span>
          <span className="thread-step-facts">
            <span className="thread-step-fact">
              {/* Keyed on the count, so each tick mounts it and B's bump
                  plays once; the pill around it keeps its beat. */}
              <span key={count} className="shimmer-direction-count">
                {count} of {TOTAL}
              </span>
            </span>
          </span>
        </div>
      </li>
    </ol>
  );
}
