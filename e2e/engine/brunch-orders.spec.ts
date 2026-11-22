import { readFileSync } from 'node:fs';

import type { inferRouterOutputs } from '@trpc/server';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { Calculation } from '@/lib/engine/calculate';
import { definitionSetSchema, type Proposal } from '@/lib/engine/types';
import type { AppRouter } from '@/server/api/root';

import { asKeptRulebook, call, seedKeptRulebooks } from '../support/kept-runs';
import { rulesReply } from '../support/rules';
import { mockProcedure } from '../support/trpc';

// Brunch orders, phase 1 (docs/processes/brunch-orders/PLAN.md): a run started by hand
// shows its instructions, reads the sheet, and keeps that read. By default it
// advances automatically through the deterministic steps without debug setup;
// turning on the step-by-step debug preference reveals the manual setup controls.

const serious = async (page: Page, include: string) =>
  (await new AxeBuilder({ page }).include(include).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

test('a run shows its instructions, reads the sheet and keeps the read', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('safepoint.dev.run-debug', 'on');
  });
  await page.goto('/processes/brunch-orders?edges=retina');
  await expect(page.locator('html')).toHaveAttribute('data-edges', 'retina');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
  await page.getByRole('button', { name: 'Start run' }).first().click();

  // The instructions the run answers to, open as its request.
  await expect(page.getByText('What this is for')).toBeVisible();
  await expect(
    page.getByText(/^Each week, suggest how many of each product to order/),
  ).toBeVisible();
  const instructions = page.getByRole('button', {
    name: /^Instructions v3\./,
  });
  await expect(instructions).toBeVisible();
  await expect(instructions.locator('.thread-marker')).toBeVisible();
  await expect(instructions.locator('.thread-dot')).not.toHaveAttribute(
    'tabindex',
    '0',
  );
  const steps = page.locator('ol.thread > li.thread-step');
  const [firstStep, firstMark, nextStep, nextMark] = await Promise.all([
    steps.nth(0).boundingBox(),
    steps.nth(0).locator('.thread-dot').boundingBox(),
    steps.nth(1).boundingBox(),
    steps.nth(1).locator('.thread-dot').boundingBox(),
  ]);
  expect(firstStep && firstMark && nextStep && nextMark).toBeTruthy();
  expect(
    Math.abs(
      firstMark!.y +
        firstMark!.height / 2 -
        firstStep!.y -
        (nextMark!.y + nextMark!.height / 2 - nextStep!.y),
    ),
  ).toBeLessThan(0.5);
  expect(
    Math.abs(
      firstMark!.x +
        firstMark!.width / 2 -
        firstStep!.x -
        (nextMark!.x + nextMark!.width / 2 - nextStep!.x),
    ),
  ).toBeLessThan(0.5);
  const lineX = await steps.first().evaluate((step) => {
    const line = getComputedStyle(step, '::before');
    return (
      step.getBoundingClientRect().x +
      parseFloat(line.left) +
      parseFloat(line.width) / 2
    );
  });
  expect(Math.abs(firstMark!.x + firstMark!.width / 2 - lineX)).toBeLessThan(
    0.5,
  );
  await expect(
    page.getByText('Instructions v3; this run answers to them as written.'),
  ).toHaveCount(0);
  const arrow = instructions.locator('.thread-step-heading-arrow');
  await expect(arrow).toHaveCSS('opacity', '0');
  await expect(arrow).toHaveCSS('width', '0px');
  await instructions.hover();
  await expect(arrow).toHaveCSS('width', '12px');
  await expect(arrow).toHaveCSS('opacity', '1');
  await instructions.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Instructions: version v3' }),
  ).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Runs', exact: true }).click();

  // It waits for a person to read the sheet.
  const read = page.getByRole('button', {
    name: 'Read the sheet',
    exact: true,
  });
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await read.last().click();
  // The first read can wait on the dev server compiling its route.
  await expect(read.first()).toHaveAttribute('aria-expanded', 'false', {
    timeout: 30_000,
  });
  await read.first().click();
  // The read just taken opens its card under its own header.
  const head = page.getByRole('button', {
    name: /^Google Sheets 5 tabs Read · /,
  });
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('list', { name: 'Data tabs read' }),
  ).toBeVisible();
  const setup = page.getByRole('region', { name: 'Read setup' });
  await expect(setup).toContainText('The captured read (no network)');
  await expect(setup).toContainText('Captured read from');
  const card = page.getByRole('article', { name: 'Sheet read' });
  await expect(
    card.getByRole('link', {
      name: 'Open in Google Sheets (opens in a new tab)',
    }),
  ).toHaveAttribute('href', /docs\.google\.com\/spreadsheets/);
  await expect(card.locator('.external-link')).toHaveCSS(
    'text-decoration-thickness',
    '0.5px',
  );
  await expect(card.getByRole('button', { name: 'View data' })).toHaveClass(
    /rounded-icon/,
  );

  // The data, one tab at a time, from the keyboard.
  const view = page.getByRole('button', { name: 'View data' });
  await view.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Sheet data' });
  const panel = drawer.locator('[data-drawer-main]');
  const resize = drawer.getByRole('separator', {
    name: 'Resize sheet data drawer',
  });
  const resizeGuide = await resize.evaluate((element) => {
    const line = getComputedStyle(element, '::before');
    const handleBox = element.getBoundingClientRect();
    const panelBox = element
      .parentElement!.querySelector('[data-drawer-main]')!
      .getBoundingClientRect();
    const edge = parseFloat(
      getComputedStyle(element).getPropertyValue('--edge-ring'),
    );
    return {
      width: line.width,
      center: handleBox.left + parseFloat(line.left),
      edgeCenter: panelBox.left + edge / 2,
    };
  });
  expect(resizeGuide.width).toBe('0.5px');
  expect(Math.abs(resizeGuide.center - resizeGuide.edgeCenter)).toBeLessThan(
    0.05,
  );
  expect((await resize.boundingBox())!.width).toBe(
    (await page.locator('.sidebar-handle[data-side="left"]').boundingBox())!
      .width,
  );
  const beforeResize = (await panel.boundingBox())!.width;
  await resize.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeGreaterThan(beforeResize);
  const tabs = drawer.getByRole('radiogroup', { name: 'Data tabs' });
  await expect(tabs.getByRole('radio', { name: /^Products,/ })).toBeChecked();
  const width = (await drawer.locator('[data-drawer-main]').boundingBox())!
    .width;
  await tabs.getByRole('radio', { name: /^Stock,/ }).focus();
  await page.keyboard.press('Space');
  await expect(tabs.getByRole('radio', { name: /^Stock,/ })).toBeChecked();
  expect(
    (await drawer.locator('[data-drawer-main]').boundingBox())!.width,
  ).toBe(width);
  const stock = drawer.getByRole('region', { name: 'Stock, as read' });
  await expect(stock.getByRole('columnheader', { name: 'sku' })).toBeVisible();
  await expect(
    stock.getByRole('columnheader', { name: 'on_hand' }),
  ).toBeVisible();
  expect(await serious(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(view).toBeFocused();

  // A tab's row opens the drawer at that tab, and hands focus back to it.
  const salesRow = card.getByRole('button', {
    name: /^Sales, \d+ rows\. View its data\.$/,
  });
  await salesRow.click();
  await expect(tabs.getByRole('radio', { name: /^Sales,/ })).toBeChecked();
  expect((await panel.boundingBox())!.width).toBe(width);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(salesRow).toBeFocused();
  expect(await serious(page, 'ol.thread')).toEqual([]);

  // A reload finds the run where it was, read and all.
  await page.reload();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .first()
    .click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await head.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await read.first().press('Enter');
  await read.first().press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('list', { name: 'Data tabs read' }),
  ).toBeVisible();
});

test('a reduced-motion read still hands off to the rules', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('safepoint.dev.run-debug', 'on');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  const read = page.getByRole('button', {
    name: 'Read the sheet',
    exact: true,
  });
  await read.last().click();
  await expect(read.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page
      .locator('ol.thread')
      .getByRole('button', { name: 'Rules', exact: true }),
  ).toBeVisible();
});

test('by default a run advances automatically from reading to proposing, and Tweakpane toggles the debug controls', async ({
  page,
}) => {
  await seedKeptRulebooks(page);
  const accepted = definitionSetSchema.parse(
    JSON.parse(
      readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8'),
    ),
  );
  const frozenCalc = JSON.parse(
    readFileSync('e2e/fixtures/brunch-orders-calculation.json', 'utf8'),
  ) as Calculation;
  const calculation = asKeptRulebook(frozenCalc, frozenCalc.fingerprint);
  const frozenProp = asKeptRulebook(
    JSON.parse(
      readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
    ) as {
      names: Record<string, string>;
      calculated: {
        calculations: { id: string; name: string }[];
        rows: Record<string, Record<string, number | null>>;
      };
      proposal: Proposal;
    },
    frozenCalc.fingerprint,
  );

  const readSources: string[] = [];
  let proposalStarted = 0;
  await page.goto('/processes/brunch-orders');
  const capturedSummary = await call<
    inferRouterOutputs<AppRouter>['read']['keep']
  >(page, 'read.keep', { source: 'captured' });
  await mockProcedure(page, 'read.keep', (input) => {
    readSources.push(input.source);
    return { data: capturedSummary };
  });
  await mockProcedure(page, 'rules.get', { data: rulesReply(accepted) });
  await mockProcedure(page, 'calculate.get', {
    data: {
      kind: 'calculation',
      calculation,
      check: null,
      current: calculation.fingerprint,
    },
  });
  await mockProcedure(page, 'propose.get', () => ({
    data: {
      kind: 'proposal' as const,
      fingerprint: frozenProp.proposal.fingerprint,
      names: frozenProp.names,
      calculated: frozenProp.calculated,
      proposal: proposalStarted > 0 ? frozenProp.proposal : null,
      progress: null,
    },
  }));
  await mockProcedure(page, 'propose.start', () => {
    proposalStarted += 1;
    return {
      data: {
        kind: 'proposal' as const,
        fingerprint: frozenProp.proposal.fingerprint,
        names: frozenProp.names,
        calculated: frozenProp.calculated,
        proposal: frozenProp.proposal,
        progress: null,
      },
    };
  });

  await page.getByRole('button', { name: 'Start run' }).first().click();

  const table = page.getByRole('table', {
    name: 'What is proposed for every record',
  });
  await expect(table).toBeVisible({ timeout: 30_000 });
  expect(readSources).toEqual(['live']);
  expect(proposalStarted).toBe(1);

  // None of the trial/debug setup sections are rendered by default.
  await expect(page.getByRole('region', { name: 'Read setup' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Draft setup' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('region', { name: 'Cross-check setup' }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Propose setup' })).toHaveCount(
    0,
  );
  await expect(
    page.locator('ol.thread').getByText('22 values worked out').first(),
  ).toBeAttached();

  // Toggling Step by step in Design controls reveals the debug sections.
  const panel = page.locator('.sp-devctl');
  await panel.getByRole('button', { name: 'Design controls' }).click();
  await panel
    .locator('label:has(input[aria-label="Step-by-step run debug controls"])')
    .click();
  await expect(
    page.getByRole('region', { name: 'Propose setup' }),
  ).toBeVisible();
});
