import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from './replay';
import { scenarioEvidencePackSchema } from './schemas';
import { deriveFindingCodes, deriveGateObligations } from './review-policy';

const replay = loadReviewedReplay();

function proposalFor(sku: (typeof replay.lines)[number]['sku']) {
  const candidate = replay.proposal.candidates.find((line) => line.sku === sku);
  if (!candidate) throw new Error(`Missing proposal ${sku}`);
  return {
    sku,
    proposedPricePence:
      candidate.proposed?.promotionalSellingPricePence ?? null,
    proposedTopUpUnits:
      candidate.proposed?.recommendedTopUpQuantityUnits ?? null,
    proposedStartsAt: candidate.proposed?.startsAt ?? null,
    proposedEndsAt: candidate.proposed?.endsAt ?? null,
  };
}

describe('derived review diagnostics', () => {
  it('matches all 27 reviewed gate obligations and finding codes', () => {
    for (const line of replay.lines) {
      const proposal = proposalFor(line.sku);
      expect(
        deriveGateObligations(replay.scenario, proposal).map(
          ({ gate, obligation }) => ({ gate, obligation }),
        ),
      ).toEqual(
        line.policyEvaluation.gateObligations.map(({ gate, obligation }) => ({
          gate,
          obligation,
        })),
      );

      expect(deriveFindingCodes(replay.scenario, proposal).sort()).toEqual(
        line.policyEvaluation.findings.map(({ code }) => code).sort(),
      );
    }
  });

  it('requires supplier and logistics gates for a known gap or a proposed top-up', () => {
    const gate = (sku: (typeof replay.lines)[number]['sku'], topUp?: number) =>
      deriveGateObligations(replay.scenario, {
        ...proposalFor(sku),
        proposedTopUpUnits: topUp ?? proposalFor(sku).proposedTopUpUnits,
      }).filter(
        ({ gate: name }) => name === 'supplier' || name === 'logistics',
      );

    expect(gate('ALD-0001').map(({ obligation }) => obligation)).toEqual([
      'required',
      'required',
    ]);
    expect(gate('ALD-0004').map(({ obligation }) => obligation)).toEqual([
      'not_applicable',
      'not_applicable',
    ]);
    expect(gate('ALD-0004', 12).map(({ obligation }) => obligation)).toEqual([
      'required',
      'required',
    ]);
    expect(gate('ALD-0027').map(({ obligation }) => obligation)).toEqual([
      'not_applicable',
      'not_applicable',
    ]);
  });

  it('verifies note claims before describing a correction or safe alternative', () => {
    const avocadoScenario = structuredClone(replay.scenario);
    const avocadoNote = avocadoScenario.operationalNotes.records.find(
      ({ evidenceId }) => evidenceId === 'ev-note-avocado-multiple',
    );
    if (avocadoNote?.claim?.kind !== 'prior_top_up_request')
      throw new Error('Missing prior top-up claim.');
    expect(
      deriveFindingCodes(avocadoScenario, proposalFor('ALD-0008')),
    ).toContain('invalid_order_multiple_corrected');
    avocadoNote.claim.requestedUnits = 480;
    expect(
      deriveFindingCodes(avocadoScenario, proposalFor('ALD-0008')),
    ).not.toContain('invalid_order_multiple_corrected');
    avocadoScenario.operationalNotes.records.push(structuredClone(avocadoNote));
    expect(scenarioEvidencePackSchema.safeParse(avocadoScenario).success).toBe(
      false,
    );

    const mozzarellaScenario = structuredClone(replay.scenario);
    const mozzarellaNote = mozzarellaScenario.operationalNotes.records.find(
      ({ evidenceId }) => evidenceId === 'ev-note-mozzarella-options',
    );
    if (mozzarellaNote?.claim?.kind !== 'candidate_plan_options')
      throw new Error('Missing alternative plan claim.');
    expect(
      deriveFindingCodes(mozzarellaScenario, proposalFor('ALD-0023')),
    ).toContain('alternative_safe_plan');
    const alternative = mozzarellaNote.claim.options.at(1);
    if (!alternative) throw new Error('Missing alternative.');
    alternative.topUpUnits = 280;
    expect(
      deriveFindingCodes(mozzarellaScenario, proposalFor('ALD-0023')),
    ).not.toContain('alternative_safe_plan');
    mozzarellaNote.claim.options.push({
      promotionalSellingPricePence: alternative.promotionalSellingPricePence,
      topUpUnits: alternative.topUpUnits,
    });
    expect(
      scenarioEvidencePackSchema.safeParse(mozzarellaScenario).success,
    ).toBe(false);
  });
});
