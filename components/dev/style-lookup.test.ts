import { describe, expect, it } from 'vitest';

import { readStylesheets } from '@/lib/dev/stylesheets';

import {
  arbitraryReads,
  inScheme,
  buildLookup,
  rulesNaming,
  shorten,
  splitVariants,
  themeFor,
  utilityFor,
} from './style-lookup';

const lookup = buildLookup(readStylesheets(process.cwd()));

describe('style inspector lookups', () => {
  it('splits variants off a class, leaving brackets whole', () => {
    expect(splitVariants('data-[hovered]:max-sm:bg-canvas/50!')).toEqual({
      base: 'bg-canvas/50',
      variants: ['data-[hovered]', 'max-sm'],
    });
    expect(splitVariants('bg-[url(a:b)]').base).toBe('bg-[url(a:b)]');
  });

  it('finds the @theme entry a Tailwind utility reads', () => {
    expect(themeFor('bg-canvas', lookup)?.name).toBe('--color-canvas');
    expect(themeFor('border-t-rule-faint', lookup)?.name).toBe(
      '--color-rule-faint',
    );
    expect(themeFor('text-meta', lookup)?.name).toBe('--text-meta');
    expect(themeFor('text-primary', lookup)?.name).toBe('--color-primary');
    expect(themeFor('bg-canvas/50', lookup)?.name).toBe('--color-canvas');
    expect(themeFor('flex', lookup)).toBeUndefined();
  });

  it('finds the app’s own utilities where they are written', () => {
    expect(utilityFor('control-header-button', lookup)).toMatchObject({
      file: 'components/app-shell/process/process-header.css',
      line: expect.any(Number),
    });
  });

  it('finds rules by class, without matching a longer class', () => {
    const sources = rulesNaming(['header-button'], lookup.sheets.rules).map(
      (rule) => rule.source,
    );
    expect(sources).toContain('.header-button');
    expect(sources).not.toContain('.header-button-count');
  });

  it('folds nesting into a selector an element can be tested against', () => {
    for (const rule of lookup.sheets.rules) {
      expect(rule.selector).not.toMatch(/&/);
    }
  });

  it('reads arbitrary values and shortens chains for display', () => {
    expect(arbitraryReads('bg-(--sp-canvas)')).toEqual(['--sp-canvas']);
    expect(
      shorten('light-dark(var(--sp-neutral-75), var(--sp-neutral-900))'),
    ).toBe('light-dark(neutral-75, neutral-900)');
    expect(shorten('light-dark( color-mix(in oklab, a 4%, b) , c )')).toBe(
      'light-dark(color-mix(in oklab, a 4%, b) , c)',
    );
  });

  it('reads only the light-dark() branch the scheme paints', () => {
    const value =
      'light-dark(color-mix(in oklab, var(--a) 40%, var(--b)), var(--c))';
    expect(inScheme(value, 'light')).toBe(
      'color-mix(in oklab, var(--a) 40%, var(--b))',
    );
    expect(inScheme(value, 'dark')).toBe('var(--c)');
    expect(
      inScheme('0 0 0 1px light-dark(var(--x), var(--y)) inset', 'dark'),
    ).toBe('0 0 0 1px var(--y) inset');
    expect(inScheme('var(--plain)', 'light')).toBe('var(--plain)');
  });
});
