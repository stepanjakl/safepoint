import { expect, test, type Locator } from '@playwright/test';

const paddingOf = (button: Locator) =>
  button.evaluate((element) => {
    const { paddingLeft, paddingRight } = getComputedStyle(element);
    return { paddingLeft, paddingRight };
  });

const colorOf = (button: Locator) =>
  button.evaluate((element) => getComputedStyle(element).color);

test('the pressed controls become status pills in place', async ({ page }) => {
  await page.goto('/workbench/decisions');
  await page.waitForLoadState('networkidle');

  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  const sameAccept = await accept.elementHandle();
  const acceptPadding = await paddingOf(accept);
  const acceptColor = await colorOf(accept);
  await accept.hover();
  expect(await colorOf(accept)).not.toBe(acceptColor);
  await accept.click();
  const accepted = page.getByRole('button', { name: 'Accepted' });
  await expect(accepted).toHaveAttribute('data-phase', 'done');
  await expect(accepted).toBeFocused();
  expect(await paddingOf(accepted)).toEqual(acceptPadding);
  expect(await colorOf(accepted)).toBe(acceptColor);
  await expect(accepted.locator('svg')).toHaveCSS('width', '0px');
  await expect(accepted.locator('svg')).toHaveCSS('opacity', '0');
  await expect(accepted.locator('svg')).toHaveCSS('margin-right', '0px');
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [sameAccept, await accepted.elementHandle()],
    ),
  ).toBe(true);
  await expect(accepted).toHaveAttribute('aria-disabled', 'true');

  const deny = page.getByRole('button', { name: 'Deny', exact: true });
  const denyPadding = await paddingOf(deny);
  const denyColor = await colorOf(deny);
  await deny.hover();
  expect(await colorOf(deny)).not.toBe(denyColor);
  await deny.press('Space');
  const denied = page.getByRole('button', { name: 'Denied' });
  await expect(denied).toHaveAttribute('data-phase', 'done');
  expect(await paddingOf(denied)).toEqual(denyPadding);
  expect(await colorOf(denied)).toBe(denyColor);
  await expect(denied.locator('svg')).toHaveCSS('width', '0px');

  const write = page.getByRole('button', { name: 'Write again' });
  const sameWrite = await write.elementHandle();
  const writePadding = await paddingOf(write);
  const writeColor = await colorOf(write);
  await write.click();
  await expect(page.getByRole('button', { name: 'Writing…' })).toHaveAttribute(
    'data-phase',
    'writing',
  );
  await page.getByRole('button', { name: 'Finish simulated reply' }).click();
  const ready = page.getByRole('button', { name: 'Ready to review' });
  await expect(ready).toHaveAttribute('data-phase', 'done');
  expect(await paddingOf(ready)).toEqual(writePadding);
  expect(await colorOf(ready)).toBe(writeColor);
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [sameWrite, await ready.elementHandle()],
    ),
  ).toBe(true);

  await page.getByRole('button', { name: 'Reset' }).first().click();
  await expect(
    page.getByRole('button', { name: 'Accept', exact: true }),
  ).toBeEnabled();
});
