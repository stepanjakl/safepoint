import { expect, test } from '@playwright/test';

/*
  Every visitor is given a name and an orb before they have said who they are,
  kept in a signed cookie: a fresh browser shows one in the account row, a
  reload keeps it, and another fresh browser is given its own.
*/

const COOKIE = 'safepoint-visitor';

const accountName = (page: import('@playwright/test').Page) =>
  page.locator('.shell-profile-row p').first();

test('a fresh browser is named in the account row, and keeps the name', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto('/');
  await expect(accountName(page)).not.toHaveText('Maya');
  const name = (await accountName(page).textContent())!;
  expect(name).toMatch(/^\S+ \S+$/);
  await expect(
    page.getByRole('button', {
      name: `Spin ${name}’s profile orb`,
      exact: true,
    }),
  ).toBeVisible();

  const cookie = (await first.cookies()).find((one) => one.name === COOKIE)!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Lax');

  await page.reload();
  await expect(accountName(page)).toHaveText(name);
  const again = (await first.cookies()).find((one) => one.name === COOKIE)!;
  expect(again.value).toBe(cookie.value);

  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto('/');
  await expect(accountName(other)).toHaveText(/^\S+ \S+$/);
  const otherCookie = (await second.cookies()).find(
    (one) => one.name === COOKIE,
  )!;
  expect(otherCookie.value).not.toBe(cookie.value);

  await first.close();
  await second.close();
});

test('visitors start in dark and retina and can keep other choices', async ({
  page,
}) => {
  await page.goto('/');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-edges', 'retina');

  await page.evaluate(() => {
    localStorage.setItem('safepoint.dev.theme', 'light');
    localStorage.setItem('safepoint.dev.edges', 'default');
  });
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).not.toHaveAttribute('data-edges', /.+/);
});
