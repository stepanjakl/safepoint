'use client';

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ThreadLookContext,
  ThreadStep,
  type ThreadLook,
} from '@/components/app-shell/thread/thread-step';
import { anchorOf, statusOf } from '@/components/brunch-orders/rules-step';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import type { DefinitionSet } from '@/lib/definitions/types';
import type { ProcessStep } from '@/lib/process/model';
import { COMING, ORDER_STEPS } from '@/lib/processes/brunch-orders/process';

import { DraftCards } from '../draft-progress/draft-cards';
import {
  stagesOf,
  summaryOf,
  useScript,
  type Scene,
} from '../draft-progress/script';
import { ScriptControls } from '../draft-progress/script-controls';
import { SPEEDS, useSlowMotion } from './slow-motion';

type Variant = 'pills' | 'name' | 'bar' | 'segments' | 'sticky';

const VARIANTS: readonly { id: Variant; name: string; note: string }[] = [
  {
    id: 'pills',
    name: '1 · All in the head',
    note: 'A fact pill for the count and another for the rule, beside the running ring and timer. The smallest change, using what a step already has, but no bar: the count is the only sense of how far.',
  },
  {
    id: 'name',
    name: '2 · The name says the rule',
    note: 'The step’s own name becomes “Writing Rule 2”, on the beat, with the count beside it. Reads as one sentence, but the step stops being called Rules while it works, and no bar.',
  },
  {
    id: 'bar',
    name: '3 · A bar under the head',
    note: 'Bar and sentence at the top of the body, as a promotion run’s evaluation already draws its bar. Familiar, and it leaves the head alone, but it scrolls away with the head.',
  },
  {
    id: 'segments',
    name: '4 · A segment per rule',
    note: 'One segment for each rule, the active one fading to blue on the beat, each saying its status on hover or focus and leading to its card. Shows the rules as separate things, and a stopped draft shows exactly where it stopped. Crowds past a dozen or so rules.',
  },
  {
    id: 'sticky',
    name: '5 · A strip that stays',
    note: 'The bar, count and rule in a strip that sticks at the top while the long cards scroll past, so it answers from anywhere in the list. Turn on whole cards to see it. The most built, and it covers a little of what scrolls under it.',
  },
];

// The real step, as it would be while a draft runs. Today it stays `attention`
// throughout: orders-run.tsx is not told a draft is running.
function stepOf(variant: Variant, set: DefinitionSet, scene: Scene) {
  const base = ORDER_STEPS.find((step) => step.id === 'rules')!;
  const count = set.definitions.length;
  const rule = set.definitions[scene.written]?.name;
  const accepted = `0 of ${count} accepted`;
  const written = `${scene.written} of ${count} written`;
  const step: ProcessStep = {
    ...base,
    status: scene.running ? 'running' : 'attention',
    label: scene.running
      ? scene.found
        ? written
        : 'Finding the rules'
      : scene.error
        ? written
        : accepted,
    flag: scene.error ? 'Stopped: out of quota' : undefined,
    progress:
      scene.running && scene.found
        ? { at: scene.written, of: count }
        : undefined,
  };
  if (variant === 'name' && scene.running)
    return {
      ...step,
      name: scene.found ? `Writing ${rule}` : 'Finding the rules',
      label: scene.found ? `${scene.written} of ${count}` : undefined,
    };
  // Their count is in the body, with the bar.
  if ((variant === 'bar' || variant === 'sticky') && scene.running)
    return { ...step, label: undefined };
  return step;
}

// The evaluation bar's own parts (run-steps.tsx), which grow as the count ticks.
function Bar({ scene, count }: { scene: Scene; count: number }) {
  return (
    <div aria-hidden className="flex h-1.5 gap-0.5">
      <span
        className={cx(
          'thread-progress-part rounded-full',
          scene.error ? 'bg-muted' : 'bg-state-advisory',
        )}
        style={{ flexGrow: scene.written }}
      />
      <span
        className="thread-progress-part bg-rule-faint rounded-full"
        style={{ flexGrow: count - scene.written }}
      />
    </div>
  );
}

// One segment per rule, in the order they are written. Each says on hover or
// focus what its card's pill says, and leads to that card.
function Segments({
  id,
  set,
  scene,
}: {
  // The anchors of the cards it leads to (DraftCards).
  id: string;
  set: DefinitionSet;
  scene: Scene;
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
      {stagesOf(set, scene).map(({ item, stage }) => {
        const status =
          stage === 'writing'
            ? 'Writing'
            : stage === 'queued'
              ? 'Up next'
              : statusOf(item).label;
        return (
          <Tooltip key={item.id} label={item.name} description={status}>
            <a
              href={`#${id}-${anchorOf(item.id)}`}
              aria-label={`${item.name}: ${status}`}
              className="draft-segment"
            >
              <span
                data-writing={stage === 'writing' ? '' : undefined}
                className={cx(
                  'draft-segment-bar',
                  stage === 'written'
                    ? scene.error
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

// What sits at the top of the step's body, where a variant puts anything there.
function Above({
  variant,
  set,
  scene,
}: {
  variant: Variant;
  set: DefinitionSet;
  scene: Scene;
}) {
  const count = set.definitions.length;
  const { headline, detail } = summaryOf(set, scene);
  // A finished draft has said all this: the head goes back to what is accepted.
  const shown = scene.found && (scene.running || scene.error);
  const reason = scene.error ? (
    <p className="text-meta text-muted">{scene.error}</p>
  ) : null;
  const unfound = !scene.found ? (
    <p className="text-meta text-muted">
      Finding the definitions in the instructions…
    </p>
  ) : null;
  if (!shown || variant === 'pills' || variant === 'name')
    return (
      <>
        {unfound}
        {reason}
      </>
    );
  if (variant === 'segments')
    return (
      <div className="grid gap-2">
        <Segments id={variant} set={set} scene={scene} />
        {reason}
      </div>
    );
  const content = (
    <>
      <Bar scene={scene} count={count} />
      <p className="text-meta">
        {headline}
        {scene.error ? '' : ` · ${detail}`}
      </p>
      {reason}
    </>
  );
  return variant === 'sticky' ? (
    <div className="draft-strip control-face surface-floating rounded-shell sticky z-1 grid gap-2 p-3">
      {content}
    </div>
  ) : (
    <div className="grid gap-2">{content}</div>
  );
}

function Option({
  variant,
  name,
  note,
  look,
  set,
  names,
  scene,
  wholeCards,
}: {
  variant: Variant;
  name: string;
  note: string;
  look: ThreadLook;
  set: DefinitionSet;
  names: Record<string, string>;
  scene: Scene;
  wholeCards: boolean;
}) {
  const headingId = useId();
  const step = stepOf(variant, set, scene);
  const reference: { label: string } | undefined =
    variant === 'pills' && scene.running && scene.found
      ? { label: set.definitions[scene.written]!.name }
      : undefined;
  const others = (id: string): ReactNode => (
    <p className="text-dense text-muted">{COMING[id]}</p>
  );
  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 content-start gap-2.5"
    >
      <h3 id={headingId} className="text-dense font-semibold">
        {name}
      </h3>
      <p className="text-meta text-muted text-pretty">{note}</p>
      <div
        data-heads-only={wholeCards ? undefined : ''}
        className="bg-surface-primary rounded-shell min-w-0 p-6 max-sm:p-4"
      >
        <ThreadLookContext value={look}>
          <ol className="thread" data-look={look}>
            <ThreadStep
              step={{
                ...ORDER_STEPS.find((candidate) => candidate.id === 'read')!,
                status: 'complete',
              }}
            >
              {others('read')}
            </ThreadStep>
            <ThreadStep step={step} latest reference={reference}>
              <div className="grid gap-4">
                <Above variant={variant} set={set} scene={scene} />
                <DraftCards
                  id={variant}
                  set={set}
                  names={names}
                  scene={scene}
                  pills="blue-dashed"
                  placeholder="writing"
                  line
                  eased
                  hold
                />
              </div>
            </ThreadStep>
            <ThreadStep
              step={{
                ...ORDER_STEPS.find(
                  (candidate) => candidate.id === 'calculate',
                )!,
                status: 'pending',
              }}
            >
              {others('calculate')}
            </ThreadStep>
          </ol>
        </ThreadLookContext>
      </div>
    </section>
  );
}

/*
  Where the count, bar and rule being written could live on or around the real
  thread step, each walked through the draft on /workbench/draft-progress. Only
  simulated: the step's status and facts are set here, as orders-run.tsx would
  set them.
*/
export function ThreadProgress({
  look,
  set,
  names,
}: {
  look: ThreadLook;
  set: DefinitionSet;
  names: Record<string, string>;
}) {
  const script = useScript();
  const [wholeCards, setWholeCards] = useState(false);
  const [rate, setRate] = useState(1);
  const figure = useRef<HTMLDivElement>(null);
  useSlowMotion(figure, rate);
  return (
    <section aria-labelledby="thread-progress">
      <div className="mb-4 grid gap-1">
        <h2 id="thread-progress" className="text-title font-semibold">
          A draft on the thread step
        </h2>
        <p className="text-meta text-muted max-w-3xl">
          The count, a bar and the rule being written, on or around the real
          step. The same scripted draft and cards as{' '}
          <a
            className="underline underline-offset-4"
            href="/workbench/draft-progress"
          >
            Draft progress
          </a>
          . The status line is left out of each, as it is the same words.
        </p>
      </div>
      <ScriptControls script={script}>
        <Button
          aria-pressed={wholeCards}
          onPress={() => setWholeCards(!wholeCards)}
        >
          Whole cards
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
      </ScriptControls>
      <div ref={figure} className="draft-thread-options mt-6 gap-x-6 gap-y-10">
        {VARIANTS.map((variant) => (
          <Option
            key={variant.id}
            variant={variant.id}
            name={variant.name}
            note={variant.note}
            look={look}
            set={set}
            names={names}
            scene={script.scene}
            wholeCards={wholeCards}
          />
        ))}
      </div>
    </section>
  );
}
