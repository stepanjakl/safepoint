import { expect, test, type Locator } from '@playwright/test';

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

async function dividerPaint(
  locator: Locator,
  side: 'bottom' | 'right',
  pseudo?: '::before',
) {
  return locator.evaluate(
    (element, { side, pseudo }) => {
      const style = getComputedStyle(element, pseudo);
      return {
        border: style.getPropertyValue(`border-${side}-width`),
        style: style.getPropertyValue(`border-${side}-style`),
        shadow: style.boxShadow,
      };
    },
    { side, pseudo },
  );
}

for (const mode of ['default', 'retina'] as const) {
  test(`main process dividers keep their rule in ${mode} and forced colors`, async ({
    page,
  }) => {
    await page.goto(`/processes/brunch-orders?edges=${mode}`);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    await expect
      .poll(() => page.locator('html').getAttribute('data-edges'))
      .toBe(mode === 'retina' ? 'retina' : null);

    const header = page.locator('.process-header');
    const runs = page.locator('.process-runs');
    const runHead = runs.locator('.sheet-head').first();
    // A solid layer and a soft one, whole device pixels each (geometry.css):
    // 0.75px is 0.5px solid and 1px at half strength; 1px is all solid.
    const [solid, soft] =
      mode === 'retina' ? ['0.5px', '1px'] : ['1px', '1.5px'];
    const layers = (x: (width: string) => string) =>
      expect.stringMatching(new RegExp(`${x(solid)} inset.*${x(soft)} inset`));
    await expect
      .poll(() => dividerPaint(header, 'bottom'))
      .toMatchObject({
        border: '0px',
        shadow: layers((w) => `0px -${w} 0px 0px`),
      });
    await expect
      .poll(() => dividerPaint(runHead, 'bottom'))
      .toMatchObject({
        border: '0px',
        shadow: layers((w) => `0px -${w} 0px 0px`),
      });
    await expect
      .poll(() => dividerPaint(runs, 'right', '::before'))
      .toMatchObject({
        border: '0px',
        shadow: layers((w) => `-${w} 0px 0px 0px`),
      });

    await page.emulateMedia({ forcedColors: 'active' });
    const fallback = { border: '1px', style: 'solid', shadow: 'none' };
    await expect.poll(() => dividerPaint(header, 'bottom')).toEqual(fallback);
    await expect.poll(() => dividerPaint(runHead, 'bottom')).toEqual(fallback);
    await expect
      .poll(() => dividerPaint(runs, 'right', '::before'))
      .toEqual(fallback);

    await page.getByRole('button', { name: /^Instructions:/ }).click();
    const instructions = page.locator(
      '.process-panels[data-tab="instructions"]',
    );
    const version = instructions.getByRole('button', { name: /^v3 · Live/ });
    await expect(version).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(() => dividerPaint(instructions, 'right', '::before'))
      .toEqual(fallback);
    await version.click();
    await expect(version).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(() => dividerPaint(instructions, 'right', '::before'))
      .toEqual(fallback);

    await page.setViewportSize({ width: 1000, height: 900 });
    await page.getByRole('button', { name: 'Runs', exact: true }).click();
    await expect
      .poll(() => dividerPaint(runs.locator('.process-runs-list'), 'bottom'))
      .toEqual(fallback);
  });
}

for (const mode of ['default', 'retina']) {
  for (const theme of ['light', 'dark']) {
    test(`the notch joins the header smoothly in ${mode} and ${theme}`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('safepoint.dev.theme', value);
      }, theme);
      await page.goto(`/processes/brunch-orders?edges=${mode}`);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect
        .poll(() => page.locator('html').getAttribute('data-edges'))
        .toBe(mode === 'retina' ? 'retina' : null);

      const notch = page.locator('.process-header .notch');
      await expect(notch).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const { right, bottom, radius } = await notch.evaluate((element) => {
        const { right, bottom } = element.getBoundingClientRect();
        const edge = parseFloat(
          getComputedStyle(element).getPropertyValue('--edge-control'),
        );
        const arc = parseFloat(getComputedStyle(element, '::after').width);
        return { right, bottom, radius: arc - edge };
      });
      const tangent = right - radius;
      const clipX = Math.floor(tangent) - 1;
      const paneRight = Math.floor(right);
      // The floor and curve meet in the last two CSS pixels above the notch bottom.
      const image = await page.screenshot({
        clip: {
          x: clipX,
          // From the floor itself, which can sit on a half pixel at 2x.
          y: bottom - 2,
          width: paneRight + 3 - clipX,
          height: 4,
        },
      });
      const differences = await page.evaluate(
        async ({ bytes, tangentX, canvasX }) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)]),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          if (!context)
            throw new Error('Could not read notch screenshot pixels.');
          context.drawImage(bitmap, 0, 0);
          const { data } = context.getImageData(
            0,
            0,
            bitmap.width,
            bitmap.height,
          );
          const tangentPixel = Math.round(tangentX * devicePixelRatio);
          const canvasPixel = canvasX * devicePixelRatio;
          let join = 0;
          let streak = 0;
          for (let row = 0; row < 2 * devicePixelRatio; row++) {
            const start = row * bitmap.width * 4;
            const reference = start + (bitmap.width - 1) * 4;
            for (let channel = 0; channel < 3; channel++) {
              const firstCurvePixel = start + tangentPixel * 4 + channel;
              join = Math.max(
                join,
                Math.abs(data[firstCurvePixel]! - data[firstCurvePixel - 4]!),
              );
              for (
                let pixel = canvasPixel;
                pixel < canvasPixel + 3 * devicePixelRatio;
                pixel++
              ) {
                streak = Math.max(
                  streak,
                  Math.abs(
                    data[start + pixel * 4 + channel]! -
                      data[reference + channel]!,
                  ),
                );
              }
            }
          }
          // The inside of the arc crosses this row one CSS pixel below the floor.
          const innerRow = 3 * devicePixelRatio * bitmap.width * 4;
          let highlightStep = 0;
          for (
            let pixel = tangentPixel + 4;
            pixel <= tangentPixel + 7;
            pixel++
          ) {
            for (let channel = 0; channel < 3; channel++) {
              const offset = innerRow + pixel * 4 + channel;
              highlightStep = Math.max(
                highlightStep,
                Math.abs(data[offset]! - data[offset - 4]!),
              );
            }
          }
          bitmap.close();
          return { join, streak, highlightStep };
        },
        {
          bytes: Array.from(image),
          tangentX: tangent - clipX,
          canvasX: paneRight - 5 - clipX,
        },
      );
      // Blink can round an otherwise identical canvas colour by one channel level.
      expect(differences.streak).toBeLessThanOrEqual(2);
      expect(differences.join).toBeLessThanOrEqual(6);
      expect(differences.highlightStep).toBeLessThanOrEqual(6);
    });
  }
}

for (const mode of ['default', 'retina']) {
  test(`mobile notch borders and header rules join cleanly in ${mode}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    }, testInfo.project.name);
    await page.goto(`/processes/brunch-orders?edges=${mode}`);
    const header = page.locator('.process-header');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(menu).toBeVisible();
    // A solid layer and a soft one, whole device pixels each (geometry.css):
    // 0.75px is 0.5px solid and 1px at half strength; 1px is all solid.
    const [solid, soft] =
      mode === 'retina' ? ['0.5px', '1px'] : ['1px', '1.5px'];
    const layers = (x: (width: string) => string) =>
      expect.stringMatching(new RegExp(`${x(solid)} inset.*${x(soft)} inset`));
    await expect
      .poll(() => dividerPaint(header, 'bottom'))
      .toMatchObject({
        border: '0px',
        shadow: layers((w) => `0px -${w} 0px 0px`),
      });
    await page.evaluate(() => document.fonts.ready);

    const pane = (await page.locator('.shell-pane').boundingBox())!;
    const button = (await menu.boundingBox())!;
    const title = (await header
      .locator('.process-header-title')
      .boundingBox())!;
    const bottom = (await header.boundingBox())!;
    const floorInset = await header
      .locator('.process-header-title')
      .evaluate((element) =>
        parseFloat(getComputedStyle(element, '::before').left),
      );
    const sideTurn = await page
      .locator('.shell-menu-notch')
      .evaluate((element) => {
        const edge = parseFloat(
          getComputedStyle(element).getPropertyValue('--notch-edge-width'),
        );
        const arcWidth = parseFloat(getComputedStyle(element, '::after').width);
        return element.getBoundingClientRect().bottom + arcWidth - 2 * edge;
      });
    const clip = {
      x: 0,
      y: 0,
      width: 390,
      height: Math.ceil(bottom.y + bottom.height + 4),
    };
    const bytes = Array.from(await page.screenshot({ clip }));
    const differences = await page.evaluate(
      async ({ bytes, pane, button, title, bottom, floorInset, sideTurn }) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)]),
        );
        const context = new OffscreenCanvas(
          bitmap.width,
          bitmap.height,
        ).getContext('2d');
        if (!context) throw new Error('Could not read mobile header pixels.');
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height,
        );
        const px = (value: number) => Math.round(value * devicePixelRatio);
        const pixel = (x: number, y: number) => {
          const start = (y * bitmap.width + x) * 4;
          return [data[start]!, data[start + 1]!, data[start + 2]!];
        };
        const difference = (a: number[], b: number[]) =>
          Math.max(...a.map((value, channel) => Math.abs(value - b[channel]!)));
        const left = px(pane.x);
        const right = px(pane.x + pane.width) - 1;
        const middle = Math.floor((left + right) / 2);
        const buttonMiddle = px(button.x + button.width / 2);
        const floor = px(title.y + title.height);
        const ruleEnd = px(bottom.y + bottom.height);
        const sideStart = px(sideTurn);
        const leftTangent = px(title.x + floorInset);
        const rightTangent = px(title.x + title.width - floorInset) - 1;
        const compare = (x: number, other: number, rows: number[]) =>
          Math.max(
            ...rows.map((y) => difference(pixel(x, y), pixel(other, y))),
          );
        const rowsUnderButtons = Array.from(
          { length: floor - px(button.y + button.height + 2) },
          (_, index) => px(button.y + button.height + 1) + index,
        );
        return {
          leftStreak: compare(left, left - 1, rowsUnderButtons),
          rightStreak: compare(right, right + 1, rowsUnderButtons),
          buttonRing: compare(buttonMiddle, right - (buttonMiddle - left), [
            px(button.y),
            px(button.y) + 1,
          ]),
          leftFloor: compare(leftTangent, middle, [floor - 2]),
          rightFloor: compare(rightTangent, middle, [floor - 2]),
          fullStroke: difference(
            pixel(middle, floor - 2),
            pixel(middle, floor - 3),
          ),
          innerStroke: difference(
            pixel(middle, floor - 1),
            pixel(middle, floor - 3),
          ),
          leftTurn: difference(
            pixel(left, sideStart - 1),
            pixel(left, sideStart),
          ),
          sideHandoff: Math.max(
            ...[left, left + 1, left + 2, right, right - 1, right - 2].map(
              (column) =>
                difference(
                  pixel(column, sideStart),
                  pixel(column, sideStart + 2),
                ),
            ),
          ),
          floorHighlight: difference(
            pixel(middle, floor),
            pixel(middle, floor + 3),
          ),
          leftHighlight: compare(leftTangent - 1, middle, [floor]),
          rightHighlight: compare(rightTangent + 1, middle, [floor]),
          leftRule: compare(left + px(2), middle, [ruleEnd - 1, ruleEnd]),
          rightRule: compare(right - px(2), middle, [ruleEnd - 1, ruleEnd]),
          highlightContrast: difference(
            pixel(middle, ruleEnd),
            pixel(middle, ruleEnd + 3),
          ),
        };
      },
      { bytes, pane, button, title, bottom, floorInset, sideTurn },
    );

    expect(differences.leftStreak).toBeLessThanOrEqual(2);
    expect(differences.rightStreak).toBeLessThanOrEqual(2);
    expect(differences.buttonRing).toBeLessThanOrEqual(4);
    expect(differences.leftFloor).toBeLessThanOrEqual(4);
    expect(differences.rightFloor).toBeLessThanOrEqual(4);
    expect(differences.fullStroke).toBeGreaterThan(3);
    if (mode === 'retina') {
      expect(differences.innerStroke).toBeGreaterThan(
        differences.fullStroke / 4,
      );
      expect(differences.innerStroke).toBeLessThan(
        differences.fullStroke * 0.75,
      );
    }
    expect(differences.leftTurn).toBeLessThanOrEqual(6);
    expect(differences.sideHandoff).toBeLessThanOrEqual(3);
    expect(differences.floorHighlight).toBeGreaterThan(3);
    expect(differences.leftHighlight).toBeLessThanOrEqual(3);
    expect(differences.rightHighlight).toBeLessThanOrEqual(3);
    expect(differences.leftRule).toBeLessThanOrEqual(2);
    expect(differences.rightRule).toBeLessThanOrEqual(2);
    expect(differences.highlightContrast).toBeGreaterThan(3);
  });
}

for (const mode of ['default', 'retina']) {
  test(`the drawer divider joins both sides of the ring in ${mode}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    }, testInfo.project.name);
    await page.goto(`/workbench/drawers?edges=${mode}`);
    await expect
      .poll(() => page.locator('html').getAttribute('data-edges'))
      .toBe(mode === 'retina' ? 'retina' : null);
    await page
      .getByRole('button', { name: 'Open drawer', exact: true })
      .click();
    const header = page
      .getByRole('dialog', { name: 'Workbench drawer' })
      .locator('[data-drawer-main] > header');
    await expect(header).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const { left, right, bottom, dpr } = await header.evaluate((element) => {
      const { left, right } = element.parentElement!.getBoundingClientRect();
      return {
        left,
        right,
        bottom: element.getBoundingClientRect().bottom,
        dpr: devicePixelRatio,
      };
    });
    expect(dpr).toBe(2);
    expect(bottom * dpr).toBeCloseTo(Math.round(bottom * dpr), 1);

    const x = Math.floor(left) - 1;
    const y = Math.floor(bottom) - 3;
    const image = await page.screenshot({
      clip: { x, y, width: Math.ceil(right) + 1 - x, height: 6 },
    });
    const pixels = await page.evaluate(
      async ({ bytes, start, end, divider, ruleRows }) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)]),
        );
        const context = new OffscreenCanvas(
          bitmap.width,
          bitmap.height,
        ).getContext('2d');
        if (!context)
          throw new Error('Could not read drawer screenshot pixels.');
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height,
        );
        const pixel = (x: number, y: number) => {
          const offset = (y * bitmap.width + x) * 4;
          return Array.from(data.slice(offset, offset + 3));
        };
        const middle = Math.floor((start + end) / 2);
        const rule = (column: number) =>
          Array.from({ length: ruleRows }, (_, row) =>
            pixel(column, divider - 1 - row),
          );
        return {
          rule: rule(middle),
          aboveRule: pixel(middle, divider - ruleRows - 1),
          face: pixel(middle, 0),
          highlight: pixel(middle, divider),
          ends: [start, start + 1, end - 1, end].map((column) => ({
            rule: rule(column),
            highlight: pixel(column, divider),
            ring: pixel(column, 0),
          })),
        };
      },
      {
        bytes: [...image],
        start: Math.round((left - x) * dpr),
        end: Math.round((right - x) * dpr) - 1,
        divider: Math.round((bottom - y) * dpr),
        ruleRows: mode === 'retina' ? 2 : 3,
      },
    );
    expect(pixels.aboveRule).toEqual(pixels.face);
    expect(pixels.rule[0]).not.toEqual(pixels.face);
    for (const row of pixels.rule) expect(row).toEqual(pixels.rule[0]);
    expect(pixels.highlight).not.toEqual(pixels.face);
    for (const end of pixels.ends) {
      expect(end.rule).toEqual(pixels.rule);
      expect(end.highlight).toEqual(end.ring);
    }

    await page.emulateMedia({ forcedColors: 'active' });
    await expect(header).toHaveCSS('border-bottom-width', '1px');
    await expect(header).toHaveCSS('box-shadow', 'none');
  });
}
