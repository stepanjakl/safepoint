import { expect, test, type Page } from '@playwright/test';

import originalZinc from './fixtures/original-zinc-colours.json' with { type: 'json' };
import { scanContrast } from './contrast';

/* Every structural edge Opaque converts. Read as tokens rather than from a
   painted element because several are cast outside their box, where no single
   element's computed style holds them. */
const OPAQUE_EDGE_TOKENS = [
  '--sp-raised-edge',
  '--sp-floating-edge',
  '--sp-analysis-highlight',
  '--sp-notice-highlight',
  '--sp-keycap-highlight',
  '--sp-divider-etch',
  '--sp-card-etch',
  '--sp-sheet-break-etch',
  '--sp-sheet-row-etch',
  '--sp-sheet-row-etch-active',
  '--sp-notch-highlight',
  '--sp-tooltip-highlight',
  '--sp-accent-edge',
  '--sp-commit-edge',
] as const;

const EDGE_BASELINE_TOKENS = [
  '--sp-face-highlight-faint',
  '--sp-face-highlight-subtle',
  '--sp-face-highlight-medium',
  '--sp-face-highlight-strong',
  '--sp-face-highlight-solid',
  '--sp-rule-etch',
  '--sp-edge-inner',
  '--sp-notch-edge',
  '--sp-notch-highlight',
  '--sp-analysis-edge-top',
  '--sp-analysis-edge-bottom',
  '--sp-analysis-highlight',
  '--sp-keycap-ring',
  '--sp-keycap-highlight',
  '--sp-notice-edge-top',
  '--sp-notice-edge-bottom',
  '--sp-notice-highlight',
] as const;

async function waitForHome(page: Page) {
  await expect(
    page.getByRole('button', { name: 'Search processes', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function resolvedColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

async function resolvedColourMap(
  page: Page,
  tokens: readonly string[],
): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      tokens.map(async (token) => [token, await resolvedColour(page, token)]),
    ),
  );
}

function violationTargets(
  violations: { nodes: { target: readonly unknown[] }[] }[],
) {
  return violations
    .flatMap((violation) => violation.nodes.flatMap((node) => node.target))
    .map(String)
    .sort();
}

/* Subset, not equality: the contract is that Custom introduces nothing
   Original did not already have. Resolving one of Original's is an
   improvement, and asserting equality made that fail as though it were a
   regression. Anything Custom fixes is reported rather than enforced, since
   Original's own findings are not this task's to hold. */
function expectNoNewViolations(
  custom: string[],
  original: string[],
  label: string,
) {
  const introduced = custom.filter((target) => !original.includes(target));
  expect(introduced, `${label}: introduced by Custom`).toEqual([]);
  const resolved = original.filter((target) => !custom.includes(target));
  if (resolved.length > 0) {
    console.log(`${label}: Custom resolves ${resolved.join(', ')}`);
  }
}

function rgbChannels(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) {
    throw new Error(
      `Expected an rgb() colour, received ${JSON.stringify(value)}.`,
    );
  }
  return [channels[0]!, channels[1]!, channels[2]!, (channels[3] ?? 1) * 255];
}

function expectColourMapWithinTolerance(
  actual: Record<string, string>,
  expected: Record<string, string>,
  tolerance: number,
) {
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  for (const [token, expectedValue] of Object.entries(expected)) {
    const actualChannels = rgbChannels(actual[token]!);
    const expectedChannels = rgbChannels(expectedValue);
    for (const [index, channel] of expectedChannels.entries()) {
      expect(
        Math.abs(actualChannels[index]! - channel),
        `${token} channel ${index}: ${actual[token]} vs ${expectedValue}`,
      ).toBeLessThanOrEqual(tolerance);
    }
  }
}

async function openScenario(
  page: Page,
  system: 'original' | 'custom',
  scenario: 'workspace' | 'search' | 'review' | 'tooltip',
) {
  await page.goto(`/?colours=${system}&neutral=zinc`);
  await waitForHome(page);
  if (scenario === 'workspace') {
    await page
      .getByRole('button', { name: 'Back to workspace menu', exact: true })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Workspace' }),
    ).toBeVisible();
  } else if (scenario === 'search') {
    await page
      .getByRole('button', { name: 'Search processes', exact: true })
      .click();
    const search = page.getByRole('searchbox', { name: 'Search processes' });
    await search.fill('Promotion');
    await expect(
      page.getByRole('link', { name: 'Promotion release', exact: true }),
    ).toBeVisible();
  } else if (scenario === 'review') {
    await page.getByRole('button', { name: 'Review release' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByText('Loading item details…', { exact: true }),
    ).toBeHidden();
  } else {
    await page
      .getByRole('button', { name: 'Search processes', exact: true })
      .focus();
    await expect(page.locator('.app-tooltip')).toBeVisible();
  }
}

test('Original Zinc retains its captured computed colours', async ({
  page,
  colorScheme,
}) => {
  if (colorScheme !== 'light' && colorScheme !== 'dark') {
    throw new Error('A colour-system project must select light or dark.');
  }
  await page.goto(`/?colours=original&neutral=zinc`);
  await waitForHome(page);
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
  }, colorScheme);

  const actual = await page.evaluate((tokens) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context)
      throw new Error('Canvas 2D is required for colour normalization.');
    const probe = document.createElement('span');
    document.body.append(probe);
    const values: Record<string, string> = {};
    for (const token of tokens) {
      probe.style.color = `var(${token})`;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(
        0,
        0,
        1,
        1,
      ).data;
      values[token] =
        alpha === 255
          ? `rgb(${red} ${green} ${blue})`
          : `rgb(${red} ${green} ${blue} / ${(alpha / 255).toFixed(3)})`;
    }
    probe.remove();
    return values;
  }, Object.keys(originalZinc.themes[colorScheme]));

  expectColourMapWithinTolerance(
    actual,
    originalZinc.themes[colorScheme],
    originalZinc.source.channelTolerance,
  );
  await expect(page.locator('html')).not.toHaveAttribute('data-colour-system');
});

test('URL, storage, and in-session choices follow the preference contract', async ({
  page,
}) => {
  await page.goto('/?colours=custom&neutral=slate');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-colour-system',
    'custom',
  );

  const customCanvas = await resolvedColour(page, '--sp-canvas');
  await page.evaluate(() => {
    document.documentElement.dataset.neutral = 'stone';
  });
  expect(await resolvedColour(page, '--sp-canvas')).toBe(customCanvas);

  const controls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  const toggle = controls.getByRole('button', { name: 'Design controls' });
  await toggle.click();
  const colourSystem = controls.getByRole('combobox', {
    name: 'Colour system',
  });
  const neutrals = controls.getByRole('combobox', {
    name: 'Neutrals',
    exact: true,
  });
  await expect(colourSystem).toHaveValue('Custom');
  await expect(neutrals).toBeDisabled();
  await colourSystem.focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();

  await colourSystem.selectOption({ label: 'Original' });
  await expect(page.locator('html')).not.toHaveAttribute('data-colour-system');
  await expect(neutrals).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('safepoint.dev.colour-system')),
    )
    .toBe('original');

  await colourSystem.selectOption({ label: 'Custom' });
  await page.reload();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-colour-system',
    'custom',
  );

  await page.goto('/?colours=original');
  await waitForHome(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-colour-system');

  await page.goto('/?colours=invalid');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-colour-system',
    'custom',
  );

  const resetControls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  await resetControls.getByRole('button', { name: 'Design controls' }).click();
  await resetControls.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-colour-system');
});

test('a valid URL choice works when storage is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/?colours=custom&edges=opaque');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-colour-system',
    'custom',
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-edge-treatment',
    'opaque',
  );
});

test('edge treatment is Custom-only and preserves the Phase A baseline', async ({
  page,
}, testInfo) => {
  await page.goto('/?colours=custom');
  await waitForHome(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-edge-treatment');
  const existing = await resolvedColourMap(page, EDGE_BASELINE_TOKENS);
  await testInfo.attach('custom-existing-edge-baseline.json', {
    body: Buffer.from(JSON.stringify(existing, null, 2)),
    contentType: 'application/json',
  });
  await testInfo.attach('custom-existing-edge-baseline.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  const controls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  const toggle = controls.getByRole('button', { name: 'Design controls' });
  await toggle.click();
  const edgeTreatment = controls.getByRole('combobox', {
    name: 'Edge treatment',
  });
  await expect(edgeTreatment).toBeEnabled();
  await expect(edgeTreatment).toHaveValue('Existing');
  await edgeTreatment.focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await edgeTreatment.selectOption({ label: 'Opaque recipes' });
  await expect(page.locator('html')).toHaveAttribute(
    'data-edge-treatment',
    'opaque',
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('safepoint.dev.edge-treatment')),
    )
    .toBe('opaque');
  /* Opaque paints its own recipes now. It must differ from the baseline, and
     every structural edge it converts must be fully opaque -- an alpha channel
     surviving here is the whole point of the treatment being missed. */
  const opaque = await resolvedColourMap(page, EDGE_BASELINE_TOKENS);
  expect(opaque).not.toEqual(existing);
  const converted = await resolvedColourMap(page, OPAQUE_EDGE_TOKENS);
  for (const [token, value] of Object.entries(converted)) {
    const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
    const alpha = channels.length > 3 ? channels[3]! : 1;
    expect(alpha === 0 || alpha === 1, `${token}: ${value}`).toBe(true);
  }

  await page.reload();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-edge-treatment',
    'opaque',
  );

  /* Switching back restores the Phase A baseline exactly, which is what makes
     Existing a trustworthy control for the comparison. */
  await page.goto('/?colours=custom&edges=existing');
  await waitForHome(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-edge-treatment');
  expect(await resolvedColourMap(page, EDGE_BASELINE_TOKENS)).toEqual(existing);

  await page.goto('/?colours=custom&edges=invalid');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute(
    'data-edge-treatment',
    'opaque',
  );

  await page.goto('/?colours=original&edges=opaque');
  await waitForHome(page);
  const originalOpaque = await resolvedColourMap(page, EDGE_BASELINE_TOKENS);
  const originalControls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  await originalControls
    .getByRole('button', { name: 'Design controls' })
    .click();
  await expect(
    originalControls.getByRole('combobox', { name: 'Edge treatment' }),
  ).toBeDisabled();

  await page.goto('/?colours=original&edges=existing');
  await waitForHome(page);
  expect(await resolvedColourMap(page, EDGE_BASELINE_TOKENS)).toEqual(
    originalOpaque,
  );

  const resetControls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  await resetControls.getByRole('button', { name: 'Design controls' }).click();
  await resetControls.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-edge-treatment');
});

test('Custom paints the unified ramp and keeps Original untouched', async ({
  page,
}) => {
  const surfaces = [
    '--sp-canvas',
    '--sp-surface-primary',
    '--sp-surface-floating',
    '--sp-surface-inset',
    '--sp-text-primary',
  ];
  const read = async (system: string) => {
    await page.goto(`/?colours=${system}&neutral=zinc`);
    await waitForHome(page);
    return resolvedColourMap(page, surfaces);
  };

  const original = await read('original');
  await expect(page.locator('html')).not.toHaveAttribute('data-colour-system');
  const custom = await read('custom');
  await expect(page.locator('html')).toHaveAttribute(
    'data-colour-system',
    'custom',
  );

  for (const token of surfaces) {
    expect(custom[token], token).not.toBe(original[token]);
  }
  /* The inset had collapsed onto the canvas when its override was scoped to
     one system's value rather than to the attribute. */
  expect(custom['--sp-surface-inset']).not.toBe(custom['--sp-canvas']);

  const controls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  await controls.getByRole('button', { name: 'Design controls' }).click();
  await expect(
    controls.getByRole('combobox', { name: 'Colour system' }),
  ).toHaveValue('Custom');
  await expect(
    controls.getByRole('combobox', { name: 'Neutrals', exact: true }),
  ).toBeDisabled();
  await expect(
    controls.getByRole('combobox', { name: 'Edge treatment' }),
  ).toBeEnabled();
});

test('every Custom neutral family paints its own ramp', async ({ page }) => {
  const families = ['graphite', 'steel', 'clay', 'moss', 'ash'] as const;
  const canvases: Record<string, string> = {};
  for (const family of families) {
    await page.goto(`/?colours=custom&customNeutral=${family}`);
    await waitForHome(page);
    /* Graphite binds on the bare selector, so it needs no attribute; the
       others must set one or they would silently paint the default. */
    if (family === 'graphite') {
      await expect(page.locator('html')).not.toHaveAttribute(
        'data-custom-neutral',
      );
    } else {
      await expect(page.locator('html')).toHaveAttribute(
        'data-custom-neutral',
        family,
      );
    }
    canvases[family] = await resolvedColour(page, '--sp-canvas');
  }
  expect(new Set(Object.values(canvases)).size, JSON.stringify(canvases)).toBe(
    families.length,
  );

  const controls = page.getByRole('region', {
    name: 'Design and motion controls',
  });
  await controls.getByRole('button', { name: 'Design controls' }).click();
  const picker = controls.getByRole('combobox', { name: 'Custom neutrals' });
  await expect(picker).toBeEnabled();
  await expect(picker).toHaveValue('Ash');

  await page.goto('/?colours=original');
  await waitForHome(page);
  await controls.getByRole('button', { name: 'Design controls' }).click();
  await expect(
    controls.getByRole('combobox', { name: 'Custom neutrals' }),
  ).toBeDisabled();
});

test('muted ink never paints on a selected surface', async ({ page }) => {
  /* The palette leaves --sp-text-muted below AA on --sp-surface-selected in
     light, which is safe only because every consumer of that fill swaps its
     ink to primary in the same rule. Four hand-written class pairs hold that
     invariant and nothing checked it, so a fifth consumer could quietly ship
     unreadable text. */
  await openScenario(page, 'custom', 'review');
  const result = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const resolve = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const selected = resolve('--sp-surface-selected');
    const muted = resolve('--sp-text-muted');
    probe.remove();

    const grounds = [...document.querySelectorAll<HTMLElement>('*')].filter(
      (element) => getComputedStyle(element).backgroundColor === selected,
    );
    const offenders: string[] = [];
    for (const ground of grounds) {
      for (const node of [
        ground,
        ...ground.querySelectorAll<HTMLElement>('*'),
      ]) {
        const text = [...node.childNodes].some(
          (child) => child.nodeType === 3 && child.textContent?.trim(),
        );
        if (text && getComputedStyle(node).color === muted) {
          offenders.push(
            `${node.tagName.toLowerCase()}.${node.className}: ${node.textContent?.trim().slice(0, 40)}`,
          );
        }
      }
    }
    return { grounds: grounds.length, offenders, selected, muted };
  });

  expect(
    result.grounds,
    'no element painted the selected fill, so this proved nothing',
  ).toBeGreaterThan(0);
  expect(result.offenders).toEqual([]);
});

test('the workbench exposes every generated step of every revision', async ({
  page,
}) => {
  await page.goto('/workbench');
  await expect(
    page.getByRole('heading', { name: '41-step workbench', exact: true }),
  ).toBeVisible();
  /* Named by revision rather than listed here, so adding or retiring a
     candidate curve does not need this test edited to stay honest. */
  for (const mode of ['light', 'dark'] as const) {
    const ramps = page.getByRole('list', { name: new RegExp(`, ${mode}$`) });
    const count = await ramps.count();
    expect(count, `${mode} ramps`).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const ramp = ramps.nth(index);
      await expect(ramp.getByRole('listitem')).toHaveCount(41);
      const colours = await ramp
        .getByRole('button')
        .evaluateAll((steps) =>
          [steps[0], steps[20], steps[40]].map(
            (step) => getComputedStyle(step!).backgroundColor,
          ),
        );
      expect(new Set(colours).size).toBe(3);
      expect(colours).not.toContain('rgba(0, 0, 0, 0)');
    }
  }
});

test('workbench step measurements are reachable by keyboard', async ({
  page,
}) => {
  await page.goto('/workbench');
  const ramp = page.getByRole('list', { name: new RegExp(', light$') }).first();
  const step = ramp.getByRole('button').nth(8);
  await step.focus();
  await expect(step).toBeFocused();
  await expect(step).toHaveAttribute('aria-pressed', 'true');
  /* The panel is the point of the page: focus alone has to reveal it, not
     only a pointer. */
  await expect(
    page.getByText('OKLCH L', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('rel. luminance', { exact: true }).first(),
  ).toBeVisible();
});

test('Custom does not introduce a new axe contrast violation', async ({
  page,
}, testInfo) => {
  await page.goto('/?colours=original&neutral=zinc');
  await waitForHome(page);
  const original = await scanContrast(page, testInfo, 'original-home-baseline');

  await page.goto('/?colours=custom');
  await waitForHome(page);
  const custom = await scanContrast(page, testInfo, 'custom-home');

  expectNoNewViolations(
    violationTargets(custom.violations),
    violationTargets(original.violations),
    'home',
  );
});

test('Custom preserves contrast findings in representative real states', async ({
  page,
}, testInfo) => {
  for (const scenario of [
    'workspace',
    'search',
    'review',
    'tooltip',
  ] as const) {
    await openScenario(page, 'original', scenario);
    const original = await scanContrast(
      page,
      testInfo,
      `original-${scenario}-baseline`,
    );
    await openScenario(page, 'custom', scenario);
    const custom = await scanContrast(page, testInfo, `custom-${scenario}`);
    expectNoNewViolations(
      violationTargets(custom.violations),
      violationTargets(original.violations),
      scenario,
    );
  }
});

test('Custom remains usable in forced colours and at a narrow viewport', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?colours=custom');
  await waitForHome(page);
  const search = page.getByRole('button', {
    name: 'Search processes',
    exact: true,
  });
  await search.focus();
  await expect(search).toBeFocused();
  const outline = await search.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe('none');
  expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

  await page.emulateMedia({ forcedColors: 'none' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await waitForHome(page);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
