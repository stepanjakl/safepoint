import type { CDPSession, Page } from '@playwright/test';

import type { Deficiency } from './metrics.ts';

/*
  Opening a page the way every perceptual check needs it: a stored theme, a
  neutral family, and nothing moving. The app's theme is a stored preference,
  not the browser's colour scheme, so it is set before the first paint.
*/
export type PageSetup = {
  theme: 'light' | 'dark';
  family?: string;
};

export async function openAt(page: Page, path: string, setup: PageSetup) {
  await page.addInitScript(
    ({ theme }) => localStorage.setItem('safepoint.dev.theme', theme),
    { theme: setup.theme },
  );
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  if (setup.family) {
    await page.evaluate((family) => {
      document.documentElement.dataset.neutral = family;
    }, setup.family);
  }
}

export async function setFamily(page: Page, family: string) {
  await page.evaluate((value) => {
    document.documentElement.dataset.neutral = value;
  }, family);
}

/* Chromium's own colour-vision emulation, through the DevTools protocol. */
export async function withDeficiency<T>(
  page: Page,
  kind: Deficiency | 'none',
  run: () => Promise<T>,
) {
  const session: CDPSession = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setEmulatedVisionDeficiency', { type: kind });
    return await run();
  } finally {
    await session.send('Emulation.setEmulatedVisionDeficiency', {
      type: 'none',
    });
    await session.detach();
  }
}

/* The colour a few flat pixels of an element paint, read back from a
   screenshot: the only way to see what an emulated deficiency or a forced
   palette actually did. Sample flat fills only; text is anti-aliased. */
export async function sampleFill(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  const png = await page.screenshot({
    clip: { x: box.x, y: box.y, width: 4, height: 4 },
  });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const [r, g, b] = context.getImageData(
      Math.floor(image.width / 2),
      Math.floor(image.height / 2),
      1,
      1,
    ).data;
    return `rgb(${r} ${g} ${b})`;
  }, png.toString('base64'));
}
