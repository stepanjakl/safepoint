import { expect, test, type Page } from '@playwright/test';
import {
  LOADER_DELAY_MS,
  LOADER_MIN_MS,
  LOADER_SLOW_MS,
} from '@/components/ui/working-mark';

const LOADING = 'Loading the rulebook…';

// When the loader's words entered and left the page, by the page's own clock.
async function watchLoader(page: Page) {
  await page.addInitScript((text) => {
    const seen = { shown: null as number | null, gone: null as number | null };
    Object.assign(window, { loaderSeen: seen });
    new MutationObserver(() => {
      const present = document.body?.innerText.includes(text) ?? false;
      if (present && seen.shown === null) seen.shown = performance.now();
      if (!present && seen.shown !== null && seen.gone === null)
        seen.gone = performance.now();
    }).observe(document, { childList: true, subtree: true });
  }, LOADING);
  return () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            loaderSeen: { shown: number | null; gone: number | null };
          }
        ).loaderSeen,
    );
}

async function openRules(page: Page, replyAfter: number | null) {
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    if (replyAfter === null) return;
    await new Promise((resolve) => setTimeout(resolve, replyAfter));
    await route.fulfill({ json: { kind: 'none' } });
  });
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Rules B', exact: true }).click();
}

test('a quick reply never shows the loader', async ({ page }) => {
  const seen = await watchLoader(page);
  await openRules(page, LOADER_DELAY_MS / 3);
  await expect(page.getByText('Nothing is accepted yet.')).toBeVisible();
  expect((await seen()).shown).toBeNull();
});

test('a loader once shown stays its minimum', async ({ page }) => {
  const seen = await watchLoader(page);
  // Lands just after the loader appears, so the minimum has to hold it.
  await openRules(page, LOADER_DELAY_MS + 100);
  await expect(page.getByText('Nothing is accepted yet.')).toBeVisible();
  const { shown, gone } = await seen();
  expect(shown).not.toBeNull();
  // A frame's slack: the observer sees a change a frame after React makes it.
  expect(gone! - shown!).toBeGreaterThanOrEqual(LOADER_MIN_MS - 20);
});

test('a long wait says so', async ({ page }) => {
  await page.clock.install();
  await openRules(page, null);
  await expect(page.getByText(LOADING)).toBeVisible();
  await page.clock.runFor(LOADER_SLOW_MS);
  await expect(page.getByText('Still loading the rulebook…')).toBeVisible();
});

test('content that ends a wait fades in; content already known does not', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // The opacity each "nothing accepted" state has as it enters the page.
  await page.addInitScript(() => {
    const entries: number[] = [];
    Object.assign(window, { arrivals: entries });
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const state = [node, ...node.querySelectorAll('[role=status]')].find(
            (el) =>
              el.getAttribute('role') === 'status' &&
              el.textContent?.includes('Nothing is accepted yet.'),
          );
          if (state) entries.push(Number(getComputedStyle(state).opacity));
        }
    }).observe(document, { childList: true, subtree: true });
  });
  const arrivals = () =>
    page.evaluate(() => (window as unknown as { arrivals: number[] }).arrivals);
  await openRules(page, LOADER_DELAY_MS / 3);
  await expect(page.getByText('Nothing is accepted yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
  await page.getByRole('button', { name: 'Rules B', exact: true }).click();
  await expect(page.getByText('Nothing is accepted yet.')).toBeVisible();
  await expect.poll(arrivals).toHaveLength(2);
  const [first, revisit] = await arrivals();
  expect(first).toBe(0);
  expect(revisit).toBe(1);
});
