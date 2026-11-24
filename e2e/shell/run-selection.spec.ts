import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';
import { brunchOrdersDirectProcess } from '@/lib/processes/brunch-orders/process';
import { listedInstructions } from '../support/kept-instructions';
import { startKeptRun } from '../support/kept-runs';
import { mockProcedure } from '../support/trpc';

/*
  Which run the process page shows: nothing on arrival, the run started here or
  chosen in the rail. The choice is kept in ?run=, so a link opens the same run.
*/
const sheetSnapshot = JSON.parse(
  readFileSync('fixtures/brunch-orders/sheet-snapshot.json', 'utf8'),
);
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('a run can start with additional instructions that stay with it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('safepoint.dev.run-debug', 'on');
  });
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Start run with a note' }).click();
  const note = page.getByRole('textbox', {
    name: /Note for this run/,
  });
  await expect(note).toBeFocused();
  await note.fill('  Focus on missing prices.\nKeep the report concise.  ');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Start run', exact: true })
    .click();
  const request = page.getByText(
    'Focus on missing prices.\nKeep the report concise.',
    { exact: true },
  );
  await expect(request).toBeVisible();
  await expect(page).toHaveURL(/run=run-/);
  await page.reload();
  await expect(request).toBeVisible();
});

test('a run id the list does not hold selects nothing, and leaves the address', async ({
  page,
}) => {
  await page.goto('/processes/brunch-orders?run=run-1790000000000');
  await expect(heading(page)).toHaveText('No run selected');
  await expect(page).not.toHaveURL(/run=/);
});

test('a saved run waits for its pinned instruction text before loading a proposal', async ({
  page,
}) => {
  const process = brunchOrdersDirectProcess;
  const at = '2026-11-19T10:00:00.000Z';
  const pinned = listedInstructions(process, [
    { text: 'Use the instructions this run started with.', publishedAt: at },
  ]).versions.at(-1)!;
  const list = listedInstructions(process, [
    { text: 'Different text under the same version label.', publishedAt: at },
  ]);
  const runId = 'run-1795082400000';
  const readId = 'read-1795082400000';
  await mockProcedure(page, 'runs.list', {
    data: [
      {
        id: runId,
        process: process.id,
        instructions: { hash: pinned.hash, version: pinned.version },
        readId,
        rulebook: null,
        stage: 'propose',
        status: 'running',
        trigger: 'manual',
        additionalInstructions: null,
        modelPlan: null,
        ownRulebook: false,
        startedBy: null,
        startedAt: at,
        updatedAt: at,
        discardedAt: null,
      },
    ],
  });
  await mockProcedure(page, 'instructions.list', { data: list });
  const release = Promise.withResolvers<void>();
  let tried = false;
  const lookup = await mockProcedure(page, 'instructions.get', async () => {
    if (!tried) {
      tried = true;
      return { error: { code: 'NOT_FOUND', message: 'Version unavailable.' } };
    }
    await release.promise;
    return { data: pinned };
  });
  const unavailable = {
    error: { code: 'NOT_FOUND' as const, message: 'Fixture only.' },
  };
  await mockProcedure(page, 'read.summary', unavailable);
  await mockProcedure(page, 'decisions.current', unavailable);
  await mockProcedure(page, 'propose.start', unavailable);
  const proposal = await mockProcedure(page, 'propose.get', unavailable);

  await page.goto(`/processes/brunch-orders-direct?run=${runId}`);
  const status = page.locator('.run-view').getByRole('status');
  const failed = `Couldn’t load instructions ${pinned.version} for this run.`;
  await expect(page.getByRole('main')).toContainText(failed);
  await expect(status).toHaveText(failed);
  expect(lookup.inputs).toEqual([{ process: process.id, hash: pinned.hash }]);
  expect(proposal.inputs).toEqual([]);

  const row = page.locator(`[data-run-id="${runId}"]`);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/run=/);
  await page.keyboard.press('Enter');
  // Waiting for them is only a run loading: nothing of its own is drawn.
  await expect(status).toHaveText('Loading run…');
  await expect(page.locator('.run-view')).not.toContainText('instructions');
  await expect(row).toBeFocused();
  await expect.poll(() => lookup.inputs.length).toBe(2);
  expect(proposal.inputs).toEqual([]);

  release.resolve();
  await expect
    .poll(() => proposal.inputs)
    .toEqual([{ text: pinned.text, readId, evaluation: 'model' }]);
});

test('a saved run waits for its thread before fading in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const process = brunchOrdersDirectProcess;
  const at = '2026-11-19T10:00:00.000Z';
  const instructions = listedInstructions(process, [
    { text: 'Use the saved instructions.', publishedAt: at },
  ]);
  const pinned = instructions.versions.at(-1)!;
  const runId = 'run-1795082400000';
  const previousId = 'run-1795082400001';
  const readId = 'read-1795082400000';
  await mockProcedure(page, 'runs.list', {
    data: [runId, previousId].map((id) => ({
      id,
      process: process.id,
      instructions: { hash: pinned.hash, version: pinned.version },
      readId: id === runId ? readId : 'read-1795082400001',
      rulebook: null,
      stage: 'read',
      status: 'failed',
      trigger: 'manual',
      additionalInstructions: id === previousId ? 'Previous run note.' : null,
      modelPlan: null,
      ownRulebook: false,
      startedBy: null,
      startedAt: at,
      updatedAt: at,
      discardedAt: null,
    })),
  });
  await mockProcedure(page, 'instructions.list', { data: instructions });
  const release = Promise.withResolvers<void>();
  const read = await mockProcedure(page, 'read.summary', async ({ id }) => {
    if (id !== readId)
      return {
        error: { code: 'NOT_FOUND', message: 'Previous read unavailable.' },
      };
    await release.promise;
    return { error: { code: 'NOT_FOUND', message: 'Saved read unavailable.' } };
  });
  await page.goto(`/processes/brunch-orders-direct?run=${previousId}`);
  await expect(
    page.getByText('Previous run note.', { exact: true }),
  ).toBeVisible();
  const layer = page.locator('.run-view > div').first();
  await expect(layer).toHaveCSS('opacity', '1');
  await page.locator(`[data-run-id="${runId}"]`).click();
  await expect
    .poll(() => read.inputs.some((input) => input.id === readId))
    .toBe(true);
  try {
    // The previous run leaves at once, well inside the run loader's delay
    // (600ms), rather than waiting for the saved one.
    await expect(
      page.getByText('Previous run note.', { exact: true }),
    ).toBeHidden({ timeout: 500 });
    // Past the delay the wait is said: the loader stands in the emptied
    // column, and the saved run stays unseen until it is ready.
    await page.waitForTimeout(900);
    await expect(page.locator('.run-view')).toContainText('Loading run…');
    await expect(layer).toHaveCSS('opacity', '0');
  } catch (error) {
    release.resolve();
    throw error;
  }
  await page.evaluate(() => {
    const frames: { content: boolean; opacity: number }[] = [];
    Object.assign(window, { runEntranceFrames: frames });
    const sample = () => {
      const layer = document.querySelector('.run-view > div');
      if (!layer) return;
      const opacity = Number(getComputedStyle(layer).opacity);
      frames.push({
        content:
          layer.textContent?.includes('Saved read unavailable.') ?? false,
        opacity,
      });
      if (!frames.at(-1)?.content || opacity < 1) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  release.resolve();
  await expect(layer).toContainText('Saved read unavailable.');
  await expect(layer).toHaveCSS('opacity', '1');
  const frames = await page.evaluate(
    () =>
      Reflect.get(window, 'runEntranceFrames') as {
        content: boolean;
        opacity: number;
      }[],
  );
  expect(frames.find((frame) => frame.content)?.opacity).toBeLessThan(0.5);
  expect(
    frames.some(
      (frame) => frame.content && frame.opacity > 0 && frame.opacity < 1,
    ),
  ).toBe(true);
});

async function openMockRun(
  page: Page,
  process: 'brunch-orders' | 'brunch-orders-direct',
  stage: string,
) {
  const id = 'mock-1795037597235';
  await page.addInitScript(
    ({ runId, process, stage }) => {
      const at = '2026-11-19T10:53:17.235Z';
      sessionStorage.setItem(
        `safepoint.mock-runs.v1:${process}`,
        JSON.stringify([
          {
            id: runId,
            process,
            startedAt: at,
            updatedAt: at,
            startedBy: null,
            discardedAt: null,
            stage: 'read',
            status: 'awaiting_review',
            trigger: 'manual',
            instructions: { version: 'v1', hash: 'mock' },
            additionalInstructions: null,
            modelPlan: null,
            ownRulebook: false,
            readId: null,
            rulebook: null,
          },
        ]),
      );
      sessionStorage.setItem(`safepoint.mock-stage.v1:${runId}`, stage);
    },
    { runId: id, process, stage },
  );
  await page.goto(`/processes/${process}?run=${id}`);
  return page.locator(`[data-run-id="${id}"]`);
}

test('a new run opens its row before fading in and taking selection', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const previous = await openMockRun(page, 'brunch-orders', 'propose-some');
  await expect(previous).toHaveAttribute('aria-pressed', 'true');
  const newRow = page.locator(
    '.sheet-list > li:first-child > [data-run-id^="run-"]',
  );
  const motion = await page.evaluateHandle(() => {
    const selector = '.sheet-list > li:first-child > [data-run-id^="run-"]';
    const original = document.querySelector(selector);
    const frames: {
      height: number;
      opacity: number;
      previousSelected: boolean;
      selected: boolean;
      inert: boolean;
    }[] = [];
    const sample = () => {
      const row = document.querySelector(selector);
      const item = row?.parentElement;
      if (row && row !== original && item) {
        frames.push({
          height: item.getBoundingClientRect().height,
          opacity: Number(getComputedStyle(item).opacity),
          previousSelected: Boolean(
            document.querySelector(
              '[data-run-id^="mock-"][aria-pressed="true"]',
            ),
          ),
          selected: row.getAttribute('aria-pressed') === 'true',
          inert: item.inert,
        });
      }
      if (!frames.at(-1)?.selected) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return frames;
  });

  await page
    .getByRole('button', { name: 'Start run', exact: true })
    .press('Enter');
  await expect(newRow).toHaveAttribute('aria-pressed', 'true');
  await expect(previous).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL(/run=run-/);

  await expect
    .poll(() => motion.evaluate((frames) => frames.at(-1)?.selected))
    .toBe(true);
  const frames = await motion.jsonValue();
  const final = frames.at(-1)!;
  const opening = frames.findIndex(
    (frame) =>
      frame.height > 0 && frame.height < final.height && frame.opacity === 0,
  );
  const fading = frames.findIndex(
    (frame) =>
      frame.height === final.height && frame.opacity > 0 && frame.opacity < 1,
  );
  expect(opening).toBeGreaterThanOrEqual(0);
  expect(fading).toBeGreaterThan(opening);
  expect(
    frames.slice(0, -1).every((frame) => frame.previousSelected && frame.inert),
  ).toBe(true);
  expect(final).toMatchObject({
    opacity: 1,
    previousSelected: false,
    selected: true,
    inert: false,
  });
});

test('the mock run links its read and approval to the captured sheet', async ({
  page,
}) => {
  await openMockRun(page, 'brunch-orders-direct', 'committed');
  const thread = page.locator('.run-view');
  const inputs = thread.getByRole('button', { name: 'Inputs', exact: true });
  if ((await inputs.getAttribute('aria-expanded')) !== 'true')
    await inputs.press('Enter');
  const sheet = thread.getByRole('button', { name: /^Google Sheets/ });
  if ((await sheet.getAttribute('aria-expanded')) !== 'true')
    await sheet.press('Enter');
  await expect(
    thread.getByRole('link', {
      name: 'Open in Google Sheets (opens in a new tab)',
    }),
  ).toHaveAttribute('href', sheetSnapshot.spreadsheet.url);
  const approval = thread.getByRole('button', {
    name: 'Approval',
    exact: true,
  });
  if ((await approval.getAttribute('aria-expanded')) !== 'true')
    await approval.press('Enter');
  const output = thread.locator('table.output-cells');
  await expect(output).toHaveCount(1);
  await expect(
    thread.getByRole('link', {
      name: 'Open Brunch store in Google Sheets (opens in a new tab)',
    }),
  ).toHaveAttribute('href', sheetSnapshot.spreadsheet.url);
  await expect(output.getByRole('link')).toHaveCount(0);
});

test('the rulebook mock waits for decisions to be confirmed', async ({
  page,
}) => {
  await openMockRun(page, 'brunch-orders', 'propose-some');
  const thread = page.locator('.run-view');
  const confirm = thread.getByRole('button', { name: 'Confirm decisions' });
  await expect(confirm).toHaveCount(0);
  const reject = thread.getByRole('button', { name: 'Reject', exact: true });
  for (let remaining = 3; remaining > 0; remaining--) {
    await expect(reject).toHaveCount(remaining);
    await reject.first().click();
  }
  await expect(confirm).toBeVisible();
  const apply = thread.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toHaveAttribute('aria-expanded', 'false');
  await confirm.press('Enter');
  await expect(apply).toHaveAttribute('aria-expanded', 'true');
  await expect(
    thread.getByText('Approved 8, changed 0, rejected 3.'),
  ).toBeVisible();
});

test('the direct mock reveals thinking after the answer arrives', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openMockRun(page, 'brunch-orders-direct', 'evaluating');
  const log = page.getByRole('list', { name: 'What happened' });
  const thought = page.locator('.model-thought-title');

  await expect(log).toBeVisible();
  await expect(thought).toHaveCount(0);
  await expect(log.getByText(/^Answered /).first()).toBeAttached({
    timeout: 20_000,
  });
  expect(await thought.count()).toBe(0);

  await expect(thought).toBeVisible();
  const previous = page.getByRole('button', { name: 'Previous thinking step' });
  const next = page.getByRole('button', { name: 'Next thinking step' });
  await previous.press('Enter');
  await expect(thought).toHaveText('Re-checking flagged items');
  await expect(previous).toBeDisabled();
  await next.press('Enter');
  await expect(thought).toHaveText('Verifying final order quantities');
});

test('bulk approval in the direct mock waits for review confirmation', async ({
  page,
}) => {
  await openMockRun(page, 'brunch-orders-direct', 'awaiting_review');
  const thread = page.locator('.run-view');
  const confirm = thread.getByRole('button', { name: 'Confirm decisions' });
  const prepare = thread.getByRole('button', { name: /^Write \d+ rows?$/ });
  await thread.getByRole('button', { name: 'Reject SD-01' }).click();
  await thread.getByRole('button', { name: 'Approve AV-RR' }).click();
  await expect(confirm).toHaveCount(0);
  const approve = thread.getByRole('button', {
    name: 'Approve all 9 not checked',
  });
  const action = await approve.elementHandle();
  await approve.press('Enter');
  await expect(confirm).toBeFocused();
  expect(
    await action.evaluate((button) => button === document.activeElement),
  ).toBe(true);
  await expect(prepare).toHaveCount(0);
  await confirm.press('Enter');
  await prepare.press('Enter');
  await expect(
    thread.getByRole('button', { name: 'Confirm write' }),
  ).toBeFocused();
});

test('the direct mock explains when all records are rejected', async ({
  page,
}) => {
  await openMockRun(page, 'brunch-orders-direct', 'awaiting_review');
  const thread = page.locator('.run-view');
  const reject = thread.getByRole('button', { name: /^Reject / });
  await expect(reject.first()).toBeVisible();
  for (let remaining = await reject.count(); remaining > 0; remaining--) {
    await reject.first().click();
    await expect(reject).toHaveCount(remaining - 1);
  }
  await thread.getByRole('button', { name: 'Confirm decisions' }).click();
  await expect(
    thread.getByText('Nothing to write.', { exact: true }),
  ).toBeVisible();
  await expect(
    thread.getByRole('button', { name: /^Write \d+ rows?$/ }),
  ).toHaveCount(0);
});

test('a run summary updates and writing can be confirmed or cancelled from the keyboard', async ({
  page,
}) => {
  const row = await openMockRun(
    page,
    'brunch-orders-direct',
    'awaiting_review',
  );
  const thread = page.locator('.run-view');
  await expect(thread).toContainText('Awaiting a reviewer');
  const inputs = thread.getByRole('button', { name: 'Inputs', exact: true });
  const sheet = thread.getByRole('button', { name: /^Google Sheets/ });
  const chevron = sheet.locator('.read-card-chevron');
  await inputs.press('Enter');
  await expect(sheet).toHaveAttribute('aria-expanded', 'true');
  await expect(chevron).toHaveCSS('rotate', '0deg');
  const pill = sheet.locator('.read-card-done');
  await expect(chevron).toHaveCSS('opacity', '0');
  await expect(pill).toHaveCSS('margin-inline-end', '0px');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pill.evaluate((element) => {
    let slides = 0;
    element.addEventListener('transitionend', (event) => {
      if (
        event instanceof TransitionEvent &&
        event.target === element &&
        event.propertyName.startsWith('margin-')
      )
        element.setAttribute('data-completed-slides', String(++slides));
    });
  });
  await chevron.evaluate((element) => {
    element.addEventListener('transitionstart', (event) => {
      if (
        event instanceof TransitionEvent &&
        event.target === element &&
        event.propertyName === 'opacity'
      ) {
        const pill = element.previousElementSibling;
        if (pill)
          element.setAttribute(
            'data-fade-started-after-slide',
            String(pill.getAttribute('data-completed-slides') === '1'),
          );
      }
    });
  });
  await sheet.hover();
  await expect(pill).toHaveAttribute('data-completed-slides', '1');
  await expect(chevron).toHaveAttribute(
    'data-fade-started-after-slide',
    'true',
  );
  await expect(chevron).toHaveCSS('opacity', '1');
  await expect(pill).not.toHaveCSS('margin-inline-end', '0px');
  await inputs.hover();
  await expect(pill).toHaveAttribute('data-completed-slides', '2');
  await expect(chevron).toHaveCSS('opacity', '0');
  await expect(pill).toHaveCSS('margin-inline-end', '0px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sheet.press('Enter');
  await expect(sheet).toHaveAttribute('aria-expanded', 'false');
  await expect(chevron).toHaveCSS('rotate', '-90deg');
  await inputs.press('Enter');
  await inputs.press('Enter');
  await expect(sheet).toHaveAttribute('aria-expanded', 'true');
  const stage = page.getByRole('combobox', { name: 'Mock run stage' });
  const reviewing = await stage
    .locator('option', { hasText: /in review/i })
    .first()
    .getAttribute('value');
  expect(reviewing).not.toBeNull();
  await stage.selectOption(reviewing!);
  await expect(
    thread.getByRole('radio', { name: 'Decided records, 4', exact: true }),
  ).toBeVisible();
  await thread
    .getByRole('button', { name: 'Undo the decision on SD-01' })
    .click();
  await expect(
    thread.getByRole('radio', { name: 'Decided records, 3', exact: true }),
  ).toBeVisible();
  const approval = await stage
    .locator('option', { hasText: /awaiting approval/i })
    .first()
    .getAttribute('value');
  expect(approval).not.toBeNull();
  await stage.selectOption(approval!);
  await expect(thread.locator('table.output-cells')).toHaveCount(1);
  await expect(thread.getByText('Brunch store · supplier copy')).toHaveCount(0);
  await expect(row).toHaveAccessibleName(/^Mock run\. Approved\./);
  const prepare = thread.getByRole('button', { name: /^Write \d+ rows?$/ });
  const confirm = thread.getByRole('button', { name: 'Confirm write' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const primary = await prepare.elementHandle();
  await prepare.press('Enter');
  await expect(confirm).toBeFocused();
  expect(
    await primary.evaluate((button) => button === document.activeElement),
  ).toBe(true);
  await thread
    .getByRole('button', { name: 'Cancel', exact: true })
    .press('Enter');
  await expect(prepare).toBeFocused();
  expect(
    await primary.evaluate((button) => button === document.activeElement),
  ).toBe(true);
  await expect(row).toHaveAccessibleName(/^Mock run\. Approved\./);
  await prepare.press('Enter');
  const undo = thread.getByRole('button', { name: 'Undo the write' });
  await confirm.evaluate((button) => {
    const layer = button
      .closest('[data-height-swap-content]')
      ?.closest('.overflow-y-clip');
    if (!(layer instanceof HTMLElement))
      throw new Error('Write section is missing');
    layer.style.width = '12rem';
    layer.style.setProperty('--fold-min', '350ms');
    layer.setAttribute('data-test-write-section', '');
  });
  const writeSection = page.locator('[data-test-write-section]');
  const frames = writeSection.evaluate(async (layer) => {
    const initial = layer.getBoundingClientRect().height;
    const until = performance.now() + 5000;
    let heldThroughExit = true;
    let sawHiddenResize = false;
    let resizedBeforeEntrance = true;
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame);
      const content = layer.querySelector('[data-height-swap-content]');
      if (!content) continue;
      const height = layer.getBoundingClientRect().height;
      const opacity = Number(getComputedStyle(content).opacity);
      if (!content.textContent?.includes('Undo the write')) {
        if (opacity > 0) heldThroughExit &&= Math.abs(height - initial) < 1;
        continue;
      }
      const hasOutcome = content.textContent.includes('Written to the sheet');
      if (opacity === 0 && hasOutcome) {
        sawHiddenResize ||= layer
          .getAnimations()
          .some(
            (animation) =>
              animation.id === 'smooth-height' &&
              animation.playState === 'running',
          );
      }
      if (opacity > 0)
        resizedBeforeEntrance &&=
          Math.abs(height - content.getBoundingClientRect().height) < 1;
      if (opacity === 1)
        return {
          hasOutcome,
          heldThroughExit,
          sawHiddenResize,
          resizedBeforeEntrance,
        };
    }
    throw new Error('The written section did not finish entering');
  });
  await confirm.press('Enter');
  await expect(undo).toBeFocused();
  expect(await frames).toEqual({
    hasOutcome: true,
    heldThroughExit: true,
    sawHiddenResize: true,
    resizedBeforeEntrance: true,
  });
  await expect(row).toHaveAccessibleName(/^Mock run\. Completed\./);
  await undo.press('Enter');
  await expect(prepare).toBeFocused();
  await expect(row).toHaveAccessibleName(/^Mock run\. Approved\./);
});

for (const [process, stage] of [
  ['brunch-orders', 'branch-apply-mismatch'],
  ['brunch-orders-direct', 'intervention'],
] as const) {
  test(`${process} mock can undo a write that reads back differently`, async ({
    page,
  }) => {
    if (process === 'brunch-orders') {
      await page.setViewportSize({ width: 1440, height: 390 });
    }
    const row = await openMockRun(page, process, stage);
    await expect(row).toHaveAccessibleName(/^Mock run[.] Held[.]/);
    const thread = page.locator('.run-view');
    if (process === 'brunch-orders') {
      const jump = thread.getByRole('button', { name: 'Jump to Apply' });
      const apply = thread.getByRole('button', { name: 'Apply', exact: true });
      await jump.press('Enter');
      await expect(apply).toBeFocused();
      await expect
        .poll(() =>
          apply.evaluate((heading) => {
            const section = heading.closest('[data-current]');
            if (!section) throw new Error('Apply is not the current section');
            let scroller = section.parentElement;
            while (
              scroller &&
              !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)
            ) {
              scroller = scroller.parentElement;
            }
            if (!scroller) throw new Error('Run scroller is missing');
            const distanceToSection =
              section.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              scroller.clientTop;
            const remainingScroll =
              scroller.scrollHeight -
              scroller.scrollTop -
              scroller.clientHeight;
            return Math.abs(Math.min(distanceToSection, remainingScroll));
          }),
        )
        .toBeLessThan(2);
    }
    const undo = thread.getByRole('button', { name: 'Undo the write' });
    await undo.press('Enter');
    await expect(
      thread.getByRole('button', { name: /^Write [0-9]+ rows?$/ }),
    ).toBeFocused();
    await expect(row).toHaveAccessibleName(/^Mock run[.] Approved[.]/);
  });
}

for (const pinned of [true, false]) {
  test(`an idle run ${pinned ? 'follows new content at the bottom' : 'keeps the reader’s place above new content'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 600 });
    await openMockRun(page, 'brunch-orders-direct', 'ready_to_commit');
    const scroller = page.locator('.process-runs-detail');
    const prepare = scroller.getByRole('button', { name: /^Write \d+ rows?$/ });
    await expect(prepare).toBeVisible();
    // Make the confirmation wrap beneath the button at a predictable width.
    await prepare.evaluate((button) => {
      if (!button.parentElement) throw new Error('Write controls are missing');
      button.parentElement.style.maxWidth = '12rem';
    });
    const before = await scroller.evaluate(async (element, atBottom) => {
      element.scrollTop = atBottom ? element.scrollHeight : 0;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return { height: element.scrollHeight, top: element.scrollTop };
    }, pinned);
    expect(before.height).toBeGreaterThan(600);
    if (pinned) expect(before.top).toBeGreaterThan(0);

    // Trigger the same button action without Playwright scrolling it into view.
    await prepare.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement))
        throw new Error('Write button is missing');
      button.click();
    });
    await expect(
      scroller.getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollHeight))
      .toBeGreaterThan(before.height);
    if (pinned) {
      await expect
        .poll(() =>
          scroller.evaluate((element) =>
            Math.abs(
              element.scrollHeight - element.clientHeight - element.scrollTop,
            ),
          ),
        )
        .toBeLessThan(2);
    } else {
      expect(await scroller.evaluate((element) => element.scrollTop)).toBe(
        before.top,
      );
    }
  });
}

test('Jump to stays anchored and is offered once per actionable step', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 600 });
  await openMockRun(page, 'brunch-orders-direct', 'awaiting_review');
  const scroller = page.locator('.process-runs-detail');
  const jump = scroller.getByRole('button', { name: 'Jump to Review' });
  await expect(jump).toBeInViewport();

  const { shift, height, top } = await jump.evaluate((button) => {
    const scroller = button.closest('.process-runs-detail');
    if (!scroller) throw new Error('Run scroller is missing');
    const before = button.getBoundingClientRect().bottom;
    const height = scroller.scrollHeight;
    scroller.scrollTop = height;
    return {
      shift: button.getBoundingClientRect().bottom - before,
      height,
      top: scroller.scrollTop,
    };
  });
  expect(Math.abs(shift)).toBeLessThan(1);
  await expect(jump).toHaveCount(0);
  await expect
    .poll(() =>
      scroller.evaluate((element) => [element.scrollHeight, element.scrollTop]),
    )
    .toEqual([height, top]);

  const observedScroll = await scroller.evaluate(async (element) => {
    element.scrollTop = 0;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return element.scrollTop;
  });
  expect(observedScroll).toBe(0);
  await expect(jump).toHaveCount(0);

  const stage = page.getByRole('combobox', { name: 'Mock run stage' });
  const approval = stage.getByRole('option', {
    name: /^\d+\. Awaiting approval$/,
  });
  await expect(approval).toHaveAttribute('value', /^\d+$/);
  await stage.selectOption((await approval.getAttribute('value'))!);
  await expect(
    scroller.getByRole('button', { name: 'Jump to Approval' }),
  ).toBeInViewport();
});

test('Jump to reveals its label before the pointer reaches its click target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await openMockRun(page, 'brunch-orders-direct', 'intervention');
  const jump = page.getByRole('button', { name: /^Jump to / });
  const label = jump.locator('.thread-jump-label');
  await expect(label).toHaveCSS('opacity', '0');

  const box = await jump.boundingBox();
  if (!box) throw new Error('Jump to button is missing');
  const x = box.x + box.width / 2;
  const y = box.y - 4;
  await page.mouse.move(x, y);
  await expect(label).toHaveCSS('opacity', '1');
  await page.mouse.click(x, y);
  await expect(jump).toBeVisible();
  await expect(jump).not.toBeFocused();

  await page.mouse.move(x, y - 24);
  await expect(label).toHaveCSS('opacity', '0');
  await jump.click();
  await expect(jump).toHaveCount(0);
});

test('the runs column fades edges only while runs extend past them', async ({
  page,
}) => {
  // Runs enough to run past the column, whatever other tests left: the
  // database starts empty with each server.
  for (let i = 0; i < 8; i++) await startKeptRun(page, 'brunch-orders');
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/processes/brunch-orders');
  const aside = page.locator('.process-runs-list');
  await expect(aside.locator('.sheet-row').first()).toBeVisible();

  await expect(aside).not.toHaveAttribute('data-fade-top');
  await expect(aside).toHaveAttribute('data-fade-bottom', '');

  await aside.evaluate((element) => {
    element.scrollTop = 60;
  });
  await expect(aside).toHaveAttribute('data-fade-top', '');
  await expect(aside).toHaveAttribute('data-fade-bottom', '');

  await aside.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(aside).toHaveAttribute('data-fade-top', '');
  await expect(aside).not.toHaveAttribute('data-fade-bottom');
});
