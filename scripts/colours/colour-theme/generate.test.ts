import { describe, expect, it } from 'vitest';

import { COLOUR_STEPS, NEUTRAL_FAMILIES } from './config.ts';
import { buildArtifacts, checkArtifacts } from './generate.ts';

describe('custom colour generation', () => {
  it('is deterministic and complete', async () => {
    const first = await buildArtifacts();
    const second = await buildArtifacts();

    expect(second).toEqual(first);
    expect(first.failures).toEqual([]);
    for (const step of COLOUR_STEPS) {
      expect(first.css).toContain(`--sp-neutral-${step}: rgb(`);
    }
  });

  it('emits one ramp rather than one per theme', async () => {
    /* A step is a colour, not a colour per theme: the light/dark relationship
       belongs to the role assignments, where it can be read. A light-dark()
       here would mean the ramp had quietly grown a second dimension again. */
    const { css } = await buildArtifacts();
    expect(css).not.toContain('light-dark(');
    /* Values, not aliases: a step one read away from a role. */
    expect(css).not.toContain('var(');
    const blocks = css.split(/^(?=:root)/m).slice(1);
    expect(blocks).toHaveLength(NEUTRAL_FAMILIES.length);
    for (const [index, family] of NEUTRAL_FAMILIES.entries()) {
      const block = blocks[index]!;
      expect(
        block.startsWith(
          index === 0 ? ':root {' : `:root[data-neutral='${family.id}']`,
        ),
      ).toBe(true);
      expect(block.match(/--sp-neutral-\d+:/g), family.id).toHaveLength(
        COLOUR_STEPS.length,
      );
    }
  });

  it('reports every required contrast contract for both themes', async () => {
    const report = JSON.parse((await buildArtifacts()).report) as {
      contrastContracts: { classification: string; passed: boolean }[];
    };
    const required = report.contrastContracts.filter(
      ({ classification }) => classification === 'required',
    );

    expect(required.length).toBeGreaterThan(0);
    expect(required.every(({ passed }) => passed)).toBe(true);
  });

  it('keeps committed generated artifacts current', async () => {
    await expect(checkArtifacts()).resolves.toBeDefined();
  });
});
