import { expect, test } from '@playwright/test';
import { expectContrast, openHome, scanContrast } from './contrast';

test.beforeEach(async ({ page, colorScheme }) => {
  if (colorScheme !== 'light' && colorScheme !== 'dark')
    throw new Error('A contrast project must select a light or dark theme.');
  await openHome(page, colorScheme);
});

test('home page', async ({ page }, testInfo) => {
  await expect(
    page.getByRole('heading', { name: 'Fresh Food Weekend', exact: true }),
  ).toBeVisible();
  await expectContrast(page, testInfo, 'home');
});

test('workspace menu', async ({ page }, testInfo) => {
  await page
    .getByRole('button', { name: 'Back to workspace menu', exact: true })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Workspace', exact: true }),
  ).toBeVisible();
  await expectContrast(page, testInfo, 'workspace');
});

test('process search', async ({ page }, testInfo) => {
  await page
    .getByRole('button', { name: 'Search processes', exact: true })
    .click();
  const search = page.getByRole('searchbox', {
    name: 'Search processes',
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill('Promotion');
  await expect(
    page.getByRole('link', { name: 'Promotion release', exact: true }),
  ).toBeVisible();
  await expectContrast(page, testInfo, 'search');
});

test('release review', async ({ page }, testInfo) => {
  await page
    .getByRole('button', { name: 'Review release', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Loading item details…', { exact: true }),
  ).toBeHidden();
  await expectContrast(page, testInfo, 'review');
});

test('scanner detects an injected contrast regression', async ({
  page,
}, testInfo) => {
  // Separate page content isolates the scanner contract from existing app findings.
  await page.setContent(
    '<html lang="en"><head><title>Contrast regression fixture</title></head><body style="background:#fff"><p id="contrast-probe" style="color:#000;font:16px Arial">Contrast regression probe</p></body></html>',
  );
  const passing = await scanContrast(page, testInfo, 'self-test-pass');
  expect(passing.violations).toEqual([]);
  expect(passing.incomplete).toEqual([]);
  expect(passing.passes.some((rule) => rule.id === 'color-contrast')).toBe(
    true,
  );
  await page.locator('#contrast-probe').evaluate((element) => {
    element.style.color = '#aaa';
  });
  const failing = await scanContrast(page, testInfo, 'self-test-fail');
  expect(
    failing.violations.some(
      (rule) =>
        rule.id === 'color-contrast' &&
        rule.nodes.some((node) => node.target.includes('#contrast-probe')),
    ),
  ).toBe(true);
});
