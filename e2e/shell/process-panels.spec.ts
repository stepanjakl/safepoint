import { expect, test, type Page } from '@playwright/test';

import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

import { mockInstructions } from '../support/kept-instructions';
import { mockProcedure } from '../support/trpc';

/* The sheet's Instructions, Inputs and Outputs tabs, and the detail drawer
   their rows open. Focus is asserted at every close: the drawer hands it
   back to whatever opened it, and a swap keeps the original opener. */

async function openTab(page: Page, tab: 'Inputs' | 'Instructions' | 'Outputs') {
  await page.goto('/processes/brunch-orders');
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: new RegExp(`^${tab}`) })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: new RegExp(`^${tab}`) }),
  ).toBeVisible();
}

const drawer = (page: Page) => page.locator('.drawer-aside');
const drawerTitle = (page: Page, name: string | RegExp) =>
  drawer(page).getByRole('heading', { name });

test('instructions open their latest version beside the list of versions', async ({
  page,
}) => {
  await openTab(page, 'Instructions');
  const versions = page.getByRole('list', { name: /^Instructions/ });
  const current = versions.getByRole('button', { name: /^v3 · Live/ });
  // The latest opens with the tab, and leaves focus where it was.
  await expect(drawerTitle(page, 'Version v3')).toBeAttached();
  await expect(current).toHaveAttribute('aria-expanded', 'true');
  const diff = drawer(page).getByRole('list', { name: 'Changes from v2' });
  await expect(diff).toHaveCount(0);
  // Each version says how many runs ran under it.
  await expect(current).toContainText('run');

  // The same panel turns to what changed, and back.
  const changes = drawer(page).getByRole('radio', { name: 'Changes from v2' });
  await changes.click();
  await expect(changes).toBeChecked();
  await expect(diff).toBeVisible();
  await expect(diff.getByText('Added:')).not.toHaveCount(0);
  await drawer(page).getByRole('radio', { name: 'Text of v3' }).click();
  await expect(diff).toHaveCount(0);

  // The row that has it open closes it.
  await current.click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(current).toBeFocused();

  // An earlier version is restored as a draft, which then leads the list.
  await versions.getByRole('button', { name: /^v2/ }).click();
  await expect(drawerTitle(page, 'Version v2')).toBeAttached();
  await drawer(page).getByRole('button', { name: 'Draft from v2' }).click();
  await expect(drawerTitle(page, 'New version v4')).toBeVisible();
  const draft = versions.getByRole('button', { name: /^v4 · Draft/ });
  await expect(draft).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  await expect(draft).toBeFocused();
});

test('versions this browser published before the server did are said, and can become a draft', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('safepoint.instructions.v2')) return;
    localStorage.setItem(
      'safepoint.instructions.v2',
      JSON.stringify({
        'brunch-orders': {
          published: [
            {
              text: 'Written in this browser.\n\nKept only here.',
              publishedAt: '2026-11-07T10:00:00Z',
              note: null,
            },
          ],
          // An unpublished draft is read once into the new key.
          draft: 'A draft nobody published.',
        },
      }),
    );
  });
  await openTab(page, 'Instructions');
  const note = page.getByRole('note').filter({
    hasText: 'Versions published in this browser were kept only here.',
  });
  await expect(note).toContainText('Publish one again to keep it.');
  // The unpublished draft was not lost: it leads the list.
  await expect(
    page.getByRole('list', { name: /^Instructions/ }).getByRole('button', {
      name: /^v4 · Draft/,
    }),
  ).toBeVisible();
  await note.getByRole('button', { name: /^Draft from the version/ }).click();
  await expect(
    drawer(page).getByRole('textbox', { name: 'Instructions, draft of v4' }),
  ).toHaveValue('Written in this browser.\n\nKept only here.');
  await note.getByRole('button', { name: 'Dismiss' }).click();
  await expect(note).toHaveCount(0);
  // The draft is the browser's own, under the new key.
  expect(
    await page.evaluate(() =>
      localStorage.getItem('safepoint.instructions.v3'),
    ),
  ).toContain('Written in this browser.');
});

test('the instruction pill stays in place as its version and status change', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockInstructions(page, brunchOrdersProcess, []);
  await page.addInitScript(() => {
    localStorage.setItem(
      'safepoint.instructions.v3',
      JSON.stringify({ 'brunch-orders': { draft: 'A draft in progress.' } }),
    );
  });
  await openTab(page, 'Instructions');

  const detail = drawer(page);
  const pill = detail.locator('.draft-pill');
  await expect(pill.locator('.sr-only').first()).toHaveText('v3 Live');
  const fades = await detail
    .locator('.instruction-band')
    .evaluateHandle((band) => {
      const counts = { entering: 0, leaving: 0, pill: 0 };
      band.addEventListener('animationstart', (event) => {
        if (
          !(event instanceof AnimationEvent) ||
          !(event.target instanceof Element)
        )
          return;
        if (
          event.target.matches('.draft-pill') ||
          event.target.querySelector('.draft-pill')
        ) {
          counts.pill += 1;
        }
        if (event.animationName === 'swap-fade-in') counts.entering += 1;
        if (event.animationName === 'swap-fade-out') counts.leaving += 1;
      });
      return counts;
    });
  const original = await pill.elementHandle();
  const position = () =>
    pill.evaluate((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
  const origin = await position();
  const versions = page.getByRole('list', { name: /^Instructions/ });

  for (const [rowName, label] of [
    [/^v4 · Draft/, 'v4 Draft'],
    [/^v2,/, 'v2'],
    [/^v3 · Live/, 'v3 Live'],
  ] as const) {
    const row = versions.getByRole('button', { name: rowName });
    await row.press('Enter');
    await expect(pill.locator('.sr-only').first()).toHaveText(label);
    expect(
      await pill.evaluate((element, first) => element === first, original),
    ).toBe(true);
    expect(await position()).toEqual(origin);
    await expect(pill).toHaveCSS('opacity', '1');
    if (label === 'v4 Draft') {
      await expect(
        detail.getByRole('textbox', { name: 'Instructions, draft of v4' }),
      ).toBeFocused();
      await expect
        .poll(() => fades.jsonValue())
        .toEqual({
          entering: 2,
          leaving: 2,
          pill: 0,
        });
    } else {
      await expect(row).toBeFocused();
    }
  }
});

test('publishing text that is already a version says which, and opens it', async ({
  page,
}) => {
  await openTab(page, 'Instructions');
  const versions = page.getByRole('list', { name: /^Instructions/ });
  await versions.getByRole('button', { name: /^v2/ }).click();
  await drawer(page).getByRole('button', { name: 'Draft from v2' }).click();
  // v2's own text: reviewing it from v3 is a change, publishing it is not.
  await drawer(page).getByRole('button', { name: 'Review changes' }).click();
  await drawer(page).getByRole('button', { name: 'Publish v4' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Publish v4' })
    .click();
  await expect(
    drawer(page).getByText(/^That is v2\. These instructions are already/),
  ).toBeVisible();
  await drawer(page).getByRole('button', { name: 'Open v2' }).click();
  await expect(drawerTitle(page, 'Version v2')).toBeAttached();
  // Nothing new was kept: v3 is still the live one.
  await expect(
    versions.getByRole('button', { name: /^v3 · Live/ }),
  ).toBeVisible();
});

test('review numbers follow the draft while removed paragraphs keep their original numbers', async ({
  page,
}) => {
  // v4 is already published (served as the server would list it); the draft
  // is the browser's own.
  await mockInstructions(page, brunchOrdersProcess, [
    {
      text: 'Keep the first paragraph.\n\nDelete this obsolete paragraph.\n\nKeep this middle anchor.\n\nKeep the final paragraph.',
      publishedAt: '2026-11-07T10:00:00Z',
    },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'safepoint.instructions.v3',
      JSON.stringify({
        'brunch-orders': {
          draft:
            'Add a fresh introduction.\n\nKeep the first paragraph.\n\nKeep this middle anchor.\n\nKeep the final paragraph updated.',
        },
      }),
    );
  });
  await openTab(page, 'Instructions');
  await drawer(page).getByRole('button', { name: 'Continue v5' }).click();
  await drawer(page).getByRole('button', { name: 'Review changes' }).click();
  const diff = drawer(page).getByRole('list', { name: 'Changes from v4' });
  await expect(diff.locator('.clause-number')).toHaveText([
    '01',
    '02',
    '02',
    '03',
    '04',
  ]);
  const rows = diff.getByRole('listitem');
  await expect(rows.nth(0)).toContainText('Added: Paragraph 1:');
  await expect(rows.nth(2)).toContainText('Removed: Paragraph 2:');
  await expect(rows.nth(4)).toContainText('Changed: Paragraph 4:');
  await expect(rows.nth(4).locator('ins')).toContainText('updated');
});

test('returning to a tab during its fade restores the page immediately', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/processes/brunch-orders');
  const tab = (name: string) =>
    page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
  const layer = page.locator('.process-sheet-swap').first();

  await tab('Inputs').evaluate((button: HTMLElement) => button.click());
  await expect(layer).toHaveAttribute('inert', '');
  await page.waitForTimeout(40);
  await tab('Runs').evaluate((button: HTMLElement) => button.click());

  await expect(layer).not.toHaveAttribute('inert', '');
  await page.waitForTimeout(100);
  expect(
    await layer.evaluate((element) =>
      Number(getComputedStyle(element).opacity),
    ),
  ).toBeGreaterThan(0.7);
  await expect(
    page.getByRole('heading', { name: 'Runs' }).first(),
  ).toBeVisible();
});

test('tab handoff keeps dividers still, fades the list once and holds the detail behind it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/processes/brunch-orders');

  const instructions = page
    .getByRole('button', { name: /^Instructions/ })
    .first();
  // The outgoing section first; the incoming one is rendered after it, hidden.
  const leaving = page.locator('.process-sheet-swap').first();
  await instructions.click();
  await expect(instructions).toHaveAttribute('aria-current', 'true');
  await expect(leaving).toHaveAttribute('inert', '');
  expect(
    await leaving.evaluate((element) => {
      const transform = new DOMMatrix(getComputedStyle(element).transform);
      return [transform.m41, transform.m42];
    }),
  ).toEqual([0, 0]);

  const entering = page.locator('.process-sheet-swap[data-swap-entering]');
  await expect(entering).toBeAttached();
  // The layer's fade is the list's only one: none of its parts fade inside it.
  for (const part of [
    entering.locator('.process-panel-list > .sheet-head'),
    entering.locator('.process-panel-list > :not(.sheet-head)').first(),
  ])
    await expect(part).toHaveCSS('animation-name', 'none');
  // Shown with its section, the detail column waits the whole beat.
  await expect(entering.locator('[data-detail-held]')).toHaveCSS(
    'animation-delay',
    '0.15s',
  );
  await expect(entering).not.toHaveAttribute('inert');
});

test('the frame holds through a tab swap and is handed back once the next section has landed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/processes/brunch-orders');
  await page
    .getByRole('button', { name: /^Instructions/ })
    .first()
    .click();
  const frame = page.locator('.process-sheet-frame');
  await expect(frame).not.toHaveAttribute('data-chrome-borrowed');

  await page
    .getByRole('button', { name: /^Outputs/ })
    .first()
    .click();
  // The sections' own bands and divider are lent to the overlay meanwhile.
  await expect(frame).toHaveAttribute('data-chrome-borrowed', '');
  await expect(frame.locator('.sheet-chrome > *').first()).toBeAttached();

  // Afterwards nothing is lent out, and the section's own band paints again.
  await expect(frame).not.toHaveAttribute('data-chrome-borrowed');
  await expect(frame.locator('.sheet-chrome > *')).toHaveCount(0);
  await expect(
    frame.locator('.process-sheet-swap .sheet-head').first(),
  ).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

// Sample painted frames rather than waiting for a final screenshot: an entrance
// can end correctly while still having played underneath the screen fade.
async function observeSectionEntrance(
  trigger: import('@playwright/test').Locator,
) {
  return trigger.evaluate((button) => {
    const frames: { screen: number; row: number; detail: number | null }[] = [];
    const started = performance.now();
    if (!(button instanceof HTMLElement)) throw new Error('Missing trigger');
    button.click();
    return new Promise<typeof frames>((resolve) => {
      function sample() {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-section-forming] :is(.process-panel-list, .process-runs-list) li',
          ),
        ).find((element) => {
          const layer = element.closest('.process-sheet-swap');
          return (
            layer &&
            !layer.hasAttribute('inert') &&
            element.getClientRects().length > 0
          );
        });
        if (row) {
          let screen = 1;
          for (
            let parent = row.parentElement;
            parent;
            parent = parent.parentElement
          )
            screen *= Number(getComputedStyle(parent).opacity);
          const detail = row
            .closest('.process-sheet-swap')
            ?.querySelector('[data-detail-held]');
          frames.push({
            screen,
            row: Number(getComputedStyle(row).opacity),
            detail: detail ? Number(getComputedStyle(detail).opacity) : null,
          });
        }
        if ((frames.length > 0 && !row) || performance.now() - started > 8000)
          resolve(frames);
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
}

function expectSectionAfterScreen(
  frames: Awaited<ReturnType<typeof observeSectionEntrance>>,
) {
  expect(frames.length).toBeGreaterThan(2);
  expect(frames.some((frame) => frame.screen < 1)).toBe(true);
  expect(
    frames.filter(
      (frame) => frame.screen < 1 && (frame.row > 0 || (frame.detail ?? 0) > 0),
    ),
    'content started arriving before its screen settled',
  ).toEqual([]);
  expect(frames.some((frame) => frame.screen === 1 && frame.row > 0)).toBe(
    true,
  );
}

test('every section waits for its tab fade before rows and details arrive', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/processes/brunch-orders');
  for (const tab of ['Instructions']) {
    expectSectionAfterScreen(
      await observeSectionEntrance(
        page.getByRole('button', { name: new RegExp(`^${tab}`) }).first(),
      ),
    );
  }
});

test('reloading keeps the open tab while navigating between processes opens runs', async ({
  page,
}) => {
  await page.goto('/processes/brunch-orders');
  await page
    .getByRole('button', { name: /^Instructions/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Instructions/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Instructions/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Instructions/ }).first(),
  ).toHaveAttribute('aria-current', 'true');

  await page
    .locator('a[href="/processes/brunch-orders-direct"]')
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Runs/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Runs', exact: true }).first(),
  ).toHaveAttribute('aria-current', 'true');

  await page
    .getByRole('button', { name: /^Instructions/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Instructions/ }),
  ).toBeVisible();

  await page.locator('a[href="/processes/brunch-orders"]').first().click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Runs/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Runs', exact: true }).first(),
  ).toHaveAttribute('aria-current', 'true');

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Runs', exact: true }).first(),
  ).toHaveAttribute('aria-current', 'true');

  await page
    .locator('a[href="/processes/brunch-orders-direct"]')
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Runs/ }).first(),
  ).toBeVisible();
});

test('rows wait for a process navigation fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockProcedure(page, 'runs.list', (input) => ({
    data:
      input.process === 'brunch-orders-direct'
        ? [
            {
              id: 'run-fade-test',
              process: 'brunch-orders-direct',
              startedAt: '2026-11-18T10:00:00.000Z',
              updatedAt: '2026-11-18T10:00:00.000Z',
              startedBy: null,
              discardedAt: null,
              stage: 'read',
              status: 'running',
              trigger: 'manual',
              instructions: { version: 'v1', hash: 'test-hash' },
              additionalInstructions: null,
              readId: null,
              rulebook: null,
            },
          ]
        : [],
  }));
  // Visit the target once so its runs query is cached before navigating back.
  await page.goto('/processes/brunch-orders-direct');
  await expect(page.locator('.process-runs-list li').first()).toBeVisible();
  await page.locator('a[href="/processes/brunch-orders"]').first().click();
  await expect(page).toHaveURL(/\/processes\/brunch-orders$/);
  await expect(page.getByRole('button', { name: /^Rules/ })).toBeVisible();
  await expect(page.locator('[data-entrance-held]')).toHaveCount(0);
  expectSectionAfterScreen(
    await observeSectionEntrance(
      page.locator('a[href="/processes/brunch-orders-direct"]').first(),
    ),
  );
});

test('reduced motion shows section rows immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTab(page, 'Inputs');
  const row = page.locator('.process-panel-list li').first();
  await expect(row).toHaveCSS('animation-name', 'none');
  await expect(row).toHaveCSS('opacity', '1');
});
