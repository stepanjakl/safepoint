import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Brunch orders, phase 1 (docs/processes/brunch-orders/PLAN.md): a run started by hand
// shows its instructions, waits for a person to read the sheet, and keeps
// that read. The captured read needs no network.

const serious = async (page: Page, include: string) =>
  (await new AxeBuilder({ page }).include(include).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);

test('a run shows its instructions, reads the sheet and keeps the read', async ({
  page,
}) => {
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();

  // The instructions the run answers to, open as its request.
  await expect(page.getByText('What this is for')).toBeVisible();
  await expect(
    page.getByText(/^Each week, suggest how many of each product to order/),
  ).toBeVisible();
  const instructions = page.getByRole('button', {
    name: /^Instructions v2\./,
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
    page.getByText('Instructions v2; this run answers to them as written.'),
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
    page.getByRole('button', { name: 'Instructions: version v2' }),
  ).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Runs', exact: true }).click();

  // It waits for a person to read the sheet.
  const read = page.getByRole('button', {
    name: 'Read the sheet',
    exact: true,
  });
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await read.last().click();
  await expect(read.first()).toHaveAttribute('aria-expanded', 'false');
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
  await expect(card.getByRole('button', { name: 'View data' })).toHaveClass(
    /rounded-full/,
  );

  // The data, one tab at a time, from the keyboard.
  const view = page.getByRole('button', { name: 'View data' });
  await view.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Sheet data' });
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
  await expect(drawer.getByLabel('Stock, as read')).toContainText(
    '["sku","on_hand","reserved"',
  );
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
  // Shut until asked for, then open from the keyboard.
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('list', { name: 'Data tabs read' }),
  ).toBeVisible();

  // And it can be discarded.
  await page.getByRole('button', { name: 'Discard this run' }).click();
  await expect(head).toHaveCount(0);
});

test('a reduced-motion read still hands off to the rules', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  const read = page.getByRole('button', {
    name: 'Read the sheet',
    exact: true,
  });
  await read.last().click();
  await expect(read.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('button', { name: 'Rules', exact: true }),
  ).toBeVisible();
});
