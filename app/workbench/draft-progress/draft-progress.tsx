'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
import { Button } from '@/components/ui/button';
import { Fold } from '@/components/ui/fold';
import { Pill } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import type { DefinitionSet } from '@/lib/definitions/types';

import {
  Crossfade,
  DraftCards,
  PILL_STYLES,
  UpNextPill,
  WritingPill,
  type PillStyle,
} from './draft-cards';
import { SCENES, serverSays, summaryOf, useScript, type Scene } from './script';
import { ScriptControls } from './script-controls';

type Option = {
  id: string;
  name: string;
  about: string;
  // Whether it can meet the accessibility requirements, and how.
  access: string;
  // What it adds to today's card and status line.
  pills?: boolean;
  placeholder?: boolean;
  line?: boolean;
  summary?: boolean;
  oneByOne?: boolean;
  // What it does in each scene, in their order.
  states: readonly string[];
};

const REVISED: Option = {
  id: 'revised',
  name: 'Revised version',
  about:
    'Only the rule being written holds placeholders; a queued rule shows its reading and “Up next”. “Writing” keeps the thread’s beat, the tab’s icon turns while the draft runs, and a card moves to its new height while what you are reading keeps still. The count, bar and rule name are compared on the thread step, on /workbench/run.',
  access:
    'Meets all three. Pills and placeholders are not live, and placeholders are hidden from screen readers. Under reduced motion the beat, shimmer, ease and tab icon all stop, and the words stay.',
  pills: true,
  line: true,
  states: [
    'The status line alone, and the tab’s icon turning. No cards until the rules are found.',
    'The first card says “Writing” on the beat, with placeholders for its formula and examples. The other four show only their reading and “Up next”.',
    'Two written. The third is “Writing” with placeholders; the last two “Up next”. It grew to take the placeholders, gently.',
    'Still the third card, its line saying “Waiting 40 s for a request slot”.',
    'The third card’s placeholders gave way to its formula and examples, and the fourth took on placeholders and “Fixing 1 problem”.',
    'All five “Waiting for you”, and the tab’s icon back at rest.',
    'Three “Waiting for you”. The rule being written loses its placeholders and goes back to “Not written” with the other, the status line gives the reason, and the tab’s icon rests.',
  ],
};

const EARLIER: readonly Option[] = [
  {
    id: 'a',
    name: 'A · Three pill states',
    about:
      'Each pill says what is really happening: written, writing or queued. “Not written” is kept for rules a stopped draft did not reach.',
    access:
      'Meets all three. The pills are not live, so only the status line speaks; the dots stop under reduced motion and the word stays.',
    pills: true,
    states: [
      'No cards yet: how many rules there are is not known until the model has found them. Only the status line says anything.',
      'The first card says “Writing ···”, the other four “Up next”.',
      'Two say “Waiting for you”, one “Writing ···”, two “Up next”.',
      'Looks exactly like the state before: nothing shows that this is a wait and not a hang.',
      'Three written, the fourth “Writing ···”. Being sent back does not show.',
      'All five say “Waiting for you”, each with its dot.',
      'Three stay “Waiting for you”. Two go back to “Not written” with their Write buttons, and the status line gives the reason.',
    ],
  },
  {
    id: 'b',
    name: 'B · A, with a placeholder body',
    about:
      'A’s pills, and the formula and examples areas keep their place until they arrive, so a card holds its shape.',
    access:
      'Meets all three. Placeholders are hidden from screen readers and still under reduced motion, where the pill’s word says which card is active.',
    pills: true,
    placeholder: true,
    states: [
      'No cards, so no shape to hold.',
      'A’s pills. The writing card’s formula and examples shimmer; the queued cards’ hold still, so one card looks active.',
      'Two cards filled in, the third shimmers, the last two hold still.',
      'The shimmer keeps moving, so a stall looks the same as progress.',
      'As before, on the fourth card. Being sent back does not show.',
      'Every placeholder replaced by what it stood for.',
      'Three filled in. The two unreached lose their placeholders, as nothing is coming, and go back to “Not written”.',
    ],
  },
  {
    id: 'c',
    name: 'C · A, with a live line',
    about:
      'A’s pills, and a line on the active card saying what the model is doing. Recommended earlier: only this shows a long wait is not a hang.',
    access:
      'Meets all three, if the status line carries the activity too, as the card’s line is not live. A real one must limit how often it changes.',
    pills: true,
    line: true,
    states: [
      'No cards, so no line: the status line alone.',
      'A’s pills, and the writing card adds “Asking the model for a formula”.',
      'The third card says “Trying a formula on real data · attempt 2”.',
      'The third card says “Waiting 40 s for a request slot”: the wait itself is shown.',
      'The fourth card says “Fixing 1 problem”.',
      'No line: nothing is working. Pills as in A.',
      'No line: nothing is working. As in A, two go back to “Not written” and the status line gives the reason.',
    ],
  },
  {
    id: 'd',
    name: 'D · A summary, cards unchanged',
    about:
      'A count, a bar and the rule being written, above the cards as they are today.',
    access:
      'Meets all three. The bar is hidden from screen readers, as a progress role can announce by itself; the sentence above it says the same.',
    summary: true,
    states: [
      '“Drafting: finding the definitions”, an empty bar, no cards.',
      '“0 of 5 written”, and the name of the rule being written. Every card says “Not written”, as today.',
      '“2 of 5 written”, the bar at two fifths. The cards still say “Not written” for the rule being written and the queued alike.',
      'Exactly the state before: a still bar cannot tell a wait from a hang.',
      '“3 of 5 written”. Being sent back does not show.',
      '“Drafted: 5 of 5 written”, “5 waiting for you”, a full bar. Every card says “Waiting for you”.',
      '“Stopped: 3 of 5 written” with the reason. The bar stays at three fifths and loses its colour. Two cards say “Not written”.',
    ],
  },
  {
    id: 'e',
    name: 'E · Cards appear as written',
    about:
      'Only written rules are drawn, one more as each is done. Advised against earlier, as the overview goes and content moves while you read.',
    access:
      'Meets all three, but a screen reader finds a list shorter than the rulebook until the end. Under reduced motion cards appear without moving.',
    oneByOne: true,
    states: [
      'Only the status line.',
      'Still no cards: the status line is the only sign of anything.',
      'Two cards. The other three are nowhere on the page.',
      'As the state before: the list simply stops growing.',
      'A third card arrives at the end of the list, and the page grows beneath the reader.',
      'All five cards, as in every option.',
      'The two unreached rules appear together as “Not written”, because their Write buttons must stay reachable.',
    ],
  },
  {
    id: 'cd',
    name: 'C + D · Recommended earlier',
    about:
      'D’s summary above the cards for how far along it is, with A’s pills and C’s line on the active card for what it is doing now.',
    access:
      'Meets all three. One status line carries both the count and the activity, so it is the longest to hear; a real one must limit how often it changes.',
    pills: true,
    line: true,
    summary: true,
    states: [
      'D’s summary, no cards.',
      'The summary above; A’s pills and C’s line on the first card.',
      '“2 of 5 written” above; “Trying a formula on real data · attempt 2” on the third card.',
      'The bar holds still while the card says “Waiting 40 s for a request slot”, so a still bar reads as a wait.',
      '“3 of 5 written” above; “Fixing 1 problem” on the fourth card.',
      'D’s finished summary, A’s pills, no line.',
      'D’s stopped summary with the reason, no line, two “Not written”.',
    ],
  },
];

// What the one status region would say under this option.
function announced(option: Option, set: DefinitionSet, scene: Scene) {
  const summary = summaryOf(set, scene);
  const said = option.summary
    ? `${summary.headline}. ${summary.detail}`
    : serverSays(set, scene);
  if (!option.line || !scene.activity) return said;
  return `${/[.…]$/.test(said) ? said : `${said}.`} ${scene.activity}.`;
}

function Summary({ set, scene }: { set: DefinitionSet; scene: Scene }) {
  const { headline, detail, share } = summaryOf(set, scene);
  return (
    <div className="grid gap-1.5">
      <p className="text-dense font-medium">{headline}</p>
      <div
        aria-hidden
        className="bg-surface-inset h-1.5 overflow-hidden rounded-full"
      >
        <span
          className={cx(
            'draft-bar-fill',
            scene.error ? 'bg-muted' : 'bg-state-advisory',
          )}
          style={{ '--draft-share': `${share}%` } as CSSProperties}
        />
      </div>
      <p className="text-meta text-muted">{detail}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline font-medium">{label}: </dt>
      <dd className="text-muted inline">{children}</dd>
    </div>
  );
}

function Panel({
  option,
  at,
  set,
  names,
}: {
  option: Option;
  at: number;
  set: DefinitionSet;
  names: Record<string, string>;
}) {
  const scene = SCENES[at]!;
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="row-span-2 grid min-w-0 grid-rows-subgrid gap-y-3"
    >
      <div className="grid content-start gap-2">
        <h3 id={headingId} className="text-title font-semibold">
          {option.name}
        </h3>
        <p className="text-meta text-muted text-pretty">{option.about}</p>
        <Facts option={option} at={at} set={set} />
      </div>
      <Drawn>
        {option.summary ? (
          <Summary set={set} scene={scene} />
        ) : (
          <p className="text-meta text-muted">
            {announced(option, set, scene)}
          </p>
        )}
        <NothingYet scene={scene} />
        <DraftCards
          id={option.id}
          set={set}
          names={names}
          scene={scene}
          pills={option.pills ? 'dots' : undefined}
          placeholder={option.placeholder ? 'all' : undefined}
          line={option.line}
          oneByOne={option.oneByOne}
        />
      </Drawn>
    </section>
  );
}

function Facts({
  option,
  at,
  set,
}: {
  option: Option;
  at: number;
  set: DefinitionSet;
}) {
  return (
    <dl className="text-meta grid gap-1">
      <Fact label="In this state">{option.states[at]}</Fact>
      <Fact label="Its status line says">
        {announced(option, set, SCENES[at]!)}
      </Fact>
      <Fact label="Accessibility">{option.access}</Fact>
    </dl>
  );
}

// What the step draws, on the pane it sits on, with room for the dots.
function Drawn({ children }: { children: ReactNode }) {
  return (
    <div className="control-face surface-raised rounded-shell grid content-start gap-4 py-4 pr-4 pl-4 sm:pr-7">
      {children}
    </div>
  );
}

function NothingYet({ scene }: { scene: Scene }) {
  return scene.found ? null : (
    <p className="text-dense text-muted">
      Nothing drafted for these instructions yet.
    </p>
  );
}

/*
  The revised version first, with what it can still be switched between: how
  its two new pills look beside the Check pill, and whether the active card
  says what the model is doing.
*/
function Revised({
  at,
  set,
  names,
}: {
  at: number;
  set: DefinitionSet;
  names: Record<string, string>;
}) {
  const [style, setStyle] = useState<PillStyle>('blue-dashed');
  const [line, setLine] = useState(true);
  const scene = SCENES[at]!;
  const option = { ...REVISED, line };
  return (
    <section aria-labelledby="revised" className="mt-6 grid max-w-3xl gap-4">
      <div className="grid gap-2">
        <h2 id="revised" className="text-title font-semibold">
          {REVISED.name}
        </h2>
        <p className="text-meta text-muted text-pretty">{REVISED.about}</p>
        <Facts option={option} at={at} set={set} />
      </div>
      <div
        role="group"
        aria-label="How the pills look"
        className="draft-pill-styles gap-3"
      >
        {PILL_STYLES.map((candidate) => (
          <div key={candidate.id} className="grid content-start gap-2">
            <Button
              variant={candidate.id === style ? 'primary' : 'secondary'}
              aria-pressed={candidate.id === style}
              onPress={() => setStyle(candidate.id)}
            >
              {candidate.name}
            </Button>
            <div aria-hidden className="flex flex-wrap items-center gap-2">
              <Pill tone="neutral">Check</Pill>
              <WritingPill style={candidate.id} />
              <UpNextPill style={candidate.id} />
            </div>
            <p className="text-meta text-muted text-pretty">{candidate.note}</p>
          </div>
        ))}
      </div>
      <div>
        <Button aria-pressed={line} onPress={() => setLine(!line)}>
          Line on the active card
        </Button>
      </div>
      <Drawn>
        <h3 className="sr-only">{REVISED.name}, drawn</h3>
        <p className="text-meta text-muted">
          <Crossfade id={announced(option, set, scene)}>
            {announced(option, set, scene)}
          </Crossfade>
        </p>
        <NothingYet scene={scene} />
        <DraftCards
          id={REVISED.id}
          set={set}
          names={names}
          scene={scene}
          pills={style}
          placeholder="writing"
          line={line}
          eased
          hold
        />
      </Drawn>
    </section>
  );
}

/*
  One scripted draft, moved by one control, and every option drawn from where
  it has got to. The panels are not live regions: the one status region on the
  page says which state is showing, and each panel says what its own would say.
*/
export function DraftProgress({
  set,
  names,
}: {
  set: DefinitionSet;
  names: Record<string, string>;
}) {
  const script = useScript();
  const { at, scene } = script;
  useWorkingFavicon(scene.running);
  // The real cards run to a screen each, so a state's differences can sit far
  // down a panel; their heads alone fit side by side.
  const [headsOnly, setHeadsOnly] = useState(false);
  const [earlier, setEarlier] = useState(false);
  return (
    <div data-heads-only={headsOnly ? '' : undefined}>
      <ScriptControls script={script}>
        <Button
          aria-pressed={headsOnly}
          onPress={() => setHeadsOnly(!headsOnly)}
        >
          Heads only
        </Button>
      </ScriptControls>

      <Revised at={at} set={set} names={names} />

      <section aria-labelledby="earlier" className="mt-10 grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="earlier" className="text-title font-semibold">
            The earlier options
          </h2>
          <Button
            size="medium"
            aria-expanded={earlier}
            aria-controls="earlier-options"
            onPress={() => setEarlier(!earlier)}
          >
            {earlier ? 'Hide them' : 'Show them'}
          </Button>
        </div>
        <Fold open={earlier} id="earlier-options">
          <div className="draft-panels gap-x-4 gap-y-8">
            {EARLIER.map((option) => (
              <Panel
                key={option.id}
                option={option}
                at={at}
                set={set}
                names={names}
              />
            ))}
          </div>
        </Fold>
      </section>

      <section aria-labelledby="every-state" className="mt-10 grid gap-4">
        <h2 id="every-state" className="text-title font-semibold">
          Every state, by option
        </h2>
        <div className="draft-panels gap-x-4 gap-y-6">
          {[REVISED, ...EARLIER].map((option) => (
            <div key={option.id} className="grid content-start gap-2">
              <h3 className="text-dense font-semibold">{option.name}</h3>
              <ol className="text-meta grid gap-1.5">
                {option.states.map((state, index) => (
                  <li
                    key={index}
                    aria-current={index === at ? 'step' : undefined}
                    className={index === at ? 'font-medium' : 'text-muted'}
                  >
                    {index + 1}. {SCENES[index]!.name}
                    {index === at ? ' (showing)' : ''}: {state}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
