import { describe, expect, it } from 'vitest';

import {
  ANCHORED_ROLES,
  RELATIVE_STEPS,
  SURFACE_LAYERS,
  SURFACE_STEPS,
  THEMES,
  recessRoles,
} from './config.ts';

/* Step numbers grow darker: 0 is the lightest end of the ramp. */
const stepsOf = (variable: string) =>
  SURFACE_STEPS.get(variable as `--${string}`) ??
  RELATIVE_STEPS.get(variable as `--${string}`)!;

const layers = Object.values(SURFACE_LAYERS);
const flush = new Set<string>(
  layers.flatMap((surface) =>
    'flush' in surface && 'highlight' in surface ? [surface.highlight] : [],
  ),
);

/* Every edge a surface paints: [ring, highlight, face, ground]. A recess's
   ground is the surface it is cut into. */
const edges = layers.flatMap((surface) => {
  const cut = recessRoles(surface.recess);
  const own =
    'on' in surface
      ? [
          [
            surface.ring,
            surface.highlight,
            surface.face,
            SURFACE_LAYERS[surface.on].face,
          ] as const,
        ]
      : [];
  return [...own, [cut.ring, cut.highlight, cut.face, surface.face] as const];
});

describe('surface stack', () => {
  it('lights every highlight lighter in light and darker in dark', () => {
    const pairs = [
      ...edges.map(([, highlight, face]) => [highlight, face] as const),
      ...[...ANCHORED_ROLES]
        .filter(([, role]) => 'highlightOf' in role)
        .map(
          ([variable, role]) =>
            [variable, (role as { highlightOf: string }).highlightOf] as const,
        ),
    ];
    expect(pairs.length).toBeGreaterThan(edges.length);
    for (const [highlight, face] of pairs) {
      /* A flush surface is already the lightest step, so its highlight stops
         at the face in light. */
      const light = stepsOf(highlight).light;
      if (flush.has(highlight))
        expect(light, highlight).toBe(stepsOf(face).light);
      else expect(light, highlight).toBeLessThan(stepsOf(face).light);
      expect(stepsOf(highlight).dark, highlight).toBeGreaterThan(
        stepsOf(face).dark,
      );
    }
  });

  it('stands every ring off both its face and its ground', () => {
    for (const [ring, , face, ground] of edges) {
      for (const theme of THEMES) {
        const sides = [stepsOf(face)[theme], stepsOf(ground)[theme]];
        /* Darker than both in light, lighter than both in dark. */
        if (theme === 'light')
          expect(stepsOf(ring).light, ring).toBeGreaterThan(Math.max(...sides));
        else expect(stepsOf(ring).dark, ring).toBeLessThan(Math.min(...sides));
      }
    }
  });
});
