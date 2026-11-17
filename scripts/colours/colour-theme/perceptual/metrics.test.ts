import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';

import {
  apca,
  appearance,
  deltaE2000,
  hellwig,
  lightnessGap,
  lstar,
  oklabL,
  simulate,
  wcag,
} from './metrics.ts';

const lab = (l: number, a: number, b: number) => new Color('lab', [l, a, b]);

describe('colour difference', () => {
  /* Pairs from Sharma, Wu and Dalal (2005), the CIEDE2000 reference data. */
  it.each([
    [lab(50, 2.6772, -79.7751), lab(50, 0, -82.7485), 2.0425],
    [lab(50, 3.1571, -77.2803), lab(50, 0, -82.7485), 2.8615],
    [lab(50, 2.8361, -74.02), lab(50, 0, -82.7485), 3.4412],
    [lab(50, 2.5, 0), lab(50, 0, -2.5), 4.3065],
    [lab(50, 2.5, 0), lab(73, 25, -18), 27.1492],
  ])('matches the published CIEDE2000 values', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 3);
  });
});

describe('contrast', () => {
  it('matches known WCAG ratios', () => {
    expect(wcag('black', 'white')).toBeCloseTo(21, 5);
    expect(wcag('#767676', 'white')).toBeCloseTo(4.54, 2);
  });

  it('reports APCA with the sign of the polarity', () => {
    expect(apca('black', 'white')).toBeCloseTo(106.04, 1);
    expect(apca('white', 'black')).toBeCloseTo(-107.88, 1);
  });
});

describe('lightness', () => {
  it('puts white at 100 and black at 0', () => {
    expect(lstar('white')).toBeCloseTo(100, 3);
    expect(lstar('black')).toBeCloseTo(0, 3);
    expect(oklabL('white')).toBeCloseTo(1, 3);
  });
});

describe('Hellwig and Fairchild with the H-K extension', () => {
  /* The worked example published with colour-science's XYZ_to_Hellwig2022. */
  it('reproduces the published vector', () => {
    const result = hellwig([19.01, 20, 21.78], [95.05, 100, 108.88], {
      adaptingLuminance: 318.31,
      backgroundFactor: 20,
      surround: 'average',
    });
    expect(result.J).toBeCloseTo(41.7312079, 4);
    expect(result.C).toBeCloseTo(0.0257636, 4);
    expect(result.h).toBeCloseTo(217.0679597, 3);
    expect(result.M).toBeCloseTo(0.0339889, 4);
    expect(result.Q).toBeCloseTo(55.8523226, 3);
    expect(result.JHK).toBeCloseTo(41.8802782, 4);
    expect(result.QHK).toBeCloseTo(56.0518358, 3);
  });

  it('gives a saturated colour more lightness than its luminance alone', () => {
    const saturated = appearance('oklch(0.8 0.15 25)');
    const grey = appearance('#cccccc');
    // A grey keeps a small term, as adaptation to the white is incomplete.
    expect(saturated.JHK - saturated.J).toBeGreaterThan(grey.JHK - grey.J + 1);
  });

  it('reports the gap to a reference per model', () => {
    const gap = lightnessGap('#e0e0e0', '#e0e0e0');
    expect(Object.values(gap).every((value) => Math.abs(value) < 1e-9)).toBe(
      true,
    );
  });
});

describe('colour-vision deficiency simulation', () => {
  it('leaves a neutral grey alone', () => {
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const grey = simulate('#808080', kind);
      expect(deltaE2000(grey, '#808080')).toBeLessThan(2);
    }
  });

  it('removes all colour for achromatopsia', () => {
    const result = simulate('#d03030', 'achromatopsia').to('oklch');
    expect(result.coords[1] ?? 0).toBeLessThan(0.005);
  });
});
