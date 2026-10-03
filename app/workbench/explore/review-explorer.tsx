'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { buildLinePreview } from '@/lib/model-workbench/line';
import { MODEL_IDS, type ModelId } from '@/lib/model-workbench/models';
import {
  modelWorkbenchResponseSchema,
  type ModelWorkbenchResponse,
} from '@/lib/model-workbench/response';
import {
  getLineFacts,
  type LinePolicyCheck,
  type LinePolicyProposal,
} from '@/lib/promotion-release/line-policy';
import { deriveFindingCodes } from '@/lib/promotion-release/review-policy';
import type {
  PolicyEvaluationReplay,
  PromotionReleasePlan,
  ScenarioEvidencePack,
  Sku,
} from '@/lib/promotion-release/schemas';
import { skuSchema } from '@/lib/promotion-release/schemas';
import {
  applyConfirmedFacts,
  captureLocalReview,
  localTrialSchema,
  localModelCallSchema,
  evaluateLabLine,
  localSimulationSchema,
  previewLocalEffects,
  simulateLocalApproval,
  type ConfirmedFacts,
  type SupplierFact,
  type LocalInput,
} from '@/lib/promotion-release/review-lab';
import {
  seedReviewRules,
  type ReviewRuleSet,
} from '@/lib/promotion-release/review-rules';

import { ReviewLabSetup } from './review-lab';
import { ModelEvaluation } from './model-evaluation';
import { DEFAULT_LAB_INPUT, useLocalReviewLab } from './local-lab-store';
import { labResponseSchema } from '@/lib/model-workbench/review-lab-contract';

type Baseline = {
  sku: Sku;
  eligibility: 'eligible' | 'blocked';
  findingCodes: ReturnType<typeof deriveFindingCodes>;
  reviewedPolicy: PolicyEvaluationReplay['candidates'][number];
};
type Comparison = 'recorded' | 'model' | 'trial';
type Draft = {
  sku: Sku;
  price: string;
  topUp: string;
  origin: 'recorded' | 'model';
};

const CARD =
  'bg-surface-floating ground-floating border-rule-default rounded-shell grid min-w-0 content-start gap-4 border p-5';
function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function readable(value: string): string {
  return value.replaceAll('_', ' ');
}

function proposalFor(
  candidate: PromotionReleasePlan['candidates'][number],
): LinePolicyProposal {
  return {
    sku: candidate.sku,
    proposedPricePence:
      candidate.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits:
      candidate.proposed?.recommendedTopUpQuantityUnits ?? null,
    proposedStartsAt: candidate.proposed?.startsAt ?? null,
    proposedEndsAt: candidate.proposed?.endsAt ?? null,
  };
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-surface-inset border-rule-default rounded-control max-w-full min-w-0 overflow-auto border p-4 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="readout text-muted">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}

function EvidenceRefs({
  ids,
  names,
  onShow,
}: {
  ids: string[];
  names: Map<string, string>;
  onShow: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="text-meta text-state-advisory underline underline-offset-2"
          onClick={() => onShow(id)}
          aria-label={`Show source ${names.get(id) ?? id}, ${id}`}
        >
          {names.get(id) ?? id}
        </button>
      ))}
    </div>
  );
}

function CheckList({
  checks,
  names,
  onShow,
  ruleSources,
}: {
  checks: LinePolicyCheck[];
  names: Map<string, string>;
  onShow: (id: string) => void;
  ruleSources?: Map<string, string>;
}) {
  return (
    <ul className="grid gap-3">
      {checks.map((check) => (
        <li
          key={check.code}
          className="border-rule-default rounded-control grid gap-2 border p-3"
        >
          <strong className="text-meta capitalize">
            {check.status} · {readable(check.code)}
          </strong>
          <p className="text-meta">{check.message}</p>
          {ruleSources?.has(check.code) ? (
            <p className="text-micro text-muted">
              JSON review rule · {ruleSources.get(check.code)}
            </p>
          ) : null}
          <EvidenceRefs
            ids={check.evidenceRefs}
            names={names}
            onShow={onShow}
          />
        </li>
      ))}
    </ul>
  );
}

export function ReviewExplorer({
  scenario,
  proposal,
  baselines,
  initialSku,
  reviewAt,
  keyConfigured,
}: {
  scenario: ScenarioEvidencePack;
  proposal: PromotionReleasePlan;
  baselines: Baseline[];
  initialSku: Sku;
  reviewAt: string;
  keyConfigured: boolean;
}) {
  const [selectedSku, setSelectedSku] = useState(initialSku);
  const [query, setQuery] = useState('');
  const [indexFilter, setIndexFilter] = useState<'all' | 'needs_review'>('all');
  const [selectedModel, setSelectedModel] = useState<ModelId>(MODEL_IDS[0]);
  const [running, setRunning] = useState(false);
  const [modelData, setModelData] = useState<ModelWorkbenchResponse | null>(
    null,
  );
  const [draftState, setDraftState] = useState<Draft | null>(null);
  const [trial, setTrial] = useState<LinePolicyProposal | null>(null);
  const [comparison, setComparison] = useState<Comparison>('recorded');
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const { data: lab, error: storageError, updateLab } = useLocalReviewLab();
  const {
    input: labInput,
    activeRules,
    confirmedSku,
    confirmedFacts,
    confirmedClaims,
    latestTrial,
  } = lab;
  const [resetCount, setResetCount] = useState(0);
  const [setupBusy, setSetupBusy] = useState(false);
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const productHeading = useRef<HTMLHeadingElement>(null);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const pendingModel = useRef<AbortController | null>(null);
  function cancelModel() {
    pendingModel.current?.abort();
    pendingModel.current = null;
    setRunning(false);
  }

  const effectiveScenario = useMemo(
    () =>
      confirmedSku
        ? applyConfirmedFacts(scenario, confirmedSku, confirmedFacts)
        : scenario,
    [scenario, confirmedSku, confirmedFacts],
  );

  const rows = useMemo(
    () =>
      proposal.candidates.map((candidate) => {
        const lineScenario =
          candidate.sku === selectedSku ? effectiveScenario : scenario;
        const facts = getLineFacts(lineScenario, candidate.sku);
        const lineProposal = proposalFor(candidate);
        const evaluated = evaluateLabLine({
          scenario,
          proposal: lineProposal,
          rules: activeRules,
          localEvidenceId:
            candidate.sku === confirmedSku &&
            labInput.role === 'case_evidence' &&
            labInput.text.trim()
              ? `ev-local-text-${candidate.sku.toLowerCase()}`
              : undefined,
          confirmedFacts: candidate.sku === confirmedSku ? confirmedFacts : {},
        });
        const policy = evaluated.policy;
        const findingCodes = evaluated.findingCodes;
        const baseline = baselines.find(({ sku }) => sku === candidate.sku);
        if (!baseline) throw new Error(`Missing replay for ${candidate.sku}`);
        return {
          sku: candidate.sku,
          name: facts.catalogue.productName,
          candidate,
          policy,
          baseline,
          findingCodes,
          findingsAgree:
            findingCodes.length === baseline.findingCodes.length &&
            findingCodes.every((code) => baseline.findingCodes.includes(code)),
          eligibilityAgrees:
            (policy.verdict === 'blocked') ===
            (baseline.eligibility === 'blocked'),
          gateObligations: evaluated.gateObligations,
        };
      }),
    [
      activeRules,
      baselines,
      confirmedFacts,
      confirmedSku,
      effectiveScenario,
      labInput.role,
      labInput.text,
      proposal,
      scenario,
      selectedSku,
    ],
  );
  const selected = rows.find(({ sku }) => sku === selectedSku);
  if (!selected) return null;
  const selectedCandidate = selected.candidate;

  const facts = getLineFacts(effectiveScenario, selectedSku);
  const localEvidenceId = `ev-local-text-${selectedSku.toLowerCase()}`;
  const preview = buildLinePreview(
    scenario,
    selectedSku,
    labInput.text.trim()
      ? {
          evidenceId: localEvidenceId,
          text: labInput.text,
          role: labInput.role,
        }
      : undefined,
  );
  const sourceNames = new Map(
    preview.sources.map(({ name, value }) => [value.evidenceId, name]),
  );
  const ruleSources = new Map(
    activeRules.rules.map(({ code, source }) => [code, source]),
  );
  const headlineCheck =
    selected.policy.checks.find(({ status: value }) => value === 'block') ??
    selected.policy.checks.find(({ status: value }) => value === 'attention');
  const needsReview = (row: (typeof rows)[number]) =>
    row.policy.verdict !== 'passes_checks' ||
    row.candidate.agentRecommendation === 'hold' ||
    row.candidate.agentRecommendation === 'exclude' ||
    !row.findingsAgree ||
    !row.eligibilityAgrees;
  const needsReviewCount = rows.filter(needsReview).length;
  const shownRows = rows.filter(
    (row) =>
      (indexFilter === 'all' || needsReview(row)) &&
      `${row.name} ${row.sku}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const live =
    modelData?.kind === 'result' && modelData.result.sku === selectedSku
      ? modelData.result
      : null;
  const liveReview = live?.review;
  const evaluatedTrial =
    trial?.sku === selectedSku
      ? evaluateLabLine({
          scenario,
          proposal: trial,
          rules: activeRules,
          confirmedFacts: confirmedSku === selectedSku ? confirmedFacts : {},
          localEvidenceId:
            confirmedSku === selectedSku ? localEvidenceId : undefined,
        })
      : null;
  const availableComparison =
    comparison === 'model' && liveReview
      ? 'model'
      : comparison === 'trial' && evaluatedTrial
        ? 'trial'
        : 'recorded';
  const active =
    availableComparison === 'model' && liveReview
      ? liveReview
      : availableComparison === 'trial' && evaluatedTrial
        ? evaluatedTrial
        : {
            policy: selected.policy,
            findingCodes: selected.findingCodes,
            gateObligations: selected.gateObligations,
          };
  const savedSimulation = localSimulationSchema.safeParse(latestTrial);
  const activeProposal: LinePolicyProposal =
    availableComparison === 'trial' && trial
      ? trial
      : availableComparison === 'model' && live?.suggestion
        ? {
            sku: selectedSku,
            proposedPricePence: live.suggestion.proposedPricePence,
            proposedTopUpUnits: live.suggestion.proposedTopUpUnits,
          }
        : proposalFor(selectedCandidate);
  const effectPreview = previewLocalEffects(scenario, activeProposal);
  const currentRecommendation =
    availableComparison === 'model'
      ? live?.suggestion?.recommendation
      : availableComparison === 'recorded'
        ? selected.candidate.agentRecommendation
        : null;
  const noReleaseProposal =
    currentRecommendation === 'hold' || currentRecommendation === 'exclude';
  const blocking = active.policy.checks.filter(
    ({ status: checkStatus }) => checkStatus === 'block',
  );
  const attention = active.policy.checks.filter(
    ({ status: checkStatus }) => checkStatus === 'attention',
  );
  const passing = active.policy.checks.filter(
    ({ status: checkStatus }) => checkStatus === 'pass',
  );
  const reviewAction = noReleaseProposal
    ? 'No release proposed'
    : active.policy.verdict === 'blocked'
      ? 'Cannot release these values'
      : active.findingCodes.includes('large_price_change')
        ? 'Individual approval required'
        : active.policy.verdict === 'review_required'
          ? 'Human review required'
          : 'Passes current checks';
  const draft =
    draftState?.sku === selectedSku
      ? draftState
      : {
          sku: selectedSku,
          price: String(selected.policy.pricePence),
          topUp: String(selected.policy.topUpUnits),
          origin: 'recorded' as const,
        };
  const chosenSource = preview.sources.find(
    ({ value }) => value.evidenceId === activeEvidence,
  );

  function selectProduct(sku: Sku) {
    if (sku === selectedSku) return;
    cancelModel();
    setSelectedSku(sku);
    setModelData(null);
    setDraftState(null);
    setTrial(null);
    setComparison('recorded');
    setActiveEvidence(null);
    setStatus(`Selected ${sku}.`);
    const url = new URL(window.location.href);
    url.searchParams.set('sku', sku);
    window.history.replaceState(null, '', url);
    requestAnimationFrame(() => productHeading.current?.focus());
  }

  function showEvidence(id: string) {
    setActiveEvidence(id);
    requestAnimationFrame(() => evidenceHeading.current?.focus());
  }

  function changeLabInput(next: LocalInput) {
    if (next.text !== labInput.text || next.role !== labInput.role) {
      updateLab({
        confirmedSku: null,
        confirmedFacts: {},
        confirmedClaims: [],
      });
    }
    cancelModel();
    updateLab({ input: next });
    setModelData(null);
    setComparison('recorded');
  }

  function activateRules(next: ReviewRuleSet) {
    cancelModel();
    updateLab({ activeRules: next });
    setModelData(null);
    setTrial(null);
    setComparison('recorded');
  }

  function confirmFacts(next: ConfirmedFacts, claim: SupplierFact) {
    cancelModel();
    updateLab({
      confirmedSku: selectedSku,
      confirmedFacts: next,
      confirmedClaims: [
        ...(confirmedSku === selectedSku
          ? confirmedClaims.filter(({ field }) => field !== claim.field)
          : []),
        claim,
      ],
    });
    setModelData(null);
    setTrial(null);
    setComparison('recorded');
  }

  function resetLab() {
    cancelModel();
    updateLab({
      input: DEFAULT_LAB_INPUT,
      activeRules: seedReviewRules,
      confirmedSku: null,
      confirmedFacts: {},
      confirmedClaims: [],
      latestTrial: null,
    });
    setResetCount((value) => value + 1);
    setModelData(null);
    setTrial(null);
    setComparison('recorded');
    setStatus('Local experiment reset to seeded rules and inputs.');
  }

  function exportTrial() {
    if (!latestTrial) return;
    const blob = new Blob([JSON.stringify(latestTrial, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `safepoint-local-review-${latestTrial.kind === 'review' ? latestTrial.proposal.sku : latestTrial.sku}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Latest local trial exported as JSON.');
  }

  function simulateApproval() {
    try {
      const modelCall =
        availableComparison === 'model' && live
          ? localModelCallSchema.safeParse({
              runId: live.runId,
              model: live.model,
              input: live.input,
            })
          : null;
      const result = simulateLocalApproval({
        scenario,
        proposal: activeProposal,
        rules: activeRules,
        input: labInput,
        confirmedFacts: confirmedSku === selectedSku ? confirmedFacts : {},
        confirmedClaims: confirmedSku === selectedSku ? confirmedClaims : [],
        expectedEffects: effectPreview,
        checkedResult: active,
        modelOutput:
          availableComparison === 'model' ? (live?.output ?? null) : null,
        modelCall: modelCall?.success ? modelCall.data : null,
      });
      updateLab({ latestTrial: result });
      setStatus(
        `${selectedSku} approval simulated in memory. No external system was changed.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Simulation failed.');
    }
  }

  async function runModel() {
    if (running || setupBusy || evaluationBusy) return;
    const controller = new AbortController();
    pendingModel.current = controller;
    setRunning(true);
    setModelData(null);
    setComparison('recorded');
    setStatus(`Running ${selectedModel} for ${selectedSku}.`);
    try {
      const response = await fetch('/api/dev/review-lab', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'propose',
          model: selectedModel,
          sku: selectedSku,
          reviewAt,
          input: labInput,
          rules: activeRules,
          confirmedFacts: confirmedSku === selectedSku ? confirmedFacts : {},
          confirmedClaims: confirmedSku === selectedSku ? confirmedClaims : [],
        }),
      });
      const labResponse = labResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      if (labResponse.kind === 'result' && labResponse.snapshot)
        updateLab({ latestTrial: labResponse.snapshot });
      const parsed =
        labResponse.kind === 'error'
          ? modelWorkbenchResponseSchema.parse(labResponse)
          : modelWorkbenchResponseSchema.parse({
              kind: 'result',
              result: {
                runId: labResponse.runId,
                model: labResponse.model,
                sku: selectedSku,
                instructionVersion: 'local-draft',
                durationMs: labResponse.durationMs,
                input: {
                  systemInstructions: labResponse.systemInstructions,
                  promptInput: labResponse.modelInput,
                },
                output: labResponse.output,
                suggestion: labResponse.suggestion,
                issues: labResponse.issues,
                review: labResponse.review,
                usage: labResponse.usage,
                finishReason: 'stop',
              },
            });
      if (parsed.kind === 'result' && parsed.result.sku !== selectedSku)
        throw new Error('The model returned a different product.');
      setModelData(parsed);
      if (parsed.kind === 'error') {
        setStatus(`Model request failed: ${parsed.message}`);
      } else if (parsed.result.review) {
        setComparison('model');
        setStatus(`Live model review finished for ${selectedSku}.`);
      } else {
        setStatus(`Model output needs inspection for ${selectedSku}.`);
      }
    } catch {
      if (controller.signal.aborted) return;
      setStatus('Model request failed or returned an unreadable response.');
    } finally {
      if (pendingModel.current === controller) {
        pendingModel.current = null;
        setRunning(false);
      }
    }
  }

  function evaluateTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(draft.price);
    const topUp = Number(draft.topUp);
    if (
      !/^\d+$/.test(draft.price) ||
      !/^\d+$/.test(draft.topUp) ||
      !Number.isSafeInteger(price) ||
      !Number.isSafeInteger(topUp) ||
      price <= 0 ||
      topUp < 0
    ) {
      setStatus(
        'Enter a whole-number price above zero and a nonnegative top-up.',
      );
      return;
    }
    const next = {
      sku: selectedSku,
      proposedPricePence: price,
      proposedTopUpUnits: topUp,
      proposedStartsAt: selectedCandidate.proposed?.startsAt ?? null,
      proposedEndsAt: selectedCandidate.proposed?.endsAt ?? null,
    };
    updateLab({
      latestTrial: captureLocalReview({
        scenario,
        proposal: next,
        rules: activeRules,
        input: labInput,
        confirmedFacts: confirmedSku === selectedSku ? confirmedFacts : {},
        confirmedClaims: confirmedSku === selectedSku ? confirmedClaims : [],
      }),
    });
    setTrial(next);
    setComparison('trial');
    setStatus(`${selectedSku} local trial evaluated.`);
  }

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
            Release review explorer
          </h1>
          <p className="text-body text-muted max-w-3xl">
            Choose a product, then follow its source facts, AI proposal,
            independent checks, and reviewer consequence. Every source record
            and result remains available below.
          </p>
          <p className="text-meta text-muted">
            Synthetic scenario · reviewed at {reviewAt} · no database or Sheet
            writes
          </p>
        </header>

        {storageError ? (
          <p className="text-meta" role="alert">
            {storageError}
          </p>
        ) : null}
        <p role="status" className="text-meta text-muted min-h-6">
          {status}
        </p>

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-4">
          <aside className={`${CARD} lg:sticky lg:top-4 lg:col-span-1`}>
            <div className="grid gap-1">
              <h2 className="text-title font-semibold">Products</h2>
              <p className="text-meta text-muted">
                {rows.length} candidates · recorded replay and current checks
              </p>
            </div>
            <label
              className="text-meta grid gap-1 lg:hidden"
              htmlFor="explorer-mobile-product"
            >
              Product
              <select
                id="explorer-mobile-product"
                className="field rounded-control px-3 py-2"
                value={selectedSku}
                disabled={running || setupBusy || evaluationBusy}
                onChange={(event) =>
                  selectProduct(skuSchema.parse(event.target.value))
                }
              >
                {rows.map(({ sku, name }) => (
                  <option key={sku} value={sku}>
                    {name} · {sku}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="text-meta hidden gap-1 lg:grid"
              htmlFor="explorer-search"
            >
              Find a product
              <input
                id="explorer-search"
                type="search"
                className="field rounded-control px-3 py-2"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="hidden flex-wrap gap-2 lg:flex">
              <button
                type="button"
                aria-pressed={indexFilter === 'all'}
                className="border-rule-default rounded-control text-meta hover:bg-surface-selected aria-pressed:bg-surface-selected focus-visible:outline-action border px-3 py-1 focus-visible:outline-2"
                onClick={() => setIndexFilter('all')}
              >
                All {rows.length}
              </button>
              <button
                type="button"
                aria-pressed={indexFilter === 'needs_review'}
                className="border-rule-default rounded-control text-meta hover:bg-surface-selected aria-pressed:bg-surface-selected focus-visible:outline-action border px-3 py-1 focus-visible:outline-2"
                onClick={() => setIndexFilter('needs_review')}
              >
                Needs review {needsReviewCount}
              </button>
            </div>
            <p role="status" className="text-meta text-muted hidden lg:block">
              Showing {shownRows.length} of {rows.length}
            </p>
            <nav
              aria-label="Products"
              className="review-explorer-index hidden gap-1 lg:grid"
            >
              {shownRows.map((row) => (
                <button
                  key={row.sku}
                  type="button"
                  disabled={running || setupBusy || evaluationBusy}
                  aria-current={row.sku === selectedSku ? 'true' : undefined}
                  onClick={() => selectProduct(row.sku)}
                  className="border-rule-default rounded-control hover:bg-surface-selected focus-visible:outline-action grid gap-1 border p-2 text-left focus-visible:outline-2"
                >
                  <span className="text-meta font-semibold">{row.name}</span>
                  <span className="text-micro text-muted">
                    {row.sku} · {readable(row.policy.verdict)}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="grid min-w-0 gap-5 lg:col-span-3">
            <ReviewLabSetup
              key={`${selectedSku}:${resetCount}`}
              scenario={scenario}
              comparisonScenario={effectiveScenario}
              proposal={proposal}
              sku={selectedSku}
              reviewAt={reviewAt}
              model={selectedModel}
              onModel={(model) => {
                cancelModel();
                setSelectedModel(model);
                setModelData(null);
                setComparison('recorded');
              }}
              disabled={running || evaluationBusy}
              onBusy={setSetupBusy}
              keyConfigured={keyConfigured}
              input={labInput}
              onInput={changeLabInput}
              activeRules={activeRules}
              onActivate={activateRules}
              confirmedFacts={
                confirmedSku === selectedSku ? confirmedFacts : {}
              }
              confirmedClaims={
                confirmedSku === selectedSku ? confirmedClaims : []
              }
              onConfirm={confirmFacts}
              onStatus={setStatus}
            />
            <ModelEvaluation
              model={selectedModel}
              reviewAt={reviewAt}
              disabled={running || setupBusy}
              keyConfigured={keyConfigured}
              onBusy={setEvaluationBusy}
              onStatus={setStatus}
            />
            <section
              className={CARD}
              aria-labelledby="explorer-product-heading"
            >
              <div className="grid gap-1">
                <p className="readout text-muted">
                  Selected product · {selectedSku}
                </p>
                <h2
                  id="explorer-product-heading"
                  ref={productHeading}
                  tabIndex={-1}
                  className="text-title font-semibold"
                >
                  {selected.name}
                </h2>
              </div>
              <div className="text-meta grid gap-2 sm:grid-cols-3">
                <p>
                  <span className="text-muted">Recorded AI</span>
                  <br />
                  <strong className="capitalize">
                    {selected.candidate.agentRecommendation}
                  </strong>
                </p>
                <p>
                  <span className="text-muted">Current checks on replay</span>
                  <br />
                  <strong className="capitalize">
                    {readable(selected.policy.verdict)}
                  </strong>
                </p>
                <p>
                  <span className="text-muted">Reviewed fixture</span>
                  <br />
                  <strong className="capitalize">
                    {selected.baseline.eligibility}
                  </strong>
                </p>
              </div>
              <p className="text-meta text-muted">
                The recorded AI and reviewed fixture are historical references.
                Current checks are recalculated from today&rsquo;s shifted
                scenario.
              </p>
              {headlineCheck ? (
                <p className="text-meta">
                  <strong>First issue to inspect:</strong>{' '}
                  {readable(headlineCheck.code)} · {headlineCheck.message}{' '}
                  <a
                    className="text-state-advisory underline underline-offset-2"
                    href="#explorer-checks"
                  >
                    See every check
                  </a>
                </p>
              ) : null}
            </section>

            <section
              className={`${CARD} review-explorer-step pl-6`}
              aria-labelledby="explorer-facts-heading"
              data-step="source"
            >
              <div className="grid gap-1">
                <p className="readout text-muted">1 · Source facts</p>
                <h2
                  id="explorer-facts-heading"
                  className="text-title font-semibold"
                >
                  What the checks can verify
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact
                  label="Brief price"
                  value={money(
                    facts.brief.intendedPromotionalSellingPricePence,
                  )}
                />
                <Fact
                  label="Regular price"
                  value={money(facts.catalogue.regularSellingPricePence)}
                />
                <Fact
                  label="Unit cost"
                  value={money(facts.catalogue.costPricePence)}
                />
                <Fact
                  label="Forecast plus safety"
                  value={
                    facts.requiredUnits === null
                      ? 'Unavailable'
                      : `${facts.requiredUnits} units`
                  }
                />
                <Fact
                  label="Stock before top-up"
                  value={
                    facts.availableBeforeLaunchUnits === null
                      ? 'Unavailable'
                      : `${facts.availableBeforeLaunchUnits} units`
                  }
                />
                <Fact
                  label="Remaining shortfall"
                  value={
                    facts.shortfallUnits === null
                      ? 'Unavailable'
                      : `${facts.shortfallUnits} units`
                  }
                />
                <Fact
                  label="Confirmed extra stock"
                  value={`${facts.supplier.confirmedAdditionalAllocationUnits} units`}
                />
                <Fact
                  label="Supplier funding"
                  value={`${money(facts.supplier.fundingPencePerUnit)} per unit · ${readable(facts.supplier.fundingStatus)}`}
                />
                <Fact
                  label="Forecast source confidence"
                  value={
                    facts.demand.kind === 'available'
                      ? facts.demand.forecastConfidence
                      : 'Unavailable'
                  }
                />
              </dl>
              <p className="text-meta text-muted">
                Forecast source confidence describes the forecast evidence, not
                the model&rsquo;s certainty. Narrative notes are untrusted
                context.
              </p>
              <EvidenceRefs
                ids={[
                  facts.catalogue.evidenceId,
                  facts.demand.evidenceId,
                  facts.supply.evidenceId,
                  facts.supplier.evidenceId,
                ]}
                names={sourceNames}
                onShow={showEvidence}
              />
            </section>

            <section
              className={`${CARD} review-explorer-step pl-6`}
              aria-labelledby="explorer-ai-heading"
              data-step="ai"
            >
              <div className="grid gap-1">
                <p className="readout text-muted">2 · AI proposals</p>
                <h2
                  id="explorer-ai-heading"
                  className="text-title font-semibold"
                >
                  What the AI suggests
                </h2>
              </div>
              <article className="border-rule-default grid gap-3 border-b pb-4">
                <h3 className="text-meta font-semibold">
                  Recorded replay · {selected.candidate.agentRecommendation}
                </h3>
                <p className="text-body">{selected.candidate.rationale}</p>
                <p className="text-meta">
                  {selected.candidate.proposed
                    ? `${money(selected.candidate.proposed.promotionalSellingPricePence)} · ${selected.candidate.proposed.recommendedTopUpQuantityUnits} top-up units`
                    : 'No release price or top-up proposed'}
                </p>
                {selected.candidate.uncertainties.length > 0 ? (
                  <p className="text-meta">
                    Uncertainties:{' '}
                    {selected.candidate.uncertainties.join(' · ')}
                  </p>
                ) : null}
                <EvidenceRefs
                  ids={selected.candidate.evidenceRefs}
                  names={sourceNames}
                  onShow={showEvidence}
                />
              </article>
              <div className="grid gap-3">
                <h3 className="text-meta font-semibold">
                  Live model · optional
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  <Button
                    variant="primary"
                    onPress={runModel}
                    isDisabled={
                      running || setupBusy || evaluationBusy || !keyConfigured
                    }
                  >
                    {running ? 'Reviewing…' : 'Run live model'}
                  </Button>
                </div>
                {!keyConfigured ? (
                  <p className="text-meta text-muted">
                    Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local to run the
                    model. The recorded replay remains available.
                  </p>
                ) : null}
                {live?.suggestion ? (
                  <div className="border-rule-default rounded-control grid gap-3 border p-3">
                    <p className="text-meta font-semibold">
                      Live result · {live.suggestion.recommendation} ·{' '}
                      {live.model}
                    </p>
                    <p className="text-body">{live.suggestion.rationale}</p>
                    <p className="text-meta">
                      {live.suggestion.proposedPricePence === null
                        ? 'No release terms proposed'
                        : `${money(live.suggestion.proposedPricePence)} · ${live.suggestion.proposedTopUpUnits} top-up units`}
                    </p>
                    {live.suggestion.uncertainties.length > 0 ? (
                      <p className="text-meta">
                        Uncertainties:{' '}
                        {live.suggestion.uncertainties.join(' · ')}
                      </p>
                    ) : null}
                    <EvidenceRefs
                      ids={live.suggestion.evidenceRefs}
                      names={sourceNames}
                      onShow={showEvidence}
                    />
                    <p className="text-meta text-muted">
                      Self-reported certainty:{' '}
                      {live.suggestion.selfReportedCertainty}; uncalibrated and
                      never used for the policy verdict. Citation IDs are
                      checked, but their support for each claim needs review.
                    </p>
                    <p className="text-micro text-muted">
                      Run {live.runId} · {live.durationMs} ms ·{' '}
                      {live.usage?.inputTokens ?? 'unknown'} input tokens ·{' '}
                      {live.usage?.outputTokens ?? 'unknown'} output tokens
                    </p>
                    {live.suggestion.proposedPricePence !== null &&
                    live.suggestion.proposedTopUpUnits !== null ? (
                      <Button
                        onPress={() => {
                          if (
                            live.suggestion?.proposedPricePence === null ||
                            live.suggestion?.proposedTopUpUnits === null ||
                            live.suggestion === null
                          )
                            return;
                          setDraftState({
                            sku: selectedSku,
                            price: String(live.suggestion.proposedPricePence),
                            topUp: String(live.suggestion.proposedTopUpUnits),
                            origin: 'model',
                          });
                          setTrial(null);
                          setStatus(
                            'Live terms copied into the local trial. Evaluate them below.',
                          );
                        }}
                      >
                        Try these values locally
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {live?.issues.length ? (
                  <p className="text-meta">
                    Contract issues: {live.issues.join(' · ')}
                  </p>
                ) : null}
                {modelData?.kind === 'error' ? (
                  <p className="text-meta">{modelData.message}</p>
                ) : null}
              </div>
            </section>

            <section
              className={`${CARD} review-explorer-step pl-6`}
              aria-labelledby="explorer-checks-heading"
              id="explorer-checks"
              data-step="policy"
            >
              <div className="grid gap-1">
                <p className="readout text-muted">3 · Independent checks</p>
                <h2
                  id="explorer-checks-heading"
                  className="text-title font-semibold"
                >
                  Which values pass policy?
                </h2>
              </div>
              <form
                onSubmit={evaluateTrial}
                className="border-rule-default grid gap-3 border-b pb-4"
              >
                <h3 className="text-meta font-semibold">Your local trial</h3>
                <p className="text-meta text-muted">
                  Started from{' '}
                  {draft.origin === 'model'
                    ? 'the live model'
                    : 'the recorded replay'}
                  . Editing these fields changes only your browser trial.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label
                    className="text-meta grid gap-1"
                    htmlFor="explorer-price"
                  >
                    Proposed price, pence
                    <input
                      id="explorer-price"
                      className="field rounded-control px-3 py-2"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={draft.price}
                      onChange={(event) => {
                        setDraftState({ ...draft, price: event.target.value });
                        setTrial(null);
                      }}
                    />
                  </label>
                  <label
                    className="text-meta grid gap-1"
                    htmlFor="explorer-top-up"
                  >
                    Top-up, units
                    <input
                      id="explorer-top-up"
                      className="field rounded-control px-3 py-2"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={draft.topUp}
                      onChange={(event) => {
                        setDraftState({ ...draft, topUp: event.target.value });
                        setTrial(null);
                      }}
                    />
                  </label>
                  <Button variant="primary" type="submit">
                    Evaluate trial
                  </Button>
                  <Button
                    onPress={() => {
                      setDraftState(null);
                      setTrial(null);
                      setComparison('recorded');
                      setStatus('Restored recorded replay values.');
                    }}
                  >
                    Restore replay values
                  </Button>
                </div>
              </form>
              <fieldset className="grid gap-2">
                <legend className="text-meta font-semibold">
                  Inspect checks for
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['recorded', 'Recorded replay', selected.policy.verdict],
                      ['model', 'Live model', liveReview?.policy.verdict],
                      ['trial', 'Your trial', evaluatedTrial?.policy.verdict],
                    ] as const
                  ).map(([kind, label, verdict]) => (
                    <label
                      key={kind}
                      className="border-rule-default rounded-control text-meta flex cursor-pointer items-center gap-2 border px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="review-comparison"
                        value={kind}
                        checked={availableComparison === kind}
                        disabled={!verdict}
                        onChange={() => setComparison(kind)}
                      />
                      {label} · {verdict ? readable(verdict) : 'not run'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-meta text-muted">
                {availableComparison === 'recorded'
                  ? selected.policy.basis === 'brief_baseline'
                    ? 'The recorded AI proposed no release terms. Checks use the brief price and calculated baseline top-up.'
                    : 'Recalculated from the recorded proposal and current scenario.'
                  : availableComparison === 'model'
                    ? `Returned by the deterministic policy check for live run ${live?.runId}.`
                    : 'Calculated locally from your unsaved trial values.'}
              </p>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Verdict" value={readable(active.policy.verdict)} />
                <Fact
                  label="Checked price"
                  value={money(active.policy.pricePence)}
                />
                <Fact
                  label="Checked top-up"
                  value={`${active.policy.topUpUnits} units`}
                />
                <Fact
                  label="Funded margin"
                  value={`${active.policy.marginPercent}%`}
                />
              </dl>
              {blocking.length + attention.length > 0 ? (
                <CheckList
                  checks={[...blocking, ...attention]}
                  names={sourceNames}
                  onShow={showEvidence}
                  ruleSources={ruleSources}
                />
              ) : (
                <p className="text-meta">No blocking or attention checks.</p>
              )}
              <details className="text-meta">
                <summary className="cursor-pointer">
                  {passing.length} passing checks
                </summary>
                <div className="mt-3">
                  <CheckList
                    checks={passing}
                    names={sourceNames}
                    onShow={showEvidence}
                    ruleSources={ruleSources}
                  />
                </div>
              </details>
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">
                  Seven gate obligations and finding codes
                </summary>
                <p className="mt-3">
                  Finding codes:{' '}
                  {active.findingCodes.map(readable).join(' · ') || 'none'}.
                </p>
                <div className="mt-3 max-w-full overflow-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-rule-default border-b">
                        <th scope="col" className="py-2 pr-3">
                          Gate
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Obligation
                        </th>
                        <th scope="col" className="py-2">
                          Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.gateObligations.map(
                        ({ gate, obligation, reason }) => (
                          <tr
                            key={gate}
                            className="border-rule-default border-b"
                          >
                            <th scope="row" className="py-2 pr-3 font-normal">
                              {readable(gate)}
                            </th>
                            <td className="py-2 pr-3">
                              {readable(obligation)}
                            </td>
                            <td className="py-2">{reason}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>

            <section
              className={`${CARD} review-explorer-step pl-6`}
              aria-labelledby="explorer-action-heading"
              data-step="action"
            >
              <div className="grid gap-1">
                <p className="readout text-muted">4 · Reviewer consequence</p>
                <h2
                  id="explorer-action-heading"
                  className="text-title font-semibold"
                >
                  {reviewAction}
                </h2>
              </div>
              <p className="text-body">
                {noReleaseProposal
                  ? `The AI chose not to propose a release. The brief baseline has ${blocking.length} blocking check${blocking.length === 1 ? '' : 's'}; its numbers do not approve a release.`
                  : blocking.length > 0
                    ? `Resolve ${blocking.length} blocking check${blocking.length === 1 ? '' : 's'} before considering these values.`
                    : attention.length > 0
                      ? `Review ${attention.length} attention check${attention.length === 1 ? '' : 's'} before deciding whether to approve.`
                      : 'The current rules pass. A person still decides whether to approve.'}
              </p>
              <p className="text-meta text-muted">
                Simulation changes an in-memory copy only. It never writes a
                database, Sheet, or storefront.
              </p>
              <details className="text-meta" open>
                <summary className="cursor-pointer">
                  Permitted changes · simulation preview
                </summary>
                <ul className="mt-2 grid gap-2">
                  {effectPreview.map((effect) => (
                    <li key={effect.target}>
                      <strong>{effect.target}</strong>
                      <details>
                        <summary className="cursor-pointer">
                          Exact before and proposed values
                        </summary>
                        <JsonBlock value={effect} />
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="grid gap-3">
                <Button
                  variant="primary"
                  onPress={simulateApproval}
                  isDisabled={
                    noReleaseProposal ||
                    active.policy.verdict === 'blocked' ||
                    activeProposal.proposedPricePence === null ||
                    activeProposal.proposedTopUpUnits === null
                  }
                >
                  Simulate approval
                </Button>
                {savedSimulation.success ? (
                  <div className="border-rule-default rounded-control grid gap-3 border p-3">
                    <p className="text-meta font-semibold">
                      Latest local simulation · {savedSimulation.data.sku} ·{' '}
                      {savedSimulation.data.simulatedAt}
                    </p>
                    <p className="text-meta text-muted">
                      Preflight compared the captured fixture state. Proposed
                      values were applied to an in-memory copy and read back
                      there. No external state was verified.
                    </p>
                    <ul className="grid gap-2">
                      {savedSimulation.data.effects.map((effect) => (
                        <li key={effect.target} className="text-meta">
                          <strong>{effect.target}</strong> ·{' '}
                          {effect.verifiedInMemory
                            ? 'verified in memory'
                            : 'simulation mismatch'}
                          <details>
                            <summary className="cursor-pointer">
                              Before and proposed values
                            </summary>
                            <JsonBlock
                              value={{
                                before: effect.before,
                                proposed: effect.proposed,
                                simulatedReadBack: effect.simulatedReadBack,
                              }}
                            />
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {latestTrial ? (
                  <>
                    <details className="text-meta">
                      <summary className="cursor-pointer">
                        Latest trial snapshot · {latestTrial.kind}
                      </summary>
                      <JsonBlock value={localTrialSchema.parse(latestTrial)} />
                    </details>
                    <Button onPress={exportTrial}>Export trial snapshot</Button>
                  </>
                ) : null}
                <Button
                  isDisabled={running || setupBusy || evaluationBusy}
                  onPress={resetLab}
                >
                  Reset local experiment
                </Button>
              </div>
            </section>

            <section
              className={`${CARD} review-explorer-source`}
              aria-labelledby="source-evidence-heading"
              id="source-evidence"
            >
              <div className="grid gap-1">
                <h2
                  id="source-evidence-heading"
                  ref={evidenceHeading}
                  tabIndex={-1}
                  className="text-title font-semibold"
                >
                  Source evidence
                </h2>
                <p className="text-meta text-muted">
                  Source records are validated inputs. Notes are untrusted
                  context; a cited ID does not prove the AI&rsquo;s claim.
                </p>
              </div>
              {chosenSource ? (
                <div className="grid gap-2">
                  <h3 className="text-meta font-semibold">
                    Opened source · {chosenSource.name} ·{' '}
                    {chosenSource.value.evidenceId}
                  </h3>
                  <JsonBlock value={chosenSource.value} />
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.sources.map(({ name, value }) => (
                  <button
                    key={value.evidenceId}
                    type="button"
                    className="border-rule-default rounded-control hover:bg-surface-selected focus-visible:outline-action grid gap-1 border p-3 text-left focus-visible:outline-2"
                    onClick={() => showEvidence(value.evidenceId)}
                  >
                    <span className="text-meta font-semibold">{name}</span>
                    <span className="text-micro text-muted">
                      {value.evidenceId}
                    </span>
                  </button>
                ))}
              </div>
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">
                  All exact source records
                </summary>
                <JsonBlock value={preview.sources} />
              </details>
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">
                  Exact checked result
                </summary>
                <JsonBlock value={active} />
              </details>
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">
                  Recorded proposal and reviewed policy JSON
                </summary>
                <div className="mt-3 grid gap-3">
                  <JsonBlock value={selected.candidate} />
                  <JsonBlock value={selected.baseline.reviewedPolicy} />
                </div>
              </details>
              <details className="text-meta min-w-0">
                <summary className="cursor-pointer">
                  Model input and output JSON
                </summary>
                <div className="mt-3 grid gap-3">
                  <JsonBlock value={live?.input ?? preview.input} />
                  {live ? <JsonBlock value={live.output} /> : null}
                </div>
              </details>
            </section>

            <details className={`${CARD} text-meta min-w-0`}>
              <summary className="text-title cursor-pointer font-semibold">
                All {rows.length} candidate comparisons
              </summary>
              <p className="text-muted">
                Current checks recalculate the recorded terms. The reviewed
                replay is the saved reference; differences remain visible.
              </p>
              <div className="max-w-full overflow-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-rule-default border-b">
                      <th scope="col" className="py-2 pr-4">
                        Product
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        Recorded AI
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        Current checks
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        Reviewed replay
                      </th>
                      <th scope="col" className="py-2">
                        Finding codes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.sku}
                        className="border-rule-default border-b"
                      >
                        <th scope="row" className="py-2 pr-4 font-normal">
                          <button
                            type="button"
                            disabled={running || setupBusy || evaluationBusy}
                            className="text-primary underline underline-offset-2"
                            onClick={() => selectProduct(row.sku)}
                          >
                            {row.name} · {row.sku}
                          </button>
                        </th>
                        <td className="py-2 pr-4">
                          {row.candidate.agentRecommendation}
                        </td>
                        <td className="py-2 pr-4">
                          {readable(row.policy.verdict)}
                          {row.eligibilityAgrees
                            ? ''
                            : ' · differs from replay'}
                        </td>
                        <td className="py-2 pr-4">
                          {row.baseline.eligibility}
                        </td>
                        <td className="py-2">
                          {row.findingCodes.join(', ') || 'none'}
                          {row.findingsAgree ? '' : ' · differs from replay'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <footer className="text-meta text-muted flex flex-wrap gap-4">
              <Link
                className="underline underline-offset-2"
                href={`/workbench/policy?sku=${selectedSku}`}
              >
                Detailed policy workbench
              </Link>
              <Link
                className="underline underline-offset-2"
                href={`/workbench/model?sku=${selectedSku}`}
              >
                Model diagnostics workbench
              </Link>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
