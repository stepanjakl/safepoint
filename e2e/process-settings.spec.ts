import { expect, test } from '@playwright/test';

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

test('settings help, choice selection and heading rhythm', async ({
  page,
  colorScheme,
}) => {
  await page.addInitScript(
    (theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    },
    colorScheme === 'dark' ? 'dark' : 'light',
  );
  await page.goto('/examples/promotion?run=run-104');
  const openSettings = () =>
    page.getByRole('button', { name: 'Settings', exact: true }).last().click();
  await openSettings();

  const help = page.getByRole('button', { name: 'How evaluation works' });
  await help.focus();
  await expect(page.getByRole('tooltip')).toContainText(
    'AI turns your instructions into formulas',
  );
  await help.press('Escape');
  await expect(page.getByRole('tooltip')).toBeHidden();

  const schedule = page.getByRole('region', { name: 'Schedule', exact: true });
  const toggle = schedule.getByRole('switch', { name: 'Scheduled runs' });
  if (!(await toggle.isChecked())) {
    await toggle.focus();
    await toggle.press('Space');
  }
  const repeats = schedule.getByRole('group', { name: 'Repeats' });
  const daily = repeats.getByRole('button', { name: 'Daily', exact: true });
  const weekly = repeats.getByRole('button', { name: 'Weekly', exact: true });
  await daily.focus();
  await daily.press('Space');
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  await expect(weekly).toHaveAttribute('aria-pressed', 'false');
  const days = schedule.locator('[role="group"][aria-label="Day"]');
  expect(
    await days.evaluate(
      (element) => element.closest('.fold')?.getBoundingClientRect().height,
    ),
  ).toBe(0);
  const monday = days.getByRole('button', { name: 'Monday', exact: true });
  await monday.focus();
  await expect(monday).not.toBeFocused();
  await daily.focus();
  await daily.press('Space');
  await expect(daily).toHaveAttribute('aria-pressed', 'true');
  await weekly.click();
  await schedule.getByRole('button', { name: 'Friday', exact: true }).click();
  await schedule.getByLabel('Time', { exact: true }).fill('14:30');

  await page.reload();
  await openSettings();
  await expect(weekly).toHaveAttribute('aria-pressed', 'true');
  await expect(
    schedule.getByRole('button', { name: 'Friday', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(schedule.getByLabel('Time', { exact: true })).toHaveValue(
    '14:30',
  );

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.locator('.process-panels').evaluate((root) => {
      const box = (element: Element) => element.getBoundingClientRect();
      const headings = [
        ...root.querySelectorAll('section[aria-labelledby] > h3'),
      ];
      const headingGaps = headings.map(
        (heading) => box(heading.nextElementSibling!).top - box(heading).bottom,
      );
      const scheduleHeading = root.querySelector('#settings-schedule')!;
      const scheduleRow = scheduleHeading.parentElement!;
      const scheduleGap =
        box(scheduleRow.nextElementSibling!).top - box(scheduleRow).bottom;
      const field = root.querySelector('input[type="time"]')!;
      const choices = [
        ...root.querySelectorAll('[role="group"][aria-label="Repeats"] button'),
      ];
      return {
        headingGaps,
        scheduleGap,
        fieldFace: getComputedStyle(field).backgroundColor,
        choiceFaces: choices.map(
          (choice) => getComputedStyle(choice).backgroundColor,
        ),
        choiceEdges: choices.map(
          (choice) => getComputedStyle(choice).borderTopWidth,
        ),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.headingGaps).toEqual([12, 12, 12]);
    expect(geometry.scheduleGap).toBe(12);
    expect(geometry.choiceFaces[0]).toBe(geometry.fieldFace);
    expect(geometry.choiceFaces[1]).not.toBe(geometry.fieldFace);
    expect(geometry.choiceEdges).toEqual(['1px', '1px']);
    expect(geometry.overflow).toBe(false);
  }
});

test('schedule changes animate height without sliding content', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/examples/promotion?run=run-104');
  await page
    .getByRole('button', { name: 'Settings', exact: true })
    .last()
    .click();
  const schedule = page.getByRole('region', { name: 'Schedule', exact: true });
  const toggle = schedule.getByRole('switch');
  if (!(await toggle.isChecked())) {
    await toggle.focus();
    await toggle.press('Space');
  }
  await schedule.getByRole('button', { name: 'Weekly', exact: true }).click();
  await expect(schedule.getByRole('group', { name: 'Day' })).toBeVisible();
  // Let the setup change finish before sampling either direction of the fold.
  await schedule.evaluate(async (root) => {
    await Promise.all(
      root
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  for (const selector of [
    'input[role="switch"]',
    'input[role="switch"]',
    'button[aria-label="Daily"]',
  ]) {
    const samples = await schedule.evaluate(async (root, selector) => {
      const heights = [root.getBoundingClientRect().height];
      const days = root.querySelector('[aria-label="Day"]')!;
      const dayFold = days.closest('.fold')!;
      const dayBody = days.parentElement!;
      const readDay = () => ({
        height: dayFold.getBoundingClientRect().height,
        opacity: Number(getComputedStyle(dayBody).opacity),
      });
      const dayFrames = [readDay()];
      const enabledBody = root.querySelector(
        '[aria-label="Repeats"]',
      )!.parentElement!;
      const manualBody = [...root.querySelectorAll('p')].find(
        (element) => element.textContent?.trim() === 'Start runs manually.',
      )!.parentElement!;
      let overlapping = false;
      const control = selector.includes('Daily')
        ? [...root.querySelectorAll('button')].find(
            (button) => button.textContent === 'Daily',
          )!
        : root.querySelector<HTMLInputElement>(selector)!;
      control.click();
      const started = performance.now();
      while (performance.now() - started < 1000) {
        await new Promise(requestAnimationFrame);
        heights.push(root.getBoundingClientRect().height);
        dayFrames.push(readDay());
        overlapping ||=
          Number(getComputedStyle(enabledBody).opacity) > 0.01 &&
          Number(getComputedStyle(manualBody).opacity) > 0.01;
      }
      const sliding = [...root.querySelectorAll('p, li, .fold-body')].some(
        (element) => {
          const style = getComputedStyle(element);
          return (
            style.transform !== 'none' ||
            !['none', '0px', '0px 0px'].includes(style.translate)
          );
        },
      );
      return { heights, sliding, dayFrames, overlapping };
    }, selector);
    const start = samples.heights[0]!;
    const end = samples.heights.at(-1)!;
    const direction = Math.sign(end - start);
    const reversed = samples.heights.some(
      (height, index) =>
        index > 0 && (height - samples.heights[index - 1]!) * direction < -0.5,
    );
    expect(
      reversed,
      'the schedule height must move in one direction without bouncing',
    ).toBe(false);
    expect(Math.abs(end - start)).toBeGreaterThan(20);
    expect(
      samples.heights.some(
        (height) =>
          height > Math.min(start, end) + 1 &&
          height < Math.max(start, end) - 1,
      ),
    ).toBe(true);
    expect(samples.sliding).toBe(false);
    expect(
      samples.overlapping,
      'outgoing content must fade away before incoming content appears',
    ).toBe(false);
    if (selector.includes('Daily')) {
      const initialHeight = samples.dayFrames[0]!.height;
      const firstCollapse = samples.dayFrames.find(
        (frame) => frame.height < initialHeight - 0.5,
      );
      expect(firstCollapse).toBeDefined();
      expect(firstCollapse!.opacity).toBeLessThanOrEqual(0.01);
      expect(
        samples.dayFrames.some(
          (frame) =>
            frame.opacity > 0 &&
            frame.opacity < 1 &&
            Math.abs(frame.height - initialHeight) < 0.5,
        ),
      ).toBe(true);
    }
  }
});
