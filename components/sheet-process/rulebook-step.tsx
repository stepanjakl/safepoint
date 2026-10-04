'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import { MODEL_IDS } from '@/lib/model-workbench/models';
import type { Draft } from '@/lib/rulebook/draft';
import type { ApprovedRulebook } from '@/lib/rulebook/schema';

import { RulebookView } from './rulebook-view';
import {
  Code,
  DataTable,
  Disclosure,
  JsonBlock,
  Mark,
  TrialControl,
  TrialSection,
  clock,
  td,
  th,
  useTrial,
} from './trial-parts';

type DraftResponse =
  | { kind: 'result'; source: string; draft: Draft }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string; runId?: string };

type ApproveResponse =
  | { kind: 'result'; version: number; file: string }
  | { kind: 'error'; message: string; issues?: unknown };

export function RulebookStep({
  active,
  trial,
}: {
  active: ApprovedRulebook | null;
  trial: ReactNode;
}) {
  const router = useRouter();
  const drafting = useTrial<DraftResponse>('/api/dev/brunch/draft');
  const approving = useTrial<ApproveResponse>('/api/dev/brunch/approve');
  const [model, setModel] =
    useState<(typeof MODEL_IDS)[number]>('gemini-3.7-flash');
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const name = useId();
  const body = drafting.state.kind === 'done' ? drafting.state.body : null;
  const draft = body?.kind === 'result' ? body.draft : null;
  const approved =
    approving.state.kind === 'done' && approving.state.body.kind === 'result'
      ? approving.state.body
      : null;

  return (
    <div className="grid gap-4">
      <p className="text-dense">
        The rules are not written into the app. A model reads the sheet and
        drafts a rulebook: how to read each tab, how the week is timed, what can
        change, what to calculate and which rules apply, all in standard CEL.
        The app checks every part, and nothing is used until you approve it. The
        Checks tab is never shown to the model.
      </p>

      <TrialSection title="Approved rulebook">
        {active ? (
          <>
            <Ledger className="enclosure">
              <LedgerRow label="Version">
                v{active.version}, approved {clock(active.approved_at)} on{' '}
                {active.approved_at.slice(0, 10)}
              </LedgerRow>
              <LedgerRow label="Drafted by">
                {active.drafted.model}, run <Code>{active.drafted.run_id}</Code>
              </LedgerRow>
              <LedgerRow label="Stored in">
                <Code>{`fixtures/avocado-toast/rulebooks/v${active.version}.json`}</Code>
              </LedgerRow>
            </Ledger>
            <Disclosure summary="Read the approved rulebook">
              <RulebookView rulebook={active.rulebook} />
            </Disclosure>
          </>
        ) : (
          <p className="text-dense text-muted">None yet. Draft one below.</p>
        )}
      </TrialSection>

      <TrialSection title="Draft a rulebook">
        <div className="flex flex-wrap gap-6">
          <fieldset className="grid gap-1">
            <legend className="text-dense font-semibold">Model</legend>
            {MODEL_IDS.map((id) => (
              <label key={id} className="text-dense flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${name}-model`}
                  checked={model === id}
                  onChange={() => setModel(id)}
                />
                {id}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className="text-dense font-semibold">Sheet data</legend>
            <label className="text-dense flex items-center gap-1.5">
              <input
                type="radio"
                name={`${name}-source`}
                checked={source === 'captured'}
                onChange={() => setSource('captured')}
              />
              The captured read
            </label>
            <label className="text-dense flex items-center gap-1.5">
              <input
                type="radio"
                name={`${name}-source`}
                checked={source === 'live'}
                onChange={() => setSource('live')}
              />
              A live read
            </label>
          </fieldset>
        </div>
        <TrialControl
          label="Draft rulebook"
          runningLabel="Drafting… (a minute or two)"
          state={drafting.state}
          onRun={() => void drafting.run({ model, source })}
          summary={
            draft
              ? draft.rulebook
                ? `Drafted in ${draft.stages.length} stages and passes every check`
                : `Not usable yet: ${draft.issues.length} problems remain`
              : body?.kind === 'not_configured'
                ? `Missing ${body.missing.join(', ')}`
                : body?.kind === 'error'
                  ? body.message
                  : null
          }
        />
      </TrialSection>

      {draft ? <DraftDetail draft={draft} /> : null}

      {draft?.rulebook ? (
        <TrialSection title="Approve">
          <p className="text-dense">
            Approving saves this draft as v{(active?.version ?? 0) + 1} in the
            repository. It is checked once more against the sheet first.
            Calculate and Check then use it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              isDisabled={
                approving.state.kind === 'running' || Boolean(approved)
              }
              onPress={() =>
                void approving
                  .run({
                    rulebook: draft.rulebook,
                    drafted: {
                      model: draft.model,
                      run_id: draft.runId,
                      at: draft.startedAt,
                    },
                    source,
                  })
                  .then(() => router.refresh())
              }
            >
              Approve as v{(active?.version ?? 0) + 1}
            </Button>
            <p role="status" className="text-meta text-muted">
              {approving.state.kind === 'running'
                ? 'Checking and saving…'
                : approving.state.kind === 'done'
                  ? approving.state.body.kind === 'result'
                    ? `Saved as v${approving.state.body.version} in ${approving.state.body.file}. Commit it to keep it.`
                    : approving.state.body.message
                  : ''}
            </p>
          </div>
        </TrialSection>
      ) : null}

      <Disclosure summary="Phase 0 record: the formula engine trial">
        {trial}
      </Disclosure>
    </div>
  );
}

function DraftDetail({ draft }: { draft: Draft }) {
  const tokens = draft.stages.reduce(
    (sum, s) => ({
      input: sum.input + (s.usage.inputTokens ?? 0),
      output: sum.output + (s.usage.outputTokens ?? 0),
    }),
    { input: 0, output: 0 },
  );
  return (
    <div className="grid gap-5">
      <TrialSection title="How it was drafted">
        <Ledger className="enclosure">
          <LedgerRow label="Model">{draft.model}</LedgerRow>
          <LedgerRow label="Run">
            <Code>{draft.runId}</Code>, {(draft.durationMs / 1000).toFixed(1)}{' '}
            s, {tokens.input.toLocaleString('en-GB')} tokens in,{' '}
            {tokens.output.toLocaleString('en-GB')} out
          </LedgerRow>
        </Ledger>
        <DataTable caption="Drafting stages">
          <thead>
            <tr>
              <th className={th}>Stage</th>
              <th className={th}>Took</th>
              <th className={th}>Tool calls</th>
              <th className={th}>Checks</th>
            </tr>
          </thead>
          <tbody>
            {draft.stages.map((s) => (
              <tr key={`${s.stage}-${s.attempt}`}>
                <td className={td}>
                  {s.stage === 'data_model' ? '1. Data model' : '2. Rules'} ·
                  attempt {s.attempt}
                </td>
                <td className={td}>{(s.durationMs / 1000).toFixed(1)} s</td>
                <td className={td}>{s.toolCalls.length}</td>
                <td className={td}>
                  <Mark passed={s.issues.length === 0}>
                    {s.issues.length ? `${s.issues.length} problems` : 'Passed'}
                  </Mark>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {draft.stages.map((s) => (
          <Disclosure
            key={`${s.stage}-${s.attempt}-detail`}
            summary={`${s.stage === 'data_model' ? 'Data model' : 'Rules'}, attempt ${s.attempt}: everything sent and received`}
          >
            {s.issues.length ? (
              <ul className="text-meta grid gap-1">
                {s.issues.map((issue, i) => (
                  <li key={i}>
                    <Mark passed={false}>{issue.where}</Mark> {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {s.toolCalls.length ? (
              <DataTable
                caption={`Tool calls, ${s.stage} attempt ${s.attempt}`}
              >
                <thead>
                  <tr>
                    <th className={th}>Tool</th>
                    <th className={th}>Formula</th>
                    <th className={th}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {s.toolCalls.map((call, i) => {
                    const input = call.input as {
                      kind?: string;
                      key?: string;
                      expression?: string;
                    };
                    const output = call.output as {
                      ok?: boolean;
                      type?: string;
                      value?: string;
                      error?: string;
                    } | null;
                    return (
                      <tr key={i}>
                        <td className={td}>
                          {call.tool}{' '}
                          <span className="text-muted">
                            {[input.kind, input.key]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </td>
                        <td className={td}>
                          <Code>{input.expression}</Code>
                        </td>
                        <td className={td}>
                          <Mark passed={output?.ok ?? false}>
                            {output?.ok
                              ? (output.type ?? output.value)
                              : output?.error}
                          </Mark>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            ) : null}
            <Disclosure summary="Instructions sent">
              <pre className="bg-surface-inset rounded-control readout max-w-full overflow-auto p-3 whitespace-pre-wrap">
                {s.instructions}
              </pre>
            </Disclosure>
            <Disclosure summary="Input sent">
              <JsonBlock label="Input sent to the model" value={s.input} />
            </Disclosure>
            <Disclosure summary="Answer received">
              <JsonBlock label="Answer from the model" value={s.output} />
            </Disclosure>
          </Disclosure>
        ))}
      </TrialSection>

      {draft.rulebook ? (
        <TrialSection title="The draft">
          <RulebookView rulebook={draft.rulebook} />
        </TrialSection>
      ) : (
        <TrialSection title="Remaining problems">
          <ul className="text-meta grid gap-1">
            {draft.issues.map((issue, i) => (
              <li key={i}>
                <Mark passed={false}>{issue.where}</Mark> {issue.message}
              </li>
            ))}
          </ul>
        </TrialSection>
      )}
    </div>
  );
}
