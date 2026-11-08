import { expect, test } from '@playwright/test';

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

test('live section titles morph in one aligned overlay, then hand back', async ({
  page,
  colorScheme,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    (theme) => localStorage.setItem('safepoint.dev.theme', theme),
    colorScheme === 'dark' ? 'dark' : 'light',
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/examples/promotion?run=run-104');
    let previous = 'Runs';
    for (const title of [
      'Instructions',
      'Inputs',
      'Outputs',
      'Settings',
      'Runs',
    ]) {
      const trigger = page
        .getByRole('button', { name: new RegExp(`^${title}(?:$|:)`) })
        .last();
      await trigger.focus();
      const samples = await trigger.evaluate(
        (button) =>
          new Promise<{
            texts: string[];
            animated: boolean;
            moved: boolean;
            changedHost: boolean;
            released: boolean;
            glyphShift: number;
            glyphSamples: number;
          }>((resolve) => {
            const texts = new Set<string>();
            let host: Element | null = null;
            let animated = false;
            let moved = false;
            let changedHost = false;
            let glyphShift = 0;
            let glyphSamples = 0;
            function glyphs(root: Element) {
              const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
              );
              const result: { x: number; y: number }[] = [];
              let node: Node | null;
              while ((node = walker.nextNode())) {
                if (
                  node.parentElement?.closest(
                    '.sr-only, [torph-sr], [torph-exiting]',
                  )
                )
                  continue;
                for (
                  let index = 0;
                  index < (node.textContent?.length ?? 0);
                  index++
                ) {
                  const range = document.createRange();
                  range.setStart(node, index);
                  range.setEnd(node, index + 1);
                  const box = range.getBoundingClientRect();
                  result.push({ x: box.x, y: box.y });
                }
              }
              return result;
            }
            const started = performance.now();
            if (!(button instanceof HTMLButtonElement))
              throw new Error('Expected a section button');
            button.click();
            function sample() {
              const frame = document.querySelector('.process-sheet-frame')!;
              const current = frame.querySelector('.sheet-chrome-title');
              if (current) {
                if (host && current !== host) changedHost = true;
                host = current;
                texts.add(current.querySelector('.sr-only')?.textContent ?? '');
                const running = current
                  .getAnimations({ subtree: true })
                  .some((animation) => animation.playState === 'running');
                animated ||= running;
                const original = [
                  ...frame.querySelectorAll('[data-section-title]'),
                ].find((element) => element.getBoundingClientRect().width > 0);
                if (original) {
                  const a = original.getBoundingClientRect();
                  const b = current.getBoundingClientRect();
                  moved ||=
                    Math.abs(a.left - b.left) > 0.5 ||
                    Math.abs(a.top - b.top) > 0.5;
                  if (
                    !running &&
                    original.textContent ===
                      current.querySelector('.sr-only')?.textContent
                  ) {
                    const before = glyphs(current);
                    const after = glyphs(original);
                    if (before.length === after.length && before.length > 0) {
                      glyphSamples++;
                      before.forEach((glyph, index) => {
                        glyphShift = Math.max(
                          glyphShift,
                          Math.abs(glyph.x - after[index]!.x),
                          Math.abs(glyph.y - after[index]!.y),
                        );
                      });
                    }
                  }
                }
              }
              const released =
                Boolean(host) && !frame.hasAttribute('data-chrome-borrowed');
              if (released || performance.now() - started > 2500)
                resolve({
                  texts: [...texts],
                  animated,
                  moved,
                  changedHost,
                  released,
                  glyphShift,
                  glyphSamples,
                });
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          }),
      );
      expect(samples.texts).toContain(previous);
      expect(samples.texts).toContain(title);
      expect(samples.animated).toBe(true);
      expect(samples.moved).toBe(false);
      expect(samples.changedHost).toBe(false);
      expect(samples.released).toBe(true);
      expect(samples.glyphSamples).toBeGreaterThan(0);
      expect(samples.glyphShift).toBeLessThan(0.001);
      await expect(
        page.getByRole('heading', {
          name: new RegExp(`^${title}(?:$| )`),
          level: 2,
        }),
      ).toBeVisible();
      await expect(trigger).toBeFocused();
      previous = title;
    }
  }
});

test('reduced motion keeps native headings without a title overlay', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/examples/promotion?run=run-104');
  await page.getByRole('button', { name: /^Instructions:/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Instructions', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.locator('.sheet-chrome-title')).toHaveCount(0);
});
