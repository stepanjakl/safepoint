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

test('instructions open their latest version beside the list of versions', async ({
  page,
}) => {
  await openTab(page, 'Instructions');
  const versions = page.getByRole('list', { name: /^Instructions/ });
  const current = versions.getByRole('button', { name: /^v4 · Live/ });
  // The latest opens with the tab, and leaves focus where it was.
  await expect(drawerTitle(page, 'Version v4')).toBeAttached();
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  const diff = drawer(page).getByRole('list', { name: 'Changes from v3' });
  await expect(diff).toHaveCount(0);
  // Each version says how many runs ran under it.
  await expect(current).toContainText('run');

  // The same panel turns to what changed, and back.
  const changes = drawer(page).getByRole('radio', { name: 'Changes from v3' });
  await changes.click();
  await expect(changes).toBeChecked();
  await expect(diff).toBeVisible();
  await expect(diff.getByText('Added:')).not.toHaveCount(0);
  await drawer(page).getByRole('radio', { name: 'Text of v4' }).click();
  await expect(diff).toHaveCount(0);

  // The row that has it open closes it.
  await current.click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(current).toBeFocused();

  // An earlier version is restored as a draft, which then leads the list.
  await versions.getByRole('button', { name: /^v3/ }).click();
  await expect(drawerTitle(page, 'Version v3')).toBeAttached();
  await drawer(page).getByRole('button', { name: 'Draft from v3' }).click();
  await expect(drawerTitle(page, 'New version v5')).toBeVisible();
  const draft = versions.getByRole('button', { name: /^v5 · Draft/ });
  await expect(draft).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(draft).toBeFocused();
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

test('tab handoff keeps dividers still, fades the list once and holds the detail behind it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/examples/promotion?run=run-104');

  const inputs = page.getByRole('button', { name: /^Inputs/ }).first();
  // The outgoing section first; the incoming one is rendered after it, hidden.
  const leaving = page.locator('.process-sheet-swap').first();
  await inputs.click();
  await expect(inputs).toHaveAttribute('aria-current', 'true');
  await expect(leaving).toHaveAttribute('inert', '');
  expect(
    await leaving.evaluate((element) => {
      const transform = new DOMMatrix(getComputedStyle(element).transform);
      return [transform.m41, transform.m42];
    }),
  ).toEqual([0, 0]);

  const entering = page.locator('.process-sheet-swap[data-swap-entering]');
  await expect(entering).toBeAttached();
  // The layer's fade is the list's only one: none of its parts fade inside it.
  for (const part of [
    entering.locator('.process-panel-list > .sheet-head'),
    entering.locator('.process-panel-list > :not(.sheet-head)').first(),
  ])
    await expect(part).toHaveCSS('animation-name', 'none');
  // Shown with its section, the detail column waits the whole beat.
  await expect(entering.locator('[data-detail-held]')).toHaveCSS(
    'animation-delay',
    '0.15s',
  );
  await expect(entering).not.toHaveAttribute('inert');
});
