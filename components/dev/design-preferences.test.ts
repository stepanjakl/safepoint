import { describe, expect, it } from 'vitest';

import {
  resolveColourSystem,
  resolveEdgeTreatment,
} from './design-preferences';

describe('colour-system preference resolution', () => {
  it('gives a valid URL choice precedence over storage', () => {
    expect(resolveColourSystem('original', 'custom')).toBe('original');
    expect(resolveColourSystem('custom', 'original')).toBe('custom');
  });

  it('falls through invalid URL and storage values to Original', () => {
    expect(resolveColourSystem('unknown', 'custom')).toBe('custom');
    expect(resolveColourSystem('unknown', 'unknown')).toBe('original');
    expect(resolveColourSystem(null, null)).toBe('original');
  });
});

describe('edge-treatment preference resolution', () => {
  it('gives a valid URL choice precedence over storage', () => {
    expect(resolveEdgeTreatment('existing', 'opaque')).toBe('existing');
    expect(resolveEdgeTreatment('opaque', 'existing')).toBe('opaque');
  });

  it('falls through invalid URL and storage values to Existing', () => {
    expect(resolveEdgeTreatment('unknown', 'opaque')).toBe('opaque');
    expect(resolveEdgeTreatment('unknown', 'unknown')).toBe('existing');
    expect(resolveEdgeTreatment(null, null)).toBe('existing');
  });
});
