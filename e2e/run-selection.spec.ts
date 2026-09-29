import { expect, test, type Page } from '@playwright/test';

/*
  Which run the process page shows: nothing on arrival, the run the rail
  chooses, nothing again when that row is chosen twice, and a started run
  playing its stages up to the review. The choice is kept in ?run=, so a link
  opens the same run.
*/
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const row = (page: Page, day: RegExp) =>
  page.locator('.sheet-row').filter({ hasText: day }).first();

test('the rail chooses what the page shows', async ({ page }) => {
  await page.goto('/examples/promotion');
  await expect(heading(page)).toHaveText('No run selected');

  await row(page, /Sep\s*4/).click();
  await expect(heading(page)).toHaveText('Run, Thu 4 Sep · 09:00');
  await expect(page).toHaveURL(/\?run=run-104$/);

  // The row is a toggle: choosing it again shows nothing.
  await row(page, /Sep\s*4/).click();
  await expect(heading(page)).toHaveText('No run selected');
  await expect(page).not.toHaveURL(/run=/);

  // Only the current run has a recorded thread.
  await row(page, /Aug\s*28/).click();
  await expect(heading(page)).toHaveText(/has no recorded thread/);

  await page.goto('/examples/promotion?run=run-104');
  await expect(heading(page)).toHaveText('Run, Thu 4 Sep · 09:00');
});

test('a started run plays up to the review', async ({ page }) => {
  await page.goto('/examples/promotion');
  await page.getByRole('button', { name: 'Start run' }).last().click();
  const top = page.locator('.sheet-row').first();
  await expect(top).toHaveAttribute('aria-label', /^Running\..*by a person/);
  await expect(heading(page)).toHaveText(/^Run, Today/);
  // While it plays, a second cannot start.
  await expect(
    page.getByRole('button', { name: 'Start run' }).first(),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect(top).toHaveAttribute('aria-label', /^Awaiting review\./, {
    timeout: 15_000,
  });
  // The review card loads its code on demand, which a busy server can slow.
  await expect(
    page.getByRole('button', { name: 'Review release' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('a process with nothing to play cannot start one', async ({ page }) => {
  await page.goto('/examples/support');
  await expect(heading(page)).toHaveText('No run selected');
  await expect(
    page.getByRole('button', { name: 'Start run' }).first(),
  ).toHaveAttribute('aria-disabled', 'true');
});
