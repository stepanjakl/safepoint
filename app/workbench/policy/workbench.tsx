'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  evaluateLinePolicy,
  getLineFacts,
  type LinePolicyProposal,
} from '@/lib/promotion-release/line-policy';
import {
  shiftProposalToReviewAt,
  shiftScenarioToReviewAt,
} from '@/lib/promotion-release/scenario-clock';
import {
  deriveFindingCodes,
  deriveGateObligations,
} from '@/lib/promotion-release/review-policy';
import {
  type PolicyEvaluationReplay,
  type PromotionReleasePlan,
  type ScenarioEvidencePack,
  type Sku,
} from '@/lib/promotion-release/schemas';

type Baseline = {
  sku: Sku;
  eligibility: 'eligible' | 'blocked';
  findingCodes: Array<
    PolicyEvaluationReplay['candidates'][number]['findings'][number]['code']
  >;
  findings: PolicyEvaluationReplay['candidates'][number]['findings'];
  gateObligations: Array<{
    gate: PolicyEvaluationReplay['candidates'][number]['gateObligations'][number]['gate'];
    obligation: PolicyEvaluationReplay['candidates'][number]['gateObligations'][number]['obligation'];
  }>;
};

const SECTION =
  'bg-surface-floating border-rule-default rounded-shell grid min-w-0 content-start gap-4 border p-5';

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function wholeNumber(value: string, minimum: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
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

export function PolicyWorkbench({
  sourceScenario,
  sourceProposal,
  baselines,
  todayAt,
}: {
  sourceScenario: ScenarioEvidencePack;
  sourceProposal: PromotionReleasePlan;
  baselines: Baseline[];
  todayAt: string;
}) {
  const [clockMode, setClockMode] = useState<'today' | 'fixture'>('today');
  const [anchorAt, setAnchorAt] = useState(todayAt);
  const [selectedSku, setSelectedSku] = useState<Sku>('ALD-0001');
  const [drafts, setDrafts] = useState<
    Partial<Record<Sku, { price: string; topUp: string }>>
  >({});
  const [trial, setTrial] = useState<LinePolicyProposal | null>(null);
  const [status, setStatus] = useState('');
  const detailHeading = useRef<HTMLHeadingElement>(null);

  const scenario = useMemo(
    () =>
      clockMode === 'today'
        ? shiftScenarioToReviewAt(sourceScenario, anchorAt)
        : sourceScenario,
    [anchorAt, clockMode, sourceScenario],
  );
  const proposal = useMemo(
    () =>
      clockMode === 'today'
        ? shiftProposalToReviewAt(
            sourceProposal,
            sourceScenario.promotionBrief.campaign.reviewAt,
            anchorAt,
          )
        : sourceProposal,
    [anchorAt, clockMode, sourceProposal, sourceScenario],
  );
  const rows = useMemo(
    () =>
      proposal.candidates.map((candidate) => {
        const lineProposal = proposalFor(candidate);
        const result = evaluateLinePolicy(scenario, lineProposal);
        const findingCodes = deriveFindingCodes(scenario, lineProposal);
        const gateObligations = deriveGateObligations(scenario, lineProposal);
        const baseline = baselines.find(({ sku }) => sku === candidate.sku);
        if (!baseline)
          throw new Error(`Missing reviewed policy ${candidate.sku}`);
        return {
          sku: candidate.sku,
          productName: getLineFacts(scenario, candidate.sku).catalogue
            .productName,
          result,
          findingCodes,
          gateObligations,
          baseline,
          agrees:
            (result.verdict !== 'blocked') ===
            (baseline.eligibility === 'eligible'),
          gatesAgree: gateObligations.every(
            ({ gate, obligation }) =>
              baseline.gateObligations.find((entry) => entry.gate === gate)
                ?.obligation === obligation,
          ),
          findingsAgree:
            findingCodes.length === baseline.findingCodes.length &&
            findingCodes.every((code) => baseline.findingCodes.includes(code)),
        };
      }),
    [baselines, proposal, scenario],
  );
  const selectedRow = rows.find(({ sku }) => sku === selectedSku);
  const selectedCandidate = proposal.candidates.find(
    ({ sku }) => sku === selectedSku,
  );
  if (!selectedRow || !selectedCandidate) return null;
  const proposedStartsAt = selectedCandidate.proposed?.startsAt ?? null;
  const proposedEndsAt = selectedCandidate.proposed?.endsAt ?? null;
  const facts = getLineFacts(scenario, selectedSku);
  const draft = drafts[selectedSku] ?? {
    price: String(selectedRow.result.pricePence),
    topUp: String(selectedRow.result.topUpUnits),
  };
  const activeTrial = trial?.sku === selectedSku ? trial : null;
  const comparisonProposal = activeTrial
    ? { ...activeTrial, proposedStartsAt, proposedEndsAt }
    : proposalFor(selectedCandidate);
  const result = activeTrial
    ? evaluateLinePolicy(scenario, comparisonProposal)
    : selectedRow.result;
  const findingCodes = activeTrial
    ? deriveFindingCodes(scenario, comparisonProposal)
    : selectedRow.findingCodes;
  const gateObligations = activeTrial
    ? deriveGateObligations(scenario, comparisonProposal)
    : selectedRow.gateObligations;
  const blocking = result.checks.filter(({ status }) => status === 'block');
  const attention = result.checks.filter(
    ({ status }) => status === 'attention',
  );
  const passing = result.checks.filter(({ status }) => status === 'pass');
  const disagreements = rows.filter(({ agrees }) => !agrees);
  const gateDisagreements = rows.filter(({ gatesAgree }) => !gatesAgree);
  const findingDisagreements = rows.filter(
    ({ findingsAgree }) => !findingsAgree,
  );
  const reviewedTreatment = selectedRow.baseline.findings.some(
    ({ approvalConsequence }) => approvalConsequence === 'block',
  )
    ? 'release blocked'
    : selectedRow.baseline.findings.some(
          ({ approvalConsequence }) =>
            approvalConsequence === 'individual_approval',
        )
      ? 'individual approval required'
      : 'no individual approval finding';
  const calculatedOnly = findingCodes.filter(
    (code) => !selectedRow.baseline.findingCodes.includes(code),
  );
  const replayOnly = selectedRow.baseline.findingCodes.filter(
    (code) => !findingCodes.includes(code),
  );

  function evaluateTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = wholeNumber(draft.price, 1);
    const topUp = wholeNumber(draft.topUp, 0);
    if (price === null || topUp === null) {
      setStatus(
        'Enter a whole-number price above zero and a nonnegative whole-number top-up.',
      );
      return;
    }
    const next = {
      sku: selectedSku,
      proposedPricePence: price,
      proposedTopUpUnits: topUp,
    };
    const verdict = evaluateLinePolicy(scenario, {
      ...next,
      proposedStartsAt,
      proposedEndsAt,
    }).verdict;
    setTrial(next);
    setStatus(
      `${selectedSku} trial evaluated: ${verdict.replaceAll('_', ' ')}.`,
    );
  }

  return (
    <main
      id="main"
      className="bg-canvas text-primary min-h-dvh px-4 py-8 sm:px-6"
    >
      <div className="mx-auto grid max-w-6xl min-w-0 gap-6">
        <header className="grid gap-2">
          <p className="readout text-muted">
            Development workbench · no model call
          </p>
          <h1 className="text-display font-semibold">
            Release checks, in the open
          </h1>
          <p className="text-body text-muted max-w-3xl">
            Try a price and supplier top-up against the source evidence. These
            calculations run locally and make no database or Sheet changes.
          </p>
          <p className="text-meta text-muted">
            Fixture {scenario.promotionBrief.fixtureVersion} · policy{' '}
            {scenario.policyRules.policyVersion}
          </p>
        </header>

        <section className={SECTION} aria-labelledby="clock-heading">
          <div className="grid gap-1">
            <h2 id="clock-heading" className="text-title font-semibold">
              Scenario clock
            </h2>
            <p className="text-meta text-muted">
              All structured dates move together. The source fixture remains
              fixed.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-1">
              <label htmlFor="policy-clock" className="text-meta">
                Clock
              </label>
              <select
                id="policy-clock"
                className="field rounded-control px-3 py-2"
                value={clockMode}
                onChange={(event) => {
                  const mode =
                    event.target.value === 'fixture' ? 'fixture' : 'today';
                  setClockMode(mode);
                  if (mode === 'today') setAnchorAt(new Date().toISOString());
                  setTrial(null);
                  setStatus(
                    `Scenario clock set to ${mode === 'today' ? 'current time' : 'recorded fixture time'}.`,
                  );
                }}
              >
                <option value="today">Current time</option>
                <option value="fixture">Recorded fixture time</option>
              </select>
            </div>
            {clockMode === 'today' ? (
              <Button
                onPress={() => {
                  setAnchorAt(new Date().toISOString());
                  setTrial(null);
                  setStatus('Scenario clock refreshed to current time.');
                }}
              >
                Refresh current time
              </Button>
            ) : null}
            <p className="text-meta text-muted">
              Review: {scenario.promotionBrief.campaign.reviewAt}
            </p>
          </div>
        </section>

        <p role="status" className="text-meta text-muted min-h-6">
          {status}
        </p>

        <section className={SECTION} aria-labelledby="agent-judgement-heading">
          <div className="grid gap-1">
            <p className="readout text-muted">Recorded AI judgement · replay</p>
            <h2
              id="agent-judgement-heading"
              className="text-title font-semibold capitalize"
            >
              {selectedCandidate.agentRecommendation}
            </h2>
          </div>
          <p className="text-body max-w-3xl">{selectedCandidate.rationale}</p>
          <p className="text-meta text-muted">
            {selectedCandidate.proposed
              ? `Proposed ${money(selectedCandidate.proposed.promotionalSellingPricePence)} and ${selectedCandidate.proposed.recommendedTopUpQuantityUnits} top-up units.`
              : 'No release price or top-up proposed.'}{' '}
            This is the agent’s proposal, not a policy decision.
          </p>
          {selectedCandidate.uncertainties.length > 0 ? (
            <p className="text-meta">
              Uncertainties: {selectedCandidate.uncertainties.join(' · ')}
            </p>
          ) : null}
          {facts.notes.some((note) => note.claim) ? (
            <div className="border-rule-default text-meta grid gap-2 border-t pt-4">
              <h3 className="font-semibold">Reported context</h3>
              <p className="text-muted">
                These note claims are untrusted. The checks verify the numbers
                against structured evidence before using them in a finding.
              </p>
              <ul className="grid gap-2">
                {facts.notes.map((note) => {
                  if (!note.claim) return null;
                  return (
                    <li key={note.evidenceId}>
                      {note.claim.kind === 'prior_top_up_request'
                        ? `Earlier requested top-up: ${note.claim.requestedUnits} units.`
                        : `Considered plans: ${note.claim.options
                            .map(
                              (option) =>
                                `${money(option.promotionalSellingPricePence)} and ${option.topUpUnits} top-up units`,
                            )
                            .join('; ')}.`}{' '}
                      <span className="text-muted">{note.evidenceId}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <details className="text-meta min-w-0">
            <summary className="cursor-pointer">Cited evidence IDs</summary>
            <p className="text-muted mt-2 break-words">
              {selectedCandidate.evidenceRefs.join(' · ')}
            </p>
          </details>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <section className={SECTION} aria-labelledby="trial-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">
                Selected product · {selectedSku}
              </p>
              <h2
                id="trial-heading"
                ref={detailHeading}
                tabIndex={-1}
                className="text-title font-semibold"
              >
                {selectedRow.productName}
              </h2>
            </div>
            <div className="grid gap-1">
              <label htmlFor="policy-product" className="text-meta">
                Product
              </label>
              <select
                id="policy-product"
                className="field rounded-control px-3 py-2"
                value={selectedSku}
                onChange={(event) => {
                  const row = rows.find(
                    ({ sku }) => sku === event.target.value,
                  );
                  if (!row) return;
                  setSelectedSku(row.sku);
                  setTrial(null);
                  setStatus(`Viewing ${row.productName}, ${row.sku}.`);
                }}
              >
                {rows.map(({ sku, productName }) => (
                  <option key={sku} value={sku}>
                    {productName} · {sku}
                  </option>
                ))}
              </select>
            </div>
            <dl className="text-meta grid grid-cols-2 gap-3">
              <div>
                <dt className="text-muted">Regular price</dt>
                <dd>{money(facts.catalogue.regularSellingPricePence)}</dd>
              </div>
              <div>
                <dt className="text-muted">Unit cost</dt>
                <dd>{money(facts.catalogue.costPricePence)}</dd>
              </div>
              <div>
                <dt className="text-muted">Supplier funding</dt>
                <dd>
                  {money(facts.supplier.fundingPencePerUnit)} per unit ·{' '}
                  {facts.supplier.fundingStatus.replaceAll('_', ' ')}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Forecast plus safety</dt>
                <dd>{facts.requiredUnits ?? 'Unavailable'} units</dd>
              </div>
              <div>
                <dt className="text-muted">Stock before top-up</dt>
                <dd>
                  {facts.availableBeforeLaunchUnits ?? 'Unavailable'} units
                </dd>
              </div>
              <div>
                <dt className="text-muted">Remaining shortfall</dt>
                <dd>{facts.shortfallUnits ?? 'Unavailable'} units</dd>
              </div>
              <div>
                <dt className="text-muted">Order multiple</dt>
                <dd>{facts.supplier.orderMultipleUnits} units</dd>
              </div>
            </dl>
            <form
              onSubmit={evaluateTrial}
              className="border-rule-default grid gap-4 border-t pt-4"
            >
              <div className="flex flex-wrap gap-4">
                <div className="grid gap-1">
                  <label htmlFor="trial-price" className="text-meta">
                    Proposed price, pence
                  </label>
                  <input
                    id="trial-price"
                    className="field rounded-control px-3 py-2"
                    inputMode="numeric"
                    type="number"
                    min="1"
                    step="1"
                    value={draft.price}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [selectedSku]: { ...draft, price: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <label htmlFor="trial-top-up" className="text-meta">
                    Top-up, units
                  </label>
                  <input
                    id="trial-top-up"
                    className="field rounded-control px-3 py-2"
                    inputMode="numeric"
                    type="number"
                    min="0"
                    step="1"
                    value={draft.topUp}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [selectedSku]: { ...draft, topUp: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary">
                  Evaluate trial
                </Button>
                {activeTrial ? (
                  <Button
                    onPress={() => {
                      setTrial(null);
                      setDrafts((current) => {
                        const next = { ...current };
                        delete next[selectedSku];
                        return next;
                      });
                      setStatus(
                        `${selectedSku} restored to the reviewed proposal.`,
                      );
                    }}
                  >
                    Restore reviewed values
                  </Button>
                ) : null}
              </div>
            </form>
            <p className="text-meta text-muted">
              {activeTrial
                ? 'Showing your local trial.'
                : 'Showing the reviewed proposal or brief baseline.'}{' '}
              These values are not saved.
            </p>
          </section>

          <section className={SECTION} aria-labelledby="result-heading">
            <div className="grid gap-1">
              <p className="readout text-muted">Independent result</p>
              <h2 id="result-heading" className="text-title font-semibold">
                {result.verdict.replaceAll('_', ' ')}
              </h2>
            </div>
            <p className="text-meta text-muted">
              Checked {money(result.pricePence)} and {result.topUpUnits} units;
              confirmed-funding margin {result.marginPercent}%. Current
              read-only checks do not grant release approval.
            </p>
            {[...blocking, ...attention].length > 0 ? (
              <ul className="grid gap-2">
                {[...blocking, ...attention].map((check) => (
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
            <details className="text-meta">
              <summary className="cursor-pointer">
                {passing.length} passing checks
              </summary>
              <ul className="mt-2 grid gap-2">
                {passing.map((check) => (
                  <li key={check.code}>
                    <strong>{check.code.replaceAll('_', ' ')}:</strong>{' '}
                    {check.message}
                  </li>
                ))}
              </ul>
            </details>
            <p className="text-meta text-muted">
              Reviewed policy: {selectedRow.baseline.eligibility}. Treatment:{' '}
              {reviewedTreatment} for the recorded proposal.
            </p>
            <div className="border-rule-default text-meta grid gap-2 border-t pt-4">
              <h3 className="font-semibold">Finding-code comparison</h3>
              <p>
                Calculated: {findingCodes.join(', ') || 'none'}. Reviewed
                replay: {selectedRow.baseline.findingCodes.join(', ') || 'none'}
                .
              </p>
              {calculatedOnly.length > 0 ? (
                <p>Calculated only: {calculatedOnly.join(', ')}.</p>
              ) : null}
              {replayOnly.length > 0 ? (
                <p>Replay only: {replayOnly.join(', ')}.</p>
              ) : null}
              {activeTrial ? (
                <p className="text-muted">
                  The replay describes the recorded proposal, while the
                  calculated codes describe your trial.
                </p>
              ) : null}
              <p className="text-muted">
                Codes cover the current replay vocabulary. A blocking check
                above can still have no matching finding code yet.
              </p>
            </div>
            <details className="text-meta min-w-0">
              <summary className="cursor-pointer">
                Seven gate obligations
              </summary>
              <div className="mt-2 max-w-full overflow-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-rule-default border-b">
                      <th scope="col" className="py-2 pr-3">
                        Gate
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Calculated
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Reviewed
                      </th>
                      <th scope="col" className="py-2">
                        Agent assessment
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateObligations.map(({ gate, obligation }) => (
                      <tr key={gate} className="border-rule-default border-b">
                        <th scope="row" className="py-2 pr-3 font-normal">
                          {gate.replaceAll('_', ' ')}
                        </th>
                        <td className="py-2 pr-3">
                          {obligation.replaceAll('_', ' ')}
                        </td>
                        <td className="py-2 pr-3">
                          {selectedRow.baseline.gateObligations
                            .find((entry) => entry.gate === gate)
                            ?.obligation.replaceAll('_', ' ') ?? 'missing'}
                        </td>
                        <td className="py-2">
                          {selectedCandidate.gateAssessments
                            .find((entry) => entry.gate === gate)
                            ?.result.replaceAll('_', ' ') ?? 'missing'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted mt-2">
                Agent assessments belong to the recorded proposal and cannot
                change calculated obligations.
              </p>
            </details>
          </section>
        </div>

        <section className={SECTION} aria-labelledby="overview-heading">
          <div className="grid gap-1">
            <h2 id="overview-heading" className="text-title font-semibold">
              All 27 candidates
            </h2>
            <p className="text-meta text-muted">
              {disagreements.length === 0
                ? 'The current blocking checks agree with every reviewed replay eligibility.'
                : `${disagreements.length} eligibility disagreement${disagreements.length === 1 ? '' : 's'} to inspect.`}{' '}
              Attention findings can still require a person to review a line.
            </p>
            <p className="text-meta text-muted">
              Gate obligations:{' '}
              {gateDisagreements.length === 0
                ? 'all 27 agree'
                : `${gateDisagreements.length} differ`}
              . Finding codes:{' '}
              {findingDisagreements.length === 0
                ? 'all 27 agree'
                : `${findingDisagreements.length} lines differ (${findingDisagreements.map(({ sku }) => sku).join(', ')})`}
              .
            </p>
          </div>
          <div className="max-w-full overflow-auto">
            <table className="text-meta w-full border-collapse text-left">
              <thead>
                <tr className="border-rule-default border-b">
                  <th scope="col" className="py-2 pr-4">
                    Product
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Current checks
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Reviewed replay
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Eligibility
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Gates
                  </th>
                  <th scope="col" className="py-2">
                    Finding codes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sku} className="border-rule-default border-b">
                    <th scope="row" className="py-2 pr-4 font-normal">
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => {
                          setSelectedSku(row.sku);
                          setTrial(null);
                          setStatus(`Viewing ${row.productName}, ${row.sku}.`);
                          detailHeading.current?.focus();
                        }}
                      >
                        {row.productName} · {row.sku}
                      </button>
                    </th>
                    <td className="py-2 pr-4">
                      {row.result.verdict.replaceAll('_', ' ')}
                    </td>
                    <td className="py-2 pr-4">{row.baseline.eligibility}</td>
                    <td className="py-2 pr-4">
                      {row.agrees ? 'Agrees' : 'Differs'}
                    </td>
                    <td className="py-2 pr-4">
                      {row.gatesAgree ? 'Agrees' : 'Differs'}
                    </td>
                    <td className="py-2">
                      {row.findingsAgree ? 'Agrees' : 'Differs'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" className="text-title font-semibold">
            Source evidence
          </h2>
          <p className="text-meta text-muted">
            These are the validated records used by the checks. Notes remain
            untrusted context.
          </p>
          <details className="text-meta min-w-0">
            <summary className="cursor-pointer">Exact source records</summary>
            <JsonBlock
              value={{
                brief: facts.brief,
                shortlist: facts.shortlist,
                catalogue: facts.catalogue,
                demand: facts.demand,
                supply: facts.supply,
                supplier: facts.supplier,
                channel: facts.channel,
                notes: facts.notes,
                policyRules: scenario.policyRules,
              }}
            />
          </details>
          <details className="text-meta min-w-0">
            <summary className="cursor-pointer">Exact check result</summary>
            <JsonBlock value={result} />
          </details>
        </section>
      </div>
    </main>
  );
}
