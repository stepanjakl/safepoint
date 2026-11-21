import { expect, test, type Page } from '@playwright/test';
import { brunchOrdersDirectProcess } from '@/lib/processes/brunch-orders/process';
import { listedInstructions } from '../support/kept-instructions';
import { mockProcedure } from '../support/trpc';

/*
  Which run the process page shows: nothing on arrival, the run started here or
  chosen in the rail. The choice is kept in ?run=, so a link opens the same run.
*/
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('a run can start with additional instructions that stay with it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('safepoint.dev.run-debug', 'on');
  });
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Start run with a note' }).click();
  const note = page.getByRole('textbox', {
    name: /Note for this run/,
  });
  await expect(note).toBeFocused();
  await note.fill('  Focus on missing prices.\nKeep the report concise.  ');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Start run', exact: true })
    .click();
  const request = page.getByText(
    'Focus on missing prices.\nKeep the report concise.',
    { exact: true },
  );
  await expect(request).toBeVisible();
  await expect(page).toHaveURL(/run=run-/);
  await page.reload();
  await expect(request).toBeVisible();
});

test('a run id the list does not hold selects nothing, and leaves the address', async ({
  page,
}) => {
  await page.goto('/processes/brunch-orders?run=run-1790000000000');
  await expect(heading(page)).toHaveText('No run selected');
  await expect(page).not.toHaveURL(/run=/);
});

test('a saved run waits for its pinned instruction text before loading a proposal', async ({
  page,
}) => {
  const process = brunchOrdersDirectProcess;
  const at = '2026-11-19T10:00:00.000Z';
  const pinned = listedInstructions(process, [
    { text: 'Use the instructions this run started with.', publishedAt: at },
  ]).versions.at(-1)!;
  const list = listedInstructions(process, [
    { text: 'Different text under the same version label.', publishedAt: at },
  ]);
  const runId = 'run-1795082400000';
  const readId = 'read-1795082400000';
  await mockProcedure(page, 'runs.list', {
    data: [
      {
        id: runId,
        process: process.id,
        instructions: { hash: pinned.hash, version: pinned.version },
        readId,
        rulebook: null,
        stage: 'propose',
        status: 'running',
        trigger: 'manual',
        additionalInstructions: null,
        modelPlan: null,
        startedBy: null,
        startedAt: at,
        updatedAt: at,
        discardedAt: null,
      },
    ],
  });
  await mockProcedure(page, 'instructions.list', { data: list });
  const release = Promise.withResolvers<void>();
  let tried = false;
  const lookup = await mockProcedure(page, 'instructions.get', async () => {
    if (!tried) {
      tried = true;
      return { error: { code: 'NOT_FOUND', message: 'Version unavailable.' } };
    }
    await release.promise;
    return { data: pinned };
  });
  const unavailable = {
    error: { code: 'NOT_FOUND' as const, message: 'Fixture only.' },
  };
  await mockProcedure(page, 'read.summary', unavailable);
  await mockProcedure(page, 'decisions.current', unavailable);
  await mockProcedure(page, 'propose.start', unavailable);
  const proposal = await mockProcedure(page, 'propose.get', unavailable);

  await page.goto(`/processes/brunch-orders-direct?run=${runId}`);
  const status = page.locator('.run-view').getByRole('status');
  const failed = `Couldn’t load instructions ${pinned.version} for this run.`;
  await expect(page.getByRole('main')).toContainText(failed);
  await expect(status).toHaveText(failed);
  expect(lookup.inputs).toEqual([{ process: process.id, hash: pinned.hash }]);
  expect(proposal.inputs).toEqual([]);

  const row = page.locator(`[data-run-id="${runId}"]`);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/run=/);
  await page.keyboard.press('Enter');
  const loading = `Loading instructions ${pinned.version}…`;
  await expect(page.getByRole('main')).toContainText(loading);
  await expect(status).toHaveText(loading);
  await expect(row).toBeFocused();
  await expect.poll(() => lookup.inputs.length).toBe(2);
  expect(proposal.inputs).toEqual([]);

  release.resolve();
  await expect
    .poll(() => proposal.inputs)
    .toEqual([{ text: pinned.text, readId, evaluation: 'model' }]);
});

test('a saved run waits for its thread before fading in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const process = brunchOrdersDirectProcess;
  const at = '2026-11-19T10:00:00.000Z';
  const instructions = listedInstructions(process, [
    { text: 'Use the saved instructions.', publishedAt: at },
  ]);
  const pinned = instructions.versions.at(-1)!;
  const runId = 'run-1795082400000';
  await mockProcedure(page, 'runs.list', {
    data: [
      {
        id: runId,
        process: process.id,
        instructions: { hash: pinned.hash, version: pinned.version },
        readId: 'read-1795082400000',
        rulebook: null,
        stage: 'propose',
        status: 'running',
        trigger: 'manual',
        additionalInstructions: null,
        modelPlan: null,
        startedBy: null,
        startedAt: at,
        updatedAt: at,
        discardedAt: null,
      },
    ],
  });
  await mockProcedure(page, 'instructions.list', { data: instructions });
  const release = Promise.withResolvers<void>();
  const read = await mockProcedure(page, 'read.summary', async () => {
    await release.promise;
    return { error: { code: 'NOT_FOUND', message: 'Saved read unavailable.' } };
  });
  await page.goto('/processes/brunch-orders-direct');
  await page.locator(`[data-run-id="${runId}"]`).click();
  await expect.poll(() => read.inputs.length).toBeGreaterThan(0);
  const layer = page.locator('.run-view > div').first();
  // Wait beyond the normal entrance, while the saved read is still held.
  await page.waitForTimeout(600);
  await expect(layer).toHaveCSS('opacity', '0');
  await page.evaluate(() => {
    const frames: { content: boolean; opacity: number }[] = [];
    Object.assign(window, { runEntranceFrames: frames });
    const sample = () => {
      const layer = document.querySelector('.run-view > div');
      if (!layer) return;
      const opacity = Number(getComputedStyle(layer).opacity);
      frames.push({
        content:
          layer.textContent?.includes('Saved read unavailable.') ?? false,
        opacity,
      });
      if (!frames.at(-1)?.content || opacity < 1) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  release.resolve();
  await expect(layer).toHaveCSS('opacity', '1');
  await expect(layer).toContainText('Saved read unavailable.');
  const frames = await page.evaluate(
    () =>
      Reflect.get(window, 'runEntranceFrames') as {
        content: boolean;
        opacity: number;
      }[],
  );
  expect(frames.find((frame) => frame.content)?.opacity).toBe(0);
  expect(
    frames.some(
      (frame) => frame.content && frame.opacity > 0 && frame.opacity < 1,
    ),
  ).toBe(true);
});

test('a run summary updates when a decision changes', async ({ page }) => {
  const id = 'mock-1795037597235';
  await page.addInitScript((runId) => {
    const at = '2026-11-19T10:53:17.235Z';
    sessionStorage.setItem(
      'safepoint.mock-runs.v1:brunch-orders-direct',
      JSON.stringify([
        {
          id: runId,
          process: 'brunch-orders-direct',
          startedAt: at,
          updatedAt: at,
          startedBy: null,
          discardedAt: null,
          stage: 'read',
          status: 'awaiting_review',
          trigger: 'manual',
          instructions: { version: 'v1', hash: 'mock' },
          additionalInstructions: null,
          modelPlan: null,
          readId: null,
          rulebook: null,
        },
      ]),
    );
    sessionStorage.setItem(
      `safepoint.mock-stage.v1:${runId}`,
      'awaiting_review',
    );
  }, id);
  await page.goto(`/processes/brunch-orders-direct?run=${id}`);
  const thread = page.locator('.run-view');
  await expect(thread).toContainText('Awaiting a reviewer');
  const stage = page.getByRole('combobox', { name: 'Mock run stage' });
  const reviewing = await stage
    .locator('option', { hasText: /in review/i })
    .first()
    .getAttribute('value');
  expect(reviewing).not.toBeNull();
  await stage.selectOption(reviewing!);
  await expect(thread).toContainText('4 of 11 decided');
  await thread
    .getByRole('button', { name: 'Undo the decision on SD-01' })
    .click();
  await expect(thread).toContainText('3 of 11 decided');
  const approval = await stage
    .locator('option', { hasText: /awaiting approval/i })
    .first()
    .getAttribute('value');
  expect(approval).not.toBeNull();
  await stage.selectOption(approval!);
  await expect(thread.locator('table.output-cells')).toHaveCount(1);
  await expect(thread.getByText('Brunch store · supplier copy')).toHaveCount(0);
});

test('the runs column fades edges only while runs extend past them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/processes/brunch-orders');
  const aside = page.locator('.process-runs-list');
  await expect(aside.locator('.sheet-row').first()).toBeVisible();

  await expect(aside).not.toHaveAttribute('data-fade-top');
  await expect(aside).toHaveAttribute('data-fade-bottom', '');

  await aside.evaluate((element) => {
    element.scrollTop = 60;
  });
  await expect(aside).toHaveAttribute('data-fade-top', '');
  await expect(aside).toHaveAttribute('data-fade-bottom', '');

  await aside.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(aside).toHaveAttribute('data-fade-top', '');
  await expect(aside).not.toHaveAttribute('data-fade-bottom');
});
