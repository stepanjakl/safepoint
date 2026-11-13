import { expect, test, type Page } from '@playwright/test';

import { SHEET_USE } from '@/lib/processes/brunch-orders/process';
import type { SourceSummary } from '@/lib/sources/model';

import { mockProcedure } from './trpc';

// A source's panels on Brunch orders: the read the server gave the page is
// shown without asking again, "Read now" keeps it on screen until a new one
// lands, and the new one is what both panels show. Reads are served by the
// test (e2e/trpc.ts); the page's own summary is the captured copy.

const SOURCE = 'brunch-store-sheet';

async function capturedSummary(page: Page): Promise<SourceSummary> {
  const response = await page.request.post('/api/trpc/sources.summary', {
    data: { source: SOURCE },
  });
  return (await response.json()).result.data;
}

const openTab = (page: Page, name: RegExp) =>
  page.locator('header.process-header').getByRole('button', { name }).click();

// The row of a tab in the panel on screen, named with its figures.
const tabRow = (page: Page, tab: string) =>
  page
    .getByRole('list', { name: /: tabs$/ })
    .filter({ visible: true })
    .getByRole('button', { name: new RegExp(`^${tab}, `) });

test('shows the server’s read, keeps it while reading, then shows the new one on both panels', async ({
  page,
}) => {
  const captured = await capturedSummary(page);
  const stock = captured.resources.find((r) => r.name === 'Stock')!;
  const output = SHEET_USE.outputs[0]!;
  // A row more in every tab, and the output tab, which the captured copy
  // does not have, written to.
  const fresh: SourceSummary = {
    ...captured,
    readId: 'fresh',
    readAt: '2026-11-13T09:30:00.000Z',
    origin: 'live',
    resources: [
      ...captured.resources.map((r) => ({ ...r, rows: r.rows + 1 })),
      { name: output, rows: 3, columns: ['sku'] },
    ],
  };

  // Nothing should ask for the summary: the page was given it.
  const summaries = await mockProcedure(page, 'sources.summary', {
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Asked again.' },
  });
  let land = () => {};
  const landed = new Promise<void>((resolve) => (land = resolve));
  const reads = await mockProcedure(page, 'sources.read', async () => {
    await landed;
    return { data: fresh };
  });

  await page.goto('/examples/brunch-orders');
  await openTab(page, /^Inputs/);
  await expect(tabRow(page, 'Stock')).toHaveAccessibleName(
    new RegExp(`^Stock, ${stock.rows} rows`),
  );

  await page.getByRole('button', { name: 'Read now' }).click();
  await expect(
    page.getByRole('button', { name: /^(Still )?[Rr]eading…$/ }),
  ).toBeVisible();
  // While it reads, the last read stays.
  await expect(tabRow(page, 'Stock')).toHaveAccessibleName(
    new RegExp(`^Stock, ${stock.rows} rows`),
  );
  land();
  await expect(tabRow(page, 'Stock')).toHaveAccessibleName(
    new RegExp(`^Stock, ${stock.rows + 1} rows`),
  );
  await expect(page.getByRole('button', { name: 'Read now' })).toBeVisible();

  await openTab(page, /^Outputs/);
  await expect(tabRow(page, output)).toHaveAccessibleName(
    new RegExp(`^${output}, 3 rows`),
  );
  expect(reads.inputs).toEqual([{ source: SOURCE }]);
  expect(summaries.inputs).toEqual([]);
});

test('a read that fails keeps the last one and says why', async ({ page }) => {
  const captured = await capturedSummary(page);
  const stock = captured.resources.find((r) => r.name === 'Stock')!;
  await mockProcedure(page, 'sources.read', {
    error: { code: 'BAD_GATEWAY', message: 'The sheet could not be reached.' },
  });

  await page.goto('/examples/brunch-orders');
  await openTab(page, /^Inputs/);
  await page.getByRole('button', { name: 'Read now' }).click();
  const reason = 'The read failed: The sheet could not be reached.';
  await expect(
    page.getByRole('region', { name: 'Inputs' }).getByRole('alert'),
  ).toHaveText(reason);
  await expect(
    page.getByRole('status').filter({ hasText: reason }),
  ).toHaveCount(1);
  await expect(tabRow(page, 'Stock')).toHaveAccessibleName(
    new RegExp(`^Stock, ${stock.rows} rows`),
  );
});

test('fetches one read’s values once, however often the drawer opens', async ({
  page,
}) => {
  const values = await mockProcedure(page, 'sources.values', ({ read }) => ({
    data: {
      readId: read,
      resources: [
        {
          name: 'Stock',
          values: [
            ['sku', 'on hand'],
            ['AV-RR', 3],
          ],
        },
      ],
    },
  }));

  await page.goto('/examples/brunch-orders');
  await openTab(page, /^Inputs/);
  for (let open = 0; open < 2; open += 1) {
    await tabRow(page, 'Stock').click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('cell', { name: 'AV-RR' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  }
  expect(values.inputs).toEqual([{ source: SOURCE, read: 'captured' }]);
});
