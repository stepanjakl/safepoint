'use client';

import { useCallback, useRef } from 'react';

import { PendingDots } from '@/components/engine/pending-dots';
import { CardAnchor, anchorOf } from '@/components/engine/rules/card-anchor';
import {
  DefinitionCard,
  statusOf,
} from '@/components/engine/rules/definition-card';
import {
  AwaitedExamples,
  AwaitedFormula,
  Crossfade,
  UpNextPill,
  WritingPill,
  chipOfStage,
  useDraftBeatClock,
  useLeavingState,
  type PillStyle,
} from '@/components/engine/rules/draft-progress';
import { useEasedCards } from '@/components/engine/rules/eased-cards';
import { Pill, SEVERITY } from '@/components/ui/pill';
import { cx } from '@/lib/ui/cx';
import { SUBJECT } from '@/lib/processes/brunch-orders/data';
import type { DefinitionSet } from '@/lib/engine/types';

import { stagesOf, type Scene } from './script';

/*
  The real cards at one scene of the draft, with whatever an option adds: its
  pills, its placeholders, its line. The buttons are real and do nothing.
*/

export { Crossfade, UpNextPill, WritingPill, type PillStyle };

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

const NOTHING = () => undefined;

const shouldLeaveScene = (previous: Scene, next: Scene) =>
  previous.found &&
  previous.running &&
  !(next.running && next.found && next.written === previous.written);

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
  const { shown: scene, leaving } = useLeavingState(
    list,
    latest,
    shouldLeaveScene,
    eased && placeholder !== undefined,
  );
  useEasedCards(list, scene, { enabled: eased, hold });
  useDraftBeatClock(list);
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
            const chip = pills ? chipOfStage(stage, pills) : undefined;
            const status = statusOf(item);
            return (
              <DefinitionCard
                key={item.id}
                subject={SUBJECT}
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
                      {chip ?? <Pill tone={status.tone}>{status.label}</Pill>}
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
