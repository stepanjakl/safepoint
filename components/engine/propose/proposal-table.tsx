'use client';

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { useWalkthrough } from '@/components/app-shell/walkthrough';
import { DataDrawer } from '@/components/engine/data-drawer';
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
import { useScreenSettled } from '@/components/ui/screen-settled';
import { SmoothHeight } from '@/components/ui/smooth-height';
import { WalkthroughHint } from '@/components/ui/walkthrough-hint';
import { cx } from '@/lib/ui/cx';
import { DURATION_PANE, DURATION_STATE, EASE_OUT_QUAD } from '@/lib/ui/motion';
import type { Proposal } from '@/lib/engine/types';
import { sourceTermsOf, type SourceKind } from '@/lib/sources/model';

import { madeNow } from './made-now';
import { ProposalRow } from './proposal-row';
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
  onConfirm,
  confirmed = false,
  icons = false,
  source,
}: {
  // Once every record is decided, a person confirms them, which offers the
  // write; none where the run moves on by itself.
  onConfirm?: () => void;
  confirmed?: boolean;
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
  const tableId = useId();
  const walkthrough = useWalkthrough();
  const screenSettled = useScreenSettled();
  const reviewHintId = useId();
  const filterBarRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const toggle = (key: string) => {
    if (key === shown.at(-1)?.[0]) {
      const fold = document.getElementById(`${tableId}-${key}`);
      if (fold)
        cardRef.current?.style.setProperty(
          '--proposal-last-fold-duration',
          getComputedStyle(fold).getPropertyValue('--fold-duration'),
        );
    }
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };
  useLayoutEffect(() => {
    const card = cardRef.current;
    const head = headRef.current;
    if (!card || !head) return;
    const sync = () => {
      card.style.setProperty(
        '--proposal-head-height',
        `${head.getBoundingClientRect().height}px`,
      );
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(head);
    return () => observer.disconnect();
  }, []);
  const showReviewHint =
    walkthrough?.step === 'review-proposal' &&
    screenSettled &&
    records.length > 0;
  const decide: typeof onDecide = (changes, words) => {
    walkthrough?.advance('review-proposal');
    onDecide(changes, words);
  };

  return (
    <div className="grid gap-3">
      <div className="flex">
        <FilterTabs
          trackRef={filterBarRef}
          descriptionId={showReviewHint ? reviewHintId : undefined}
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
      <WalkthroughHint
        isOpen={showReviewHint}
        step="review-proposal"
        title="Review and decide"
        descriptionId={reviewHintId}
        targetRef={filterBarRef}
        preferredPlacement="bottom-start"
        onDismiss={() => walkthrough?.dismiss()}
        onInteractOutside={() => walkthrough?.advance('review-proposal')}
      >
        Check each proposal and decide. Nothing changes until you approve.
      </WalkthroughHint>
      <p role="status" className="sr-only">
        {announced}
      </p>
      <DataDrawer readId={readId}>
        {(cite) => (
          <DataTable ref={cardRef} className="proposal-table-card">
            <div className="proposal-table-sticky-track">
              <div className="proposal-table-scroll min-w-0 overflow-x-auto overflow-y-hidden">
                <table className={cx('calc-table', DATA_TABLE_BODY)}>
                  <caption className="sr-only">
                    What is proposed for every record
                  </caption>
                  <thead ref={headRef}>
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
                    <LayoutGroup>
                      <AnimatePresence initial={false}>
                        {shown.length === 0 ? (
                          <motion.tr
                            key="empty"
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{
                              opacity: 1,
                              transition: {
                                delay: reduceMotion ? 0 : DURATION_PANE,
                                duration: reduceMotion ? 0 : DURATION_STATE,
                                ease: EASE_OUT_QUAD,
                              },
                            }}
                            exit={reduceMotion ? undefined : { opacity: 0 }}
                            transition={{
                              duration: DURATION_STATE,
                              ease: EASE_OUT_QUAD,
                            }}
                          >
                            <td
                              colSpan={fields.length + 4}
                              className="text-muted px-6 py-2.75"
                            >
                              {showing === 'need'
                                ? 'Nothing needs you.'
                                : 'Nothing decided yet.'}
                            </td>
                          </motion.tr>
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
                            source={source}
                            onToggle={() => toggle(key)}
                            onDecide={decide}
                            onCheck={onCheck}
                            onCite={(cell) => {
                              const address = sourceTermsOf(source).address;
                              const tab = address.resourceOf(cell);
                              if (!tab) return;
                              const position =
                                source === 'database'
                                  ? null
                                  : address.blockStart(
                                      cell.slice(tab.length + 1),
                                    );
                              cite(
                                tab,
                                position
                                  ? { ...position, label: cell }
                                  : undefined,
                              );
                            }}
                            icons={icons}
                          />
                        ))}
                      </AnimatePresence>
                    </LayoutGroup>
                  </tbody>
                </table>
              </div>
              <div
                role="group"
                aria-label="Proposal summary"
                className="proposal-table-summary ground-raised bg-surface-primary border-t-section sticky bottom-0 z-3 border-transparent"
              >
                <SmoothHeight className="sm:grid sm:content-center">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                          transition={{
                            duration: DURATION_STATE,
                            ease: 'easeOut',
                          }}
                        >
                          <Button
                            size="medium"
                            onPress={() => {
                              const at = new Date().toISOString();
                              decide(
                                Object.fromEntries(
                                  ready.map(([key]) => [
                                    key,
                                    madeNow('approve', at),
                                  ]),
                                ),
                                `${ready.length} ${unchecked ? 'not checked' : 'ready'} approved`,
                              );
                            }}
                          >
                            <span>
                              Approve all{' '}
                              <MorphingText text={String(ready.length)} />{' '}
                              {unchecked ? 'not checked' : 'ready'}
                            </span>
                          </Button>
                        </motion.div>
                      ) : !needYou.length && onConfirm && !confirmed ? (
                        <motion.div
                          key="confirm"
                          className="ml-auto"
                          initial={reduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={reduceMotion ? undefined : { opacity: 0 }}
                          transition={{
                            duration: DURATION_STATE,
                            ease: 'easeOut',
                          }}
                        >
                          <Button
                            size="medium"
                            variant="primary"
                            onPress={onConfirm}
                          >
                            Confirm decisions
                          </Button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </SmoothHeight>
              </div>
            </div>
          </DataTable>
        )}
      </DataDrawer>
    </div>
  );
}
