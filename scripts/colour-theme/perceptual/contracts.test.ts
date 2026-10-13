import { describe, expect, it } from 'vitest';

import {
  constantDistance,
  distinguishable,
  readable,
  strongerThan,
  summarise,
  toneMatch,
  visibleAgainst,
} from './contracts.ts';
import type { Reading } from './types.ts';

const reading = (over: Partial<Reading>): Reading => ({
  component: 'test',
  theme: 'light',
  family: 'graphite',
  surface: 'canvas',
  strip: 'default',
  group: 'blocked',
  state: 'rest-chip',
  colour: '#e0e0e0',
  ref: '#f0f0f0',
  ...over,
});

describe('constantDistance', () => {
  it('passes when every surface keeps the canvas distance', () => {
    const findings = constantDistance(
      [
        reading({}),
        reading({ surface: 'floating', colour: '#eaeaea', ref: '#fafafa' }),
      ],
      { across: 'surface', state: 'rest-chip', tolerance: 0.012 },
    );
    expect(findings.every((f) => f.pass)).toBe(true);
  });

  it('fails when a surface drifts', () => {
    const findings = constantDistance(
      [
        reading({}),
        reading({ surface: 'floating', colour: '#f6f6f6', ref: '#fafafa' }),
      ],
      { across: 'surface', state: 'rest-chip', tolerance: 0.012 },
    );
    expect(findings.some((f) => !f.pass && f.severity === 'blocking')).toBe(
      true,
    );
  });
});

describe('toneMatch', () => {
  const tones = ['blocked', 'decision', 'ready'].map((group) =>
    reading({ group, colour: 'oklch(0.85 0.07 25)' }),
  );

  it('accepts a neutral of the same lightness once the gap is allowed for', () => {
    const neutral = reading({ group: 'deferred', colour: 'oklch(0.85 0 0)' });
    const findings = toneMatch([...tones, neutral], {
      state: 'rest-chip',
      tones: ['blocked', 'decision', 'ready'],
      neutral: 'deferred',
      tolerance: 3.5,
      target: 2,
      offset: { light: -4 },
    });
    expect(summarise(findings).blocking).toEqual([]);
  });

  it('fails a neutral far lighter than its neighbours', () => {
    const neutral = reading({ group: 'deferred', colour: 'oklch(0.95 0 0)' });
    const findings = toneMatch([...tones, neutral], {
      state: 'rest-chip',
      tones: ['blocked', 'decision', 'ready'],
      neutral: 'deferred',
      tolerance: 3.5,
      target: 2,
    });
    expect(summarise(findings).blocking.length).toBeGreaterThan(0);
  });
});

describe('visibleAgainst', () => {
  it('grades: blocking under the floor, advice under the target', () => {
    const near = reading({ colour: '#f1f1f1', ref: '#f0f0f0' });
    const middling = reading({ colour: '#dadada', ref: '#f0f0f0' });
    const far = reading({ colour: '#c0c0c0', ref: '#f0f0f0' });
    const result = visibleAgainst([near, middling, far], {
      state: 'rest-chip',
      minimum: 3,
      target: 8,
    });
    expect(result.map((f) => [f.pass, f.severity])).toEqual([
      [false, 'blocking'],
      [false, 'advisory'],
      [true, 'blocking'],
    ]);
  });
});

describe('strongerThan', () => {
  it('counts the stronger end of the pill', () => {
    const readings = [
      reading({ state: 'hover-wash', colour: '#e8e8e8', ref: '#f0f0f0' }),
      reading({ state: 'pill-top', colour: '#ececec', ref: '#f0f0f0' }),
      reading({ state: 'pill-bottom', colour: '#d0d0d0', ref: '#f0f0f0' }),
    ];
    const findings = strongerThan(readings, {
      later: ['pill-top', 'pill-bottom'],
      earlier: 'hover-wash',
    });
    expect(findings.every((f) => f.pass)).toBe(true);
  });
});

describe('readable and distinguishable', () => {
  it('holds WCAG as the floor and reports APCA beside it', () => {
    const findings = readable(
      [reading({ state: 'ink', colour: '#222222', ref: '#e0e0e0' })],
      { state: 'ink' },
    );
    expect(findings.find((f) => f.id.startsWith('wcag'))?.pass).toBe(true);
    expect(findings.find((f) => f.id.startsWith('apca'))?.severity).toBe(
      'advisory',
    );
  });

  it('flags two tones that collapse', () => {
    const findings = distinguishable(
      [
        reading({ group: 'blocked', colour: '#bcbab4' }),
        reading({ group: 'ready', colour: '#bdbbb5' }),
      ],
      { id: 'seen', minimumDeltaE: 8, minimumLightness: 0.05 },
    );
    expect(findings[0]?.pass).toBe(false);
  });
});
