import { expect, test, type Page } from '@playwright/test';

/* The sidebar's behaviour: search, level travel, and reordering by keyboard
   and pointer. Focus is asserted at every step, because the menu moves it by
   hand across inert panes. */

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

function menuLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Processes' })
    .getByRole('link', { name, exact: true });
}

async function openHome(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toBeVisible();
}

function processNames(page: Page) {
  return page
    .getByRole('list', { name: /process order|Available processes/ })
    .getByRole('listitem')
    .evaluateAll((rows) =>
      rows
        .filter((row) => !row.hasAttribute('aria-hidden'))
        .sort(
          (a, b) =>
            new DOMMatrix(getComputedStyle(a).transform).m42 -
            new DOMMatrix(getComputedStyle(b).transform).m42,
        )
        .map((row) => row.textContent?.match(/^(.*?)(?:\d|$)/)?.[1]?.trim()),
    );
}

test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
});

test('⌘K opens search, filters, and Escape unwinds in two steps', async ({
  page,
}) => {
  await openHome(page);
  const toggle = page.getByRole('button', {
    name: 'Search processes',
    exact: true,
  });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press(`${modifier}+k`);
  const field = page.getByRole('searchbox', { name: 'Search processes' });
  await expect(field).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await field.fill('support');
  await expect(menuLink(page, 'Support handoff')).toBeVisible();
  await expect(menuLink(page, 'Promotion release')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Clear search' }),
  ).toBeVisible();

  await field.fill('nothing like this');
  await expect(page.getByText('No matching processes.')).toBeVisible();

  // First Escape clears the query and keeps the field.
  await page.keyboard.press('Escape');
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  // Second closes it and hands focus back to the toggle.
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menuLink(page, 'Promotion release')).toBeVisible();
});

test('the clear button empties the field and keeps the caret there', async ({
  page,
}) => {
  await openHome(page);
  await page
    .getByRole('button', { name: 'Search processes', exact: true })
    .click();
  const field = page.getByRole('searchbox', { name: 'Search processes' });
  await expect(field).toBeFocused();
  await field.fill('promo');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
});

test('travelling between levels moves focus to the arrival control', async ({
  page,
}) => {
  await openHome(page);
  await page
    .getByRole('button', { name: 'Back to workspace menu', exact: true })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Workspace' }),
  ).toBeVisible();
  const enter = page.getByRole('button', { name: /^Processes/ });
  await expect(enter).toBeFocused();
  await expect(enter).toContainText('2');

  await enter.press('Enter');
  await expect(
    page.getByRole('navigation', { name: 'Processes' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to workspace menu', exact: true }),
  ).toBeFocused();

  // ⌘K from the workspace level travels back and lands in the field.
  await page
    .getByRole('button', { name: 'Back to workspace menu', exact: true })
    .click();
  await page.keyboard.press(`${modifier}+k`);
  await expect(
    page.getByRole('searchbox', { name: 'Search processes' }),
  ).toBeFocused();
});

test('arranging by keyboard reorders, keeps focus, and saves', async ({
  page,
}) => {
  await openHome(page);
  const before = await processNames(page);
  expect(before).toEqual(['Promotion release', 'Support handoff']);

  await page.getByRole('button', { name: 'Arrange processes' }).click();
  const save = page.getByRole('button', { name: 'Save order' });
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  // Arranging keeps search shut, and says so.
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');

  const handle = page.getByRole('button', {
    name: 'Reorder Promotion release',
  });
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await expect(handle).toBeFocused();
  await expect
    .poll(() => processNames(page))
    .toEqual(['Support handoff', 'Promotion release']);
  // Already last: nothing moves, and focus stays put.
  await page.keyboard.press('ArrowDown');
  await expect(handle).toBeFocused();
  await page.keyboard.press('Home');
  await expect
    .poll(() => processNames(page))
    .toEqual(['Promotion release', 'Support handoff']);
  await page.keyboard.press('End');
  await expect
    .poll(() => processNames(page))
    .toEqual(['Support handoff', 'Promotion release']);

  await save.click();
  await expect(
    page.getByRole('button', { name: 'Arrange processes' }),
  ).toBeFocused();
  await page.reload();
  await expect
    .poll(() => processNames(page))
    .toEqual(['Support handoff', 'Promotion release']);
});

test('a pointer drag reorders, and Escape mid-drag puts the row back', async ({
  page,
}) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Arrange processes' }).click();
  const handle = page.getByRole('button', {
    name: 'Reorder Promotion release',
  });
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Cancelled: the drop slot shows while dragging, and Escape restores.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 50, { steps: 6 });
  await expect(page.locator('.process-drop-slot')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.process-drop-slot')).toHaveCount(0);
  await expect
    .poll(() => processNames(page))
    .toEqual(['Promotion release', 'Support handoff']);

  // Completed: the row lands one place down.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 50, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.process-drop-slot')).toHaveCount(0);
  await expect
    .poll(() => processNames(page))
    .toEqual(['Support handoff', 'Promotion release']);
});

test('hovering Arrange previews the handles without entering the mode', async ({
  page,
}) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Arrange processes' }).hover();
  const start = page.locator('.process-menu-row-start').first();
  await expect
    .poll(() => start.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(30);
  await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
  await page.mouse.move(1400, 880);
  await expect
    .poll(() => start.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(0);
});
