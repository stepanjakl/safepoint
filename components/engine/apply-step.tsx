'use client';

import { useMutation } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useRef, useState } from 'react';

import type { RunProcessId } from '@/components/app-shell/runs/kept-runs';
import { Lede, plural, saidBy } from '@/components/engine/trial-parts';
import { useTRPC } from '@/components/trpc/provider';
import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_BODY,
  DATA_TABLE_HEAD,
  DATA_TABLE_NAME,
  DATA_TABLE_NAME_COLUMN,
  DATA_TABLE_NAME_UNDER,
  DATA_TABLE_SECONDARY_NAME,
  DATA_TABLE_RULE,
  DATA_TABLE_RULE_ON,
  DataTable,
} from '@/components/ui/data-table';
import { cx } from '@/lib/ui/cx';
import type { Application, CellChange } from '@/lib/engine/types';
import type { DefinitionSubject } from '@/lib/engine/subject';
import { sourceTermsOf } from '@/lib/sources/model';
import type { AppRouter } from '@/server/api/root';

import type { Decision } from './propose/types';

// What the procedures answer: the preview of what the decisions write (which
// is also what a refused write answers, so the screen shows why), the record
// of a write or an undo, or `stale` where the rulebook no longer fits the read.
type Replies = inferRouterOutputs<AppRouter>['application'];
type ApplyReply = Replies['preview'] | Replies['write'] | Replies['undo'];
type Preview = Extract<ApplyReply, { kind: 'preview' }>;

// What this run's write came to, for the step's mark.
export type ApplyProgress = { status: Application['status'] | null };

const STANDS: Application['status'][] = ['verified', 'mismatch'];

// What each result says, in the words of the source the write goes to.
const resultWords = (noun: string): Record<Application['status'], string> => ({
  pending: `Not confirmed yet: this write has not been read back from the ${noun}.`,
  verified: `Written, and read back from the ${noun} as written.`,
  mismatch: `Written, but the ${noun} reads back differently. Check the cells below.`,
  failed: `The write did not land, so the ${noun} is as it was.`,
  undone: 'Undone: the cells are back as they were.',
});

const NO_LONGER_FIT =
  'The rules this run used no longer fit its read. Go back to Propose.';

/*
  Apply: what the decided proposal writes to the output the process declares,
  cell by cell, read from the source as it is now. The server decides whether it
  can be written and works out what it writes; this only asks. A person
  confirms the write, sees it read back, and can undo it while the cells hold
  what was written.
*/
export function ApplyStep({
  subject,
  run,
  decisions,
  onProgress,
}: {
  // The process's subject: what it writes, and to which output.
  subject: DefinitionSubject;
  // The run that writes, by the id the server gave it: the server reads its
  // text, read, rulebook and current decisions itself.
  run: { process: RunProcessId; runId: string };
  // What the server holds of the decisions, for the counts and for asking the
  // preview again when one changes.
  decisions: Record<string, Decision>;
  onProgress: (progress: ApplyProgress) => void;
}) {
  const trpc = useTRPC();
  // What reaches the sheet is never retried: it could happen twice.
  const previewing = useMutation(trpc.application.preview.mutationOptions());
  const writing = useMutation(
    trpc.application.write.mutationOptions({ retry: false }),
  );
  const undoing = useMutation(
    trpc.application.undo.mutationOptions({ retry: false }),
  );
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

  const answer = (reply: ApplyReply) => {
    setFailure(null);
    if (reply.kind === 'stale') return setFailure(NO_LONGER_FIT);
    if (reply.kind === 'preview') setPreview(reply);
    setApplication(reply.application);
    report.current({ status: reply.application?.status ?? null });
  };
  // What the server said where it would not do it; a request that got no
  // answer is only said to have failed. What follows the answer (`then`) is
  // done in the same turn, so the screen changes once: focus goes where the
  // answer puts the button it is for.
  const settle = (
    asked: Promise<ApplyReply>,
    then?: (reply: ApplyReply | null) => void,
  ) =>
    void asked.then(
      (reply) => {
        answer(reply);
        then?.(reply);
      },
      (error: unknown) => {
        setFailure(saidBy(error) ?? 'The request failed.');
        then?.(null);
      },
    );

  const askPreview = () => settle(previewing.mutateAsync(run));

  // When each record was decided: a decision changed or made again is a new
  // time, so the preview is asked again whenever what is decided changes.
  const decidedKey = JSON.stringify(
    Object.entries(decisions).map(([key, one]) => [key, one.at]),
  );
  useEffect(() => {
    askPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.process, run.runId, decidedKey]);

  const write = (acknowledged: string[]) => {
    setConfirming(false);
    setActing(true);
    settle(writing.mutateAsync({ ...run, acknowledged }), () => {
      setActing(false);
      setActed(true);
    });
  };
  const undo = () => {
    setActing(true);
    settle(undoing.mutateAsync(run), (reply) => {
      setActing(false);
      setActed(true);
      // A refused undo keeps its message: only a real one changes the cells.
      if (reply?.kind === 'applied') askPreview();
    });
  };

  const standing = application && STANDS.includes(application.status);
  // Begun and not read back: it may have written, so it is not offered again.
  const unconfirmed = application?.status === 'pending';
  const output = subject.data.output;
  const { noun, resource } = sourceTermsOf(subject.data.source);
  const count = (kind: Decision['kind']) =>
    Object.values(decisions).filter((d) => d.kind === kind).length;
  const changes =
    standing || unconfirmed ? application.changes : (preview?.changes ?? []);
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
            to the <span className="font-medium">{output.tab}</span>{' '}
            {resource.singular}
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
        {application ? resultWords(noun)[application.status] : null}
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
      ) : unconfirmed ? null : (
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
                    Write to the {noun}
                  </Button>
                  <Button onPress={() => setConfirming(false)}>Cancel</Button>
                  <span className="text-meta text-muted">
                    {preview.tabExists
                      ? `Changes ${plural(rows, 'row')} on the ${preview.tab} ${resource.singular}.`
                      : `Adds the ${preview.tab} ${resource.singular}, with ${plural(rows, 'row')}.`}
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
        <table className={DATA_TABLE_BODY}>
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
                    DATA_TABLE_SECONDARY_NAME,
                    'py-2.75 pr-3',
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
