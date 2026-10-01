import { expect, test, type Page } from '@playwright/test';
import Color from 'colorjs.io';

/*
  Which run the process page shows: nothing on arrival, the run the rail
  chooses, nothing again when that row is chosen twice, and a started run
  playing its stages up to the review. The choice is kept in ?run=, so a link
  opens the same run.
*/
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const row = (page: Page, day: RegExp) =>
  page.locator('.sheet-row').filter({ hasText: day }).first();

test('the rail chooses what the page shows', async ({ page }) => {
  await page.goto('/examples/promotion');
  await expect(heading(page)).toHaveText('No run selected');

  await row(page, /Sep\s*4/).click();
  await expect(heading(page)).toHaveText('Run, Thu 4 Sep · 09:00');
  await expect(page).toHaveURL(/\?run=run-104$/);

  // The row is a toggle: choosing it again shows nothing.
  await row(page, /Sep\s*4/).click();
  await expect(heading(page)).toHaveText('No run selected');
  await expect(page).not.toHaveURL(/run=/);

  // Only the current run has a recorded thread.
  await row(page, /Aug\s*28/).click();
  await expect(heading(page)).toHaveText(/has no recorded thread/);

  await page.goto('/examples/promotion?run=run-104');
  await expect(heading(page)).toHaveText('Run, Thu 4 Sep · 09:00');
});

test('run tally and row colours advance through rest, hover, and selection', async ({
  page,
  colorScheme,
}) => {
  await page.goto('/examples/promotion');
  await page.locator('html').evaluate(
    (root, theme) => {
      root.dataset.theme = theme;
    },
    colorScheme === 'dark' ? 'dark' : 'light',
  );
  const tallyRow = page
    .locator('.sheet-row:has(.sheet-seg[data-severity])')
    .first();
  await expect(tallyRow).toBeVisible();

  const colours = () =>
    tallyRow.evaluate((button) => {
      const paint = (
        selector: string,
        property: 'backgroundColor' | 'color',
      ) => {
        const element = button.querySelector(selector);
        if (!element) throw new Error(`Missing tally part: ${selector}`);
        return getComputedStyle(element)[property];
      };
      return {
        row: getComputedStyle(button).backgroundColor,
        day: paint('.sheet-row-day', 'color'),
        time: paint('.sheet-row-when .value', 'color'),
        status: paint('.sheet-row-status', 'color'),
        outcome: paint('.sheet-seg[data-severity]', 'backgroundColor'),
        outcomeInk: paint('.sheet-seg[data-severity]', 'color'),
        total: paint('.sheet-seg-total', 'backgroundColor'),
        number: paint('.sheet-total-lead', 'backgroundColor'),
        label: paint('.sheet-total-label', 'color'),
      };
    });

  const rest = await colours();
  await tallyRow.hover();
  const hover = await colours();
  await page.mouse.move(1400, 900);
  await tallyRow.focus();
  expect(await colours()).toEqual(hover);
  await tallyRow.click();
  await expect(tallyRow).toHaveAttribute('data-current', '');
  const selected = await colours();

  for (const part of [
    'row',
    'day',
    'time',
    'outcome',
    'total',
    'number',
  ] as const) {
    expect(new Set([rest[part], hover[part], selected[part]]).size, part).toBe(
      3,
    );
  }
  expect(rest.outcomeInk).toBe(hover.outcomeInk);
  const lightness = (value: string) => {
    const coordinate = new Color(value).to('oklch').coords[0];
    if (coordinate === null) throw new Error(`Missing lightness for ${value}`);
    return coordinate;
  };
  expect(lightness(hover.number)).toBeGreaterThan(lightness(rest.number));
  expect(lightness(selected.number)).toBeGreaterThan(lightness(hover.number));
  const selectedOutcomes = await tallyRow
    .locator('.sheet-seg[data-severity]')
    .evaluateAll((segments) =>
      segments.map((segment) => ({
        background: getComputedStyle(segment).backgroundColor,
        ink: getComputedStyle(segment).color,
      })),
    );
  for (const outcome of selectedOutcomes) {
    expect(lightness(outcome.ink)).toBeGreaterThan(0.85);
    expect(
      Color.contrastWCAG21(
        new Color(outcome.ink),
        new Color(outcome.background),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  }
  if (colorScheme === 'light') {
    for (const state of [rest, hover, selected]) {
      expect(
        Color.contrastWCAG21(new Color(state.label), new Color(state.total)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(rest.status).toBe(hover.status);
  expect(selected.status).toBe(rest.status);
});

test('a started run plays up to the review', async ({ page }) => {
  await page.goto('/examples/promotion');
  await page.getByRole('button', { name: 'Start run' }).last().click();
  const top = page.locator('.sheet-row').first();
  await expect(top).toHaveAttribute('aria-label', /^Running\..*by a person/);
  await expect(heading(page)).toHaveText(/^Run, Today/);
  // While it plays, a second cannot start.
  await expect(
    page.getByRole('button', { name: 'Start run' }).first(),
  ).toHaveAttribute('aria-disabled', 'true');
  await expect(top).toHaveAttribute('aria-label', /^Awaiting review\./, {
    timeout: 15_000,
  });
  // The review card loads its code on demand, which a busy server can slow.
  await expect(
    page.getByRole('button', { name: 'Review release' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('a process with nothing to play cannot start one', async ({ page }) => {
  await page.goto('/examples/support');
  await expect(heading(page)).toHaveText('No run selected');
  await expect(
    page.getByRole('button', { name: 'Start run' }).first(),
  ).toHaveAttribute('aria-disabled', 'true');
});
