'use client';

import { useReducedMotion } from 'motion/react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

import { FromModel } from '@/components/engine/rules-parts';
import { anchorOf } from '@/components/engine/rules/card-anchor';
import { statusOf } from '@/components/engine/rules/definition-card';
import { Pill } from '@/components/ui/pill';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/ui/cx';
import type { Definition } from '@/lib/engine/types';

export type PillStyle = 'blue-dashed' | 'blue' | 'ringed' | 'words';

export type DraftStage = 'written' | 'writing' | 'queued' | 'unreached';

const WORDS = 'text-meta text-muted';

export function WritingPill({ style = 'blue-dashed' }: { style?: PillStyle }) {
  const word = <span className="draft-beat">Writing</span>;
  if (style === 'words') return <span className={WORDS}>{word}</span>;
  if (style === 'ringed')
    return (
      <Pill tone="neutral" variant="ringed">
        {word}
      </Pill>
    );
  return (
    <Pill tone="advisory" className="draft-beat-white">
      {word}
    </Pill>
  );
}

export function UpNextPill({ style = 'blue-dashed' }: { style?: PillStyle }) {
  if (style === 'words') return <span className={WORDS}>Up next</span>;
  if (style === 'ringed')
    return (
      <Pill tone="neutral" variant="ringed">
        Up next
      </Pill>
    );
  if (style === 'blue') return <Pill tone="advisory">Up next</Pill>;
  return (
    <Pill tone="neutral" variant="dashed">
      Up next
    </Pill>
  );
}

function WritingDots() {
  return (
    <span aria-hidden className="draft-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

// `dots` is the earlier options' pill: the three dots, ringed for what is next.
export function chipOfStage(
  stage: DraftStage,
  pills: PillStyle | 'dots' = 'blue-dashed',
) {
  if (stage === 'writing')
    return pills === 'dots' ? (
      <Pill tone="neutral">
        Writing
        <WritingDots />
      </Pill>
    ) : (
      <WritingPill style={pills} />
    );
  if (stage === 'queued')
    return pills === 'dots' ? (
      <Pill tone="neutral" variant="ringed">
        Up next
      </Pill>
    ) : (
      <UpNextPill style={pills} />
    );
  return undefined;
}

// A card's draft stage, from the definitions and any active draft job.
export function stageOfDefinition(
  definitions: Definition[],
  item: Definition,
  drafting: { running: boolean; writing?: string | null } | null,
): DraftStage {
  if (drafting?.running && drafting.writing === item.id) return 'writing';
  if (item.formula) return 'written';
  if (!drafting?.running) return 'unreached';
  const writingIndex = definitions.findIndex((d) => d.id === drafting.writing);
  const index = definitions.indexOf(item);
  if (writingIndex < 0) {
    const firstUnwritten = definitions.findIndex((d) => !d.formula);
    return index === firstUnwritten ? 'writing' : 'queued';
  }
  return index > writingIndex ? 'queued' : 'unreached';
}

// The short activity line on the active card while a draft or rewrite runs.
export function activityOfDraft(
  step: string,
  rewriting: boolean,
): string | null {
  if (!step) return null;
  const writeMatch = /,\s*(write \d+)…?\s*$/.exec(step);
  if (rewriting)
    return writeMatch
      ? `Being written again (${writeMatch[1]}). This is the version before it, until the new one is ready.`
      : 'Being written again. This is the version before it, until the new one is ready.';
  if (/^Finding the definitions/.test(step)) return null;
  if (/^Writing \d+ of \d+:/.test(step))
    return writeMatch
      ? `Trying a formula on real data · ${writeMatch[1]}`
      : 'Asking the model for a formula';
  return step;
}

const LINE = 'draft-line bg-surface-hover-strong rounded-control block h-2.5';

export function AwaitedFormula({
  live,
  leaving,
}: {
  live: boolean;
  leaving: boolean;
}) {
  return (
    <div
      aria-hidden
      data-shimmer={live ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
    >
      <FromModel label="The model's formula">
        <div className="bg-surface-floating rounded-control grid gap-1.5 px-3 py-2">
          <span className={cx(LINE, 'w-full')} />
          <span className={cx(LINE, 'w-2/3')} />
        </div>
      </FromModel>
    </div>
  );
}

export function AwaitedExamples({
  live,
  leaving,
}: {
  live: boolean;
  leaving: boolean;
}) {
  return (
    <div
      aria-hidden
      data-shimmer={live ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
      className="grid gap-3"
    >
      <span className="readout text-muted">Examples</span>
      <div className="grid gap-5 px-4">
        {/* About what three examples take, as most rules have. */}
        {[0, 1, 2].map((record) => (
          <div key={record} className="grid gap-2">
            <span className={cx(LINE, 'w-1/3')} />
            <span className={cx(LINE, 'w-full')} />
            <span className={cx(LINE, 'w-full')} />
            <span className={cx(LINE, 'w-2/3')} />
            <span className={cx(LINE, 'w-1/2')} />
          </div>
        ))}
      </div>
    </div>
  );
}

// What is said fades in over what it replaces, which keeps no room of its own.
export function Crossfade({
  id,
  className,
  children,
}: {
  // What changing means: the words themselves, or which pill it is.
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const [now, setNow] = useState({ id, node: children });
  const [was, setWas] = useState<typeof now | null>(null);
  if (id !== now.id) {
    setWas(now);
    setNow({ id, node: children });
  }
  return (
    <span
      className={cx('draft-crossfade', className)}
      onAnimationEnd={(event: AnimationEvent) => {
        if (event.animationName === 'draft-crossfade-out') setWas(null);
      }}
    >
      <span key={id} className="draft-crossfade-now">
        {children}
      </span>
      {was && !still ? (
        <span key={was.id} aria-hidden className="draft-crossfade-was">
          {was.node}
        </span>
      ) : null}
    </span>
  );
}

// Synchronises the shimmer beat across every active pill and placeholder line in a list.
export function useDraftBeatClock(list: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    list.current
      ?.querySelectorAll('.draft-beat, [data-shimmer] .draft-line')
      .forEach((element) =>
        element.getAnimations().forEach((animation) => {
          animation.startTime = 0;
        }),
      );
  });
}

/*
  What the cards draw: the state, once what it replaces has gone. A rule whose
  placeholders are about to be replaced keeps them while they fade out, so the
  new content arrives into their place rather than over them.
*/
export function useLeavingState<T>(
  list: RefObject<HTMLOListElement | null>,
  state: T,
  shouldLeave: (previous: T, next: T) => boolean,
  enabled: boolean,
) {
  const [shown, setShown] = useState(state);
  const leaving = enabled && shown !== state && shouldLeave(shown, state);
  if (shown !== state && !leaving) setShown(state);
  useLayoutEffect(() => {
    if (!leaving) return;
    let current = true;
    const fades = [
      ...(list.current?.querySelectorAll('[data-leaving]') ?? []),
    ].flatMap((part) =>
      part
        .getAnimations()
        .filter(
          (animation) =>
            (animation as CSSAnimation).animationName === 'draft-leave',
        ),
    );
    void Promise.allSettled(fades.map((fade) => fade.finished)).then(() => {
      // Sync, as any commit from an event is: PendingDots disconnects its
      // observer in an effect, and one held back past a frame sees it unmounted.
      if (current) flushSync(() => setShown(state));
    });
    return () => {
      current = false;
    };
  }, [list, leaving, state]);
  return { shown, leaving };
}

// One segment per rule, in the order they are written. Each says on hover or
// focus what its card's pill says, and leads to that card.
export function DraftSegments({
  prefix,
  stages,
  error = false,
}: {
  // Optional prefix for the anchor id when multiple rulebooks sit on one page.
  prefix?: string;
  stages: { item: Definition; stage: DraftStage }[];
  error?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  // On one clock with the word and placeholders on the card below.
  useLayoutEffect(() => {
    row.current?.getAnimations({ subtree: true }).forEach((animation) => {
      if ((animation as CSSAnimation).animationName === 'draft-segment-beat')
        animation.startTime = 0;
    });
  });
  return (
    <div ref={row} role="group" aria-label="Each rule" className="flex gap-1">
      {stages.map(({ item, stage }) => {
        const status =
          stage === 'writing'
            ? 'Writing'
            : stage === 'queued'
              ? 'Up next'
              : statusOf(item).label;
        const href = prefix
          ? `#${prefix}-${anchorOf(item.id)}`
          : `#${anchorOf(item.id)}`;
        return (
          <Tooltip key={item.id} label={item.name} description={status}>
            <a
              href={href}
              aria-label={`${item.name}: ${status}`}
              className="draft-segment"
            >
              <span
                data-writing={stage === 'writing' ? '' : undefined}
                className={cx(
                  'draft-segment-bar',
                  stage === 'written'
                    ? error
                      ? 'bg-muted'
                      : 'bg-state-advisory'
                    : stage !== 'writing' && 'bg-rule-faint',
                )}
              />
            </a>
          </Tooltip>
        );
      })}
    </div>
  );
}
