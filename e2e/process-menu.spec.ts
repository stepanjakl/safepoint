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
  await page.goto('/examples/promotion?run=run-104');
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
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByRole('heading', {
      name: 'An agent proposes a change. You make the call. Safepoint applies only what you approve.',
    }),
  ).toBeVisible();
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
  await expect(
    page.getByRole('heading', { name: /An agent proposes a change/ }),
  ).toBeVisible();

  // ⌘K from the workspace level travels back and lands in the field.
  await page
    .getByRole('button', { name: 'Back to workspace menu', exact: true })
    .click();
  await page.keyboard.press(`${modifier}+k`);
  await expect(
    page.getByRole('searchbox', { name: 'Search processes' }),
  ).toBeFocused();

  await menuLink(page, 'Support handoff').click();
  await expect(page).toHaveURL(/\/examples\/support$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByRole('navigation', { name: 'Workspace' }),
  ).toBeVisible();
});

test('the first workspace visit reveals navigation after the intro', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workspace');

  const shell = page.locator('.resizable-shell');
  const handle = page.locator('.sidebar-handle[data-side="left"]');
  const navigation = page.locator('.sidebar-navigation');
  const processes = page.locator('.workspace-menu-shine');

  await expect(shell).toHaveAttribute('data-workspace-reveal', 'waiting');
  await expect(navigation).toHaveAttribute('inert', '');
  await expect(handle).toBeHidden();
  await expect(handle).toHaveAttribute('tabindex', '-1');
  const inset = await shell.evaluate((root) => {
    const pane = root.querySelector('.ground-raised.rounded-shell');
    if (!pane) throw new Error('Workspace pane not found');
    const shellBox = root.getBoundingClientRect();
    const paneBox = pane.getBoundingClientRect();
    return {
      left: paneBox.left - shellBox.left,
      right: shellBox.right - paneBox.right,
      top: paneBox.top - shellBox.top,
    };
  });
  expect(inset.left).toBeCloseTo(inset.right);
  expect(inset.left).toBeCloseTo(inset.top);

  await expect(shell).toHaveAttribute('data-workspace-reveal', 'opening', {
    timeout: 12_000,
  });
  await expect(handle).toBeHidden();
  await expect(shell).not.toHaveAttribute('data-workspace-reveal');
  await expect(navigation).not.toHaveAttribute('inert');
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute('tabindex', '0');
  await expect(processes).toHaveAttribute('data-shine', 'true');
});

test('the brand mark turns on hover and settles back into place', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openHome(page);

  const mark = page.locator('.sidebar-navigation [aria-label="Safepoint"] svg');
  const animatedMark = mark.locator('..');
  const rotation = () =>
    animatedMark.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).b,
    );

  await mark.hover();
  await expect.poll(rotation, { timeout: 2_500 }).toBeLessThan(-0.5);
  await expect.poll(rotation, { timeout: 2_500 }).toBeCloseTo(0, 2);
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
