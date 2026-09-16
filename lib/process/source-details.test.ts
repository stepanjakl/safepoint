import { describe, expect, it } from 'vitest';

import { EXPECTED_SKUS, loadReviewedReplay } from '../promotion-release';
import { presentPromotionSourceDetails } from './source-details';
import { presentPromotionSources } from './system-links';

describe('presentPromotionSourceDetails', () => {
  const replay = loadReviewedReplay();
  const details = presentPromotionSourceDetails(replay);
  const sources = presentPromotionSources(replay);

  it('has a detail for every source the header lists, under the same id', () => {
    expect(Object.keys(details).sort()).toEqual(
      sources.map((source) => source.id).sort(),
    );
  });

  it('keeps every evidence record from the files exactly once', () => {
    const scenario = replay.scenario;
    const expected = [
      scenario.cataloguePricebook.records,
      scenario.shortlistProvenance.records,
      scenario.demandEvidence.records,
      scenario.supplyPosition.records,
      scenario.supplierTerms.records,
      scenario.channelState.records,
      scenario.operationalNotes.records,
    ].reduce((sum, records) => sum + records.length, 1);
    const ids = Object.values(details).flatMap((detail) =>
      detail.records.map((record) => record.evidenceId),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(expected);
  });

  it('counts unavailable records the way the header reports them', () => {
    for (const source of sources) {
      const detail = details[source.id]!;
      const reported = source.freshness?.label.match(/^(\d+) of (\d+)/);
      expect(detail.unavailableCount).toBe(reported ? Number(reported[1]) : 0);
    }
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
