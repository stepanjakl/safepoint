'use client';

import { useEffect, useRef, useState } from 'react';

import { Lede, plural, useTrial } from '@/components/brunch-orders/trial-parts';
import { Button } from '@/components/ui/button';
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
import type { Application, CellChange } from '@/lib/definitions/types';
import type { DefinitionSubject } from '@/lib/process/model';

import type { Decision, Evaluation } from './propose-step';

type NewlyFailing = { id: string; key: string; check: string };

type Preview = {
  kind: 'preview';
  tab: string;
  names: Record<string, string>;
  // Why this run cannot write, when it cannot.
  notWritable: string | null;
  tabExists: boolean;
  changes: CellChange[];
  problems: string[];
  newlyFailing: NewlyFailing[];
  application: Application | null;
};

type ApplyReply =
  | Preview
  | { kind: 'applied'; application: Application }
  | { kind: 'stale' }
  | { kind: 'error'; message: string };

// What this run's write came to, for the step's mark.
export type ApplyProgress = { status: Application['status'] | null };

const STANDS: Application['status'][] = ['verified', 'mismatch'];

const RESULT: Record<Application['status'], string> = {
  verified: 'Written, and read back from the sheet as written.',
  mismatch:
    'Written, but the sheet reads back differently. Check the cells below.',
  failed: 'The write did not land, so the sheet is as it was.',
  undone: 'Undone: the cells are back as they were.',
};

const NO_LONGER_FIT =
  'The rules this run used no longer fit its read. Go back to Propose.';

/*
  Apply: what the decided proposal writes to the output the process declares,
  cell by cell, read from the sheet as it is now. The server decides whether it
  can be written and works out what it writes; this only asks. A person
  confirms the write, sees it read back, and can undo it while the cells hold
  what was written.
*/
export function ApplyStep({
  subject,
  text,
  readId,
  rulebook,
  evaluation = 'rules',
  proposedAt,
  decisions,
  onProgress,
}: {
  // The process's subject: what it writes, and to which output.
  subject: DefinitionSubject;
  text: string;
  readId: string;
  rulebook: string;
  evaluation?: Evaluation;
  proposedAt: string;
  decisions: Record<string, Decision>;
  onProgress: (progress: ApplyProgress) => void;
}) {
  const apply = useTrial<ApplyReply>('/api/dev/brunch-orders/apply');
  const { run } = apply;
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A write or undo under way. A preview refreshing behind it disables nothing,
  // since that would drop focus from the button it lands on.
  const [acting, setActing] = useState(false);
  // Where focus goes once the button a person pressed has gone.
  const [acted, setActed] = useState(false);

  const answer = (reply: ApplyReply | null) => {
    if (!reply) return setFailure('The request failed.');
    setFailure(null);
    if (reply.kind === 'error') return setFailure(reply.message);
    if (reply.kind === 'stale') return setFailure(NO_LONGER_FIT);
    if (reply.kind === 'preview') setPreview(reply);
    setApplication(reply.application);
    report.current({ status: reply.application?.status ?? null });
  };

  const request = (action: string, more: Record<string, unknown> = {}) =>
    run({ action, text, readId, rulebook, evaluation, ...more });
  const decided = { proposedAt, decisions: toSend(decisions) };
  const askPreview = () => request('preview', decided).then(answer);

  const decidedKey = JSON.stringify(decided);
  useEffect(() => {
    void askPreview();
    // Whenever the run or what was decided changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, readId, rulebook, evaluation, decidedKey]);

  const write = (acknowledged: string[]) => {
    setConfirming(false);
    setActing(true);
    void request('write', { ...decided, acknowledged }).then((reply) => {
      answer(reply);
      setActing(false);
      setActed(true);
    });
  };
  const undo = () => {
    setActing(true);
    void request('undo').then((reply) => {
      answer(reply);
      setActing(false);
      setActed(true);
      // A refused undo keeps its message: only a real one changes the cells.
      if (reply?.kind === 'applied') void askPreview();
    });
  };

  const standing = application && STANDS.includes(application.status);
  const output = subject.data.output;
  const count = (kind: Decision['kind']) =>
    Object.values(decisions).filter((d) => d.kind === kind).length;
  const changes = standing ? application.changes : (preview?.changes ?? []);
  const rows = new Set(changes.map((change) => change.key)).size;
  const held = preview?.newlyFailing ?? [];
  const refused = preview?.problems ?? [];
  const canWrite =
    preview && !preview.notWritable && rows > 0 && !refused.length;

  return (
    <div className="grid gap-4">
      <Lede>
        What the decided proposal writes
        {output ? (
          <>
            {' '}
            to the <span className="font-medium">{output.tab}</span> tab
          </>
        ) : null}
        , cell by cell. Nothing is written until you confirm it.
      </Lede>
      <p className="text-dense">
        Approved {count('approve')}, changed {count('change')}, rejected{' '}
        {count('reject')}.{' '}
        <span className="text-muted">
          {rows ? `${plural(rows, 'row')} to write.` : 'Nothing to write.'}
        </span>
      </p>
      {failure ? (
        <p role="alert" className="text-dense text-state-blocked">
          {failure}
        </p>
      ) : null}
      {changes.length ? (
        <ChangesTable
          fields={subject.proposal}
          changes={changes}
          names={preview?.names ?? {}}
          outputKey={output?.key}
          written={Boolean(standing)}
        />
      ) : null}
      <p role="status" className="text-dense">
        {application ? RESULT[application.status] : null}
        {application?.error && application.status !== 'undone'
          ? ` ${application.error}`
          : null}
      </p>
      {standing ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button isDisabled={acting} autoFocus={acted} onPress={undo}>
            Undo the write
          </Button>
          <span className="text-meta text-muted">
            Possible while the cells hold what was written.
          </span>
        </div>
      ) : preview?.notWritable ? (
        <p className="text-meta text-muted">{preview.notWritable}</p>
      ) : (
        <>
          {refused.length ? (
            <ul
              role="alert"
              className="text-dense text-state-blocked grid gap-1"
            >
              {refused.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {canWrite && held.length ? (
            <div className="grid gap-2">
              <p className="text-dense">
                Since you decided, these now ask for a person:
              </p>
              <ul className="text-dense grid gap-1">
                {held.map((failing) => (
                  <li key={failing.id}>
                    {failing.key}: {failing.check}
                  </li>
                ))}
              </ul>
              <div>
                <Button
                  isDisabled={acting}
                  onPress={() => write(held.map((failing) => failing.id))}
                >
                  Write them anyway
                </Button>
              </div>
            </div>
          ) : canWrite ? (
            <div className="flex flex-wrap items-center gap-3">
              {confirming ? (
                <>
                  <Button
                    variant="primary"
                    autoFocus
                    isDisabled={acting}
                    onPress={() => write([])}
                  >
                    Write to the sheet
                  </Button>
                  <Button onPress={() => setConfirming(false)}>Cancel</Button>
                  <span className="text-meta text-muted">
                    {preview.tabExists
                      ? `Changes ${plural(rows, 'row')} on the ${preview.tab} tab.`
                      : `Adds the ${preview.tab} tab, with ${plural(rows, 'row')}.`}
                  </span>
                </>
              ) : (
                <Button
                  variant="primary"
                  isDisabled={acting}
                  autoFocus={acted}
                  onPress={() => setConfirming(true)}
                >
                  Write {plural(rows, 'row')}
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Only what the server reads of a decision: it works out the rest itself.
function toSend(decisions: Record<string, Decision>) {
  return Object.fromEntries(
    Object.entries(decisions).map(([key, { kind, values, at }]) => [
      key,
      { kind, ...(values ? { values } : {}), at },
    ]),
  );
}

function ChangesTable({
  fields,
  changes,
  names,
  outputKey,
  written,
}: {
  fields: DefinitionSubject['proposal'];
  changes: CellChange[];
  names: Record<string, string>;
  outputKey: string | undefined;
  written: boolean;
}) {
  const keys = [...new Set(changes.map((change) => change.key))];
  return (
    <DataTable>
      <div className="min-w-0 overflow-x-auto">
        <table className="text-dense w-full border-separate border-spacing-0">
          <caption className="sr-only">
            {written
              ? 'What was written, before and after'
              : 'What would be written, before and after'}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, 'pr-3 pl-4 text-left')}
              >
                {outputKey ?? 'Record'}
              </th>
              <th
                scope="col"
                className={cx(DATA_TABLE_HEAD, DATA_TABLE_NAME_COLUMN, 'pr-3')}
              >
                <span className="sr-only">Name</span>
              </th>
              {fields.map((field) => (
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
            {keys.map((key, index) => (
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
                    <span className={DATA_TABLE_NAME_UNDER}>{names[key]}</span>
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
                {fields.map((field) => {
                  const change = changes.find(
                    (c) => c.key === key && c.field === field.id,
                  );
                  return (
                    <td
                      key={field.id}
                      title={change?.cell}
                      className={cx(
                        'value py-2.75 pr-4 pl-3 text-right tabular-nums',
                        index > 0 && DATA_TABLE_RULE_ON,
                      )}
                    >
                      <span className="text-muted">
                        {change?.before === null || change?.before === undefined
                          ? '—'
                          : String(change.before)}
                      </span>{' '}
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                      <span className="sr-only">becomes</span>{' '}
                      <span className="font-medium">{change?.after}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataTable>
  );
}
