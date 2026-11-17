import { expect, test } from '@playwright/test';

// The Brunch processes were served under /examples; the old addresses answer
// a permanent redirect, and a run named in the query comes with them.
for (const [old, now] of [
  ['/examples/brunch-orders', '/processes/brunch-orders'],
  ['/examples/brunch-orders-direct', '/processes/brunch-orders-direct'],
] as const) {
  test(`${old} is permanently redirected to ${now}`, async ({ request }) => {
    const response = await request.get(`${old}?run=run-1`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location!, 'http://x').pathname).toBe(
      now,
    );
    expect(new URL(response.headers().location!, 'http://x').search).toBe(
      '?run=run-1',
    );
  });

  test(`${old}?run=x opens ${now}?run=x in the browser`, async ({ page }) => {
    await page.goto(`${old}?run=x`);
    await expect(page).toHaveURL(
      new RegExp(`${now.replaceAll('/', '\\/')}\\?run=x$`),
    );
  });
}
