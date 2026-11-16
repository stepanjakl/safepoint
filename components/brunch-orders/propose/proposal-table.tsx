'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';

import { DataDrawer } from '@/components/brunch-orders/data-drawer';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_BODY,
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME_COLUMN,
  DataTable,
} from '@/components/ui/data-table';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { MorphingText } from '@/components/ui/morphing-text';
import { Pill } from '@/components/ui/pill';
import { cx } from '@/lib/cx';
import { DURATION_STATE } from '@/lib/motion';
import type { Proposal } from '@/lib/definitions/types';
import { sourceTermsOf, type SourceKind } from '@/lib/sources/model';

import { madeNow } from './made-now';
import { PresentRow, ProposalRow } from './proposal-row';
import type { Calculated, Decision, ProposalField, CheckReply } from './types';
import { VERDICT, needsPerson } from './verdict';

type Showing = 'all' | 'need' | 'decided';

export function ProposalTable({
  fields,
  proposal,
  names,
  calculated,
  decisions,
  readId,
  announced,
  onDecide,
  onCheck,
  icons = false,
  source,
}: {
  // Decisions as their marks alone, each named in its tooltip.
  icons?: boolean;
  // The kind of source read, which says how a cited cell names its resource.
  source?: SourceKind;
  // What each record's proposal sets: a column each.
  fields: ProposalField[];
  proposal: Proposal;
  names: Record<string, string>;
  calculated: Calculated;
  decisions: Record<string, Decision>;
  readId: string;
  announced: string;
  onDecide: (changes: Record<string, Decision | null>, words: string) => void;
  onCheck: (
    key: string,
    values: Record<string, number>,
  ) => Promise<CheckReply | null>;
}) {
  const records = Object.entries(proposal.records);
  const needYou = records.filter(
    ([key, record]) => !decisions[key] && needsPerson(record.verdict),
  );
  // Those nothing asks a person about, whether checked or not.
  const ready = records.filter(
    ([key, record]) => !decisions[key] && !needsPerson(record.verdict),
  );
  const unchecked = ready.every(([, record]) => record.verdict === 'unchecked');
  const decided = records.filter(([key]) => decisions[key]);
  const reduceMotion = useReducedMotion();
  const [showing, setShowing] = useState<Showing>('all');
  const shown =
    showing === 'need' ? needYou : showing === 'decided' ? decided : records;
  const counts = (['blocked', 'decide', 'ready', 'unchecked'] as const)
    .map((verdict) => ({
      verdict,
      count: records.filter(([, r]) => r.verdict === verdict).length,
    }))
    .filter((entry) => entry.count);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const tableId = useId();

  return (
    <div className="grid gap-3">
      <div className="flex">
        <FilterTabs
          size="small"
          ariaLabel="Records to show"
          tabs={[
            {
              key: 'all',
              short: 'All',
              label: 'All records',
              count: records.length,
            },
            {
              key: 'need',
              short: 'Need you',
              label: 'Records that need you',
              count: needYou.length,
              severity: 1,
            },
            {
              key: 'decided',
              short: 'Decided',
              label: 'Decided records',
              count: decided.length,
            },
          ]}
          selected={showing}
          onChange={setShowing}
        />
      </div>
      <p role="status" className="sr-only">
        {announced}
      </p>
      <DataDrawer readId={readId}>
        {(view) => (
          <DataTable>
            <div className="min-w-0 overflow-x-auto overflow-y-hidden">
              <table className={cx('calc-table', DATA_TABLE_BODY)}>
                <caption className="sr-only">
                  What is proposed for every record
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pr-3 pl-6 text-left')}
                    >
                      Record
                    </th>
                    <th
                      scope="col"
                      className={cx(
                        DATA_TABLE_HEAD,
                        DATA_TABLE_NAME_COLUMN,
                        'pr-3',
                      )}
                    >
                      <span className="sr-only">Name</span>
                    </th>
                    {fields.map((field) => (
                      <th
                        key={field.id}
                        scope="col"
                        className={cx(DATA_TABLE_HEAD, 'pl-3 text-right')}
                      >
                        {field.label}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pl-3 text-left')}
                    >
                      Verdict
                    </th>
                    <th
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pr-4 pl-3 text-right')}
                    >
                      Decision
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {shown.length === 0 ? (
                      <PresentRow key="empty">
                        <td
                          colSpan={fields.length + 4}
                          className="text-muted px-6 py-2.75"
                        >
                          {showing === 'need'
                            ? 'Nothing needs you.'
                            : 'Nothing decided yet.'}
                        </td>
                      </PresentRow>
                    ) : null}
                    {shown.map(([key, record], rowIndex) => (
                      <ProposalRow
                        key={key}
                        fields={fields}
                        id={`${tableId}-${key}`}
                        recordKey={key}
                        name={names[key] ?? ''}
                        record={record}
                        decision={decisions[key]}
                        expanded={open.has(key)}
                        ruled={rowIndex < shown.length - 1}
                        calculated={calculated}
                        onToggle={() => toggle(key)}
                        onDecide={onDecide}
                        onCheck={onCheck}
                        onCite={(cell) => {
                          const tab =
                            sourceTermsOf(source).address.resourceOf(cell);
                          if (tab) view(tab);
                        }}
                        icons={icons}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            <div
              role="group"
              aria-label="Proposal summary"
              className="ground-raised border-rule-faint bg-surface-primary border-t-section sticky bottom-0 z-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {counts.map(({ verdict, count }) => (
                  <Pill key={verdict} tone={VERDICT[verdict].tone}>
                    {count} {VERDICT[verdict].label.toLowerCase()}
                  </Pill>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {ready.length ? (
                  <motion.div
                    key="approve-ready"
                    className="ml-auto"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
                  >
                    <Button
                      size="medium"
                      onPress={() => {
                        const at = new Date().toISOString();
                        onDecide(
                          Object.fromEntries(
                            ready.map(([key]) => [key, madeNow('approve', at)]),
                          ),
                          `${ready.length} ${unchecked ? 'not checked' : 'ready'} approved`,
                        );
                      }}
                    >
                      <span>
                        Approve all <MorphingText text={String(ready.length)} />{' '}
                        {unchecked ? 'not checked' : 'ready'}
                      </span>
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </DataTable>
        )}
      </DataDrawer>
    </div>
  );
}
