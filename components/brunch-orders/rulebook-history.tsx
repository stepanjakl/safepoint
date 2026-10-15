'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button as AriaButton } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import ChevronTriangleDown from 'blode-icons-react/icons/chevron-triangle-down-small-filled';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import {
  REASONS,
  type RulebookHistory as History,
} from '@/components/brunch-orders/rulebook-panel';
import { Button } from '@/components/ui/button';
import { Fold } from '@/components/ui/fold';
import { Pill } from '@/components/ui/pill';

/*
  Development only, with Rules B: the rulebook's revisions in a drawer, by day.
  A day sits on the outer lane and its revisions on the inner one; the line
  runs down whichever lane the next dot is on and steps across in a soft S.
  Any number of revisions can be open; the line lights from the current
  rulebook down to the last one opened: how far back it is. Drawn from where the dots measure.
*/

type Entry = History['revisions'][number] & { sample?: true };

/*
  Sample revisions below the real ones, so the timeline can be judged at a
  length a process will reach. Marked as samples wherever they are drawn.
  Delete with the comparison.
*/
const DAY = 86_400_000;
function samplesBefore(oldest: string | undefined): Entry[] {
  const from = oldest ? Date.parse(oldest) : Date.now();
  const at = (days: number, hours: number) =>
    new Date(from - days * DAY - hours * 3_600_000).toISOString();
  const entry = (
    id: string,
    reason: Entry['reason'],
    when: string,
    changes: Partial<NonNullable<Entry['changes']>>,
    note: string | null = null,
  ): Entry => ({
    id,
    parent: null,
    reason,
    at: when,
    schemaVersion: 1,
    note,
    changes: { added: [], removed: [], changed: [], ...changes },
    sample: true,
  });
  return [
    entry('a41f09c2be17', 'used', at(1, 2), {}, 'Kept by a run on 10 Oct'),
    entry('7c0d2e9f4a10', 'accepted', at(1, 5), {
      changed: ['Order in whole cases'],
    }),
    entry('e9b2731c05d8', 'accepted', at(3, 1), {
      added: ['Arrival before opening'],
      changed: ['Supplier delivery limit'],
    }),
    entry('3d6a8f12c4e0', 'migrated', at(3, 4), {}, 'groups keyed by SKU'),
    entry('b5e1c07d9a23', 'accepted', at(6, 0), {
      removed: ['Weekend uplift'],
      changed: ['Expected sales', 'Target stock level'],
    }),
  ];
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
});
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
});

function dayOf(iso: string) {
  const day = new Date(iso);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / DAY);
  return {
    key: day.toISOString(),
    label:
      days === 0 ? 'Today' : days === 1 ? 'Yesterday' : DAY_LABEL.format(day),
  };
}

function byDay(entries: Entry[]) {
  const days: { key: string; label: string; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const day = dayOf(entry.at);
    const last = days.at(-1);
    if (last?.key === day.key) last.entries.push(entry);
    else days.push({ ...day, entries: [entry] });
  }
  return days;
}

export function RulebookHistory({ history }: { history: History }) {
  const [open, setOpen] = useState(false);
  const entries: Entry[] = [
    ...history.revisions,
    ...samplesBefore(history.revisions.at(-1)?.at),
  ];
  return (
    <>
      <Button size="small" pill onPress={() => setOpen(true)}>
        History
      </Button>
      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title="Rulebook history"
          closeLabel="Close"
          aside={null}
          width="fixed"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <Timeline entries={entries} head={history.head} />
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}

type Ink = {
  width: number;
  height: number;
  // One path from each dot to the next, stopping short of both.
  segments: string[];
  // Past the last dot to the frame's foot, where it fades.
  tail: string;
  last: number;
};

function Timeline({
  entries,
  head,
}: {
  entries: Entry[];
  head: string | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  // Open revisions in the order they were opened. The light runs from the top
  // to the last one opened, or to the current rulebook with none open.
  const [opened, setOpened] = useState<string[]>(head ? [head] : []);
  const [ink, setInk] = useState<Ink | null>(null);

  const days = byDay(entries);
  // Every dot in reading order: each day's, then its revisions'.
  const dots = days.flatMap((day) => [
    `day:${day.key}`,
    ...day.entries.map((entry) => entry.id),
  ]);
  const lead = opened.at(-1) ?? head;
  const target = lead ? dots.indexOf(lead) : -1;
  // Where the light was, so it travels from there: down one segment after
  // another, or back up from the furthest.
  const [light, setLight] = useState({ target, from: target });
  if (light.target !== target) setLight({ target, from: light.target });
  const { from } = light;
  // Only what the light crosses waits for it; everything else answers at once.
  const delayOf = (index: number) =>
    index < Math.min(from, target) || index > Math.max(from, target)
      ? 0
      : Math.max(0, target >= from ? index - from : from - 1 - index);

  // The dots' centres, and the line between them.
  useLayoutEffect(() => {
    const box = frame.current;
    if (!box) return;
    const measure = () => {
      const origin = box.getBoundingClientRect();
      const marks = [
        ...box.querySelectorAll<HTMLElement>('[data-timeline-dot]'),
      ];
      const at = marks.map((dot) => {
        const r = dot.getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - origin.left,
          y: r.top + r.height / 2 - origin.top,
        };
      });
      const radius = (marks[0]?.getBoundingClientRect().width ?? 0) / 2;
      const last = at.at(-1);
      const gap = radius + CLEARANCE;
      setInk({
        width: origin.width,
        height: origin.height,
        segments: segmentsThrough(at, gap),
        tail: last
          ? `M ${last.x} ${last.y + gap} L ${last.x} ${origin.height}`
          : '',
        last: last?.y ?? 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const delay = (index: number) =>
    ({ '--rulebook-timeline-at': delayOf(index) }) as CSSProperties;

  return (
    <div ref={frame} className="rulebook-timeline">
      {ink ? (
        <svg
          aria-hidden
          className="rulebook-timeline-ink"
          width={ink.width}
          height={ink.height}
        >
          <defs>
            <linearGradient
              id="rulebook-timeline-tail"
              gradientUnits="userSpaceOnUse"
              x1="0"
              x2="0"
              y1={ink.last}
              y2={ink.height}
            >
              <stop offset="0" stopColor="currentColor" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ink.segments.map((d, index) => (
            <path key={index} className="rulebook-timeline-line" d={d} />
          ))}
          <path
            className="rulebook-timeline-tail"
            d={ink.tail}
            stroke="url(#rulebook-timeline-tail)"
          />
          {ink.segments.map((d, index) => (
            <path
              key={index}
              className="rulebook-timeline-trail"
              d={d}
              pathLength={1}
              data-lit={index < target ? '' : undefined}
              style={delay(index)}
            />
          ))}
        </svg>
      ) : null}
      <ol aria-label="Rulebook revisions, newest first" className="grid gap-1">
        {days.map((day) => {
          const index = dots.indexOf(`day:${day.key}`);
          return (
            <li key={day.key} className="grid gap-1">
              <div
                className="rulebook-timeline-row text-meta text-muted font-medium"
                data-lit={index <= target ? '' : undefined}
                style={delay(index)}
              >
                <span data-timeline-dot className="rulebook-timeline-dot" />
                {day.label}
              </div>
              <ol aria-label={day.label} className="grid gap-1">
                {day.entries.map((entry) => {
                  const at = dots.indexOf(entry.id);
                  return (
                    <Revision
                      key={entry.id}
                      entry={entry}
                      head={entry.id === head}
                      open={opened.includes(entry.id)}
                      lit={at <= target}
                      delay={delay(at)}
                      onToggle={() =>
                        setOpened((ids) =>
                          ids.includes(entry.id)
                            ? ids.filter((id) => id !== entry.id)
                            : [...ids, entry.id],
                        )
                      }
                    />
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// What a revision did to each rule, in the order a reader weighs them.
const KINDS = [
  { key: 'added', sign: '+', said: 'Added' },
  { key: 'changed', sign: '~', said: 'Changed' },
  { key: 'removed', sign: '−', said: 'Removed' },
] as const;

/*
  A revision's row opens its detail in place, as a read's header opens its
  card (orders-run.css): the chevron shows under the pointer or focus and
  stays while open, and the detail folds open (components/ui/fold.tsx).
*/
function Revision({
  entry,
  head,
  open,
  lit,
  delay,
  onToggle,
}: {
  entry: Entry;
  head: boolean;
  open: boolean;
  lit: boolean;
  // When its dot lights or dims, as the light travels.
  delay: CSSProperties;
  onToggle: () => void;
}) {
  const detailId = `revision-${entry.id}`;
  const changes = entry.changes;
  // What it did, by kind, leaving out a kind it did none of.
  const counts = KINDS.map((kind) => ({
    ...kind,
    count: changes?.[kind.key].length ?? 0,
  })).filter((kind) => kind.count > 0);
  const pill =
    'group-hover/row:bg-severity-pill-hover group-hover/row:text-severity-strong group-focus-visible/row:bg-severity-pill-hover group-focus-visible/row:text-severity-strong control-wash';
  return (
    <li className="grid">
      <AriaButton
        onPress={onToggle}
        aria-expanded={open}
        aria-controls={detailId}
        data-lit={lit ? '' : undefined}
        style={delay}
        className="rulebook-timeline-row rulebook-timeline-entry group/row text-dense"
      >
        <ChevronTriangleDown
          aria-hidden
          className="rulebook-timeline-chevron"
        />
        <span
          data-timeline-dot
          data-id={entry.id}
          className="rulebook-timeline-dot"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium">{REASONS[entry.reason]}</span>
          {counts.length ? (
            <span className="rulebook-timeline-counts">
              {counts.map((kind) => (
                <span
                  key={kind.key}
                  data-kind={kind.key}
                  className="rulebook-timeline-count"
                >
                  <span aria-hidden>
                    {kind.sign}
                    {kind.count}
                  </span>
                  <span className="sr-only">
                    , {kind.count} {kind.key}
                  </span>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {head ? (
          <Pill tone="ready" className={pill}>
            Current
          </Pill>
        ) : null}
        {entry.sample ? (
          <Pill tone="neutral" className={pill}>
            Sample
          </Pill>
        ) : null}
        <span className="rulebook-timeline-quiet value text-meta">
          {TIME.format(new Date(entry.at))}
        </span>
      </AriaButton>
      <Fold open={open} id={detailId} className="rulebook-timeline-detail">
        {entry.note ? <p className="text-meta">{entry.note}</p> : null}
        {changes && counts.length ? (
          <ul
            aria-label={`What ${entry.id} changed`}
            className="text-meta grid gap-1"
          >
            {KINDS.flatMap((kind) =>
              changes[kind.key].map((name) => (
                <li
                  key={`${kind.key}-${name}`}
                  data-kind={kind.key}
                  className="rulebook-timeline-change"
                >
                  <span aria-hidden className="rulebook-timeline-sign">
                    {kind.sign}
                  </span>
                  <span>
                    <span className="sr-only">{kind.said}: </span>
                    {name}
                  </span>
                </li>
              )),
            )}
          </ul>
        ) : null}
        {/* The revision's file name, for tracing it: a footnote, not content. */}
        <p className="rulebook-timeline-id">
          <span className="readout text-muted">Revision</span>
          <code className="rulebook-timeline-code value">{entry.id}</code>
        </p>
      </Fold>
    </li>
  );
}

// The step across between lanes: at most this tall.
const STEP = 20;
// Clear space between the line's end and a dot's edge.
const CLEARANCE = 2.5;

/*
  From each dot to the next: straight down a lane, and across to the next in
  an S whose ends leave and arrive upright, so the pieces read as one line
  bending. The S is centred half a row above the dot it arrives at -- the
  closest two dots are a row apart -- so an open revision's detail lengthens
  the run before it, never moves it. Each piece stops `gap` short of both
  dots, so its round ends show and the dot sits on whatever is behind it.
*/
function segmentsThrough(at: { x: number; y: number }[], gap: number) {
  const row = Math.min(...at.slice(1).map((to, i) => to.y - (at[i]?.y ?? 0)));
  return at.slice(1).map((to, i) => {
    const from = at[i]!;
    const start = `M ${from.x} ${from.y + gap}`;
    if (Math.abs(to.x - from.x) < 0.5)
      return `${start} L ${from.x} ${to.y - gap}`;
    const mid = to.y - row / 2;
    const half = Math.min(row * 0.4, STEP / 2);
    return `${start} L ${from.x} ${mid - half} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${mid + half} L ${to.x} ${to.y - gap}`;
  });
}
