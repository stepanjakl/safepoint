import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function openHome(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ({ theme }) => {
      localStorage.setItem('safepoint:theme', theme);
    },
    { theme },
  );
  await page.goto('/examples/promotion?run=run-104');
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toBeVisible();
  // Also works against production, where the development preference script is absent.
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `
    *, *::before, *::after { animation: none !important; transition: none !important; }
    /* The design controls are not application UI and can obscure the page. */
    .sp-devctl { display: none !important; }
  `,
  });
}

export async function scanContrast(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .analyze();
  await testInfo.attach(`${name}-axe`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach(`${name}-page`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  const incompleteNodes = results.incomplete.reduce(
    (count, rule) => count + rule.nodes.length,
    0,
  );
  if (incompleteNodes) {
    const description = `${name}: ${incompleteNodes} nodes need manual contrast review; see axe attachment.`;
    testInfo.annotations.push({ type: 'contrast-needs-review', description });
    console.warn(description);
  }
  return results;
}

export async function expectContrast(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const results = await scanContrast(page, testInfo, name);
  expect(
    results.passes.length +
      results.violations.length +
      results.incomplete.length,
    'axe must inspect contrast, not return an empty scan',
  ).toBeGreaterThan(0);
  expect
    .soft(
      results.violations,
      `${name}: confirmed contrast violations; see axe attachment`,
    )
    .toEqual([]);
  if (process.env.CONTRAST_STRICT === '1') {
    expect
      .soft(results.incomplete, `${name}: unresolved contrast findings`)
      .toEqual([]);
  }
}
