'use client';

import { useReducedMotion } from 'motion/react';
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

import { PendingDots } from '@/components/brunch-orders/pending-dots';
import { FromModel } from '@/components/brunch-orders/rules-parts';
import {
  CardAnchor,
  DefinitionCard,
  anchorOf,
  statusOf,
} from '@/components/brunch-orders/rules-step';
import { StatusChip } from '@/components/brunch-orders/trial-parts';
import { Pill, SEVERITY } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import type { DefinitionSet } from '@/lib/definitions/types';

import { useEasedCards } from './eased-cards';
import { stagesOf, type Scene, type Stage } from './script';

/*
  The real cards at one scene of the draft, with whatever an option adds: its
  pills, its placeholders, its line. The buttons are real and do nothing.
*/

export type PillStyle = 'blue-dashed' | 'blue' | 'ringed' | 'words';

export const PILL_STYLES: readonly {
  id: PillStyle;
  name: string;
  note: string;
}[] = [
  {
    id: 'blue-dashed',
    name: 'Blue, then dashed',
    note: 'Only the active rule takes colour, in the blue the model’s words are marked with. Up next is a dashed outline: there, but not yet.',
  },
  {
    id: 'blue',
    name: 'Blue, both',
    note: 'One style, as you suggested. Far from the grey Check pill, but every queued rule is coloured too, so the active one stands out by its beat alone.',
  },
  {
    id: 'ringed',
    name: 'Ringed, both',
    note: 'Grey outlines. Quiet, and apart from the Check pill by its fill only.',
  },
  {
    id: 'words',
    name: 'Words only',
    note: 'No pill at all, so nothing can be mistaken for a kind. The lightest, and the easiest to overlook.',
  },
];

const BLUE =
  'pill-shape text-meta bg-tried-face text-state-advisory px-2 py-0.5 font-medium';
const WORDS = 'text-meta text-muted';

export function WritingPill({ style }: { style: PillStyle }) {
  const word = <span className="draft-beat">Writing</span>;
  if (style === 'words') return <span className={WORDS}>{word}</span>;
  if (style === 'ringed')
    return (
      <Pill tone="neutral" variant="ringed">
        {word}
      </Pill>
    );
  return <span className={cx(BLUE, 'draft-beat-white')}>{word}</span>;
}

export function UpNextPill({ style }: { style: PillStyle }) {
  if (style === 'words') return <span className={WORDS}>Up next</span>;
  if (style === 'ringed')
    return (
      <Pill tone="neutral" variant="ringed">
        Up next
      </Pill>
    );
  if (style === 'blue') return <span className={BLUE}>Up next</span>;
  return (
    <span className="draft-pill-dashed pill-shape text-meta text-muted px-2 py-0.5 font-medium">
      Up next
    </span>
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
function chipOf(stage: Stage, pills: PillStyle | 'dots') {
  if (stage === 'writing')
    return pills === 'dots' ? (
      <StatusChip tone="neutral">
        Writing
        <WritingDots />
      </StatusChip>
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

const LINE = 'draft-line bg-surface-hover-strong rounded-control block h-2.5';

function AwaitedFormula({
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

function AwaitedExamples({
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

const NOTHING = () => undefined;

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

/*
  What the cards draw: the scene, once what it replaces has gone. A rule whose
  placeholders are about to be replaced keeps them while they fade out, so the
  new content arrives into their place rather than over them.
*/
function useLeavingScene(
  list: RefObject<HTMLOListElement | null>,
  scene: Scene,
  enabled: boolean,
) {
  const [shown, setShown] = useState(scene);
  const stillWriting =
    scene.running && scene.found && scene.written === shown.written;
  const leaving =
    enabled && shown !== scene && shown.found && shown.running && !stillWriting;
  if (shown !== scene && !leaving) setShown(scene);
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
      if (current) flushSync(() => setShown(scene));
    });
    return () => {
      current = false;
    };
  }, [list, leaving, scene]);
  return { shown, leaving };
}

export function DraftCards({
  id,
  set,
  names,
  scene: latest,
  pills,
  placeholder,
  line = false,
  oneByOne = false,
  eased = false,
  hold = false,
}: {
  // Draws of one rulebook on one page each need ids and links of their own.
  id: string;
  set: DefinitionSet;
  names: Record<string, string>;
  scene: Scene;
  pills?: PillStyle | 'dots';
  // Which rules not written yet keep a place for their formula and examples.
  placeholder?: 'all' | 'writing';
  line?: boolean;
  oneByOne?: boolean;
  // A card moves to its new height rather than jumping.
  eased?: boolean;
  // And the page keeps still what is being read.
  hold?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const { shown: scene, leaving } = useLeavingScene(
    list,
    latest,
    eased && placeholder !== undefined,
  );
  useEasedCards(list, scene, { enabled: eased, hold });
  // A card's word and placeholders on one clock, after every render: a pill
  // restyled or a line shown again would otherwise restart out of step.
  useLayoutEffect(() => {
    list.current
      ?.querySelectorAll('.draft-beat, [data-shimmer] .draft-line')
      .forEach((element) =>
        element.getAnimations().forEach((animation) => {
          animation.startTime = 0;
        }),
      );
  });
  const anchor = useCallback((rule: string) => `${id}-${anchorOf(rule)}`, [id]);
  const stages = stagesOf(set, scene);
  const shown = oneByOne
    ? stages.filter(({ stage }) => stage === 'written' || stage === 'unreached')
    : stages;
  if (!shown.length) return null;
  const items = stages.map(({ item }) => item);
  const pending = shown
    .filter(({ stage }) => stage === 'written' || stage === 'unreached')
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      status: statusOf(item).label,
      severity: SEVERITY[statusOf(item).tone],
    }));
  return (
    <CardAnchor value={anchor}>
      <div className="rules-list grid gap-4">
        <PendingDots pending={pending} anchorOf={anchor} />
        <ol
          ref={list}
          className={cx('grid gap-3', (oneByOne || eased) && 'draft-arriving')}
          data-draft-holds-scroll={hold ? '' : undefined}
          aria-label="Calculations and checks"
        >
          {shown.map(({ item, stage }) => {
            const awaited =
              stage === 'writing' ||
              (stage === 'queued' && placeholder === 'all');
            const chip = pills ? chipOf(stage, pills) : undefined;
            const status = statusOf(item);
            return (
              <DefinitionCard
                key={item.id}
                item={item}
                quoted={false}
                names={names}
                working={[]}
                reads={items.filter((d) => item.uses.includes(d.id))}
                busy={scene.running}
                canWrite
                onWrite={NOTHING}
                onDecide={NOTHING}
                chip={
                  eased ? (
                    <Crossfade
                      id={`${stage}-${String(pills)}`}
                      className="draft-chip"
                    >
                      {chip ?? (
                        <StatusChip tone={status.tone}>
                          {status.label}
                        </StatusChip>
                      )}
                    </Crossfade>
                  ) : (
                    chip
                  )
                }
                activity={
                  line && stage === 'writing' ? (
                    <p
                      className="text-meta text-muted-strong"
                      data-leaving={leaving ? '' : undefined}
                    >
                      <Crossfade id={scene.activity ?? ''}>
                        {scene.activity}
                      </Crossfade>
                    </p>
                  ) : undefined
                }
                awaitedFormula={
                  placeholder && awaited ? (
                    <AwaitedFormula
                      live={stage === 'writing'}
                      leaving={leaving}
                    />
                  ) : undefined
                }
                awaitedExamples={
                  placeholder && awaited ? (
                    <AwaitedExamples
                      live={stage === 'writing'}
                      leaving={leaving}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </ol>
      </div>
    </CardAnchor>
  );
}
