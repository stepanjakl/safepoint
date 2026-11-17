import { expect, test, type Page } from '@playwright/test';

import { SHEET_USE } from '@/lib/processes/brunch-orders/data';
import type { SourceSummary } from '@/lib/sources/model';

import { mockProcedure } from './trpc';

// A source's panels on Brunch orders: the read the server gave the page is
// shown without asking again, "Read now" keeps it on screen until a new one
// lands, and the new one is what both panels show. Reads are served by the
// test (e2e/trpc.ts). The page's own read is whatever the server keeps -- its
// latest kept read, or the captured copy -- so every figure expected here is
// worked out from it, never written in.

const SOURCE = 'brunch-store-sheet';

async function serverSummary(page: Page): Promise<SourceSummary> {
  const response = await page.request.post('/api/trpc/sources.summary', {
    data: { source: SOURCE },
  });
  return (await response.json()).result.data;
}

// The first input tab the server's read has, with its figures there.
function inputTab(read: SourceSummary) {
  const found = read.resources.find((r) => SHEET_USE.inputs.includes(r.name));
  if (!found) throw new Error('The server’s read has none of the input tabs.');
  return found;
}

const openTab = (page: Page, name: RegExp) =>
  page.locator('header.process-header').getByRole('button', { name }).click();

// The row of a tab in the panel on screen, named with its figures.
const tabRow = (page: Page, tab: string) =>
  page
    .getByRole('list', { name: /: tabs$/ })
    .filter({ visible: true })
    .getByRole('button', { name: new RegExp(`^${tab}, `) });

const rows = (tab: string, count: number) =>
  new RegExp(`^${tab}, ${count} rows?,`);

test('shows the server’s read, keeps it while reading, then shows the new one on both panels', async ({
  page,
}) => {
  const server = await serverSummary(page);
  const input = inputTab(server);
  const output = SHEET_USE.outputs[0]!;
  const outputBefore =
    server.resources.find((r) => r.name === output)?.rows ?? 0;
  // A row more in every tab, the output tab included (added if the server's
  // read has none), so each figure differs from what the page was given.
  const fresh: SourceSummary = {
    ...server,
    readId: 'fresh',
    readAt: '2026-11-13T09:30:00.000Z',
    origin: 'live',
    resources: [
      ...server.resources.map((r) => ({ ...r, rows: r.rows + 1 })),
      ...(server.resources.some((r) => r.name === output)
        ? []
        : [{ name: output, rows: 1, columns: ['sku'] }]),
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

  await page.goto('/processes/brunch-orders');
  await openTab(page, /^Inputs/);
  await expect(tabRow(page, input.name)).toHaveAccessibleName(
    rows(input.name, input.rows),
  );

  await page.getByRole('button', { name: 'Read now' }).click();
  await expect(
    page.getByRole('button', { name: /^(Still )?[Rr]eading…$/ }),
  ).toBeVisible();
  // While it reads, the last read stays.
  await expect(tabRow(page, input.name)).toHaveAccessibleName(
    rows(input.name, input.rows),
  );
  land();
  await expect(tabRow(page, input.name)).toHaveAccessibleName(
    rows(input.name, input.rows + 1),
  );
  await expect(page.getByRole('button', { name: 'Read now' })).toBeVisible();

  // Opened only now, Outputs was handed the server's read too; the read made
  // from Inputs is what it shows.
  await openTab(page, /^Outputs/);
  await expect(tabRow(page, output)).toHaveAccessibleName(
    rows(output, outputBefore + 1),
  );
  expect(reads.inputs).toEqual([{ source: SOURCE }]);
  expect(summaries.inputs).toEqual([]);
});

test('a read that fails keeps the last one and says why', async ({ page }) => {
  const input = inputTab(await serverSummary(page));
  await mockProcedure(page, 'sources.read', {
    error: { code: 'BAD_GATEWAY', message: 'The sheet could not be reached.' },
  });

  await page.goto('/processes/brunch-orders');
  await openTab(page, /^Inputs/);
  await page.getByRole('button', { name: 'Read now' }).click();
  const reason = 'The read failed: The sheet could not be reached.';
  await expect(
    page.getByRole('region', { name: 'Inputs' }).getByRole('alert'),
  ).toHaveText(reason);
  await expect(
    page.getByRole('status').filter({ hasText: reason }),
  ).toHaveCount(1);
  await expect(tabRow(page, input.name)).toHaveAccessibleName(
    rows(input.name, input.rows),
  );
});

test('fetches one read’s values once, however often the drawer opens', async ({
  page,
}) => {
  const server = await serverSummary(page);
  const input = inputTab(server);
  const values = await mockProcedure(page, 'sources.values', ({ read }) => ({
    data: {
      readId: read,
      resources: [
        {
          name: input.name,
          values: [
            ['sku', 'on hand'],
            ['AV-RR', 3],
          ],
        },
      ],
    },
  }));

  await page.goto('/processes/brunch-orders');
  await openTab(page, /^Inputs/);
  for (let open = 0; open < 2; open += 1) {
    await tabRow(page, input.name).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('cell', { name: 'AV-RR' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  }
  // The read the page was given, asked for once.
  expect(values.inputs).toEqual([{ source: SOURCE, read: server.readId }]);
});
