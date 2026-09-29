import { expect, test, type Page } from '@playwright/test';

/* Every structural edge is a ramp step, never white or black at a
   percentage. Read as tokens rather than from a painted element because
   several are cast outside their box, where no single element's computed
   style holds them. */
const OPAQUE_EDGE_TOKENS = [
  '--sp-raised-edge',
  '--sp-floating-edge',
  '--sp-raised-ring',
  '--sp-floating-ring',
  '--sp-recessed-ring',
  '--sp-recessed-edge',
  '--sp-notice-highlight',
  '--sp-keycap-highlight',
  '--sp-divider-etch',
  '--sp-card-etch',
  '--sp-sheet-break-etch',
  '--sp-sheet-row-etch',
  '--sp-sheet-row-etch-active',
  '--sp-notch-highlight',
  '--sp-tooltip-highlight',
  '--sp-enclosure-edge',
  '--sp-accent-edge',
  '--sp-commit-drag-edge',
] as const;

const FAMILIES = ['graphite', 'steel', 'clay', 'moss', 'ash'] as const;

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

function designControls(page: Page) {
  return page.getByRole('region', { name: 'Design and motion controls' });
}

test('the neutral family follows the preference contract', async ({ page }) => {
  await page.goto('/examples/promotion?neutral=steel');
  await waitForHome(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-neutral', 'steel');
  const steel = await resolvedColour(page, '--sp-canvas');

  const controls = designControls(page);
  const toggle = controls.getByRole('button', { name: 'Design controls' });
  await toggle.click();
  const neutrals = controls.getByRole('combobox', {
    name: 'Neutrals',
    exact: true,
  });
  await expect(neutrals).toHaveValue('Steel');
  await neutrals.focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();

  await neutrals.selectOption({ label: 'Clay' });
  await expect(html).toHaveAttribute('data-neutral', 'clay');
  expect(await resolvedColour(page, '--sp-canvas')).not.toBe(steel);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('safepoint.dev.neutral')),
    )
    .toBe('clay');

  /* A stored choice survives a reload; an invalid URL value falls through
     to it -- including a palette name from the retired Tailwind neutrals. */
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  await expect(html).toHaveAttribute('data-neutral', 'clay');
  await page.goto('/examples/promotion?neutral=zinc');
  await waitForHome(page);
  await expect(html).toHaveAttribute('data-neutral', 'clay');

  /* Graphite is the default and binds on :root, so it is the absence of the
     attribute rather than a value of it. */
  await controls.getByRole('button', { name: 'Design controls' }).click();
  await controls.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(html).not.toHaveAttribute('data-neutral');
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
  await page.goto('/examples/promotion?neutral=moss');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-neutral', 'moss');
});

test('every neutral family paints its own ramp', async ({ page }) => {
  const canvases: Record<string, string> = {};
  for (const family of FAMILIES) {
    await page.goto(`/examples/promotion?neutral=${family}`);
    await waitForHome(page);
    canvases[family] = await resolvedColour(page, '--sp-canvas');
  }
  expect(new Set(Object.values(canvases)).size, JSON.stringify(canvases)).toBe(
    FAMILIES.length,
  );
});

test('every structural edge is opaque', async ({ page }) => {
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  for (const token of OPAQUE_EDGE_TOKENS) {
    const value = await resolvedColour(page, token);
    const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
    /* Transparent is allowed: it is where a face at step 0 has no lighter
       step to lift it with. A partial alpha is what this refactor removed. */
    const alpha = value.includes('/') ? channels.at(-1)! : 1;
    expect(alpha === 0 || alpha === 1, `${token}: ${value}`).toBe(true);
  }
});

/* A surface-following role (hover, rules, fields...) resolves against the
   nearest ground-* above it, so a region painted with a pane or floating face
   but no ground hands its content the canvas's values. That is how the review
   dialog lost its pane-tuned rules; this catches the next one. */
test('every painted pane or floating region hands its content its ground', async ({
  page,
}) => {
  const states: [string, (page: Page) => Promise<void>][] = [
    ['home', async () => {}],
    [
      'review',
      async (page) => {
        await page.getByRole('button', { name: 'Review release' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    ],
    [
      'input detail',
      async (page) => {
        await page
          .getByRole('button', { name: /^Inputs/ })
          .first()
          .click();
        await page
          .locator('.process-panels')
          .getByRole('button', { name: /^Supply position/ })
          .click();
        await expect(page.locator('.drawer-aside')).toBeVisible();
      },
    ],
  ];
  for (const [name, arrive] of states) {
    await page.goto('/examples/promotion?run=run-104');
    await waitForHome(page);
    await arrive(page);
    const orphans = await page.evaluate(() => {
      /* By the utility that paints the face, not by colour: another role can
         land on the same step (a field on the canvas is the pane's colour). */
      const faces: [string, string][] = [
        ['bg-surface-primary', '.ground-raised, .surface-raised'],
        ['bg-surface-floating', '.ground-floating, .surface-floating'],
      ];
      const found: string[] = [];
      for (const [paint, grounds] of faces) {
        for (const element of document.querySelectorAll(`.${paint}`)) {
          if (!element.children.length || !element.getClientRects().length)
            continue;
          const ground = element.closest(
            '.ground-raised, .ground-floating, .surface-raised, .surface-floating',
          );
          if (ground?.matches(grounds)) continue;
          found.push(
            `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 4).join('.')}`,
          );
        }
      }
      return found;
    });
    expect(orphans, `${name}: painted without a ground`).toEqual([]);
  }
});

test('the primary action is flat under the pointer', async ({ page }) => {
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  const button = page.getByRole('button', { name: 'Review release' });
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  /* Face, ring and highlight take one colour, so the button reads as a single
     fill. Polled, because control-face animates its stops there. */
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return new Set(
          [
            '--control-face-top',
            '--control-face-bottom',
            '--control-ring-top',
            '--control-ring-bottom',
            '--control-highlight',
          ].map((name) => style.getPropertyValue(name).trim()),
        ).size;
      }),
    )
    .toBe(1);
});

test('muted ink never paints on a selected surface', async ({ page }) => {
  /* The palette leaves --sp-text-muted below AA on --sp-surface-selected in
     light, which is safe only because every consumer of that fill swaps its
     ink to primary in the same rule. */
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  await page.getByRole('button', { name: 'Review release' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText('Loading item details…', { exact: true }),
  ).toBeHidden();
  const result = await page.evaluate(() => {
    /* The selected fill follows the surface it is inside, so it is resolved
       in each element's own ground rather than once at the root. */
    const resolveIn = (context: Element, token: string) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      context.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const muted = resolveIn(document.body, '--sp-text-muted');
    const selectedIn = new Map<Element, string>();
    const selectedFor = (element: Element) => {
      const ground =
        element.parentElement?.closest(
          '.ground-raised, .ground-floating, .surface-raised, .surface-floating, .surface-recessed',
        ) ?? document.body;
      if (!selectedIn.has(ground))
        selectedIn.set(ground, resolveIn(ground, '--sp-surface-selected'));
      return selectedIn.get(ground);
    };

    const grounds = [
      ...document.querySelectorAll<HTMLElement>('body *'),
    ].filter(
      (element) =>
        getComputedStyle(element).backgroundColor === selectedFor(element),
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
    return { grounds: grounds.length, offenders };
  });

  expect(
    result.grounds,
    'no element painted the selected fill, so this proved nothing',
  ).toBeGreaterThan(0);
  expect(result.offenders).toEqual([]);
});

/* Coloured text and white labels, measured as the page resolves them. The
   colour contracts in scripts/colour-theme cover the neutral ramp only; these
   are mixes of Radix steps, so they are read here rather than restated. */
async function contrastOf(page: Page, pairs: [string, string][]) {
  return page.evaluate((list) => {
    const canvas = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
    const probe = document.createElement('span');
    document.body.append(probe);
    const rgb = (token: string) => {
      probe.style.color = token.startsWith('--') ? `var(${token})` : token;
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = getComputedStyle(probe).color;
      canvas.fillRect(0, 0, 1, 1);
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const result = list.map(([fg, bg]) => {
      const [a, b] = [luminance(rgb(fg)), luminance(rgb(bg))];
      return `${fg} on ${bg}: ${((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)}`;
    });
    probe.remove();
    return result;
  }, pairs);
}

const ratio = (line: string) => {
  const value = Number(line.split(': ').at(-1));
  // A value the page could not resolve reads as no contrast, never a pass.
  return Number.isFinite(value) ? value : 0;
};

test('state text clears AA on every surface it can sit on', async ({
  page,
}) => {
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  const states = [
    'advisory',
    'verified',
    'caution',
    'decision',
    'blocked',
    'destructive',
  ];
  const grounds = [
    '--sp-surface-floating',
    '--sp-surface-primary',
    '--sp-canvas',
    '--sp-sheet-band',
    '--sp-surface-inset',
  ];
  const measured = await contrastOf(
    page,
    states.flatMap((state) =>
      grounds.map(
        (ground) => [`--sp-state-${state}`, ground] as [string, string],
      ),
    ),
  );
  const failing = measured.filter((line) => ratio(line) < 4.5);
  expect(failing, measured.join('\n')).toEqual([]);
});

test('white labels hold their measured floor on the coloured faces', async ({
  page,
}) => {
  await page.goto('/examples/promotion?run=run-104');
  await waitForHome(page);
  /* The glowing top stop is a chosen trade -- Radix fitted to Tailwind's cyan
     and teal, about 1.9:1 in light -- so it is not held here. The bottom stop,
     the flat Save-order face and the flat hovers hold the non-text floor. */
  const measured = await contrastOf(page, [
    ['white', '--sp-accent-face-bottom'],
    ['white', '--sp-accent-hover'],
    ['white', '--sp-commit-face'],
    ['white', '--sp-commit-hover'],
  ]);
  const failing = measured.filter((line) => ratio(line) < 3);
  expect(failing, measured.join('\n')).toEqual([]);
});

test('usable in forced colours and at a narrow viewport', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/examples/promotion?run=run-104');
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
