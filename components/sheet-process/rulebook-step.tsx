'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { Draft, StageStop } from '@/lib/rulebook/draft';
import {
  DRAFTING_MODELS,
  strongerModel,
  type DraftingModel,
} from '@/lib/rulebook/models';
import type { ApprovedRulebook } from '@/lib/rulebook/schema';
import type { DraftRecord, DraftSummary } from '@/lib/rulebook/store';

import { OwnerChecks } from './check-step';
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
  | ({ kind: 'result'; saved: string | null } & DraftRecord)
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'error'; message: string; runId?: string };

type DraftsResponse =
  | { kind: 'list'; drafts: DraftSummary[] }
  | ({ kind: 'record'; file: string } & DraftRecord)
  | { kind: 'error'; message: string };

// The draft on screen: the one just made, or one opened from the list.
type Shown = DraftRecord & { saved: string | null; label: string };

const STOP_REASONS: Record<StageStop['reason'], string> = {
  limit: 'the attempt limit was reached without the problems falling',
  no_progress: 'the same problems came back',
  repeat: 'the model sent back the same answer',
};

const describeStop = (stop: StageStop) =>
  `${STAGE_NAMES[stop.stage]} gave up after ${stop.attempts} attempts with ${stop.problems} problems left: ${STOP_REASONS[stop.reason]}`;

const STAGE_NAMES: Record<Draft['stages'][number]['stage'], string> = {
  inventory: '1. Inventory',
  data_model: '2. Data model',
  logic: '3. Rules',
};

const ownerScore = (checks: DraftRecord['checks']) =>
  checks
    ? `${checks.results.filter((c) => c.passed).length} of ${checks.results.length} owner checks pass`
    : null;

type ApproveResponse =
  | { kind: 'result'; version: number; file: string }
  | { kind: 'error'; message: string; issues?: unknown };

export function RulebookStep({ active }: { active: ApprovedRulebook | null }) {
  const router = useRouter();
  const drafting = useTrial<DraftResponse>('/api/dev/brunch/draft');
  const approving = useTrial<ApproveResponse>('/api/dev/brunch/approve');
  const [model, setModel] = useState<DraftingModel>('gemini-3.8-flash');
  const [source, setSource] = useState<'captured' | 'live'>('captured');
  const [opened, setOpened] = useState<Shown | null>(null);
  const name = useId();
  const body = drafting.state.kind === 'done' ? drafting.state.body : null;
  const shown: Shown | null =
    opened ??
    (body?.kind === 'result'
      ? { ...body, label: 'The draft just made' }
      : null);
  const draft = shown?.draft ?? null;
  const approved =
    approving.state.kind === 'done' && approving.state.body.kind === 'result'
      ? approving.state.body
      : null;

  return (
    <div className="grid gap-4">
      <p className="text-dense">
        The rules are not written into the app. A model reads the sheet and
        drafts a rulebook: how to read each tab, how time is handled, what can
        change, what to calculate and which rules apply, in standard CEL. The
        app checks every part, and nothing is used until you approve it. The
        owner&rsquo;s tab of checks is never shown to the model.
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
            <legend className="text-dense font-semibold">
              Model, newest first
            </legend>
            {DRAFTING_MODELS.map((id) => (
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
            <span className="text-meta text-muted max-w-80">
              If the service is busy or out of quota for one, the draft moves to
              the next older model of the same family and records which model
              answered each step.
            </span>
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
          onRun={() => {
            setOpened(null);
            void drafting.run({ model, source });
          }}
          summary={
            body?.kind === 'result'
              ? body.draft.interrupted
                ? `Stopped: ${body.draft.interrupted}`
                : body.draft.stopped
                  ? `Stopped: ${describeStop(body.draft.stopped)}`
                  : body.draft.rulebook
                    ? `Passes the drafting checks after ${body.draft.stages.length} steps; ${ownerScore(body.checks) ?? 'no owner checks'}`
                    : `Not usable yet: ${body.draft.issues.length} problems remain`
              : body?.kind === 'not_configured'
                ? `Missing ${body.missing.join(', ')}`
                : body?.kind === 'error'
                  ? body.message
                  : null
          }
        />
      </TrialSection>

      <PastDrafts
        latest={
          drafting.state.kind === 'done' ? drafting.state.finishedAt : null
        }
        onOpen={setOpened}
      />

      {shown ? (
        <>
          <p className="text-dense">
            <strong>Showing: {shown.label}.</strong>{' '}
            {shown.saved ? (
              <>
                Its full record is <Code>{shown.saved}</Code> (not committed).
              </>
            ) : null}
          </p>
          <DraftDetail draft={shown.draft} />
          {shown.saved && !shown.draft.rulebook && shown.draft.stopped ? (
            <Escalate
              draft={shown.draft}
              file={shown.saved.split('/').pop()!}
              running={drafting.state.kind === 'running'}
              onRun={(stronger, file) => {
                setOpened(null);
                void drafting.run({ model: stronger, source, resume: file });
              }}
            />
          ) : null}
          {shown.checks ? (
            <OwnerChecks
              checks={shown.checks}
              title="The owner's checks on this draft"
            />
          ) : null}
        </>
      ) : null}

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
                      model: draft.models.join(', '),
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
          <LedgerRow label="Models">
            {draft.models.join(', then ') || draft.model}
          </LedgerRow>
          {draft.resumedFrom ? (
            <LedgerRow label="Continues">
              <Code>{draft.resumedFrom.file}</Code>, carrying over its{' '}
              {draft.resumedFrom.carried
                .map((stage) => STAGE_NAMES[stage])
                .join(' and ') || 'nothing'}
            </LedgerRow>
          ) : null}
          {draft.stopped ? (
            <LedgerRow label="Stopped">{describeStop(draft.stopped)}</LedgerRow>
          ) : null}
          <LedgerRow label="Run">
            <Code>{draft.runId}</Code>, {(draft.durationMs / 1000).toFixed(1)}{' '}
            s, {tokens.input.toLocaleString('en-GB')} tokens in,{' '}
            {tokens.output.toLocaleString('en-GB')} out
          </LedgerRow>
        </Ledger>
        <DataTable caption="Drafting stages">
          <thead>
            <tr>
              <th className={th}>Step</th>
              <th className={th}>Model</th>
              <th className={th}>Took</th>
              <th className={th}>Tool calls</th>
              <th className={th}>Checks</th>
            </tr>
          </thead>
          <tbody>
            {draft.stages.map((s, i) => (
              <tr key={i}>
                <td className={td}>
                  {STAGE_NAMES[s.stage]}
                  {s.round > 1 ? ', revised' : ''} · attempt {s.attempt}
                </td>
                <td className={td}>{s.model}</td>
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
        {draft.stages.map((s, i) => (
          <Disclosure
            key={i}
            summary={`${STAGE_NAMES[s.stage]}${s.round > 1 ? ', revised' : ''}, attempt ${s.attempt} (${s.model}): everything sent and received`}
          >
            {s.note ? <p className="text-meta">{s.note}</p> : null}
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
                    <th className={th}>Checked</th>
                    <th className={th}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {s.toolCalls.map((call, i) => {
                    const input = call.input as {
                      kind?: string;
                      key?: string;
                      expression?: string;
                      summary?: string;
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
                          {input.expression ? (
                            <Code>{input.expression}</Code>
                          ) : (
                            input.summary
                          )}
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

// Every saved draft, newest first, so runs can be compared and reopened.
function PastDrafts({
  latest,
  onOpen,
}: {
  latest: string | null;
  onOpen: (shown: Shown) => void;
}) {
  const listing = useTrial<DraftsResponse>('/api/dev/brunch/drafts');
  const opening = useTrial<DraftsResponse>('/api/dev/brunch/drafts');
  const list =
    listing.state.kind === 'done' && listing.state.body.kind === 'list'
      ? listing.state.body.drafts
      : null;
  return (
    <TrialSection title="Past drafts">
      <TrialControl
        label={latest ? 'List past drafts (refresh)' : 'List past drafts'}
        runningLabel="Listing…"
        state={listing.state}
        onRun={() => void listing.run({})}
        summary={list ? `${list.length} saved drafts` : null}
      />
      {list?.length ? (
        <DataTable caption="Past drafts, newest first">
          <thead>
            <tr>
              <th className={th}>Started</th>
              <th className={th}>Models</th>
              <th className={th}>Steps</th>
              <th className={th}>Result</th>
              <th className={th}>Owner checks</th>
              <th className={th}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.file}>
                <td className={td}>
                  {d.startedAt.slice(0, 10)} {clock(d.startedAt)}
                </td>
                <td className={td}>{d.models.join(', then ')}</td>
                <td className={td}>
                  {d.steps} in {(d.durationMs / 1000).toFixed(0)} s
                  {d.rounds > 1 ? ', revised once' : ''}
                  {d.resumed ? ', continued an earlier draft' : ''}
                </td>
                <td className={td}>
                  <Mark passed={d.passed}>
                    {d.passed
                      ? 'Passes'
                      : d.interrupted
                        ? 'Stopped by the service'
                        : d.stopped
                          ? `Gave up at ${STAGE_NAMES[d.stopped.stage]}: ${STOP_REASONS[d.stopped.reason]}`
                          : `${d.problems} problems`}
                  </Mark>
                </td>
                <td className={td}>
                  {d.checks ? `${d.checks.passed} of ${d.checks.total}` : '—'}
                </td>
                <td className={td}>
                  <Button
                    onPress={() =>
                      void opening.run({ file: d.file }).then((record) => {
                        if (record?.kind === 'record')
                          onOpen({
                            source: record.source,
                            draft: record.draft,
                            checks: record.checks,
                            saved: `.rulebook-drafts/avocado-toast/${record.file}`,
                            label: `the draft started ${record.draft.startedAt.slice(0, 10)} ${clock(record.draft.startedAt)}`,
                          });
                      })
                    }
                    isDisabled={opening.state.kind === 'running'}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      {opening.state.kind === 'done' && opening.state.body.kind === 'error' ? (
        <p className="text-meta">{opening.state.body.message}</p>
      ) : null}
    </TrialSection>
  );
}

// Offered, never automatic: a stuck draft continued by the strongest family,
// keeping every stage that already passed.
function Escalate({
  draft,
  file,
  running,
  onRun,
}: {
  draft: Draft;
  file: string;
  running: boolean;
  onRun: (model: DraftingModel, file: string) => void;
}) {
  const stronger = strongerModel(draft.models.at(-1) ?? draft.model);
  if (!stronger || !draft.stopped) return null;
  return (
    <TrialSection title="Try a stronger model">
      <p className="text-dense">
        {describeStop(draft.stopped)}. A stronger model can continue from{' '}
        {STAGE_NAMES[draft.stopped.stage]}, keeping the stages that passed. It
        uses that model&rsquo;s free quota, which is smaller.
      </p>
      <div>
        <Button isDisabled={running} onPress={() => onRun(stronger, file)}>
          Continue from {STAGE_NAMES[draft.stopped.stage]} with {stronger}
        </Button>
      </div>
    </TrialSection>
  );
}
