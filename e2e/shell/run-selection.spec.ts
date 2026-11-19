import { expect, test, type Page } from '@playwright/test';

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
