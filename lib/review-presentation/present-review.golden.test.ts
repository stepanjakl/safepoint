import { describe, expect, it } from 'vitest';

import { loadReviewedReplay } from '../promotion-release';
import {
  formatDuration,
  formatLondonDateTime,
  formatLondonTime,
  formatMoney,
  formatPercent,
  parseSkuParam,
  presentReview,
} from './index';

/*
  The whole presentation of the fixture replay, byte for byte. Any change to
  what this module produces -- intended or not -- shows up here as a snapshot
  diff; refactors must leave it untouched. Update with `vitest -u` only when
  the output is meant to change.
*/
describe('review presentation output', () => {
  it('presents the fixture replay exactly as recorded', () => {
    expect(presentReview(loadReviewedReplay())).toMatchSnapshot();
  });

  it('formats values exactly as recorded', () => {
    expect({
      dateTime: formatLondonDateTime('2026-09-04T08:00:00Z'),
      time: formatLondonTime('2026-09-04T08:00:00Z'),
      durations: [0, 59_000, 3_600_000, 76_500_000].map(formatDuration),
      money: [0, 99, 12_345, -250].map(formatMoney),
      percent: [0, 12.5, -3.25].map(formatPercent),
      skus: ['', 'nope', 'SKU-1', 'sku-1'].map((value) => parseSkuParam(value)),
    }).toMatchSnapshot();
  });
});
