import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { definitionSetSchema } from '@/lib/engine/types';

import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

import { listedInstructions } from '../support/kept-instructions';
import { noRules, rulesReply } from '../support/rules';
import { mockProcedure } from '../support/trpc';

const accepted = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const rulebook = rulesReply(accepted);

test.beforeEach(async ({ page, colorScheme }) => {
  await page.addInitScript(
    (theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    },
    colorScheme === 'dark' ? 'dark' : 'light',
  );
});

test('returning to Rules retains its known empty state while refreshing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let refresh = false;
  await mockProcedure(page, 'rules.get', async () => {
    if (refresh) await new Promise((resolve) => setTimeout(resolve, 350));
    return { data: noRules() };
  });
  await page.goto('/processes/brunch-orders');
  const rules = page.getByRole('button', { name: 'Rules', exact: true });
  await rules.click();
  await expect(
    page.getByText('Nothing is accepted yet.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.process-sheet-swap')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
  refresh = true;
  const frames = await rules.evaluate(
    (button) =>
      new Promise<{ loading: boolean; empty: boolean; opacity: number }[]>(
        (resolve) => {
          if (!(button instanceof HTMLButtonElement))
            throw new Error('Missing Rules tab');
          const frames: {
            loading: boolean;
            empty: boolean;
            opacity: number;
          }[] = [];
          const started = performance.now();
          function sample() {
            const layer = document.querySelector('.process-sheet-swap');
            const content = layer?.querySelector(
              'section[aria-labelledby="rules-heading"]',
            );
            if (content) {
              let opacity = 1;
              for (
                let element: Element | null = content;
                element;
                element = element.parentElement
              )
                opacity *= Number(getComputedStyle(element).opacity);
              frames.push({
                loading: Boolean(
                  content.textContent?.includes('Loading the rulebook'),
                ),
                empty: Boolean(
                  content.textContent?.includes('Nothing is accepted yet.'),
                ),
                opacity,
              });
            }
            if (performance.now() - started < 1000)
              requestAnimationFrame(sample);
            else resolve(frames);
          }
          button.click();
          requestAnimationFrame(sample);
        },
      ),
  );
  expect(frames.length).toBeGreaterThan(2);
  expect(
    frames.every((frame) => frame.empty && !frame.loading),
    'known rulebook was replaced by its loading state',
  ).toBe(true);
  for (let index = 1; index < frames.length; index++)
    expect(frames[index]!.opacity).toBeGreaterThanOrEqual(
      frames[index - 1]!.opacity - 0.01,
    );
  expect(frames.at(-1)?.opacity).toBe(1);
});

test('Rules keeps the retained result while it refreshes newly accepted rules', async ({
  page,
}) => {
  let hasRules = false;
  let releaseRefresh: (() => void) | undefined;
  const refreshed = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await mockProcedure(page, 'rules.get', async () => {
    if (hasRules) await refreshed;
    return { data: hasRules ? rulebook : noRules() };
  });
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(
    page.getByText('Nothing is accepted yet.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
  hasRules = true;
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(
    page.getByText('Nothing is accepted yet.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Loading the rulebook…', { exact: true }),
  ).toHaveCount(0);
  releaseRefresh?.();
  await expect(
    page.getByRole('list', { name: 'Accepted rules' }).locator('> li'),
  ).toHaveCount(accepted.definitions.length);
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Accepted rules' }).locator('> li'),
  ).toHaveCount(accepted.definitions.length);
  await expect(
    page.getByText('Loading the rulebook…', { exact: true }),
  ).toHaveCount(0);
});

test('changed instructions never show the previous version’s retained rules', async ({
  page,
}) => {
  const text = 'Changed instructions for this regression.';
  let changed = false;
  let releaseRefresh: (() => void) | undefined;
  const refreshed = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await mockProcedure(page, 'rules.get', async () => {
    if (changed) await refreshed;
    return { data: changed ? noRules() : rulebook };
  });
  // The publish is served, as the server would answer it: the next label.
  await mockProcedure(page, 'instructions.publish', () => ({
    data: {
      version: listedInstructions(brunchOrdersProcess, [
        { text, publishedAt: '2026-10-14T10:00:00Z' },
      ]).versions.at(-1)!,
      created: true,
    },
  }));
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  const list = page.getByRole('list', { name: 'Accepted rules' });
  await expect(list.locator('> li')).toHaveCount(accepted.definitions.length);

  // Write and publish the next version from the Instructions tab.
  await page
    .getByRole('button', { name: /^Instructions/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'New version' }).click();
  await page
    .getByRole('textbox', { name: /^Instructions, draft of/ })
    .fill(text);
  await page.getByRole('button', { name: 'Review changes' }).click();
  await page.getByRole('button', { name: 'Publish v4' }).click();
  changed = true;
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish v4' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Loading the rulebook…');
  await expect(list).toHaveCount(0);
  releaseRefresh?.();
  await expect(page.getByRole('status')).toContainText(
    'Nothing is accepted yet.',
  );
  await expect(page.getByRole('status')).toContainText('v4');
});
