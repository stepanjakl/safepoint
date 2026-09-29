import { expect, test, type Page } from '@playwright/test';

/* The sheet's Instructions, Inputs and Outputs tabs, and the detail drawer
   their rows open. Focus is asserted at every close: the drawer hands it
   back to whatever opened it, and a swap keeps the original opener. */

async function openTab(page: Page, tab: 'Inputs' | 'Instructions' | 'Outputs') {
  await page.goto('/examples/promotion?run=run-104');
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`^${tab}`) })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: new RegExp(`^${tab}`) }),
  ).toBeVisible();
}

const drawer = (page: Page) => page.locator('.drawer-aside');
const drawerTitle = (page: Page, name: string | RegExp) =>
  drawer(page).getByRole('heading', { name });
const inputRow = (page: Page, name: string) =>
  page
    .locator('.process-panels')
    .getByRole('button', { name: new RegExp(`^${name}`) });

test('an input opens its detail, and Escape hands focus back to its row', async ({
  page,
}) => {
  await openTab(page, 'Inputs');
  const row = inputRow(page, 'Supply position');
  await row.click();
  await expect(drawerTitle(page, 'Supply position')).toBeVisible();
  await expect(row).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(row).toHaveAttribute('aria-expanded', 'false');
});

test('the row that opened the detail closes it again', async ({ page }) => {
  await openTab(page, 'Inputs');
  const row = inputRow(page, 'Campaign brief');
  await row.click();
  await expect(drawerTitle(page, 'Campaign brief')).toBeVisible();
  await row.click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('opening another input swaps the detail in place', async ({ page }) => {
  await openTab(page, 'Inputs');
  await inputRow(page, 'Supply position').click();
  await expect(drawerTitle(page, 'Supply position')).toBeVisible();
  const second = inputRow(page, 'Demand forecast');
  await second.click();
  await expect(drawerTitle(page, 'Demand forecast')).toBeVisible();
  await expect(drawerTitle(page, 'Supply position')).toHaveCount(0);
  await expect(second).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(second).toBeFocused();
});

test('Add opens the preview panel and closes back onto itself', async ({
  page,
}) => {
  await openTab(page, 'Inputs');
  const add = page.getByRole('button', { name: 'Add an input, preview' });
  await add.click();
  await expect(drawerTitle(page, 'Add an input')).toBeVisible();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(add).toBeFocused();
});

test('instructions open a version’s changes and the editor', async ({
  page,
}) => {
  await openTab(page, 'Instructions');
  const changes = page.getByRole('button', { name: 'What changed from v3' });
  await changes.click();
  await expect(drawerTitle(page, /What changed in v4/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(changes).toBeFocused();

  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  await edit.click();
  await expect(drawerTitle(page, 'Edit instructions')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  // Opening the editor started a draft, so the same button now resumes it.
  await expect(
    page.getByRole('button', { name: 'Continue draft' }),
  ).toBeFocused();
});

test('outputs list every destination with how it is undone', async ({
  page,
}) => {
  await openTab(page, 'Outputs');
  const region = page.getByRole('region', { name: 'Outputs 4' });
  await expect(region.getByRole('listitem')).toHaveCount(4);
  await expect(region).toContainText('Simulation only.');
  // Outputs open nothing, so there is no empty detail column.
  await expect(drawer(page)).toHaveCount(0);
});

test('returning to a tab during its fade restores the page immediately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/examples/promotion?run=run-104');
  const tab = (name: string) =>
    page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
  const layer = page
    .locator('.rounded-b-shell-inner.overflow-clip > div')
    .first();

  await tab('Inputs').evaluate((button: HTMLElement) => button.click());
  await expect(layer).toHaveAttribute('inert', '');
  await page.waitForTimeout(40);
  await tab('Runs').evaluate((button: HTMLElement) => button.click());

  await expect(layer).not.toHaveAttribute('inert', '');
  await page.waitForTimeout(100);
  expect(
    await layer.evaluate((element) =>
      Number(getComputedStyle(element).opacity),
    ),
  ).toBeGreaterThan(0.7);
  await expect(
    page.getByRole('heading', { name: 'Runs' }).first(),
  ).toBeVisible();
});
