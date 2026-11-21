import { describe, expect, it } from 'vitest';

import { resolveEdgePreset, resolveNeutral } from './design-preferences';

describe('neutral family preference resolution', () => {
  it('gives a valid URL choice precedence over storage', () => {
    expect(resolveNeutral('steel', 'clay')).toBe('steel');
    expect(resolveNeutral('clay', 'steel')).toBe('clay');
  });

  it('falls through invalid URL and storage values to Graphite', () => {
    expect(resolveNeutral('zinc', 'moss')).toBe('moss');
    expect(resolveNeutral('unknown', 'zinc')).toBe('graphite');
    expect(resolveNeutral(null, null)).toBe('graphite');
  });
});

describe('edge preset preference resolution', () => {
  it('gives a valid URL choice precedence over storage', () => {
    expect(resolveEdgePreset('retina', 'highlights')).toBe('retina');
    expect(resolveEdgePreset('highlights', 'retina')).toBe('highlights');
  });

  it('falls through invalid URL and storage values to default', () => {
    expect(resolveEdgePreset('thin', 'highlights')).toBe('highlights');
    expect(resolveEdgePreset('unknown', 'thin')).toBe('retina');
    expect(resolveEdgePreset(null, null)).toBe('retina');
  });
});
