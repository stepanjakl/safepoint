import { describe, expect, it } from 'vitest';

import { FILE_ID, READ_ID, RULEBOOK_ID } from './ids';

// Moved from run-key.test.ts, whose file names went with the applied files.
describe('the id patterns', () => {
  it('keep what each caller accepted', () => {
    expect(FILE_ID.test('a'.repeat(200))).toBe(true);
    expect(READ_ID.test('a'.repeat(80))).toBe(true);
    expect(READ_ID.test('a'.repeat(81))).toBe(false);
    expect(READ_ID.test('')).toBe(false);
    expect(RULEBOOK_ID.test('0123456789ab')).toBe(true);
    expect(RULEBOOK_ID.test('0123456789AB')).toBe(false);
    expect(RULEBOOK_ID.test('0123456789a')).toBe(false);
  });
});
