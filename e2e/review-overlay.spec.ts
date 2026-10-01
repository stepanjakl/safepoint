import { expect, test, type Page } from '@playwright/test';

/* The release review: the queue over the sheet, and the item it opens beside
   it. Focus is asserted at every close -- the item hands it back to its row,
   and the review to whatever opened it. */

async function openRun(page: Page) {
  await page.goto('/examples/promotion?run=run-104');
  await expect(
    page.getByRole('button', { name: 'Review release', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

const review = (page: Page) => page.getByRole('dialog');
const queueRows = (page: Page) =>
  page.locator('.review-queue button[aria-expanded]');
const item = (page: Page) => page.locator('.drawer-aside');

test('the button opens the queue alone, and a row opens its item beside it', async ({
  page,
}) => {
  await openRun(page);
  const opener = page.getByRole('button', {
    name: 'Review release',
    exact: true,
  });
  await opener.click();
  await expect(review(page)).toBeVisible();
  await expect(item(page)).toHaveCount(0);

  const first = queueRows(page).first();
  const subject = (await first.locator('span').first().textContent()) ?? '';
  await first.click();
  await expect(
    item(page).getByRole('heading', { name: subject }),
  ).toBeFocused();
  await expect(first).toHaveAttribute('aria-expanded', 'true');

  // A second row swaps the item in place, and focus stays on the row.
  const second = queueRows(page).nth(1);
  const next = (await second.locator('span').first().textContent()) ?? '';
  await second.click();
  await expect(item(page).getByRole('heading', { name: next })).toBeVisible();
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute('aria-expanded', 'false');

  // Escape closes the item first, then the review.
  await page.keyboard.press('Escape');
  await expect(item(page)).toHaveCount(0);
  await expect(review(page)).toBeVisible();
  await expect(second).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a row on the card opens the review at its item', async ({ page }) => {
  await openRun(page);
  const row = page.getByRole('button', { name: /Open in review$/ }).first();
  const subject = (await row.locator('span').first().textContent()) ?? '';
  await row.click();
  await expect(
    item(page).getByRole('heading', { name: subject }),
  ).toBeVisible();
  await expect(
    page.locator('.review-queue button[aria-expanded="true"]'),
  ).toHaveCount(1);
});

test('the card swaps bucket rows in place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openRun(page);
  const tabs = page.getByRole('tablist', { name: 'Filter by disposition' });
  const next = tabs.getByRole('tab').nth(1);
  await next.click();
  await expect(next).toHaveAttribute('aria-selected', 'true');

  const incoming = page.locator('.release-bucket-swap[data-swap-entering]');
  await expect(incoming).toBeVisible();
  const motion = await incoming.evaluate((element) => {
    const transform = new DOMMatrixReadOnly(
      getComputedStyle(element).transform,
    );
    return [transform.m41, transform.m42];
  });
  expect(motion).toEqual([0, 0]);
  const delays = await incoming
    .locator('li')
    .evaluateAll((rows) =>
      rows.slice(0, 2).map((row) => getComputedStyle(row).animationDelay),
    );
  expect(delays).toEqual(['0s', '0.04s']);
});

test('a filter that leaves the open item out closes it', async ({ page }) => {
  await openRun(page);
  await page
    .getByRole('button', { name: 'Review release', exact: true })
    .click();
  await queueRows(page).first().click();
  await expect(item(page)).toHaveCount(1);
  const filters = page.getByRole('radiogroup', {
    name: 'Filter by disposition',
  });
  await filters.getByRole('radio').last().click();
  await expect(item(page)).toHaveCount(0);
});

test('number keys pick a tab, and the review reopens on the last one', async ({
  page,
}) => {
  await openRun(page);
  const opener = page.getByRole('button', {
    name: 'Review release',
    exact: true,
  });
  await opener.click();
  const tabs = page.getByRole('radiogroup', { name: 'Filter by disposition' });
  await queueRows(page).first().focus();
  await page.keyboard.press('2');
  await expect(tabs.getByRole('radio').nth(1)).toBeChecked();

  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await opener.click();
  await expect(tabs.getByRole('radio').nth(1)).toBeChecked();
});

test('a bucket gets the quiet All-style cue only after the list scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await openRun(page);
  await page.getByRole('button', { name: 'Review release' }).click();

  const tabs = page.getByRole('radiogroup', {
    name: 'Filter by disposition',
  });
  const all = tabs.getByRole('radio').first();
  const bucket = tabs.getByRole('radio').nth(1);
  const scroller = page.locator('.review-queue .overflow-y-auto');
  await expect(all).toBeChecked();
  await expect(bucket).not.toHaveAttribute('data-spied', '');

  await scroller.evaluate((element) => {
    element.scrollTop = 2;
  });
  await expect(bucket).toHaveAttribute('data-spied', '');
  const colors = await bucket.evaluate((element) => {
    const count = element.querySelector('.review-tab-count');
    const home = document.querySelector('.review-tab-home');
    const field = document.querySelector('.field-track');
    if (!count || !home || !field)
      throw new Error('Review filter colors cannot be measured');
    return {
      tab: getComputedStyle(element).backgroundColor,
      tabText: getComputedStyle(element).color,
      count: getComputedStyle(count).backgroundColor,
      countText: getComputedStyle(count).color,
      home: getComputedStyle(home).backgroundColor,
      field: getComputedStyle(field).backgroundColor,
    };
  });
  expect(colors.tab).toBe(colors.home);
  expect(colors.count).toBe(colors.field);
  await bucket.hover();
  await expect
    .poll(() => bucket.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(colors.tabText);
  const hovered = {
    tab: await bucket.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    count: await bucket
      .locator('.review-tab-count')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    countText: await bucket
      .locator('.review-tab-count')
      .evaluate((element) => getComputedStyle(element).color),
  };
  expect(hovered.tab).toBe(colors.tab);
  expect(hovered.count).toBe(colors.count);
  expect(hovered.countText).not.toBe(colors.countText);

  const nextGroup = scroller.locator('[data-group]').nth(1);
  const nextBucket = tabs.locator(
    `[data-review-filter="${await nextGroup.getAttribute('data-group')}"]`,
  );
  await scroller.evaluate((element) => {
    const next = element.querySelectorAll<HTMLElement>('[data-group]').item(1);
    if (!next) throw new Error('Second review group is missing');
    element.scrollTop = next.offsetTop + 2;
  });
  await expect(bucket).not.toHaveAttribute('data-spied', '');
  await expect(nextBucket).toHaveAttribute('data-spied', '');

  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(bucket).not.toHaveAttribute('data-spied', '');
  await expect(all).toBeChecked();
});

test('where the tabs do not fit, the rest move into a menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openRun(page);
  await page
    .getByRole('button', { name: 'Review release', exact: true })
    .click();
  const tabs = page.getByRole('radiogroup', { name: 'Filter by disposition' });
  await expect(tabs.getByRole('radio')).toHaveCount(1);
  await page.getByRole('button', { name: /^More/ }).click();
  await page.getByRole('menuitem').first().click();
  await expect(tabs.getByRole('radio')).toHaveCount(1);
  await expect(tabs.getByRole('radio')).toBeChecked();
});
