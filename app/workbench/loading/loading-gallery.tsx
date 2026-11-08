'use client';

import TableFilled from 'blode-icons-react/icons/table-filled';
import { useEffect, useState, type ReactNode } from 'react';

import { StatusChip } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
import {
  COMPACT_TABLE_BODY,
  COMPACT_TABLE_CELL,
  COMPACT_TABLE_HEAD,
  DataTable,
} from '@/components/ui/data-table';
import { Loader } from '@/components/ui/loader';
import { MORPH_WORDS_MS, MorphingText } from '@/components/ui/morphing-text';
import {
  Arrival,
  LOADER_DELAY_MS,
  LOADER_MIN_MS,
  LOADER_SLOW_MS,
  useLoader,
} from '@/components/ui/working-mark';
import { cx } from '@/lib/cx';

import { DRAWER, PANE, Side, type Load } from './parts';
import { RuleContext } from './rule-context';

const REPLIES = [
  { label: 'Quick', ms: LOADER_DELAY_MS / 2 },
  { label: 'A second and a half', ms: 1500 },
  { label: 'Slow', ms: LOADER_SLOW_MS + 2000 },
] as const;

export function LoadingGallery() {
  const [load, setLoad] = useState<Load>({ loading: true, at: 0 });
  const [reply, setReply] = useState<number | null>(null);

  useEffect(() => {
    if (reply === null || !load.loading) return;
    const landed = setTimeout(
      () => setLoad((current) => ({ ...current, loading: false })),
      reply,
    );
    return () => clearTimeout(landed);
  }, [load, reply]);

  const start = (ms: number | null) => {
    setReply(ms);
    setLoad({ loading: true, at: performance.now() });
  };

  return (
    <div className="grid gap-12">
      <Sizes />

      <section aria-label="Replay" className="grid gap-3">
        <h2 className="text-title font-medium">In place</h2>
        <div className="flex flex-wrap gap-2">
          <Button onPress={() => start(null)}>Hold loading</Button>
          {REPLIES.map(({ label, ms }) => (
            <Button key={label} onPress={() => start(ms)}>
              {`${label} · ${ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}`}
            </Button>
          ))}
          <Button
            onPress={() => {
              setReply(null);
              setLoad({ loading: false, at: performance.now() });
            }}
          >
            Loaded
          </Button>
        </div>
        <p className="text-meta text-muted max-w-prose">
          Before: the words appear at once and the content cuts in. After:
          nothing for {LOADER_DELAY_MS}ms, then the loader for at least{' '}
          {LOADER_MIN_MS}ms, &ldquo;Still&nbsp;…&rdquo; after{' '}
          {LOADER_SLOW_MS / 1000}s, and the content fades in.
        </p>
      </section>

      <Case
        title="Source drawer and data drawer"
        where="sources/source-drawer.tsx · brunch-orders/data-drawer.tsx"
        fix="A drawer waiting for its read: the panel loader."
        before={
          <div className={cx(DRAWER, 'flex h-72 flex-col gap-3 p-5')}>
            {load.loading ? (
              <p role="status" className="text-dense text-muted">
                Loading the read…
              </p>
            ) : (
              <ReadTable />
            )}
          </div>
        }
        after={
          <PanelLoad
            load={load}
            className={cx(DRAWER, 'flex h-72 flex-col gap-3 p-5')}
            label="Loading the read…"
          >
            <ReadTable />
          </PanelLoad>
        }
      />

      <Case
        title="Review item details"
        where="review/review-item-aside.tsx"
        fix="The same panel loader. The aside keeps its own screen-reader status, so the loader does not announce."
        before={
          <div className={cx(DRAWER, 'flex h-72 flex-col')}>
            {load.loading ? (
              <p className="text-muted text-dense p-5">Loading item details…</p>
            ) : (
              <ItemDetail />
            )}
          </div>
        }
        after={
          <PanelLoad
            load={load}
            className={cx(DRAWER, 'flex h-72 flex-col')}
            label="Loading item details…"
          >
            <ItemDetail />
          </PanelLoad>
        }
      />

      <Case
        title="Assistant answer"
        where="app-shell/assistant/assistant-panel.tsx"
        fix="The question is already there, so the wait is a line: the inline loader, and the answer fades in under the question."
        before={
          <div className={cx(DRAWER, 'grid min-h-40 content-start gap-3 p-5')}>
            <p className="text-body text-muted-strong">{QUESTION}</p>
            <div className="text-body grid gap-3">
              {load.loading ? <p className="text-muted">Asking…</p> : ANSWER}
            </div>
          </div>
        }
        after={
          <div className={cx(DRAWER, 'grid min-h-40 content-start gap-3 p-5')}>
            <p className="text-body text-muted-strong">{QUESTION}</p>
            <InlineLoad load={load} className="text-body" label="Asking…">
              {ANSWER}
            </InlineLoad>
          </div>
        }
      />

      <Case
        title="Calculate step"
        where="brunch-orders/calculate-step.tsx (two places)"
        fix="“Working the values out…” and the cross-check's “Working…” both take the inline loader."
        before={
          <div className={cx(PANE, 'grid min-h-24 content-start p-5')}>
            {load.loading ? (
              <p className="text-dense text-muted">Working the values out…</p>
            ) : (
              <CalculateResult />
            )}
          </div>
        }
        after={
          <div className={cx(PANE, 'grid min-h-24 content-start p-5')}>
            <InlineLoad
              load={load}
              className="text-dense"
              label="Working the values out…"
            >
              <CalculateResult />
            </InlineLoad>
          </div>
        }
      />

      <Case
        title="Trial control (Read the sheet)"
        where="brunch-orders/trial-parts.tsx"
        fix="The status beside the button says what is under way, as the inline loader, instead of a bare “Running…”. The button keeps its own words, so the two never say the same thing side by side."
        before={
          <div className={cx(PANE, 'p-5')}>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" isDisabled={load.loading}>
                {load.loading ? 'Reading…' : 'Read the sheet again'}
              </Button>
              <p role="status" className="text-meta text-muted min-w-0">
                {load.loading ? 'Running…' : TRIAL_DONE}
              </p>
            </div>
          </div>
        }
        after={
          <div className={cx(PANE, 'p-5')}>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" isDisabled={load.loading}>
                Read the sheet again
              </Button>
              <InlineLoad
                load={load}
                className="text-meta text-muted min-w-0"
                label="Reading…"
              >
                <p>{TRIAL_DONE}</p>
              </InlineLoad>
            </div>
          </div>
        }
      />

      <Case
        title="Read card, before the read lands"
        where="brunch-orders/orders-run.tsx"
        fix="The sheet's icon stays, since it says what is being read; the count's place takes the inline loader, and the count fades in."
        before={
          <div className={cx(PANE, 'p-3')}>
            <div className="brunch-read-head" data-reading>
              <TableFilled aria-hidden className="brunch-read-icon" />
              <span className="brunch-read-name">Orders sheet</span>
              <span className="text-meta text-muted ms-auto">
                {load.loading ? 'Reading…' : '4 tabs'}
              </span>
            </div>
          </div>
        }
        after={
          <div className={cx(PANE, 'p-3')}>
            <div className="brunch-read-head" data-reading>
              <TableFilled aria-hidden className="brunch-read-icon" />
              <span className="brunch-read-name">Orders sheet</span>
              <InlineLoad
                load={load}
                className="text-meta text-muted ms-auto"
                label="Reading…"
              >
                <MorphingText text="4 tabs" duration={MORPH_WORDS_MS} />
              </InlineLoad>
            </div>
          </div>
        }
      />

      <Case
        title="Model review buttons (development only)"
        where="workbench/explore/review-explorer.tsx · workbench/model/workbench.tsx"
        fix="As the trial control: the inline loader beside the button carries the wait."
        before={
          <div className={cx(PANE, 'flex items-center gap-3 p-5')}>
            <Button isDisabled={load.loading}>
              {load.loading ? 'Reviewing…' : 'Run live model'}
            </Button>
          </div>
        }
        after={
          <div className={cx(PANE, 'flex items-center gap-3 p-5')}>
            <Button isDisabled={load.loading}>Run live model</Button>
            <InlineLoad
              load={load}
              className="text-meta text-muted"
              label="Reviewing…"
            >
              <p>Reviewed 18 items · 9.4 s</p>
            </InlineLoad>
          </div>
        }
      />

      <RuleContext load={load} />
    </div>
  );
}

/* The three sizes, held, and each as it reads once a wait runs long. */
function Sizes() {
  return (
    <section aria-labelledby="loader-sizes" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="loader-sizes" className="text-title font-medium">
          Loader
        </h2>
        <p className="text-dense text-muted-strong max-w-prose">
          <span className="value">components/ui/loader.tsx</span>. One mark, one
          pass of its colour across the words per turn of its petals, in three
          sizes: a whole pane, a drawer or aside, and a line of text.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {(['page', 'panel', 'inline'] as const).map((size) => (
          <figure key={size} className="grid content-start gap-2">
            <figcaption className="readout text-muted">{size}</figcaption>
            <div
              className={cx(
                PANE,
                'flex h-72 flex-col',
                size === 'inline' && 'justify-center gap-4 p-6',
              )}
            >
              {size === 'inline' ? (
                <>
                  <span className="text-body">
                    <Loader phase="shown" label="Asking…" />
                  </span>
                  <span className="text-dense">
                    <Loader phase="shown" label="Working the values out…" />
                  </span>
                  <span className="text-meta">
                    <Loader phase="slow" label="Reading the sheet…" />
                  </span>
                </>
              ) : (
                <Loader
                  phase="shown"
                  size={size}
                  label={
                    size === 'page'
                      ? 'Loading the rulebook…'
                      : 'Loading the read…'
                  }
                />
              )}
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Case({
  title,
  where,
  fix,
  before,
  after,
}: {
  title: string;
  where: string;
  fix: string;
  before: ReactNode;
  after: ReactNode;
}) {
  return (
    <article className="grid gap-4">
      <header className="grid gap-1">
        <h2 className="text-title font-medium">{title}</h2>
        <p className="value text-meta text-muted">{where}</p>
        <p className="text-dense text-muted-strong max-w-prose">{fix}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Side label="Before">{before}</Side>
        <Side label="After">{after}</Side>
      </div>
    </article>
  );
}

function InlineLoad({
  load,
  className,
  label,
  slowLabel,
  children,
}: {
  load: Load;
  className?: string;
  label: string;
  slowLabel?: string;
  children: ReactNode;
}) {
  const { phase, fadeIn } = useLoader(load.loading);
  return (
    <div className={className}>
      {phase ? (
        <Loader phase={phase} label={label} slowLabel={slowLabel} />
      ) : (
        <Arrival key={load.at} fadeIn={fadeIn}>
          {children}
        </Arrival>
      )}
    </div>
  );
}

function PanelLoad({
  load,
  className,
  label,
  children,
}: {
  load: Load;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const { phase, fadeIn } = useLoader(load.loading);
  return (
    <div className={className}>
      {phase ? (
        <Loader phase={phase} size="panel" label={label} />
      ) : (
        <Arrival
          key={load.at}
          fadeIn={fadeIn}
          className="flex min-h-0 flex-1 flex-col"
        >
          {children}
        </Arrival>
      )}
    </div>
  );
}

const QUESTION = 'Why does table 12 count twice?';
const ANSWER = (
  <p>
    It appears on two order sheets for the same sitting, so the rule that sums
    covers per table reads it once from each.
  </p>
);
const TRIAL_DONE = '4 tabs · 812 ms round trip · 14:02';

function ReadTable() {
  const rows = [
    ['12', 'Sat 09:30', '4'],
    ['7', 'Sat 10:00', '2'],
    ['3', 'Sat 10:15', '6'],
    ['12', 'Sat 11:45', '3'],
  ];
  return (
    <div className="grid gap-3">
      <p className="text-dense text-primary font-medium">Orders</p>
      <DataTable variant="compact">
        <table className={cx(COMPACT_TABLE_BODY, 'w-full text-left')}>
          <thead>
            <tr>
              {['Table', 'Sitting', 'Covers'].map((head) => (
                <th key={head} scope="col" className={COMPACT_TABLE_HEAD}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column} className={COMPACT_TABLE_CELL}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}

function ItemDetail() {
  return (
    <dl className="text-dense grid gap-3 p-5">
      {[
        ['Order', '#4821 · table 12'],
        ['Rule', 'Covers per table'],
        ['Model', '3 covers'],
        ['Formula', '4 covers'],
      ].map(([term, value]) => (
        <div key={term} className="grid gap-0.5">
          <dt className="readout text-muted">{term}</dt>
          <dd className="text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CalculateResult() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip tone="ready">All 24 match the model</StatusChip>
      <span className="text-meta text-muted">On the accepted rules</span>
    </div>
  );
}
