import { describe, expect, it } from 'vitest';

import { EXPECTED_SKUS, loadReviewedReplay } from '../promotion-release';
import { presentPromotionInputDetails } from './input-details';
import { PROMOTION_PACKS, presentPromotionInputs } from './system-links';

describe('presentPromotionInputDetails', () => {
  const replay = loadReviewedReplay();
  const details = presentPromotionInputDetails(replay);
  const inputs = presentPromotionInputs(replay);

  it('has one input per evidence file, under the id the header lists', () => {
    expect(inputs).toHaveLength(PROMOTION_PACKS.length);
    expect(Object.keys(details).sort()).toEqual(
      inputs.map((input) => input.id).sort(),
    );
  });

  it('keeps every evidence record from the files exactly once', () => {
    const scenario = replay.scenario;
    // The brief and the policy are one record each: the file as a whole.
    const expected = [
      scenario.cataloguePricebook.records,
      scenario.shortlistProvenance.records,
      scenario.demandEvidence.records,
      scenario.supplyPosition.records,
      scenario.supplierTerms.records,
      scenario.channelState.records,
      scenario.operationalNotes.records,
    ].reduce((sum, records) => sum + records.length, 2);
    const ids = Object.values(details).flatMap((detail) =>
      detail.records.map((record) => record.evidenceId),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(expected);
  });

  it('keeps every source label as provenance, so one file stays one input', () => {
    const labels = new Set(
      replay.scenario.operationalNotes.records.map(
        (record) => record.sourceLabel,
      ),
    );
    const notes = Object.values(details).find(
      (detail) => detail.file === 'operational-notes.json',
    )!;
    expect(labels.size).toBeGreaterThan(1);
    expect(new Set(notes.sources)).toEqual(labels);
  });

  it('counts unavailable records the way the header reports them', () => {
    for (const input of inputs) {
      const detail = details[input.id]!;
      const reported = input.freshness?.label.match(/^(\d+) of (\d+)/);
      expect(detail.unavailableCount).toBe(reported ? Number(reported[1]) : 0);
    }
  });

  it('versions the policy rules rather than ageing them', () => {
    const policy = inputs.find((input) => input.icon === 'policy')!;
    expect(policy.freshness).toBeUndefined();
    expect(details[policy.id]!.version).toBe(
      replay.scenario.policyRules.policyVersion,
    );
  });

  it('cites only review items that exist, and keeps each raw record intact', () => {
    for (const detail of Object.values(details)) {
      for (const record of detail.records) {
        for (const item of record.citedBy) {
          expect(EXPECTED_SKUS).toContain(item.sku);
        }
        expect(JSON.parse(record.raw)).toMatchObject({
          evidenceId: record.evidenceId,
        });
      }
    }
  });
});
