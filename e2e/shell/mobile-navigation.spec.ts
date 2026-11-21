import { expect, test } from '@playwright/test';

const processRoute = '/processes/brunch-orders';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe('mobile drawer with a pointer', () => {
  test.use({ hasTouch: false });

  test('selected menu icons share a face and border that respond to hover', async ({
    page,
  }, testInfo) => {
    await page.addInitScript((theme) => {
      if (theme === 'light' || theme === 'dark') {
        localStorage.setItem('safepoint.dev.theme', theme);
      }
    }, testInfo.project.use.colorScheme);
    const paints = [];
    for (const [name, selectedName, state] of [
      ['Settings', 'Settings', 'aria-expanded'],
      ['Search processes', 'Search processes', 'aria-expanded'],
      ['Arrange processes', 'Save order', 'aria-pressed'],
    ] as const) {
      await page.goto(processRoute);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
      await drawer.getByRole('button', { name, exact: true }).click();
      const selected = drawer.getByRole('button', {
        name: selectedName,
        exact: true,
      });
      await expect(selected).toHaveAttribute(state, 'true');

      await page.mouse.move(1, 1);
      const readPaint = () =>
        selected.evaluate(async (button) => {
          await Promise.allSettled(
            button
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished),
          );
          const face = getComputedStyle(button);
          const ring = getComputedStyle(button, '::after');
          return {
            faceImage: face.backgroundImage,
            ringImage: ring.backgroundImage,
            faceTop: face.getPropertyValue('--control-face-top'),
            faceBottom: face.getPropertyValue('--control-face-bottom'),
            ringTop: ring.getPropertyValue('--control-ring-top'),
            ringBottom: ring.getPropertyValue('--control-ring-bottom'),
          };
        });
      const rest = await readPaint();
      expect(rest.faceTop).not.toBe(rest.faceBottom);
      expect(rest.ringTop).not.toBe(rest.ringBottom);
      await selected.hover();
      const hover = await readPaint();
      expect(hover.faceTop).not.toBe(rest.faceTop);
      expect(hover.faceBottom).not.toBe(rest.faceBottom);
      expect(hover.ringTop).not.toBe(rest.ringTop);
      expect(hover.ringBottom).not.toBe(rest.ringBottom);
      for (const paint of [rest, hover]) {
        expect(paint.faceImage).toBe(
          `linear-gradient(${paint.faceTop}, ${paint.faceBottom})`,
        );
        expect(paint.ringImage).toBe(
          `linear-gradient(${paint.ringTop}, ${paint.ringBottom})`,
        );
      }
      await page.mouse.move(1, 1);
      await expect.poll(readPaint).toEqual(rest);
      paints.push({ rest, hover });
    }
    expect(paints).toEqual(Array(3).fill(paints[0]));
  });
});

test.describe('mobile first paint', () => {
  test.use({ javaScriptEnabled: false });

  test('both routes show the same menu and the workspace fills the viewport', async ({
    page,
  }) => {
    const opener = page.getByRole('button', { name: 'Menu', exact: true });
    await page.goto('/workspace');
    await expect(opener).toBeVisible();
    const workspaceMenu = await opener.boundingBox();
    const pane = page.locator('.shell-pane');
    const content = page.locator('.workspace-intro-content');
    const paneBox = (await pane.boundingBox())!;
    const contentBox = (await content.boundingBox())!;
    expect(paneBox.y * 2 + paneBox.height).toBeCloseTo(
      page.viewportSize()!.height,
      0,
    );
    expect(contentBox.y + contentBox.height / 2).toBeCloseTo(
      paneBox.y + paneBox.height / 2,
      0,
    );
    expect(contentBox.x + contentBox.width / 2).toBeCloseTo(
      paneBox.x + paneBox.width / 2,
      0,
    );

    await page.goto(processRoute);
    await expect(opener).toBeVisible();
    expect(await opener.boundingBox()).toEqual(workspaceMenu);
  });
});

test('the mobile menu has modal dismissal, search and destination navigation', async ({
  page,
}) => {
  await page.goto('/workspace');
  const opener = page.getByRole('button', { name: 'Menu', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  const close = drawer.getByRole('button', { name: 'Close menu' });

  await expect(opener).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await page.mouse.click(3, 3);
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.keyboard.press(`${modifier}+k`);
  const search = drawer.getByRole('searchbox', { name: 'Search processes' });
  await expect(search).toBeFocused();
  await search.fill('brunch');
  await drawer.locator(`a[href="${processRoute}"]`).click();
  await expect(page).toHaveURL(processRoute, { timeout: 15_000 });
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeVisible();

  await opener.click();
  await expect(close).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeHidden();
  await expect(
    page.getByRole('complementary', { name: 'Workspace navigation' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(opener).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test('touch opens and dismisses the mobile menu and switches the process section', async ({
  page,
}) => {
  await page.goto('/workspace');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const drawer = page.getByRole('dialog', { name: 'Menu', exact: true });
  await menu.tap();
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Close menu' }).tap();
  await expect(drawer).toBeHidden();

  await page.goto(processRoute);
  const settings = page.locator('.process-header').getByRole('button', {
    name: 'Settings',
    exact: true,
  });
  await settings.tap();
  await expect(settings).toHaveAttribute('aria-current', 'true');
});

test('the empty run is centred below the runs list on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto(processRoute);

  const empty = page.getByRole('main').filter({
    hasText: 'Choose a run, or start a new one.',
  });
  const message = empty.locator(':scope > div');
  await expect(message).toBeVisible();
  const listBox = (await page.locator('.process-runs-list').boundingBox())!;
  const sheetBox = (await page.locator('.process-sheet-frame').boundingBox())!;
  const messageBox = (await message.boundingBox())!;
  expect(messageBox.x + messageBox.width / 2).toBeCloseTo(
    sheetBox.x + sheetBox.width / 2,
    0,
  );
  expect(messageBox.y + messageBox.height / 2).toBeCloseTo(
    (listBox.y + listBox.height + sheetBox.y + sheetBox.height) / 2,
    0,
  );
});

test('process panels fill the mobile viewport and scroll when taller', async ({
  page,
}) => {
  for (const route of [processRoute, '/processes/brunch-orders-direct']) {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.goto(route);
    const settings = page.getByRole('button', {
      name: 'Settings',
      exact: true,
    });
    await settings.click();
    await expect(settings).toHaveAttribute('aria-current', 'true');

    const pane = page.locator('.shell-pane');
    const sheet = page.locator('.process-sheet-frame');
    const paneBox = (await pane.boundingBox())!;
    const sheetBox = (await sheet.boundingBox())!;
    expect(paneBox.y * 2 + paneBox.height).toBeCloseTo(
      page.viewportSize()!.height,
      0,
    );
    expect(
      paneBox.y + paneBox.height - sheetBox.y - sheetBox.height,
    ).toBeLessThan(16);

    await page.setViewportSize({ width: 390, height: 500 });
    const lastSetting = sheet.getByText('Delete permanently', { exact: true });
    await lastSetting.scrollIntoViewIfNeeded();
    await expect(lastSetting).toBeInViewport({ ratio: 1 });
  }
});

test('the narrow process header centres the editable title and reveals the active tab', async ({
  page,
}) => {
  await page.goto(processRoute);
  const title = page.getByRole('textbox', { name: 'Process name' });
  const opener = page.getByRole('button', { name: 'Menu', exact: true });
  const assistant = page.getByRole('button', {
    name: 'Assistant',
    exact: true,
  });
  const header = page.locator('.process-header');
  const runs = header.getByRole('button', { name: 'Runs', exact: true });
  const settings = header.getByRole('button', { name: 'Settings' });

  await expect(title).toBeVisible();
  const titleBox = (await title.boundingBox())!;
  const menuBox = (await opener.boundingBox())!;
  const assistantBox = (await assistant.boundingBox())!;
  const runsBox = (await runs.boundingBox())!;
  const headerBox = (await header.boundingBox())!;
  expect(
    Math.abs(
      titleBox.x + titleBox.width / 2 - headerBox.x - headerBox.width / 2,
    ),
  ).toBeLessThan(2);
  expect(Math.abs(menuBox.y - assistantBox.y)).toBeLessThan(2);
  expect(runsBox.y).toBeGreaterThan(menuBox.y + menuBox.height);
  await expect(settings).toBeInViewport({ ratio: 1 });
  const settingsX = (await settings.boundingBox())!.x;
  const outputs = header.getByRole('button', { name: /^Outputs:/ });
  await expect(outputs).not.toBeInViewport();
  await outputs.focus();
  await page.keyboard.press('Enter');
  await expect(outputs).toHaveAttribute('aria-current', 'true');
  await expect(settings).toBeInViewport({ ratio: 1 });
  expect((await settings.boundingBox())!.x).toBeCloseTo(settingsX);
  await page.reload();
  await expect(outputs).toHaveAttribute('aria-current', 'true');
  await expect(outputs).toBeInViewport({ ratio: 1 });
});
