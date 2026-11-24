import { describe, expect, it } from 'vitest';

import { said } from './said';

describe('what a stopped workflow says', () => {
  it('is the model service’s own words, without the SDK’s retries', () => {
    expect(
      said({
        message:
          'Step "step//./server/workflows/proposal-steps//batchStep" failed after 3 retries: This model is currently experiencing high demand.\nmore',
      }),
    ).toBe('This model is currently experiencing high demand.');
  });

  it('reads an error rebuilt outside its realm, and says Failed. of nothing', () => {
    expect(said(new Error('Out of quota.'))).toBe('Out of quota.');
    expect(said(null)).toBe('Failed.');
    expect(said({ message: '' })).toBe('Failed.');
  });
});
