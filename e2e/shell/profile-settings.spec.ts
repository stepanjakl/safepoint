import { expect, test } from '@playwright/test';

test('profile orb spins on activation and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workspace');
  const orb = page.getByRole('button', { name: /^Spin .+’s profile orb$/ });
  const isSpinning = () =>
    orb.evaluate((element) =>
      element
        .getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running'),
    );

  await orb.click();
  await expect.poll(isSpinning).toBe(true);
  await expect.poll(isSpinning, { timeout: 8000 }).toBe(false);

  await orb.press('Space');
  await expect(orb).toBeFocused();
  await expect(orb).toHaveCSS('outline-style', 'solid');
  await expect.poll(isSpinning).toBe(true);
  await expect.poll(isSpinning, { timeout: 8000 }).toBe(false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await orb.press('Enter');
  expect(await isSpinning()).toBe(false);
});

test('profile appearance applies immediately and survives reload', async ({
  page,
}) => {
  await page.goto('/workspace');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');

  const appearance = page.getByRole('dialog', { name: 'Settings' });
  const mode = appearance.getByLabel('Mode');
  const theme = appearance.getByLabel('Theme');
  const edges = appearance.getByLabel('Edges');
  const root = page.locator('html');

  await expect(appearance).toBeVisible();
  await expect(settings).toHaveCSS('cursor', 'pointer');
  await expect(mode).toHaveCSS('cursor', 'pointer');
  const triggerBox = await settings.boundingBox();
  const dialogBox = await appearance.locator('..').boundingBox();
  expect(dialogBox?.x).toBeCloseTo(triggerBox?.x ?? -1, 0);
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await mode.selectOption('dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await theme.selectOption('moss');
  await expect(root).toHaveAttribute('data-neutral', 'moss');
  await edges.selectOption('highlights');
  await expect(root).toHaveAttribute('data-edges', 'highlights');

  await page.keyboard.press('Escape');
  await expect(appearance).toBeHidden();
  await expect(settings).toBeFocused();

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-neutral', 'moss');
  await expect(root).toHaveAttribute('data-edges', 'highlights');

  await settings.click();
  await expect(mode).toHaveValue('dark');
  await expect(theme).toHaveValue('moss');
  await expect(edges).toHaveValue('highlights');
  await mode.selectOption('system');
  await expect(root).not.toHaveAttribute('data-theme', /.+/);
  await page.mouse.click(1400, 20);
  await expect(appearance).toBeHidden();
});

test('profile settings work inside the mobile navigation drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  const settings = drawer.getByRole('button', {
    name: 'Settings',
    exact: true,
  });
  await settings.click();

  const appearance = page.getByRole('dialog', { name: 'Settings' });
  await expect(appearance).toBeInViewport();
  await appearance.getByLabel('Theme').selectOption('clay');
  await expect(page.locator('html')).toHaveAttribute('data-neutral', 'clay');

  await page.keyboard.press('Escape');
  await expect(appearance).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(settings).toBeFocused();
});

test('popover triggers toggle and an outside click activates Search', async ({
  page,
}) => {
  await page.goto('/processes/brunch-orders');
  const search = page.getByRole('button', {
    name: 'Search processes',
    exact: true,
  });
  const searchbox = page.getByRole('searchbox', { name: 'Search processes' });

  const profileSettings = page
    .getByRole('complementary', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Settings', exact: true });
  const runOptions = page.getByRole('button', {
    name: 'Start run with a note',
  });

  for (const [trigger, title] of [
    [profileSettings, 'Settings'],
    [runOptions, 'Start with a note'],
  ] as const) {
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await trigger.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.press('Space');
    await expect(dialog).toBeVisible();
    await search.click();
    await expect(dialog).toBeHidden();
    await expect(searchbox).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
  }
});
