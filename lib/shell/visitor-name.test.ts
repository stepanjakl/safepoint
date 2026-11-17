import { describe, expect, it } from 'vitest';

import { VISITOR_ADJECTIVES, VISITOR_NOUNS, visitorName } from './visitor-name';

describe('a visitor name', () => {
  it('is an adjective and a noun chosen by the bytes', () => {
    expect(visitorName(new Uint8Array([0, 0]))).toBe('Curious Croissant');
    expect(visitorName(new Uint8Array([1, 1]))).toBe('Sunny Shakshuka');
  });

  it('wraps past the end of either list and tolerates short input', () => {
    expect(visitorName(new Uint8Array([255, 255]))).toMatch(/^\S+ \S+$/);
    expect(visitorName(new Uint8Array([]))).toBe('Curious Croissant');
  });

  it('draws on lists of forty words each, none repeated', () => {
    expect(new Set(VISITOR_ADJECTIVES).size).toBe(40);
    expect(new Set(VISITOR_NOUNS).size).toBe(40);
  });
});
