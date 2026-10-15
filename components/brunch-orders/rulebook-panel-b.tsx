'use client';

import { useId, useState } from 'react';

import {
  RulebookLoading,
  useRulebook,
} from '@/components/brunch-orders/rulebook-panel';
import { RulebookHistory } from '@/components/brunch-orders/rulebook-history';
import {
  ASKS,
  CONSEQUENCE,
  Formula,
  linkKey,
  linked,
  anchorOf,
  words,
} from '@/components/brunch-orders/rules-step';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Pill, SEVERITY } from '@/components/ui/pill';
import { Arrival, EmptyState, useLoader } from '@/components/ui/working-mark';
import { cx } from '@/lib/cx';
import type { Definition } from '@/lib/definitions/types';

/*
  Development only: the proposed Rules tab, beside the current one for
  comparison. The accepted rules as tiles, a calculation twice a check's width
  because checks read it, filtered by what each does; the history in a drawer.
  Delete with the 'rules-b' tab once one of the two is chosen.
*/

type Filter = 'all' | 'number' | 'block' | 'decide';

const matches = (item: Definition, filter: Filter) =>
  filter === 'all' ||
  (filter === 'number'
    ? item.result === 'number'
    : item.result === 'check' && item.consequence === filter);

export function RulebookPanelB() {
  const { current, body, set, accepted } = useRulebook();
  const { phase, fadeIn } = useLoader(!body);
  const [filter, setFilter] = useState<Filter>('all');
  const [hot, setHot] = useState<string | null>(null);
  const count = (key: Filter) =>
    accepted.filter((item) => matches(item, key)).length;
  const tabs = (
    [
      { key: 'all', short: 'All', label: 'All rules' },
      { key: 'number', short: 'Calculations', label: 'Calculations' },
      {
        key: 'block',
        short: 'Blocks',
        label: 'Checks that block the proposal',
        severity: SEVERITY[CONSEQUENCE.block.tone],
      },
      {
        key: 'decide',
        short: 'Decides',
        label: 'Checks a person decides',
        severity: SEVERITY[CONSEQUENCE.decide.tone],
      },
    ] as const
  )
    .map((tab) => ({ ...tab, count: count(tab.key) }))
    .filter((tab) => tab.key === 'all' || tab.count > 0);
  // Calculations first, as checks read them; each kind in the rulebook's order.
  const shown = [
    ...accepted.filter((d) => d.result === 'number'),
    ...accepted.filter((d) => d.result !== 'number'),
  ].filter((item) => matches(item, filter));
  const drafted = set ? set.definitions.length - accepted.length : 0;
  const names = body?.kind === 'rules' ? body.names : {};
  const history = body?.kind === 'rules' ? body.history : null;

  if (phase || !body) return <RulebookLoading phase={phase ?? 'waiting'} />;
  if (body.kind === 'error')
    return (
      <EmptyState
        role="alert"
        fadeIn={fadeIn}
        title="The rulebook could not be read."
      >
        {body.message}
      </EmptyState>
    );
  if (!accepted.length)
    return (
      <EmptyState
        role="status"
        fadeIn={fadeIn}
        title="Nothing is accepted yet."
      >
        A run&rsquo;s Rules step is where the rules for instructions{' '}
        <span className="value">{current.version}</span> are drafted and
        accepted.
      </EmptyState>
    );

  return (
    <Arrival fadeIn={fadeIn} className="rulebook-grid grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          tabs={tabs}
          selected={filter}
          onChange={setFilter}
          ariaLabel="Filter rules"
          menuLabel="Other rule filters"
          className="w-fit"
        />
        {history?.revisions.length ? (
          <RulebookHistory history={history} />
        ) : null}
      </div>
      {/* One listener for every linked name: the one under the pointer is lit
          wherever it is shown (linkKey, rules-step.tsx). */}
      <ol
        className="rulebook-tiles"
        aria-label="Accepted rules"
        onPointerOver={(event) => {
          const name = (event.target as Element)
            .closest<HTMLElement>('[data-link]')
            ?.getAttribute('data-link');
          setHot(name ?? null);
        }}
        onPointerLeave={() => setHot(null)}
      >
        {shown.map((item) => (
          <RuleTile
            key={item.id}
            item={item}
            quoted={words(current.text).includes(words(item.text))}
            names={names}
            reads={accepted.filter((d) => item.uses.includes(d.id))}
            hot={hot}
          />
        ))}
        {filter === 'all' && drafted > 0 ? (
          <li className="rounded-shell border-rule-default text-meta text-muted grid place-items-center border border-dashed p-4 text-center">
            {drafted} more drafted in a run, not yet accepted.
          </li>
        ) : null}
      </ol>
    </Arrival>
  );
}

/*
  One accepted rule, read-only, on one face: its name and what failing it
  does, the instructions' words, the formula and the numbers and groups it
  brings. The formula is still: a past run's examples are not the rulebook's,
  and a calculation it reads is named in that calculation's colour.
*/
function RuleTile({
  item,
  quoted,
  names,
  reads,
  hot,
}: {
  item: Definition;
  quoted: boolean;
  names: Record<string, string>;
  reads: Definition[];
  hot: string | null;
}) {
  const headingId = useId();
  const own = linkKey(item, 'values', item.id);
  const fixed = fixedOf(item);
  const consequence =
    item.result === 'check' && item.consequence
      ? CONSEQUENCE[item.consequence]
      : null;
  return (
    <li
      id={anchorOf(item.id)}
      data-result={item.result}
      // Its own name lit elsewhere: this is the calculation being read.
      data-source={item.result === 'number' && hot === own ? '' : undefined}
      aria-labelledby={headingId}
      className={cx(
        ASKS,
        'data-source:rulebook-source-ring isolate flex scroll-mt-4 flex-col gap-3 p-4',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h4 id={headingId} className="text-dense font-semibold">
            {item.name}
          </h4>
          {/* The name other formulas read it by, in the colour they show. */}
          {item.result === 'number' ? (
            <code
              {...linked(own, hot)}
              className="value text-meta rules-linked rules-linked-calculation rulebook-variable justify-self-start"
            >
              values.{item.id}
            </code>
          ) : null}
        </div>
        {consequence ? (
          <Pill tone={consequence.tone} variant="ringed">
            {consequence.label}
          </Pill>
        ) : (
          <span className="rulebook-calculation-pill pill-shape text-meta px-2 py-0.5">
            Calculation
          </span>
        )}
      </div>
      <p className="text-dense leading-relaxed">
        {quoted ? <>&ldquo;{item.text}&rdquo;</> : item.text}
      </p>
      <div className="grid gap-2.5">
        {item.formula ? (
          <Formula
            item={item}
            formula={item.formula}
            names={names}
            reads={reads}
            face="bg-surface-inset"
            still
            hot={hot}
          />
        ) : null}
      </div>
      {fixed.length ? (
        <dl
          aria-label={`Fixed values ${item.name} reads`}
          className="rulebook-fixed value text-meta"
        >
          {fixed.map((entry) => {
            const key = linkKey(item, entry.root, entry.id);
            return (
              // The whole pair lights, as its name does in the formula.
              <div
                key={key}
                {...linked(key, hot)}
                className="rules-linked rules-linked-name"
              >
                <dt>
                  {entry.root}.{entry.id}
                </dt>
                {/* A key never breaks inside itself: FT-200, not FT- / 200. */}
                <dd>
                  {entry.values.map((value, index) => (
                    <span key={index}>
                      {index ? ', ' : null}
                      <span className="whitespace-nowrap">{value}</span>
                    </span>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </li>
  );
}

/*
  The numbers and groups a definition holds, fixed when its rulebook was
  accepted, by the name the formula reads them by: in the order the formula
  first reads each, so the list follows the reading, then any it never reads.
*/
function fixedOf(item: Definition) {
  const all = [
    ...item.constants.map((c) => ({
      root: 'constants',
      id: c.id,
      values: [String(c.value)],
    })),
    ...item.groups.map((g) => ({
      root: 'groups',
      id: g.id,
      values: g.keys,
    })),
  ];
  const read = [
    ...new Set(
      [...(item.formula ?? '').matchAll(/\b(constants|groups)\.(\w+)/g)].map(
        (match) => `${match[1]}.${match[2]}`,
      ),
    ),
  ];
  const at = (entry: (typeof all)[number]) => {
    const index = read.indexOf(`${entry.root}.${entry.id}`);
    return index < 0 ? read.length : index;
  };
  return all.sort((a, b) => at(a) - at(b));
}
