'use client';

import { useCallback, useMemo, type ReactNode } from 'react';

import {
  CardAnchor,
  DefinitionCard,
  statusOf,
} from '@/components/brunch-orders/rules-step';
import { StatusChip } from '@/components/brunch-orders/trial-parts';
import { Loader } from '@/components/ui/loader';
import { useLoader } from '@/components/ui/working-mark';
import { cx } from '@/lib/cx';

import { sampleDraft } from '../draft-progress/sample';
import { PANE, Side, type Load } from './parts';

const NOTHING = () => undefined;

/*
  The Rules step's list as a draft runs through it: the frozen rulebook's first
  three rules, the second being written again. The chip is the only part that
  differs between the two sides.
*/
export function RuleContext({ load }: { load: Load }) {
  const { set, names } = useMemo(() => sampleDraft(), []);
  const items = set.definitions.slice(0, 3);
  const writing = items[1]?.id;
  const { phase } = useLoader(load.loading);

  const list = (side: string, chipFor: (id: string) => ReactNode) => (
    <ListOf
      side={side}
      items={items}
      names={names}
      writing={load.loading ? writing : undefined}
      chipFor={chipFor}
    />
  );

  return (
    <section aria-labelledby="rule-context" className="grid gap-4">
      <header className="grid gap-1">
        <h2 id="rule-context" className="text-title font-medium">
          Rule being written, in its list
        </h2>
        <p className="value text-meta text-muted">
          brunch-orders/rules-step.tsx · DefinitionCard
        </p>
        <p className="text-dense text-muted-strong max-w-prose">
          The Rules step lists every calculation and check as a card; each card
          names its kind and what failing it does as pills on the left, and its
          status as a chip on the right. While a draft is writing a rule, that
          rule&rsquo;s chip says &ldquo;Writing…&rdquo; and a line under its
          title says the version shown is the one before. After: the
          chip&rsquo;s place takes the inline loader, since writing is not a
          status the rule has but a wait, and the status chip comes back when it
          lands. Use the replay buttons above to watch it.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        <Side label="Before">
          {list('before', (id) =>
            id === writing && load.loading ? (
              <StatusChip tone="neutral">Writing…</StatusChip>
            ) : undefined,
          )}
        </Side>
        <Side label="After">
          {list('after', (id) =>
            id === writing && phase ? (
              <Loader phase={phase} label="Writing…" className="text-meta" />
            ) : undefined,
          )}
        </Side>
      </div>
    </section>
  );
}

function ListOf({
  side,
  items,
  names,
  writing,
  chipFor,
}: {
  side: string;
  items: ReturnType<typeof sampleDraft>['set']['definitions'];
  names: Record<string, string>;
  writing: string | undefined;
  chipFor: (id: string) => ReactNode;
}) {
  const anchor = useCallback((rule: string) => `${side}-${rule}`, [side]);
  return (
    <CardAnchor value={anchor}>
      <div className={cx(PANE, 'p-5')}>
        <div className="rules-list grid gap-4">
          <ol className="grid gap-3" aria-label="Calculations and checks">
            {items.map((item) => (
              <DefinitionCard
                key={item.id}
                item={item}
                quoted={false}
                names={names}
                working={[]}
                reads={items.filter((d) => item.uses.includes(d.id))}
                busy={writing !== undefined}
                canWrite
                onWrite={NOTHING}
                onDecide={NOTHING}
                chip={
                  chipFor(item.id) ?? (
                    <StatusChip tone={statusOf(item).tone}>
                      {statusOf(item).label}
                    </StatusChip>
                  )
                }
                activity={
                  item.id === writing && item.formula ? (
                    <p className="text-meta text-muted">
                      Being written again. This is the version before it, until
                      the new one is ready.
                    </p>
                  ) : null
                }
              />
            ))}
          </ol>
        </div>
      </div>
    </CardAnchor>
  );
}
