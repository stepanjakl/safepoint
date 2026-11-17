import { expect, test } from '@playwright/test';

// The Brunch processes were served under /examples; the old addresses answer
// a permanent redirect, and a run named in the query comes with them.
for (const [old, now] of [
  ['/examples/brunch-orders', '/processes/brunch-orders'],
  ['/examples/brunch-orders-direct', '/processes/brunch-orders-direct'],
] as const) {
  const redirectedTo = (location: string) => new URL(location, 'http://x');

  test(`${old} is permanently redirected to ${now}`, async ({ request }) => {
    const response = await request.get(`${old}?run=run-1`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    const to = redirectedTo(response.headers().location!);
    expect(to.pathname).toBe(now);
    expect(to.search).toBe('?run=run-1');
  });

  // The page may tidy a run it does not know from the address once it opens,
  // so what is checked is the redirect the browser was given.
  test(`${old}?run=x is followed by the browser to ${now}`, async ({
    page,
  }) => {
    const response = await page.goto(`${old}?run=x`);
    const first = response!.request().redirectedFrom();
    expect(first).not.toBeNull();
    const given = await first!.response();
    expect(given!.status()).toBe(308);
    expect(redirectedTo(given!.headers().location!).search).toBe('?run=x');
    expect(new URL(page.url()).pathname).toBe(now);
  });
}
