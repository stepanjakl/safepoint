'use client';

import { useEffect } from 'react';

import { Lede, plural, useTrial } from '@/components/sheet-process/trial-parts';
import {
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_RULE,
  DATA_TABLE_RULE_ON,
  DataTable,
} from '@/components/ui/data-table';
import { cx } from '@/lib/cx';
import type { Proposal } from '@/lib/definitions/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';

import type { Decision } from './propose-step';

const FIELDS = SUBJECT.proposal;

type ProposalReply =
  | {
      kind: 'proposal';
      names: Record<string, string>;
      proposal: Proposal | null;
    }
  | { kind: 'error'; message: string };

// The proposal the run decided on, read from where Propose keeps it.
export function ApplyStep({
  text,
  readId,
  rulebook,
  decisions,
}: {
  text: string;
  readId: string;
  rulebook: string;
  decisions: Record<string, Decision>;
}) {
  const reply = useTrial<ProposalReply>('/api/dev/brunch-orders/propose');
  const { run } = reply;
  useEffect(() => {
    void run({ action: 'get', text, readId, rulebook });
  }, [run, text, readId, rulebook]);
  const body = reply.state.kind === 'done' ? reply.state.body : null;
  if (body?.kind === 'error')
    return (
      <p role="alert" className="text-dense text-state-blocked">
        {body.message}
      </p>
    );
  return body?.kind === 'proposal' && body.proposal ? (
    <ApplyPreview
      proposal={body.proposal}
      decisions={decisions}
      names={body.names}
    />
  ) : null;
}

/*
  Apply, as a preview: what the decided proposal would write to the output the
  process declares, cell by cell, before and after. Approved and changed
  records with values are written; a record left unchanged or rejected is
  not. Nothing is written yet.
*/
function ApplyPreview({
  proposal,
  decisions,
  names,
}: {
  proposal: Proposal;
  decisions: Record<string, Decision>;
  names: Record<string, string>;
}) {
  const output = SUBJECT.data.output;
  const decided = Object.entries(decisions);
  const count = (kind: Decision['kind']) =>
    decided.filter(([, d]) => d.kind === kind).length;
  const writes = Object.entries(proposal.records).flatMap(([key, record]) => {
    const decision = decisions[key];
    if (!decision || decision.kind === 'reject') return [];
    const values = decision.values ?? record.values;
    return values ? [{ key, values }] : [];
  });
  return (
    <div className="grid gap-4">
      <Lede>
        What the decided proposal would write
        {output ? (
          <>
            {' '}
            to the <span className="font-medium">{output.tab}</span> tab
          </>
        ) : null}
        , cell by cell.
      </Lede>
      <p className="text-dense">
        Approved {count('approve')}, changed {count('change')}, rejected{' '}
        {count('reject')}.{' '}
        <span className="text-muted">
          {writes.length
            ? `${plural(writes.length, 'row')} to write.`
            : 'Nothing to write.'}
        </span>
      </p>
      {writes.length ? (
        <DataTable>
          <div className="min-w-0 overflow-x-auto">
            <table className="text-dense w-full border-separate border-spacing-0">
              <caption className="sr-only">
                What would be written, before and after
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={cx(DATA_TABLE_HEAD, 'pr-3 pl-4 text-left')}
                  >
                    {output?.key ?? 'Record'}
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
                  {FIELDS.map((field) => (
                    <th
                      key={field.id}
                      scope="col"
                      className={cx(DATA_TABLE_HEAD, 'pr-4 pl-3 text-right')}
                    >
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {writes.map(({ key, values }, index) => (
                  <tr key={key}>
                    <th
                      scope="row"
                      className={cx(
                        'py-2.75 pr-3 pl-4 text-left font-normal whitespace-nowrap',
                        index > 0 && DATA_TABLE_RULE,
                      )}
                    >
                      <span className={DATA_TABLE_NAME}>{key}</span>
                      {names[key] ? (
                        <span className={DATA_TABLE_NAME_UNDER}>
                          {names[key]}
                        </span>
                      ) : null}
                    </th>
                    <td
                      className={cx(
                        DATA_TABLE_NAME_COLUMN,
                        'text-muted py-2.75 pr-3',
                        index > 0 && DATA_TABLE_RULE_ON,
                      )}
                    >
                      {names[key] ?? null}
                    </td>
                    {FIELDS.map((field) => (
                      <td
                        key={field.id}
                        className={cx(
                          'value py-2.75 pr-4 pl-3 text-right tabular-nums',
                          index > 0 && DATA_TABLE_RULE_ON,
                        )}
                      >
                        {/* The output tab is not part of the read yet, so
                            every cell is new. */}
                        <span className="text-muted">—</span>{' '}
                        <span aria-hidden className="text-muted">
                          →
                        </span>
                        <span className="sr-only">becomes</span>{' '}
                        <span className="font-medium">{values[field.id]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      ) : null}
      <p className="text-meta text-muted">
        Nothing is written to the sheet yet.
      </p>
    </div>
  );
}
