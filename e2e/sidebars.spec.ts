import { expect, test, type Page } from '@playwright/test';

/*
  The two resizable sidebars: the workspace menu on the left and the
  assistant on the right. Drag, thresholds, collapse and reset, keyboard
  presets, persistence and its failure modes, route changes and reload, the
  overlay below the shell breakpoint, and the phone layout.

  One sequential test, because each step starts from where the last left the
  panels -- which is also how a person uses them. Ported from the standalone
  scripts/check-sidebars.mjs with the same assertions in the same order.
*/

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

type Side = {
  width: number;
  x: number;
  y: number;
  path: string | null;
  hover: boolean;
};

const side = (page: Page, which: 'left' | 'right') =>
  page.evaluate((which): Side | null => {
    const handle = document.querySelector(
      `.sidebar-handle[data-side="${which}"]`,
    );
    if (!handle) return null;
    const box = handle.getBoundingClientRect();
    return {
      width: Number(handle.getAttribute('aria-valuenow')),
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      path: handle.querySelector('path')?.getAttribute('d') ?? null,
      hover: handle.hasAttribute('data-hovered'),
    };
  }, which);

const assistant = (page: Page) =>
  page.evaluate(() => {
    const handle = document.querySelector('.sidebar-handle[data-side="right"]');
    const field = document.querySelector('textarea');
    return {
      open: document
        .querySelector('button[aria-label="Assistant"]')!
        .getAttribute('aria-expanded'),
      width: handle?.getAttribute('aria-valuenow') ?? null,
      focus: document.activeElement === field,
      draft: field?.value ?? null,
      modal: Boolean(document.querySelector('.assistant-modal')),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });

const leftCollapsed = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('.resizable-shell')!.hasAttribute('data-collapsed'),
  );

const stored = (page: Page, key: string) =>
  page.evaluate((key) => localStorage.getItem(key), key);

/* Press on a handle and move it to where the panel would be `width` wide. The
   button stays down; `release` lets go. */
async function dragTo(page: Page, which: 'left' | 'right', width: number) {
  const handle = (await side(page, which))!;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  const x = handle.x + (width - handle.width) * (which === 'left' ? 1 : -1);
  await page.mouse.move(x, handle.y);
  await page.waitForTimeout(35);
  return { x, y: handle.y };
}

async function release(page: Page, point: { x: number; y: number }) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  await page.waitForTimeout(40);
}

const focusHandle = (page: Page, which: 'left' | 'right') =>
  page.locator(`.sidebar-handle[data-side="${which}"]`).focus();

test('the sidebars resize, remember, and recover', async ({
  page,
  colorScheme,
}, testInfo) => {
  test.skip(colorScheme === 'dark', 'Theme-independent; one run is enough.');
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.sidebar-handle').first()).toHaveAttribute(
    'aria-valuenow',
    '250',
  );
  await page.evaluate(() => document.fonts.ready);

  await test.step('the assistant opens at its default width, focused', async () => {
    expect((await assistant(page)).open).toBe('false');
    expect(await side(page, 'right')).toBeNull();
    await page.locator('button[aria-label="Assistant"]').click();
    await expect.poll(async () => (await assistant(page)).width).toBe('320');
    expect((await assistant(page)).focus).toBe(true);
    await page
      .locator('.assistant-content button', { hasText: 'Explain this run' })
      .click();
    await expect
      .poll(async () => (await assistant(page)).draft)
      .toBe('Explain this run');
    await expect(
      page.locator('.assistant-content button[disabled]'),
    ).toHaveText('Send');
  });

  await test.step('dragging resizes, bends the grip, snaps and cancels', async () => {
    let point = await dragTo(page, 'right', 400);
    expect((await side(page, 'right'))!.width).toBe(400);
    await release(page, point);
    expect(
      JSON.parse((await stored(page, 'safepoint.assistant.v1'))!).width,
    ).toBe(25);

    point = await dragTo(page, 'right', 200);
    expect((await side(page, 'right'))!.path).toBe('M12 4 L12 22 L12 40');
    await page.mouse.move(point.x + 80, point.y);
    await page.waitForTimeout(30);
    expect((await side(page, 'right'))!.path).toBe('M14 4 L10 22 L14 40');
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(30);
    expect((await side(page, 'right'))!.path).toBe('M10 4 L14 22 L10 40');
    await release(page, point);
    expect((await side(page, 'right'))!.width).toBe(280);

    await page.keyboard.press('Alt+Enter');
    await expect.poll(async () => (await side(page, 'right'))!.width).toBe(320);

    point = await dragTo(page, 'right', 100);
    await page.keyboard.press('Escape');
    await release(page, point);
    expect((await side(page, 'right'))!.width).toBe(320);

    point = await dragTo(page, 'right', 100);
    await release(page, point);
    expect(await side(page, 'right')).toBeNull();
    expect((await assistant(page)).open).toBe('false');

    await page.locator('button[aria-label="Assistant"]').click();
    await expect.poll(async () => (await assistant(page)).width).toBe('320');
    expect((await assistant(page)).draft).toBe('Explain this run');
  });

  await test.step('the left panel keeps its bounds, collapse and search', async () => {
    let point = await dragTo(page, 'left', 300);
    await release(page, point);
    expect((await side(page, 'left'))!.width).toBe(300);
    point = await dragTo(page, 'left', 100);
    await release(page, point);
    expect(await leftCollapsed(page)).toBe(true);
    await page.keyboard.press(`${modifier}+k`);
    await expect.poll(() => leftCollapsed(page)).toBe(false);
    await focusHandle(page, 'left');
    await page.keyboard.press('Alt+Enter');
    await expect.poll(async () => (await side(page, 'left'))!.width).toBe(250);
  });

  await test.step('both panels at their widest still leave 640px for the sheet', async () => {
    await focusHandle(page, 'right');
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(100);
    expect((await assistant(page)).overflow).toBe(false);
    expect(
      await page.evaluate(
        () =>
          parseFloat(
            getComputedStyle(
              document.querySelector('.resizable-shell')!,
            ).gridTemplateColumns.split(' ')[1]!,
          ) >= 639,
      ),
    ).toBe(true);
    expect(
      JSON.parse((await stored(page, 'safepoint.assistant.v1'))!).width,
    ).toBe(30);
    expect((await assistant(page)).width).toBe('370');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await assistant(page)).width).toBe('480');
  });

  await test.step('a route change keeps the draft; a reload keeps only preferences', async () => {
    await page.locator('a[href="/examples/support"]').first().click();
    await page.waitForURL('**/examples/support');
    await expect
      .poll(async () => (await assistant(page)).draft)
      .toBe('Explain this run');
    await page.reload();
    await expect(
      page.locator('.sidebar-handle[data-side="right"]'),
    ).toHaveAttribute('aria-valuenow', '480');
    expect((await assistant(page)).draft).toBe('');
  });

  await test.step('reset animates content and sheet edge together', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await focusHandle(page, 'right');
    await page.keyboard.press('Alt+Enter');
    const frames = await page.evaluate(
      () =>
        new Promise<{ menu: number; track: number; open: boolean }[]>(
          (resolve) => {
            const frames: { menu: number; track: number; open: boolean }[] = [];
            const start = performance.now();
            function sample() {
              const shell = document.querySelector('.resizable-shell')!;
              frames.push({
                menu: document
                  .querySelector('.assistant-content')!
                  .getBoundingClientRect().width,
                track: parseFloat(
                  getComputedStyle(shell).gridTemplateColumns.split(' ')[2]!,
                ),
                open: shell.hasAttribute('data-assistant-open'),
              });
              if (performance.now() - start < 1100)
                requestAnimationFrame(sample);
              else resolve(frames);
            }
            requestAnimationFrame(sample);
          },
        ),
    );
    expect(frames.some((frame) => frame.menu > 321 && frame.menu < 479)).toBe(
      true,
    );
    expect(
      frames.every(
        (frame) => frame.open && Math.abs(frame.menu - frame.track) < 1,
      ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  await test.step('a fast pass never lights the handle; a settled one does', async () => {
    await page.locator('.sidebar-handle[data-side="right"]').blur();
    const edge = (await side(page, 'right'))!;
    await page.mouse.move(edge.x - 100, edge.y - 100);
    await page.waitForTimeout(30);
    await page.mouse.move(edge.x, edge.y - 100);
    expect((await side(page, 'right'))!.hover).toBe(false);
    await page.mouse.move(edge.x + 100, edge.y - 100);
    await page.waitForTimeout(120);
    expect((await side(page, 'right'))!.hover).toBe(false);
    await page.mouse.move(edge.x, edge.y - 100);
    await page.waitForTimeout(130);
    expect((await side(page, 'right'))!.hover).toBe(true);
    // The tooltip belongs to the grip, not the whole edge.
    await expect(
      page.locator('[role="tooltip"]:not([data-exiting])'),
    ).toHaveCount(0);
    await page.mouse.move(edge.x + 9, edge.y);
    await page.waitForTimeout(130);
    await expect(
      page.locator('[role="tooltip"]:not([data-exiting])'),
    ).toHaveCount(1);
    const point = await dragTo(page, 'right', 360);
    await release(page, point);
    expect((await side(page, 'right'))!.hover, 'release suppresses hover').toBe(
      false,
    );
  });

  await test.step('below the shell breakpoint the assistant is a trapped overlay', async () => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(150);
    expect((await assistant(page)).modal).toBe(true);
    expect((await assistant(page)).focus).toBe(true);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        ),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await assistant(page)).open).toBe('false');
    await expect(page.locator('button[aria-label="Assistant"]')).toBeFocused();
  });

  await test.step('at phone width the handle goes and the field stays in view', async () => {
    await page.locator('button[aria-label="Assistant"]').click();
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: 600, height: 900 });
    await page.waitForTimeout(150);
    expect((await assistant(page)).overflow).toBe(false);
    await expect(page.locator('.sidebar-handle[data-side="right"]')).toHaveCSS(
      'display',
      'none',
    );
    await page.setViewportSize({ width: 600, height: 500 });
    await page.waitForTimeout(100);
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('.assistant-content textarea')!
            .getBoundingClientRect().bottom < innerHeight,
      ),
    ).toBe(true);
    await page.locator('button[aria-label="Close assistant"]').click();
    await expect.poll(async () => (await assistant(page)).open).toBe('false');
  });

  await test.step('keyboard presets and Escape answer the popup, not its panel', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(100);
    await page.locator('button[aria-label="Assistant"]').click();
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await testInfo.attach('assistant-dark', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await focusHandle(page, 'right');
    await page.keyboard.press('Shift+F10');
    await expect(page.locator('[aria-label="Sidebar width"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    expect((await assistant(page)).open).toBe('true');
  });

  await test.step('the backdrop dismisses the overlay', async () => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(150);
    await page.mouse.click(500, 450);
    await expect
      .poll(async () => (await assistant(page)).open, {
        message: 'backdrop dismisses overlay',
      })
      .toBe('false');
  });

  await test.step('corrupt storage falls back; blocked storage still works', async () => {
    await page.evaluate(() => {
      localStorage.setItem('safepoint.assistant.v1', 'invalid');
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'safepoint.assistant.v1' }),
      );
    });
    await page.locator('button[aria-label="Assistant"]').click();
    await expect.poll(async () => (await assistant(page)).width).toBe('320');
    await page.locator('button[aria-label="Close assistant"]').click();
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('Blocked', 'SecurityError');
      };
    });
    await page.locator('button[aria-label="Assistant"]').click();
    await expect.poll(async () => (await assistant(page)).open).toBe('true');
  });

  expect(errors).toEqual([]);
});
