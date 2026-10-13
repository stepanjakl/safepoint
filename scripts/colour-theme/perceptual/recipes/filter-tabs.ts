import type { Locator, Page } from '@playwright/test';

import { PERCEPTUAL_OFFSETS } from '../../config.ts';
import {
  constantDistance,
  readable,
  strongerThan,
  toneMatch,
  visibleAgainst,
} from '../contracts.ts';
import type { Finding, Reading } from '../types.ts';

/*
  The filter strip's colours, as readings. The workbench's live section holds
  one working strip of each kind on each surface (data-surface, data-strip);
  this drives them through rest, hover and chosen and records what each part
  paints. See docs/interface/COLOUR-TESTING.md → State recipes.
*/
export const FILTER_TABS = {
  component: 'filter-tabs',
  path: '/workbench/controls',
  surfaces: ['canvas', 'primary', 'floating'] as const,
  /* Coloured buckets, the neutral one among them, and the lead tab. */
  groups: ['all', 'blocked', 'decision', 'deferred', 'ready'] as const,
  tones: ['blocked', 'decision', 'ready'] as const,
  neutral: 'deferred',
};

const FUNCTION = /(?:rgba?|color|oklab|oklch|lab|lch)\([^)]*\)/g;

const css = (locator: Locator, property: string) =>
  locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );

export type Setup = Pick<Reading, 'theme' | 'family'>;

export async function readFilterTabs(
  page: Page,
  setup: Setup,
): Promise<Reading[]> {
  const readings: Reading[] = [];
  for (const surface of FILTER_TABS.surfaces) {
    const scope = page.locator(`[data-surface="${surface}"]`);
    const strip = scope.locator('[data-strip="default"] .field-track');
    const make = (
      group: string,
      state: string,
      colour: string,
      ref: string,
      stripName = 'default',
    ): Reading => ({
      component: FILTER_TABS.component,
      ...setup,
      surface,
      strip: stripName,
      group,
      state,
      colour,
      ref,
    });
    const tab = (group: string) =>
      strip.locator(`[data-review-filter="${group}"]`);
    const track = () => css(strip, 'background-color');

    for (const group of FILTER_TABS.groups) {
      const other = group === 'all' ? 'ready' : 'all';
      await tab(other).click();
      await page.mouse.move(0, 0);
      const ground = await track();
      const rest = tab(group);
      readings.push(
        make(
          group,
          'rest-chip',
          await css(rest.locator('.review-tab-count'), 'background-color'),
          ground,
        ),
        make(group, 'rest-ink', await css(rest, 'color'), ground),
      );

      await rest.hover();
      const wash = await css(rest, 'background-color');
      readings.push(
        make(group, 'hover-wash', wash, ground),
        make(
          group,
          'hover-chip',
          await css(rest.locator('.review-tab-count'), 'background-color'),
          wash,
        ),
      );

      await rest.click();
      await page.mouse.move(0, 0);
      const chosen = tab(group);
      const gradient = await css(
        strip.locator('.review-tab-indicator'),
        'background-image',
      );
      const [top, bottom] = gradient.match(FUNCTION) ?? [];
      if (!top || !bottom) throw new Error(`No pill gradient for ${group}`);
      const ink = await css(chosen, 'color');
      readings.push(
        make(group, 'pill-top', top, ground),
        make(group, 'pill-bottom', bottom, ground),
        make(
          group,
          'chosen-chip',
          await css(chosen.locator('.review-tab-count'), 'background-color'),
          bottom,
        ),
        make(group, 'ink-on-pill-top', ink, top),
        make(group, 'ink-on-pill-bottom', ink, bottom),
      );
    }

    const spied = scope.locator('[data-strip="spied"] .field-track');
    const spiedTab = spied.locator('[data-spied]');
    const spiedGround = await css(spied, 'background-color');
    const edge = (await css(spiedTab, 'box-shadow')).match(FUNCTION)?.[0];
    if (!edge) throw new Error('The spied tab has no edge');
    readings.push(
      make('decision', 'spied-edge', edge, spiedGround, 'spied'),
      make(
        'decision',
        'spied-chip',
        await css(spiedTab.locator('.review-tab-count'), 'background-color'),
        spiedGround,
        'spied',
      ),
    );
  }
  return readings;
}

/* The strip's contracts. Floors are starting values, set under the smallest
   distance measured on the strip when they were written; see
   docs/interface/COLOUR-TESTING.md → Contract catalogue for how to move one. */
export function checkFilterTabs(readings: Reading[]): Finding[] {
  const coloured = ['blocked', 'decision', 'deferred', 'ready'];
  const parts = [
    'rest-chip',
    'hover-wash',
    'pill-top',
    'pill-bottom',
    'chosen-chip',
  ];
  return [
    ...parts.flatMap((state) => [
      ...constantDistance(readings, {
        across: 'surface',
        state,
        groups: state === 'rest-chip' ? coloured : undefined,
        tolerance: 0.012,
      }),
      ...constantDistance(readings, {
        across: 'family',
        state,
        groups: state === 'rest-chip' ? coloured : undefined,
        tolerance: 0.02,
      }),
    ]),
    ...[
      'rest-chip',
      'hover-chip',
      'pill-top',
      'pill-bottom',
      'chosen-chip',
    ].flatMap((state) =>
      toneMatch(readings, {
        state,
        tones: FILTER_TABS.tones,
        neutral: FILTER_TABS.neutral,
        offset: PERCEPTUAL_OFFSETS['filter-tabs'].neutral,
        tolerance: 3.5,
        target: 2,
      }),
    ),
    ...visibleAgainst(readings, {
      state: 'rest-chip',
      minimum: 4,
      target: 5,
      groups: coloured,
    }),
    ...visibleAgainst(readings, {
      state: 'hover-wash',
      minimum: 2.5,
      target: 3.5,
    }),
    ...visibleAgainst(readings, { state: 'hover-chip', minimum: 4, target: 5 }),
    ...visibleAgainst(readings, { state: 'pill-top', minimum: 4, target: 5 }),
    ...visibleAgainst(readings, {
      state: 'pill-bottom',
      minimum: 4,
      target: 5,
    }),
    ...visibleAgainst(readings, {
      state: 'chosen-chip',
      minimum: 3,
      target: 5,
    }),
    ...visibleAgainst(readings, { state: 'spied-edge', minimum: 4, target: 6 }),
    ...visibleAgainst(readings, { state: 'spied-chip', minimum: 4, target: 6 }),
    ...strongerThan(readings, {
      later: ['pill-top', 'pill-bottom'],
      earlier: 'hover-wash',
    }),
    ...readable(readings, { state: 'rest-ink' }),
    ...readable(readings, { state: 'ink-on-pill-top' }),
    ...readable(readings, { state: 'ink-on-pill-bottom' }),
  ];
}
