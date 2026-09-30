import { expect, test } from '@playwright/test';

/* The development style inspector: from an element to the file and line its
   styles are written on, without the page reacting to the inspection. */

test('the inspector names where an element’s styles are written', async ({
  page,
  colorScheme,
}) => {
  test.skip(colorScheme === 'dark', 'The lookup is theme-independent.');
  await page.goto('/examples/promotion?run=run-104');
  const inputs = page.getByRole('button', { name: /^Inputs/ }).first();
  await expect(inputs).toBeVisible();

  await page.keyboard.press('Control+Shift+Backquote');
  const panel = page.getByRole('region', { name: 'Style inspector' });
  await expect(panel).toContainText('Point at an element');

  // In its start padding, so the pointer is on the button, not its label.
  const box = (await inputs.boundingBox())!;
  const padding = { x: 5, y: box.height / 2 };
  await inputs.hover({ position: padding });
  await expect(panel).toContainText('<button>');
  // The component whose JSX wrote it, linked to that line, then its owners.
  const source = panel.locator('.spi-source');
  await expect(source.getByRole('link').first()).toHaveText(
    /^process-header\.tsx:\d+$/,
  );
  await expect(source).toContainText(/Rendered in\s*ProcessHeader\b/);
  const utility = panel
    .locator('.spi-row')
    .filter({ hasText: /^control-header-button\b/ })
    .first();
  await expect(utility.getByRole('link').first()).toHaveText(
    /^process-header\.css:\d+$/,
  );
  // Every role it reads resolves to a declaration and a painted colour.
  await expect(utility).toContainText('--sp-header-button-face-top');
  await expect(utility).toContainText(/= #[0-9a-f]{6}/);
  // A Tailwind utility is traced to the @theme entry it reads.
  await expect(panel).toContainText('--text-dense ← @theme');
  // A token is shown where it is applied and who set it: control-face's
  // background reads --control-face-top, which the button's condition face
  // sets, down through its role to a Radix step.
  const face = panel.locator('.spi-row').filter({
    has: page.locator('summary code', { hasText: /^control-face$/ }),
  });
  await expect(face).toContainText('background-image');
  await expect(face).toContainText(
    /--control-face-top = #[0-9a-f]{6} ← (interact:)?control-header-button-(blocked|caution)/,
  );
  await expect(face).toContainText(/--radix-[a-z]+-11 = #[0-9a-f]{6} ← :root/);
  // A setter says what reads it.
  await expect(utility).toContainText(
    'read by control-face · background-image',
  );

  // A click pins the element; the button itself is never pressed.
  await inputs.click({ position: padding });
  await expect(inputs).not.toHaveAttribute('aria-current', 'true');
  await page.mouse.move(5, 5);
  await expect(panel).toContainText('<button>');

  // Escape unpins, then closes.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('holding Option peeks, and Option-click pins past the key', async ({
  page,
  colorScheme,
}) => {
  test.skip(colorScheme === 'dark', 'The gesture is theme-independent.');
  await page.goto('/examples/promotion?run=run-104');
  const inputs = page.getByRole('button', { name: /^Inputs/ }).first();
  await expect(inputs).toBeVisible();
  const panel = page.getByRole('region', { name: 'Style inspector' });
  const box = (await inputs.boundingBox())!;
  const padding = { x: 5, y: box.height / 2 };
  await inputs.hover({ position: padding });

  // Held: what is already under the pointer, without moving it. Released: gone.
  await page.keyboard.down('Alt');
  await expect(panel).toContainText('<button>');
  await page.keyboard.up('Alt');
  await expect(panel).toHaveCount(0);

  // ⌥ joined by another key is another gesture, so the peek steps aside.
  await page.keyboard.down('Alt');
  await expect(panel).toBeVisible();
  await page.keyboard.down('Shift');
  await expect(panel).toHaveCount(0);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');

  // ⌥-click pins without pressing the button, and the pin outlasts the key.
  await page.keyboard.down('Alt');
  await inputs.click({ position: padding, modifiers: ['Alt'] });
  await page.keyboard.up('Alt');
  await expect(panel).toContainText('<button>');
  await expect(inputs).not.toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // In a field, ⌥ is for typing.
  await page
    .getByRole('button', { name: 'Search processes', exact: true })
    .click();
  await page.getByRole('searchbox', { name: 'Search processes' }).focus();
  await page.keyboard.down('Alt');
  await expect(panel).toHaveCount(0);
  await page.keyboard.up('Alt');
});

test('Option-click on the sidebar handle still resets it', async ({
  page,
  colorScheme,
}) => {
  test.skip(colorScheme === 'dark', 'The gesture is theme-independent.');
  await page.goto('/examples/promotion?run=run-104');
  const handle = page.locator('.sidebar-handle[data-side="left"]');
  await expect(handle).toHaveAttribute('aria-valuenow', '250');
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).not.toHaveAttribute('aria-valuenow', '250');

  await handle.click({ modifiers: ['Alt'] });
  await expect(handle).toHaveAttribute('aria-valuenow', '250');
  await expect(
    page.getByRole('region', { name: 'Style inspector' }),
  ).toHaveCount(0);
});

test('a shadow brought in by @apply traces to the rule that sets its colour, and the filter finds it', async ({
  page,
  colorScheme,
}) => {
  test.skip(colorScheme === 'dark', 'The lookup is theme-independent.');
  await page.goto('/examples/promotion?run=run-104');
  const row = page.locator('li.process-menu-row[data-current]');
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const panel = page.getByRole('region', { name: 'Style inspector' });
  const head = panel.locator('.spi-head strong');

  await page.mouse.move(centre.x, centre.y);
  await page.keyboard.down('Alt');
  await expect(head).toHaveText(/^</);
  // ⌥ is still held from keyboard.down, so this is a ⌥-click.
  await page.mouse.click(centre.x, centre.y);
  await page.keyboard.up('Alt');
  // The pointer lands inside the row; step out to the <li> itself.
  for (let step = 0; step < 6; step += 1) {
    if ((await head.innerText()).startsWith('<li>')) break;
    await panel.getByRole('button', { name: 'Parent' }).click();
  }
  await expect(head).toHaveText(/^<li>/);

  await panel.getByRole('searchbox').fill('shadow');
  // The rule that applies, not the forced-colours one of the same selector.
  const current = panel.locator('.spi-row:not([data-idle])').filter({
    has: page.locator('summary code', {
      hasText: /^\.process-menu-row\[data-current\]/,
    }),
  });
  // control-face applies Tailwind's shadow utility; the colour it paints is
  // set by the row's own rule, and read on the row, not on :root.
  await expect(current).toContainText('box-shadow');
  await expect(current).toContainText(
    /--control-highlight = (#[0-9a-f]{6}|transparent) ← \.process-menu-row\[data-current\]/,
  );
  await expect(current).not.toContainText('border-width');
  await expect(panel).toContainText(/\d+ of \d+/);

  // Escape clears the filter before it unpins.
  await panel.getByRole('searchbox').press('Escape');
  await expect(panel.getByRole('searchbox')).toHaveValue('');
  await expect(current).toContainText('border-width');
});

test('the panel stays usable over an open modal', async ({
  page,
  colorScheme,
}) => {
  test.skip(colorScheme === 'dark', 'The gesture is theme-independent.');
  await page.goto('/examples/promotion?run=run-104');
  await page.getByRole('button', { name: 'Overlay demo' }).click();
  const close = page.getByRole('button', { name: 'Close overlay demo' });
  await expect(close).toBeVisible();

  // Opened after the modal, so React Aria sees it arrive while hiding.
  await page.keyboard.press('Control+Shift+Backquote');
  const panel = page.getByRole('region', { name: 'Style inspector' });
  await expect(panel).toBeVisible();
  await expect(
    page.locator('[data-style-inspector]').first(),
  ).not.toHaveAttribute('inert');

  // Pin the heading inside the modal, then step out from it: the panel's own
  // button answers, rather than the page beneath taking the click.
  // Point first: the panel moves to the side away from what it inspects,
  // which here is the drawer's heading, under where the panel starts.
  const heading = page.getByRole('heading', { name: 'Overlay demo' });
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  const head = panel.locator('.spi-head strong');
  await expect(head).toHaveText(/^<h2>/);
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await panel.getByRole('button', { name: 'Parent' }).click();
  await expect(head).not.toHaveText(/^<h2>/);
  await expect(head).not.toContainText('drawer-overlay');

  // Child retraces every Parent step, then goes; a new pin forgets the way.
  const child = panel.getByRole('button', { name: 'Child' });
  await panel.getByRole('button', { name: 'Parent' }).click();
  await child.click();
  await expect(head).not.toHaveText(/^<h2>/);
  await child.click();
  await expect(head).toHaveText(/^<h2>/);
  await expect(child).toHaveCount(0);
  await panel.getByRole('button', { name: 'Parent' }).click();
  await expect(child).toBeVisible();
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await expect(head).toHaveText(/^<h2>/);
  await expect(child).toHaveCount(0);

  // The filter takes typing, and keeps focus, while the modal holds its own.
  const filter = panel.getByRole('searchbox');
  await filter.click();
  await filter.pressSequentially('color');
  await expect(filter).toHaveValue('color');
  await expect(filter).toBeFocused();
  await expect(close).toBeVisible();
});
