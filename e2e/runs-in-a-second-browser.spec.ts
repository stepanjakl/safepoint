import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import type { Proposal } from '@/lib/engine/types';

import { call } from './kept-runs';
import { mockProcedure } from './trpc';

/*
  What this phase is for: a run, and a decision made on one of its records,
  are the server's, so a browser that has never seen them shows them. Runs and
  decisions reach the real test server and its own database; only the
  proposal is stood in for, since no model runs here. The model's proposal is
  served to the screen (`propose.*`) and, so a decision can be made on it, kept
  on the server for the run through the development route that keeps one
  without a model (app/api/dev/test-proposal).
*/
const frozen = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
) as {
  names: Record<string, string>;
  calculated: {
    calculations: { id: string; name: string }[];
    rows: Record<string, Record<string, number | null>>;
  };
  proposal: Proposal;
};

async function serveProposal(page: Page) {
  const proposed = {
    data: {
      kind: 'proposal' as const,
      fingerprint: frozen.proposal.fingerprint,
      names: frozen.names,
      calculated: frozen.calculated,
      proposal: frozen.proposal,
      progress: null,
    },
  };
  await mockProcedure(page, 'propose.get', proposed);
  await mockProcedure(page, 'propose.start', proposed);
}

test('a run started in one browser, and a decision made on it, are there in a fresh one', async ({
  page,
  browser,
  baseURL,
  colorScheme,
}) => {
  await serveProposal(page);
  // The screen reads the live sheet as the run opens, which a test must not
  // reach: the captured read, really kept on the server, answers instead.
  await mockProcedure(page, 'read.keep', {
    data: await call(page, 'read.keep', { source: 'captured' }),
  });

  // Started from the screen, in the first browser.
  await page.goto('/examples/brunch-orders-direct');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await expect(page).toHaveURL(/run=run-/);
  const runId = new URL(page.url()).searchParams.get('run')!;
  // The screen has recorded the read it took, with the server.
  await expect
    .poll(async () => {
      const runs = await call<{ id: string; readId: string | null }[]>(
        page,
        'runs.list',
        { process: 'brunch-orders-direct' },
      );
      return runs.find((run) => run.id === runId)?.readId ?? null;
    })
    .not.toBeNull();

  // The model's proposal, kept for the run as a model's job would keep it.
  const kept = await page.request.post('/api/dev/test-proposal', {
    data: {
      process: 'brunch-orders-direct',
      runId,
      at: frozen.proposal.at,
      records: frozen.proposal.records,
    },
  });
  expect(kept.ok()).toBe(true);

  // A decision, from the screen: the first record nothing asks a person about.
  await page.reload();
  const table = page.getByRole('table', {
    name: 'What is proposed for every record',
  });
  await expect(table).toBeVisible({ timeout: 30_000 });
  const [key] = Object.entries(frozen.proposal.records).find(
    ([, record]) =>
      record.verdict === 'ready' && record.values && !record.unsure,
  )!;
  const row = table.getByRole('row', { name: new RegExp(`^${key}`) });
  await row.getByRole('button', { name: /^Approve$/ }).click();
  await expect(row.getByText('Approved', { exact: true })).toBeVisible();
  const total = Object.keys(frozen.proposal.records).length;
  await expect(
    page.locator('ol.thread').getByText(`1 of ${total} decided`).first(),
  ).toBeAttached();
  // Kept by the server, not only shown.
  await expect
    .poll(async () => {
      const held = await call<{ decisions: Record<string, unknown> }>(
        page,
        'decisions.current',
        { process: 'brunch-orders-direct', runId },
      );
      return Object.keys(held.decisions);
    })
    .toEqual([key]);

  // A second browser that has never seen any of it: empty storage.
  const second = await browser.newContext({
    baseURL,
    colorScheme,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const other = await second.newPage();
    await serveProposal(other);
    await other.goto('/examples/brunch-orders-direct');
    expect(await other.evaluate(() => localStorage.length)).toBe(0);
    // The run is in its list, found by the id the server gave it.
    await other.locator(`.sheet-row[data-run-id="${runId}"]`).click();
    await expect(other).toHaveURL(new RegExp(`run=${runId}$`));
    const copy = other.getByRole('table', {
      name: 'What is proposed for every record',
    });
    await expect(copy).toBeVisible({ timeout: 30_000 });
    // And so is the decision.
    await expect(
      copy
        .getByRole('row', { name: new RegExp(`^${key}`) })
        .getByText('Approved', { exact: true }),
    ).toBeVisible();
    await expect(
      other.locator('ol.thread').getByText(`1 of ${total} decided`).first(),
    ).toBeAttached();
  } finally {
    await second.close();
  }
});
