'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  MODEL_IDS,
  modelIdSchema,
  type ModelId,
} from '@/lib/model-workbench/models';
import {
  confirmedFactsSchema,
  supplierFactSchema,
  extractedFactsSchema,
  type ConfirmedFacts,
  type LocalInput,
  type SupplierFact,
} from '@/lib/promotion-release/review-lab';
import {
  describeRule,
  describeRuleChanges,
  reviewRuleSetSchema,
  type ReviewRuleSet,
} from '@/lib/promotion-release/review-rules';
import type {
  PromotionReleasePlan,
  ScenarioEvidencePack,
  Sku,
} from '@/lib/promotion-release/schemas';
import { evaluateLabLine } from '@/lib/promotion-release/review-lab';

import {
  labResponseSchema,
  inspectRuleDraft,
} from '@/lib/model-workbench/review-lab-contract';

type ClaimDraft = {
  field:
    | 'fundingStatus'
    | 'fundingPencePerUnit'
    | 'confirmedAdditionalAllocationUnits';
  value: string;
  quote: string;
};

function proposalFor(candidate: PromotionReleasePlan['candidates'][number]) {
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

export function ReviewLabSetup({
  scenario,
  comparisonScenario,
  proposal,
  sku,
  reviewAt,
  model,
  onModel,
  disabled,
  onBusy,
  keyConfigured,
  input,
  onInput,
  activeRules,
  onActivate,
  confirmedFacts,
  confirmedClaims,
  onConfirm,
  onStatus,
}: {
  scenario: ScenarioEvidencePack;
  comparisonScenario: ScenarioEvidencePack;
  proposal: PromotionReleasePlan;
  sku: Sku;
  reviewAt: string;
  model: ModelId;
  onModel: (model: ModelId) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  keyConfigured: boolean;
  input: LocalInput;
  onInput: (next: LocalInput) => void;
  activeRules: ReviewRuleSet;
  onActivate: (next: ReviewRuleSet) => void;
  confirmedFacts: ConfirmedFacts;
  confirmedClaims: SupplierFact[];
  onConfirm: (next: ConfirmedFacts, claim: SupplierFact) => void;
  onStatus: (message: string) => void;
}) {
  const [busy, setBusy] = useState<'extract' | 'draft_rule' | null>(null);
  const [claims, setClaims] = useState<ClaimDraft[]>([]);
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const [editedJson, setRuleJson] = useState<string | null>(null);
  const [acknowledgedDraft, setAcknowledgedDraft] = useState<string | null>(
    null,
  );
  const ruleJson = editedJson ?? JSON.stringify(activeRules, null, 2);
  const requestController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      requestController.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  const [suggestion, setSuggestion] = useState<{
    reason: string;
    sourceQuote: string;
  } | null>(null);
  const [diagnostics, setDiagnostics] = useState<{
    stage: string;
    runId: string;
    systemInstructions: string;
    modelInput: unknown;
    output: unknown;
  } | null>(null);
  function changeInput(next: LocalInput) {
    if (next.text !== input.text || next.role !== input.role) {
      setClaims([]);
      setUncertainties([]);
      setDiagnostics(null);
    }
    onInput(next);
  }
  const draft = useMemo(() => {
    try {
      return reviewRuleSetSchema.safeParse(JSON.parse(ruleJson));
    } catch {
      return null;
    }
  }, [ruleJson]);
  const draftRules = draft?.success ? draft.data : null;
  const ruleChanges = draftRules
    ? describeRuleChanges(
        activeRules,
        draftRules,
        comparisonScenario.policyRules,
      )
    : [];
  const requiresAcknowledgement = ruleChanges.some(
    ({ direction }) => direction === 'loosens' || direction === 'changed',
  );
  const differences = useMemo(() => {
    if (!draftRules) return [];
    return proposal.candidates.flatMap((candidate) => {
      const line = proposalFor(candidate);
      const before = evaluateLabLine({
        scenario: comparisonScenario,
        proposal: line,
        rules: activeRules,
      }).policy;
      const after = evaluateLabLine({
        scenario: comparisonScenario,
        proposal: line,
        rules: draftRules,
      }).policy;
      const beforeSummary = before.checks
        .map(({ code, status }) => `${code}:${status}`)
        .sort()
        .join('|');
      const afterSummary = after.checks
        .map(({ code, status }) => `${code}:${status}`)
        .sort()
        .join('|');
      return beforeSummary === afterSummary
        ? []
        : [
            {
              sku: candidate.sku,
              before: before.verdict,
              after: after.verdict,
              reasons: Array.from(
                new Set(
                  [...before.checks, ...after.checks].map(({ code }) => code),
                ),
              ).flatMap((code) => {
                const old = before.checks.find((check) => check.code === code);
                const next = after.checks.find((check) => check.code === code);
                return old?.status === next?.status
                  ? []
                  : [
                      `${code}: ${old?.status ?? 'not applicable'} → ${next?.status ?? 'not applicable'}${next ? `. ${next.message}` : ''}`,
                    ];
              }),
            },
          ];
    });
  }, [activeRules, comparisonScenario, draftRules, proposal]);

  async function askModel(stage: 'extract' | 'draft_rule') {
    if (busy || disabled) return;
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(stage);
    onBusy(true);
    onStatus(
      stage === 'extract'
        ? 'Extracting claims from local text.'
        : 'Drafting one review rule.',
    );
    try {
      const response = await fetch('/api/dev/review-lab', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          model,
          sku,
          reviewAt,
          input,
          rules: activeRules,
          confirmedFacts,
          confirmedClaims,
        }),
      });
      const data = labResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      if (data.kind === 'error') throw new Error(data.message);
      setDiagnostics({
        stage,
        runId: data.runId,
        systemInstructions: data.systemInstructions,
        modelInput: data.modelInput,
        output: data.output,
      });
      if (data.issues.length) {
        onStatus(
          `${stage === 'extract' ? 'Extraction' : 'Rule draft'} needs inspection: ${data.issues.join(' ')}`,
        );
        return;
      }
      if (stage === 'extract') {
        const parsed = extractedFactsSchema.parse(data.output);
        setClaims(
          parsed.claims.map((claim) => ({
            field: claim.field,
            value: String(claim.value),
            quote: claim.quote,
          })),
        );
        setUncertainties(parsed.uncertainties);
        onStatus(
          `${parsed.claims.length} supplier claim${parsed.claims.length === 1 ? '' : 's'} extracted. Confirm each before use.`,
        );
      } else {
        const inspected = inspectRuleDraft(data.output);
        if (!inspected.draft) throw new Error(inspected.issues.join(' '));
        const parsed = inspected.draft;
        const current = draftRules ?? activeRules;
        const suggestedRule = parsed.sourceQuote
          ? {
              ...parsed.rule,
              source: 'Local policy excerpt',
              supportingQuote: parsed.sourceQuote,
            }
          : parsed.rule;
        const next = reviewRuleSetSchema.parse({
          schemaVersion: 1,
          rules: [
            ...current.rules.map((rule) =>
              rule.code === parsed.rule.code ? suggestedRule : rule,
            ),
            ...(current.rules.some((rule) => rule.code === parsed.rule.code)
              ? []
              : [suggestedRule]),
          ],
        });
        setRuleJson(JSON.stringify(next, null, 2));
        setSuggestion({
          reason: parsed.reason,
          sourceQuote: parsed.sourceQuote,
        });
        onStatus(
          `Rule ${parsed.rule.code} drafted. Review the change before activation.`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      onStatus(
        error instanceof Error ? error.message : 'Model request failed.',
      );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(null);
        onBusy(false);
        requestController.current = null;
      }
    }
  }

  function confirmClaim(claim: ClaimDraft) {
    let next: ConfirmedFacts;
    if (claim.field === 'fundingStatus') {
      if (!['confirmed', 'unverified', 'not_offered'].includes(claim.value)) {
        onStatus('Choose a valid funding status.');
        return;
      }
      next = {
        ...confirmedFacts,
        fundingStatus: z
          .enum(['confirmed', 'unverified', 'not_offered'])
          .parse(claim.value),
      };
    } else {
      const value = Number(claim.value);
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        !/^\d+$/.test(claim.value)
      ) {
        onStatus('Enter a nonnegative whole number.');
        return;
      }
      next = { ...confirmedFacts, [claim.field]: value };
    }
    const parsed = confirmedFactsSchema.safeParse(next);
    if (!parsed.success) {
      onStatus(parsed.error.issues.map(({ message }) => message).join(' '));
      return;
    }
    if (!input.text.includes(claim.quote)) {
      onStatus('The supporting quote is no longer present. Extract again.');
      return;
    }
    const accepted = supplierFactSchema.parse({
      ...claim,
      value: next[claim.field],
    });
    onConfirm(parsed.data, accepted);
    if (
      parsed.data.fundingStatus === 'confirmed' &&
      parsed.data.fundingPencePerUnit === undefined &&
      scenario.supplierTerms.records.find((record) => record.sku === sku)
        ?.fundingStatus !== 'confirmed'
    ) {
      onStatus(
        'Funding status accepted; confirm the amount before confirmed funding can be used.',
      );
      return;
    }
    onStatus(
      `${claim.field} confirmed for the local ${sku} trial. The original source remains visible.`,
    );
  }

  return (
    <section
      className="bg-surface-floating ground-floating border-rule-default rounded-shell grid min-w-0 gap-5 border p-5"
      aria-labelledby="lab-heading"
    >
      <div className="grid gap-1">
        <p className="readout text-muted">
          Local experiment · prepare before review
        </p>
        <h2 id="lab-heading" className="text-title font-semibold">
          Inputs and review rules
        </h2>
        <p className="text-meta text-muted">
          Browser drafts only. The structured scenario remains available below.
          Model suggestions do not activate rules or facts.
        </p>
      </div>
      <div className="grid gap-3">
        <label className="text-meta grid gap-1" htmlFor="lab-model">
          Model for all experiment stages
          <select
            id="lab-model"
            className="field rounded-control px-3 py-2"
            value={model}
            disabled={Boolean(busy) || disabled}
            onChange={(event) =>
              onModel(modelIdSchema.parse(event.target.value))
            }
          >
            {MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-meta grid gap-1" htmlFor="lab-instructions">
          Editable process instructions
          <textarea
            id="lab-instructions"
            className="field rounded-control min-h-24 p-3"
            disabled={Boolean(busy) || disabled}
            maxLength={4000}
            value={input.instructions}
            onChange={(event) =>
              changeInput({ ...input, instructions: event.target.value })
            }
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label
            className="text-meta grid content-start gap-1"
            htmlFor="lab-role"
          >
            Optional text role
            <select
              id="lab-role"
              className="field rounded-control px-3 py-2"
              disabled={Boolean(busy) || disabled}
              value={input.role}
              onChange={(event) =>
                changeInput({
                  ...input,
                  role: z
                    .enum([
                      'case_evidence',
                      'policy_excerpt',
                      'background_context',
                    ])
                    .parse(event.target.value),
                })
              }
            >
              <option value="case_evidence">Case evidence</option>
              <option value="policy_excerpt">Policy excerpt</option>
              <option value="background_context">Background context</option>
            </select>
          </label>
          <label
            className="text-meta grid gap-1 sm:col-span-2"
            htmlFor="lab-text"
          >
            Optional text
            <textarea
              id="lab-text"
              className="field rounded-control min-h-24 p-3"
              disabled={Boolean(busy) || disabled}
              maxLength={6000}
              value={input.text}
              onChange={(event) =>
                changeInput({ ...input, text: event.target.value })
              }
            />
          </label>
        </div>
        <p className="text-meta text-muted">
          Case evidence may propose supplier facts for confirmation. A policy
          excerpt may suggest a rule. Background context informs the proposal
          only.
        </p>
        <p className="text-meta text-muted">
          To confirm previously unverified funding, confirm both its status and
          its amount from the pasted evidence. A status-only claim never
          confirms the amount in the original record.
        </p>
        {input.role === 'case_evidence' && input.text.trim() ? (
          <Button
            onPress={() => void askModel('extract')}
            isDisabled={Boolean(busy) || disabled || !keyConfigured}
          >
            Extract supplier facts
          </Button>
        ) : null}
        {confirmedClaims.length ? (
          <div
            className="text-meta grid gap-2"
            aria-label="Confirmed local supplier facts"
          >
            <h3 className="font-semibold">Confirmed facts · {sku} only</h3>
            {confirmedClaims.map((claim) => (
              <p key={claim.field}>
                {claim.field}: original{' '}
                {String(
                  scenario.supplierTerms.records.find(
                    (record) => record.sku === sku,
                  )?.[claim.field],
                )}{' '}
                → accepted {String(claim.value)}
                <br />
                Supporting text: “{claim.quote}”
              </p>
            ))}
          </div>
        ) : null}
        {claims.length ? (
          <div className="grid gap-3" aria-label="Extracted supplier claims">
            {claims.map((claim, index) => {
              const original = scenario.supplierTerms.records.find(
                (record) => record.sku === sku,
              )?.[claim.field];
              return (
                <div
                  key={`${claim.field}-${index}`}
                  className="border-rule-default rounded-control grid gap-2 border p-3"
                >
                  <p className="text-meta font-semibold">
                    {claim.field} · source value {String(original ?? 'missing')}
                  </p>
                  <blockquote className="text-meta border-rule-default border-l pl-3">
                    “{claim.quote}”
                  </blockquote>
                  <label
                    className="text-meta grid gap-1"
                    htmlFor={`claim-${index}`}
                  >
                    Trial value
                    {claim.field === 'fundingStatus' ? (
                      <select
                        id={`claim-${index}`}
                        className="field rounded-control px-3 py-2"
                        value={claim.value}
                        onChange={(event) =>
                          setClaims(
                            claims.map((item, at) =>
                              at === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="unverified">Unverified</option>
                        <option value="not_offered">Not offered</option>
                      </select>
                    ) : (
                      <input
                        id={`claim-${index}`}
                        className="field rounded-control px-3 py-2"
                        type="number"
                        min="0"
                        max={
                          claim.field === 'fundingPencePerUnit'
                            ? 10_000
                            : 1_000_000
                        }
                        step="1"
                        value={claim.value}
                        onChange={(event) =>
                          setClaims(
                            claims.map((item, at) =>
                              at === index
                                ? { ...item, value: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    )}
                  </label>
                  <Button
                    isDisabled={Boolean(busy) || disabled}
                    onPress={() => confirmClaim(claim)}
                  >
                    Confirm for local trial
                  </Button>
                  {String(confirmedFacts[claim.field]) === claim.value ? (
                    <p className="text-meta">
                      Confirmed locally · original value retained as evidence
                    </p>
                  ) : null}
                </div>
              );
            })}
            {uncertainties.length ? (
              <p className="text-meta">
                Uncertainties: {uncertainties.join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="border-rule-default grid gap-3 border-t pt-4">
        <div className="grid gap-1">
          <h3 className="text-meta font-semibold">
            Review rules · active for all 27 candidates
          </h3>
          <p className="text-meta text-muted">
            Edit JSON or request one model suggestion. The preview compares the
            draft with the current rules; only Activate changes the checker.
          </p>
          <p className="text-meta text-muted">
            Protected safeguards keep all four core checks and their
            consequences. Margin and price-change thresholds are editable
            business policy; supplier coverage and order terms stay enforced.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {activeRules.rules.map((rule) => (
            <li
              key={rule.code}
              className="border-rule-default rounded-control text-meta border p-3"
            >
              <strong>{rule.title}</strong>
              <br />
              <span className="text-muted">
                {rule.code} · {rule.source} · {rule.failure} if failed
              </span>
              <br />
              {describeRule(rule)}
              {rule.supportingQuote ? (
                <blockquote>“{rule.supportingQuote}”</blockquote>
              ) : null}
              <details>
                <summary className="cursor-pointer">Rule JSON</summary>
                <pre className="mt-2 max-w-full overflow-auto text-xs">
                  {JSON.stringify(rule, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
        <Button
          onPress={() => void askModel('draft_rule')}
          isDisabled={Boolean(busy) || disabled || !keyConfigured}
        >
          Suggest one rule change
        </Button>
        {suggestion ? (
          <p className="text-meta">
            Model reason: {suggestion.reason}
            {suggestion.sourceQuote
              ? ` · Source: “${suggestion.sourceQuote}”`
              : ''}
          </p>
        ) : null}
        <label className="text-meta grid gap-1" htmlFor="lab-rules-json">
          Draft rule JSON
          <textarea
            id="lab-rules-json"
            className="field rounded-control min-h-64 p-3 font-mono"
            spellCheck={false}
            aria-invalid={!draft?.success}
            aria-describedby="lab-rules-validation"
            disabled={Boolean(busy) || disabled}
            value={ruleJson}
            onChange={(event) => {
              setRuleJson(event.target.value);
              setAcknowledgedDraft(null);
            }}
          />
        </label>
        <div id="lab-rules-validation">
          {!draft ? (
            <p className="text-meta">JSON syntax is invalid.</p>
          ) : !draft.success ? (
            <p className="text-meta">
              Invalid rule:{' '}
              {draft.error.issues
                .slice(0, 4)
                .map(({ path, message }) => `${path.join('.')}: ${message}`)
                .join(' · ')}
            </p>
          ) : (
            <div className="grid gap-2">
              <p className="text-meta">
                {differences.length} of 27 candidates change checks under this
                draft.
              </p>
              {differences.length ? (
                <details className="text-meta">
                  <summary className="cursor-pointer">
                    Show affected candidates
                  </summary>
                  <ul className="mt-2 grid gap-1">
                    {differences.map((item) => (
                      <li key={item.sku}>
                        {item.sku}: {item.before} → {item.after}
                        <ul className="ml-3 grid gap-1">
                          {item.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </div>
        {draftRules && ruleChanges.length ? (
          <div
            className="text-meta grid gap-2"
            aria-label="Rule change direction"
          >
            <ul className="grid gap-1">
              {ruleChanges.map((change) => (
                <li key={change.code}>
                  {change.code}: {change.direction} · {change.explanation}
                </li>
              ))}
            </ul>
            {requiresAcknowledgement ? (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="focus-visible:outline-action focus-visible:outline-2"
                  checked={acknowledgedDraft === ruleJson}
                  onChange={(event) =>
                    setAcknowledgedDraft(event.target.checked ? ruleJson : null)
                  }
                />
                I reviewed the relaxation or changed logic and its effect across
                candidates.
              </label>
            ) : null}
          </div>
        ) : null}
        <Button
          variant="primary"
          onPress={() => {
            if (
              !draftRules ||
              (requiresAcknowledgement && acknowledgedDraft !== ruleJson)
            )
              return;
            onActivate(draftRules);
            setRuleJson(null);
            onStatus('Draft rules activated locally for all 27 candidates.');
          }}
          isDisabled={
            !draftRules ||
            Boolean(busy) ||
            disabled ||
            (requiresAcknowledgement && acknowledgedDraft !== ruleJson)
          }
        >
          Activate reviewed rules locally
        </Button>
        <details className="text-meta min-w-0">
          <summary className="cursor-pointer">
            Last model call · exact input and output
          </summary>
          <pre className="bg-surface-inset rounded-control mt-2 max-w-full overflow-auto p-3 text-xs">
            {JSON.stringify(diagnostics, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}
