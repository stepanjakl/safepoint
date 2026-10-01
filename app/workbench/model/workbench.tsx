'use client';

import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import type { LinePreview } from '@/lib/model-workbench/line';
import {
  MODEL_IDS,
  modelIdSchema,
  type ModelId,
} from '@/lib/model-workbench/models';
import { skuSchema, type Sku } from '@/lib/promotion-release/schemas';

const responseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('result'),
    result: z.strictObject({
      runId: z.string(),
      model: z.string(),
      sku: skuSchema,
      instructionVersion: z.string(),
      durationMs: z.number(),
      input: z.unknown(),
      output: z.unknown(),
      suggestion: z
        .strictObject({
          sku: skuSchema,
          recommendation: z.enum(['release', 'adjust', 'hold', 'exclude']),
          proposedPricePence: z.number().nullable(),
          proposedTopUpUnits: z.number().nullable(),
          rationale: z.string(),
          uncertainties: z.array(z.string()),
          evidenceRefs: z.array(z.string()),
          selfReportedCertainty: z.enum(['low', 'medium', 'high']),
        })
        .nullable(),
      issues: z.array(z.string()),
      policy: z
        .strictObject({
          basis: z.enum(['brief_baseline', 'model_proposal']),
          pricePence: z.number(),
          topUpUnits: z.number(),
          marginPercent: z.number(),
          verdict: z.enum(['blocked', 'review_required', 'passes_checks']),
          checks: z.array(
            z.strictObject({
              code: z.string(),
              status: z.enum(['pass', 'attention', 'block']),
              message: z.string(),
              evidenceRefs: z.array(z.string()),
            }),
          ),
        })
        .nullable(),
      usage: z.nullable(
        z.strictObject({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
        }),
      ),
      finishReason: z.string().nullable(),
    }),
  }),
  z.strictObject({
    kind: z.literal('error'),
    message: z.string(),
    runId: z.string().optional(),
    stage: z.string().optional(),
  }),
]);

type ResponseData = z.infer<typeof responseSchema>;

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-surface-inset border-rule-default rounded-control max-w-full min-w-0 overflow-auto border p-4 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="readout text-muted">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}

const SECTION =
  'bg-surface-floating border-rule-default rounded-shell grid min-w-0 content-start gap-4 border p-5';

type ReviewedBaseline = {
  sku: Sku;
  recommendation: 'release' | 'adjust' | 'hold' | 'exclude';
  eligibility: 'eligible' | 'blocked';
};

export function ModelWorkbench({
  keyConfigured,
  previews,
  baselines,
}: {
  keyConfigured: boolean;
  previews: LinePreview[];
  baselines: ReviewedBaseline[];
}) {
  const [selectedModel, setSelectedModel] = useState<ModelId>(MODEL_IDS[0]);
  const [selectedSku, setSelectedSku] = useState<Sku>('ALD-0001');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [data, setData] = useState<ResponseData | null>(null);
  const preview = previews.find(({ sku }) => sku === selectedSku);
  if (!preview) return null;
  const baseline = baselines.find(({ sku }) => sku === selectedSku);

  async function run() {
    setRunning(true);
    setStatus(`Reviewing ${selectedSku} with ${selectedModel}.`);
    setData(null);
    try {
      const response = await fetch('/api/dev/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, sku: selectedSku }),
      });
      const parsed = responseSchema.parse(await response.json());
      setData(parsed);
      setStatus(
        parsed.kind === 'error'
          ? `Model request failed at ${parsed.stage ?? 'request'} stage.`
          : parsed.result.issues.length > 0
            ? `Review finished with ${parsed.result.issues.length} contract issue${parsed.result.issues.length === 1 ? '' : 's'}.`
            : `Review finished for ${selectedSku}. Release checks: ${parsed.result.policy?.verdict.replaceAll('_', ' ') ?? 'unavailable'}.`,
      );
    } catch {
      setStatus('Model request failed or returned an unreadable response.');
    } finally {
      setRunning(false);
    }
  }

  const result = data?.kind === 'result' ? data.result : null;
  const suggestion = result?.suggestion;
  const policy = result?.policy;
  const concerningChecks = policy?.checks.filter(
    ({ status }) => status !== 'pass',
  );
  const passingChecks = policy?.checks.filter(
    ({ status }) => status === 'pass',
  );

  return (
    <main
      id="main"
      className="bg-canvas text-primary min-h-dvh px-4 py-8 sm:px-6"
    >
      <div className="mx-auto grid max-w-6xl min-w-0 gap-6">
        <header className="grid gap-2">
          <p className="readout text-muted">
            Development workbench · read only
          </p>
          <h1 className="text-display font-semibold">
            One product, one review
          </h1>
          <p className="text-body text-muted max-w-3xl">
            Follow the source facts, the model&rsquo;s suggestion, and
            independent release checks for one synthetic promotion candidate. No
            database or Google Sheet is changed.
          </p>
          <p className="text-meta text-muted">
            Scenario review time: {preview.input.campaign.reviewAt}
          </p>
        </header>

        <section className={SECTION} aria-label="Run controls">
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <label htmlFor="model-workbench-sku" className="text-meta">
                Product
              </label>
              <select
                id="model-workbench-sku"
                className="field rounded-control px-3 py-2"
                value={selectedSku}
                onChange={(event) => {
                  setSelectedSku(skuSchema.parse(event.target.value));
                  setData(null);
                  setStatus('');
                }}
                disabled={running}
              >
                {previews.map(({ sku, productName }) => (
                  <option key={sku} value={sku}>
                    {productName} · {sku}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="model-workbench-choice" className="text-meta">
                Model
              </label>
              <select
                id="model-workbench-choice"
                className="field rounded-control px-3 py-2"
                value={selectedModel}
                onChange={(event) => {
                  setSelectedModel(modelIdSchema.parse(event.target.value));
                  setData(null);
                  setStatus('');
                }}
                disabled={running}
              >
                {MODEL_IDS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              onPress={run}
              isDisabled={running || !keyConfigured}
            >
              {running ? 'Reviewing…' : 'Run model review'}
            </Button>
          </div>
          <p className="text-meta text-muted">
            {keyConfigured
              ? 'The Google API key is configured on the server.'
              : 'Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local, then restart pnpm dev.'}
          </p>
        </section>

        <p role="status" className="text-meta text-muted min-h-6">
          {status}
        </p>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={SECTION} aria-labelledby="source-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">1 · Source facts</p>
              <h2 id="source-heading" className="text-title font-semibold">
                {preview.productName} · {preview.sku}
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail
                label="Candidate status"
                value={preview.input.candidate.status}
              />
              <Detail
                label="Intended price"
                value={money(preview.input.candidate.intendedPricePence)}
              />
              <Detail
                label="Regular price"
                value={money(preview.input.product.regularPricePence)}
              />
              <Detail
                label="Unit cost"
                value={money(preview.input.product.costPence)}
              />
              <Detail
                label="Forecast demand"
                value={
                  preview.input.demand.kind === 'available'
                    ? `${preview.input.demand.forecastUnits} units`
                    : 'Unavailable'
                }
              />
              <Detail
                label="Stock before top-up"
                value={
                  preview.input.supply.kind === 'available'
                    ? `${preview.input.supply.availableBeforeLaunchUnits} units`
                    : 'Unavailable'
                }
              />
              <Detail
                label="Remaining shortfall"
                value={
                  preview.input.supply.kind === 'available' &&
                  preview.input.supply.shortfallUnits !== null
                    ? `${preview.input.supply.shortfallUnits} units`
                    : 'Unknown'
                }
              />
              <Detail
                label="Confirmed extra stock"
                value={`${preview.input.supplier.confirmedAllocationUnits} units`}
              />
              <Detail
                label="Supplier lead time"
                value={`${preview.input.supplier.leadTimeHours} hours`}
              />
            </dl>
            <p className="text-meta text-muted">
              Source forecast confidence:{' '}
              {preview.input.demand.kind === 'available'
                ? preview.input.demand.sourceConfidence
                : 'unavailable'}
              . This describes the forecast source, not the model.
            </p>
            <p className="text-meta text-muted">
              Price: {preview.input.product.evidenceId} · Demand:{' '}
              {preview.input.demand.evidenceId} · Stock:{' '}
              {preview.input.supply.evidenceId} · Supplier:{' '}
              {preview.input.supplier.evidenceId}
            </p>
            {preview.input.notes.length > 0 ? (
              <div className="border-rule-default grid gap-2 border-t pt-4">
                <h3 className="text-meta font-semibold">Relevant notes</h3>
                {preview.input.notes.map((note) => (
                  <p key={note.evidenceId} className="text-meta">
                    {note.text}{' '}
                    <span className="text-muted">({note.evidenceId})</span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className={SECTION} aria-labelledby="proposal-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">2 · Model suggestion</p>
              <h2 id="proposal-heading" className="text-title font-semibold">
                {suggestion
                  ? suggestion.recommendation
                  : result
                    ? 'No valid suggestion'
                    : 'Run a review to see a suggestion'}
              </h2>
            </div>
            {suggestion ? (
              <div className="grid gap-4">
                <p className="text-body">{suggestion.rationale}</p>
                <dl className="grid grid-cols-2 gap-4">
                  <Detail
                    label="Proposed price"
                    value={
                      suggestion.proposedPricePence === null
                        ? 'No proposal'
                        : money(suggestion.proposedPricePence)
                    }
                  />
                  <Detail
                    label="Proposed top-up"
                    value={
                      suggestion.proposedTopUpUnits === null
                        ? 'No proposal'
                        : `${suggestion.proposedTopUpUnits} units`
                    }
                  />
                </dl>
                <div className="grid gap-1">
                  <h3 className="text-meta font-semibold">Uncertainties</h3>
                  {suggestion.uncertainties.length ? (
                    <ul className="text-meta list-disc pl-5">
                      {suggestion.uncertainties.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-meta text-muted">None stated.</p>
                  )}
                </div>
                <div className="grid gap-1">
                  <h3 className="text-meta font-semibold">Cited sources</h3>
                  <ul className="text-meta grid gap-1">
                    {suggestion.evidenceRefs.map((id) => (
                      <li key={id}>
                        {preview.sources.find(
                          ({ value }) => value.evidenceId === id,
                        )?.name ?? id}{' '}
                        <span className="text-muted">({id})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-meta text-muted">
                    Citation IDs are checked; whether the cited text supports
                    each claim still needs review.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-meta text-muted">
                The model&rsquo;s suggestion remains separate from the release
                checks below.
              </p>
            )}
          </section>

          <section className={SECTION} aria-labelledby="checks-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">3 · Independent checks</p>
              <h2 id="checks-heading" className="text-title font-semibold">
                {policy
                  ? policy.verdict.replaceAll('_', ' ')
                  : 'Waiting for a valid suggestion'}
              </h2>
            </div>
            {result?.issues.length ? (
              <div className="grid gap-1">
                <h3 className="text-meta font-semibold">Contract issues</h3>
                <ul className="text-meta list-disc pl-5">
                  {result.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {policy ? (
              <div className="grid gap-4">
                <p className="text-meta text-muted">
                  Checked the{' '}
                  {policy.basis === 'model_proposal'
                    ? 'model’s proposed price and top-up'
                    : 'brief price and calculated baseline top-up'}
                  . This is a diagnostic result, not release approval.
                </p>
                <dl className="grid grid-cols-3 gap-3">
                  <Detail
                    label="Checked price"
                    value={money(policy.pricePence)}
                  />
                  <Detail
                    label="Checked top-up"
                    value={`${policy.topUpUnits} units`}
                  />
                  <Detail
                    label="Funded margin"
                    value={`${policy.marginPercent}%`}
                  />
                </dl>
                {concerningChecks?.length ? (
                  <ul className="grid gap-2">
                    {concerningChecks.map((check) => (
                      <li
                        key={check.code}
                        className="border-rule-default rounded-control border p-3"
                      >
                        <strong className="text-meta capitalize">
                          {check.status} · {check.code.replaceAll('_', ' ')}
                        </strong>
                        <p className="text-meta">{check.message}</p>
                        <p className="text-micro text-muted">
                          {check.evidenceRefs.join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-meta">No blocking or attention checks.</p>
                )}
                {passingChecks?.length ? (
                  <details className="text-meta">
                    <summary className="cursor-pointer">
                      {passingChecks.length} passing checks
                    </summary>
                    <ul className="mt-2 grid gap-2">
                      {passingChecks.map((check) => (
                        <li key={check.code}>
                          <strong>{check.code.replaceAll('_', ' ')}:</strong>{' '}
                          {check.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={SECTION} aria-labelledby="diagnostics-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">4 · Developer diagnostics</p>
              <h2 id="diagnostics-heading" className="text-title font-semibold">
                Exact inputs and outputs
              </h2>
              <p className="text-meta text-muted">
                This page keeps the latest result until reload. Local AI SDK
                traces remain in .devtools/generations.json. Run pnpm exec
                devtools from this project to inspect them.
              </p>
            </div>
            {result ? (
              <div className="grid gap-3">
                <p className="text-meta">
                  Run {result.runId} · {result.model} · {result.durationMs} ms ·{' '}
                  {result.usage?.inputTokens ?? 'unknown'} input tokens ·{' '}
                  {result.usage?.outputTokens ?? 'unknown'} output tokens
                </p>
                <p className="text-meta">
                  {result.instructionVersion} · finish{' '}
                  {result.finishReason ?? 'unknown'} · model-reported certainty{' '}
                  {suggestion?.selfReportedCertainty ?? 'unavailable'}
                </p>
                <p className="text-meta text-muted">
                  Model certainty is uncalibrated and has no effect on the rule
                  verdict.
                </p>
                {baseline ? (
                  <p className="text-meta">
                    Reviewed replay: {baseline.recommendation} · static policy{' '}
                    {baseline.eligibility}.{' '}
                    {suggestion
                      ? suggestion.recommendation === baseline.recommendation
                        ? 'Model recommendation matches.'
                        : 'Model recommendation differs.'
                      : 'No valid model recommendation to compare.'}
                  </p>
                ) : null}
              </div>
            ) : null}
            {data?.kind === 'error' ? (
              <div className="text-meta grid gap-1">
                <p>{data.message}</p>
                {data.runId ? <p>Run {data.runId}</p> : null}
              </div>
            ) : null}
            <details className="text-meta min-w-0">
              <summary className="cursor-pointer">Source records</summary>
              <JsonBlock value={preview.sources} />
            </details>
            <details className="text-meta min-w-0">
              <summary className="cursor-pointer">Model input JSON</summary>
              <JsonBlock value={result?.input ?? preview.input} />
            </details>
            {result ? (
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">Model output JSON</summary>
                <JsonBlock value={result.output} />
              </details>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
