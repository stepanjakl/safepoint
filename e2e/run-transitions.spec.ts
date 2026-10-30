import { expect, test, type Locator, type Page } from '@playwright/test';

type Frame = {
  empty: boolean;
  instructions: string | null;
  thread: boolean;
  opacity: number;
  inert: boolean;
};

// Observe every painted frame, including the outgoing inert page that role
// locators omit. Reduced-motion tests cannot catch a flash during the fade.
const chooseAndObserve = (row: Locator, reverse = false) =>
  row.evaluate(
    (button, reverse) =>
      new Promise<Frame[]>((resolve) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Expected a run button');
        const previous = document.querySelector<HTMLButtonElement>(
          '.sheet-row[data-current]',
        );
        const frames: Frame[] = [];
        const started = performance.now();
        let reversed = false;
        function sample() {
          const layer = document.querySelector('.run-view > div');
          if (!layer) throw new Error('Missing run page');
          const empty = Boolean(
            layer.textContent?.includes('Choose a run, or start a new one.'),
          );
          const content = empty ? layer.querySelector('main > div') : layer;
          let opacity = 1;
          for (let element = content; element; element = element.parentElement)
            opacity *= Number(getComputedStyle(element).opacity);
          frames.push({
            empty,
            thread: Boolean(layer.querySelector('ol.thread')),
            instructions:
              Array.from(layer.querySelectorAll('p')).find(
                (paragraph) =>
                  paragraph.textContent === 'First run.' ||
                  paragraph.textContent === 'Second run.',
              )?.textContent ?? null,
            opacity,
            inert: layer.hasAttribute('inert'),
          });
          if (
            reverse &&
            !reversed &&
            layer.hasAttribute('inert') &&
            opacity < 0.9
          ) {
            if (!previous) throw new Error('Missing outgoing run button');
            reversed = true;
            previous.click();
          }
          if (performance.now() - started < 1000) requestAnimationFrame(sample);
          else resolve(frames);
        }
        button.click();
        requestAnimationFrame(sample);
      }),
    reverse,
  );

test.beforeEach(async ({ page, colorScheme }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    (theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
      localStorage.setItem(
        'safepoint.live-runs.v1',
        JSON.stringify({
          'brunch-orders': [
            {
              run: {
                id: 'run-second',
                startedAt: '2026-10-12T10:00:00Z',
                status: 'running',
                trigger: 'manual',
                counts: { items: 0 },
                instructionsVersion: 'v2',
              },
              data: { additionalInstructions: 'Second run.' },
            },
            {
              run: {
                id: 'run-first',
                startedAt: '2026-10-11T10:00:00Z',
                status: 'running',
                trigger: 'manual',
                counts: { items: 0 },
                instructionsVersion: 'v2',
              },
              data: { additionalInstructions: 'First run.' },
            },
          ],
        }),
      );
    },
    colorScheme === 'dark' ? 'dark' : 'light',
  );
  await page.goto('/examples/brunch-orders?run=run-second');
  await expect(page.getByText('Second run.', { exact: true })).toBeVisible();
  await expect(page.locator('.run-view > div')).toHaveCSS('opacity', '1');
});

test('switching live runs keeps the outgoing thread until the new one arrives', async ({
  page,
}) => {
  const frames = await chooseAndObserve(page.locator('.sheet-row').nth(1));
  expect(
    frames.every((frame) => !frame.empty),
    'empty state flashed between runs',
  ).toBe(true);
  expect(frames.every((frame) => frame.thread)).toBe(true);
  expect(frames.some((frame) => frame.inert && frame.opacity < 0.9)).toBe(true);
  expect(
    frames
      .filter((frame) => frame.inert)
      .every((frame) => frame.instructions === 'Second run.'),
  ).toBe(true);
  expect(frames.at(-1)?.instructions).toBe('First run.');
  await expect(page.getByText('First run.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Read the sheet', exact: true }).last(),
  ).toBeVisible();
});

test('deselecting a live run brings the empty state in once', async ({
  page,
}) => {
  const frames = await chooseAndObserve(page.locator('.sheet-row').first());
  const empty = frames.filter((frame) => frame.empty);
  expect(empty.length).toBeGreaterThan(2);
  expect(
    empty.every((frame) => !frame.inert),
    'empty state appeared during the outgoing fade',
  ).toBe(true);
  expect(empty[0]!.opacity).toBeLessThan(0.5);
  for (let index = 1; index < empty.length; index++)
    expect(empty[index]!.opacity).toBeGreaterThanOrEqual(
      empty[index - 1]!.opacity - 0.01,
    );
  expect(empty.at(-1)!.opacity).toBe(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
});

// Every frame of the empty page arriving: its own parts' opacity, and the
// screen's around them. Pages left behind hold the same words, so they are
// marked first and passed over.
type ArrivalFrame = { own: number; screen: number };

// Runs in the page, so it closes over nothing.
function sampleArrival(watchMs?: number) {
  const words = 'Choose a run, or start a new one.';
  const wording = () =>
    Array.from(document.querySelectorAll('p')).filter(
      (paragraph) => paragraph.textContent === words,
    );
  wording().forEach((paragraph) => (paragraph.dataset.left = ''));
  const frames: ArrivalFrame[] = [];
  const product = (from: Element | null, stop: Element | null) => {
    let opacity = 1;
    for (let element = from; element && element !== stop;) {
      opacity *= Number(getComputedStyle(element).opacity);
      element = element.parentElement;
    }
    return opacity;
  };
  const started = performance.now();
  let seen = 0;
  return new Promise<ArrivalFrame[]>((resolve) => {
    function sample() {
      const arriving = wording().find(
        (paragraph) => paragraph.dataset.left === undefined,
      );
      const main = arriving?.closest('main');
      if (arriving && main)
        frames.push({
          own: product(arriving, main),
          screen: product(main, null),
        });
      if (frames.length) seen ||= performance.now();
      // Until it lands, or for as long as asked once it is on screen: the
      // route may still be compiling on the dev server.
      const last = frames.at(-1);
      const done = watchMs
        ? seen > 0 && performance.now() - seen > watchMs
        : last?.own === 1 && last.screen === 1;
      if (done || performance.now() - started > 20_000) resolve(frames);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

const observeArrival = (page: Page) => page.evaluate(sampleArrival, undefined);

const expectArrivalAfterScreen = (frames: ArrivalFrame[]) => {
  expect(frames.length).toBeGreaterThan(2);
  expect(frames[0]!.screen, 'the screen was not coming in').toBeLessThan(1);
  expect(
    frames.filter((frame) => frame.own > 0 && frame.screen < 1),
    'the empty page moved before the screen had settled',
  ).toEqual([]);
  expect(frames.at(-1)).toEqual({ own: 1, screen: 1 });
};

test('the empty page arrives after a tab has finished coming in', async ({
  page,
}) => {
  await page.locator('.sheet-row').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
  await page
    .getByRole('button', { name: /^Instructions/ })
    .first()
    .click();
  await expect(page.locator('.process-runs-detail')).toHaveCount(0);
  const arrival = observeArrival(page);
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  expectArrivalAfterScreen(await arrival);
});

test('the empty page arrives after another process has finished coming in', async ({
  page,
}) => {
  const arrival = observeArrival(page);
  await page.locator('a[href="/examples/promotion"]').first().click();
  expectArrivalAfterScreen(await arrival);
});

// The browser holds the old page until the new one paints, so a reload that
// moves nothing cannot be told from no reload at all.
test('a reload leaves the page where it was', async ({ page }) => {
  await page.goto('/examples/promotion');
  await page.addInitScript(
    `window.arrival = (${sampleArrival.toString()})(1500);`,
  );
  await page.reload();
  const frames = await page.evaluate(
    () => (window as unknown as { arrival: Promise<ArrivalFrame[]> }).arrival,
  );
  expect(frames.length).toBeGreaterThan(10);
  expect(
    frames.filter((frame) => frame.own < 1 || frame.screen < 1),
    'something faded on a reload',
  ).toEqual([]);
});

test('a process loaded directly under reduced motion is not left hidden', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/examples/promotion');
  await expect(page.locator('.process-sheet-frame')).toHaveCSS('opacity', '1');
  await expect(
    page.getByText('Choose a run, or start a new one.', { exact: true }),
  ).toHaveCSS('opacity', '1');
});

test('returning to the outgoing run reverses its fade without an empty page', async ({
  page,
}) => {
  const frames = await chooseAndObserve(
    page.locator('.sheet-row').nth(1),
    true,
  );
  expect(
    frames.every(
      (frame) =>
        !frame.empty && frame.thread && frame.instructions === 'Second run.',
    ),
  ).toBe(true);
  expect(frames.some((frame) => frame.inert && frame.opacity < 1)).toBe(true);
  expect(frames.at(-1)?.opacity).toBe(1);
  await expect(page).toHaveURL(/run=run-second$/);
});

test('reduced-motion run selection works from the keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = page.locator('.sheet-row').nth(1);
  await first.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('First run.', { exact: true })).toBeVisible();
  await expect(page.getByText('Second run.', { exact: true })).toHaveCount(0);
  await expect(first).toBeFocused();
  await expect(page.locator('.run-view > div')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'No run selected',
  );
  await expect(page.locator('.run-view > div')).toHaveCSS('opacity', '1');
  await expect(first).toBeFocused();
});
