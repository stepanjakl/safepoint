import { describe, expect, it } from 'vitest';

import { runDay } from './run-time';

describe('runDay', () => {
  const now = new Date('2026-06-17T12:00:00Z');

  it('names today and yesterday in London', () => {
    expect(runDay('2026-06-17T06:00:00Z', now)).toBe('Today');
    expect(runDay('2026-06-16T06:00:00Z', now)).toBe('Yesterday');
    expect(runDay('2026-06-15T06:00:00Z', now)).toBe('Jun 15');
  });

  it('places an instant by the London day, not the UTC one', () => {
    // 23:30 UTC on the 16th is 00:30 BST on the 17th.
    expect(runDay('2026-06-16T23:30:00Z', now)).toBe('Today');
  });

  it('finds yesterday across the spring clock change', () => {
    // 00:30 BST on Monday 30 March is still Sunday in UTC.
    const monday = new Date('2026-03-29T23:30:00Z');
    expect(runDay('2026-03-29T09:00:00Z', monday)).toBe('Yesterday');
    expect(runDay('2026-03-28T09:00:00Z', monday)).toBe('Mar 28');
  });

  it('finds yesterday across the autumn clock change', () => {
    // 23:30 GMT on Sunday 25 October follows a 25-hour day.
    const sunday = new Date('2026-10-25T23:30:00Z');
    expect(runDay('2026-10-24T22:30:00Z', sunday)).toBe('Yesterday');
  });
});
