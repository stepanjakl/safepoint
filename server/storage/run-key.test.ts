import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';

import { FILE_ID, READ_ID, RULEBOOK_ID } from './ids';
import { runFile, type RunKey } from './run-key';

// Real kept files are found by these names, so they must not move: each
// expected path is what the function it replaced produced.

const scratch = inScratchDirectory();
const key: RunKey = {
  process: 'brunch-orders',
  readId: 'read-2026_01',
  fingerprint: 'abc123def456',
};
const at = (kind: string, name: string) =>
  path.join(scratch(), 'data', 'brunch-orders', kind, name);

describe('the file for a run', () => {
  it('names a write as before', () => {
    // applicationFile
    expect(runFile('applied', key)).toBe(
      at('applied', 'read-2026_01.abc123def456.json'),
    );
  });

  it('refuses an id that could name a path, with the words it always had', () => {
    for (const bad of ['../x', 'a/b', 'a.b', '', 'a b']) {
      expect(() => runFile('applied', { ...key, readId: bad })).toThrow(
        'Not a read or rulebook id.',
      );
      expect(() => runFile('applied', { ...key, fingerprint: bad })).toThrow(
        'Not a read or rulebook id.',
      );
    }
  });
});

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
