/*
  The rail measurement, shared by the command-line checker
  (scripts/check-rail-alignment.ts) and the Playwright test (e2e/rail.spec.ts).
  It reads the axes from the live `.rail-axis` element, so the stylesheet stays
  the only place an axis is defined.
*/

/*
  Boxes that are deliberately off-axis, and why.

  `observed` is what the offset measured when the entry was written. An entry
  that merely silenced an element would rot into a blanket mute; recording the
  number instead means the element is still watched -- it is reported again the
  moment it moves further than `drift` from the offset that was signed off.
*/
export type Allowance = {
  selector: string;
  reason: string;
  observed: number;
  drift?: number;
};

export const ALLOWLIST: Allowance[] = [
  {
    selector: 'button[aria-label="Search processes"]',
    reason:
      'The inner button of a side-by-side pair. Only the trailing button of a group can sit on an axis; this one is a gap and a button width inside it.',
    // Carried over from Add process, which held this slot until it moved to
    // the Processes title; the pair's geometry is unchanged.
    observed: -24,
  },
];

export const DRIFT_DEFAULT = 0.5;

/* How each level of the sidebar is reached from the one before it. */
export const LEVEL_OPENERS = {
  processes: null,
  search: 'button[aria-label="Search processes"]',
  arrange: '[aria-label="Arrange processes"]',
  workspace: '[aria-label="Back to workspace menu"]',
} as const;

export type Axis = { name: string; centre: number; probe?: number };
export type Mark = {
  label: string;
  size: number;
  direction: 'x' | 'y';
  centre: number;
  axis: string;
  delta: number;
  verdict: 'ok' | 'warn' | 'fail' | 'allowed';
  note?: string;
};
export type BorderFinding = {
  where: string;
  declared: string;
  property: string;
};
export type Report = {
  error?: string;
  axes: Axis[];
  marks: Mark[];
  borders: BorderFinding[];
  skippedSheets: number;
};

/*
  Runs inside the page. Serialised with toString(), so it may not close over
  anything here -- everything it needs arrives as its one argument. It is a real
  typed function rather than a string so that `pnpm typecheck` reads it; the DOM
  lib is already in tsconfig.
*/
export function measureInPage(args: {
  tolerance: number;
  allowlist: Allowance[];
  driftDefault: number;
  selfTest: boolean;
  scale: number;
}): Report {
  const empty: Report = { axes: [], marks: [], borders: [], skippedSheets: 0 };

  const axisEl = document.querySelector('.rail-axis');
  if (!axisEl) return { ...empty, error: 'no .rail-axis element on the page' };
  const axisStyle = getComputedStyle(axisEl);
  if (axisStyle.display === 'none') {
    return {
      ...empty,
      error:
        'the guides are switched off. They are development-only — is this a production build?',
    };
  }

  const area = axisEl.getBoundingClientRect();

  /* Split a comma-separated computed value without splitting inside calc(). */
  const layers = (value: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        out.push(current.trim());
        current = '';
      } else current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  };

  const px = (value: string, base: number): number | null => {
    const trimmed = value.trim();
    if (trimmed.endsWith('px')) return parseFloat(trimmed);
    if (trimmed.endsWith('%')) return (parseFloat(trimmed) / 100) * base;
    return null;
  };

  const paintedEdge = (
    raw: string,
    extent: number,
    lineSize: number,
  ): number | null => {
    const keyword = raw.match(/^(left|right|top|bottom)\s+(.+)$/);
    if (keyword) {
      const offset = px(keyword[2] ?? '', extent - lineSize);
      if (offset === null) return null;
      return keyword[1] === 'left' || keyword[1] === 'top'
        ? offset
        : extent - lineSize - offset;
    }
    if (raw === 'center') return (extent - lineSize) / 2;
    if (raw.startsWith('calc(')) {
      const match = raw.slice(5, -1).match(/^([\d.]+)%\s*([+-])\s*([\d.]+)px$/);
      if (!match) return null;
      const pct = (parseFloat(match[1] ?? '0') / 100) * (extent - lineSize);
      const len = parseFloat(match[3] ?? '0');
      return match[2] === '+' ? pct + len : pct - len;
    }
    return px(raw, extent - lineSize);
  };

  const positions = layers(axisStyle.backgroundPositionX);
  const sizes = layers(axisStyle.backgroundSize);
  const images = layers(axisStyle.backgroundImage);
  if (positions.length !== images.length || sizes.length !== images.length) {
    return {
      ...empty,
      error: `background layer counts disagree (${images.length} images, ${positions.length} positions, ${sizes.length} sizes)`,
    };
  }

  const axes: Axis[] = [];
  for (let i = 0; i < images.length; i += 1) {
    const sizeX = (sizes[i] ?? '').split(/\s+/)[0] ?? '';
    const width = px(sizeX, area.width);
    if (width === null) {
      return {
        ...empty,
        error: `layer ${i} has a background-size of "${sizes[i]}" — a guide line must have an explicit width for its centre to mean anything`,
      };
    }
    /*
      Where the painted line's LEFT EDGE sits, relative to the positioning area.
      The centre follows below. Reading the position value as if it were the
      centre is the very bug this tool was built to catch: a 1px line placed at
      31 paints across 31..32, so its centre is 31.5.
    */
    const leftEdge = paintedEdge(
      (positions[i] ?? '').trim(),
      area.width,
      width,
    );
    if (leftEdge === null) {
      return {
        ...empty,
        error: `could not read background-position "${positions[i]}" on layer ${i}`,
      };
    }
    axes.push({ name: `layer-${i}`, centre: area.left + leftEdge + width / 2 });
  }

  // Name them by where they ended up, not by the order they were declared.
  axes.sort((a, b) => a.centre - b.centre);
  const names =
    axes.length === 4
      ? ['rail-left', 'end-left', 'end-right', 'rail-right']
      : axes.length === 3
        ? ['rail-left', 'end-right', 'rail-right']
        : axes.map((_, i) => `axis-${i}`);
  axes.forEach((axis, i) => {
    axis.name = names[i] ?? `axis-${i}`;
  });

  /*
    A second derivation that shares no code with the first: let the browser
    resolve the same custom property into a real width. If the two agree the
    parser above is honest.
  */
  if (args.selfTest) {
    for (const [property, matchName] of [
      ['--rail-axis-rail', 'rail-left'],
      ['--rail-axis-end', 'end-left'],
      ['--rail-axis-end', 'end-right'],
      ['--rail-axis-rail', 'rail-right'],
    ] as const) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;height:0;width:var(${property})`;
      axisEl.appendChild(probe);
      const measured = probe.getBoundingClientRect().width;
      probe.remove();
      const axis = axes.find((a) => a.name === matchName);
      if (axis) {
        axis.probe = matchName.endsWith('-left')
          ? area.left + measured + 0.5
          : area.right - measured - 0.5;
      }
    }
  }

  /* ------------------------------------------------------------- the marks */

  const marks: Mark[] = [];
  const all = Array.from(document.querySelectorAll('.rail-mark'));
  for (const el of all) {
    /*
      Both panes of the menu are in the DOM at once; the one that is off screen
      is translated and inert, and measuring it would report nonsense. Keyed on
      `inert` alone, not on aria-hidden: plenty of marked boxes are decorative
      and hidden from the accessibility tree -- the brand mark is one -- and
      excluding those would quietly drop the elements most worth checking.
    */
    if (el.closest('[inert]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right < area.left || rect.left > area.right) continue;

    const centre = rect.left + rect.width / 2;
    let nearest = axes[0];
    if (!nearest) continue;
    for (const axis of axes) {
      if (Math.abs(centre - axis.centre) < Math.abs(centre - nearest.centre))
        nearest = axis;
    }
    const delta = centre - nearest.centre;

    /*
      Most marked boxes are wrappers with nothing to say for themselves, so walk
      out until something names them -- their own label, a labelled ancestor, or
      the screen-reader text a control carries instead of one. A column of
      `span.inline-grid` would not tell the reader which icon had moved.
    */
    let describe = '';
    let node: Element | null = el;
    for (let hop = 0; hop < 4 && node && !describe; hop += 1) {
      describe = (
        node.getAttribute('aria-label') ??
        node.getAttribute('title') ??
        node.querySelector('.sr-only')?.textContent ??
        (node.tagName === 'BUTTON' || node.tagName === 'A'
          ? (node.textContent ?? '')
          : '')
      ).trim();
      node = node.parentElement;
    }
    if (!describe) describe = `${el.tagName.toLowerCase()} ${rect.width}px`;
    describe = describe.slice(0, 26);

    const allowed = args.allowlist.find(
      (entry) =>
        el.matches(entry.selector) || el.closest(entry.selector) !== null,
    );
    if (allowed) {
      const drift = allowed.drift ?? args.driftDefault;
      const moved = Math.abs(delta - allowed.observed) > drift;
      marks.push({
        label: describe,
        size: rect.width,
        direction: 'x',
        centre,
        axis: nearest.name,
        delta,
        verdict: moved ? 'warn' : 'allowed',
        note: moved
          ? `allowed at ${allowed.observed.toFixed(2)} but now ${delta.toFixed(2)} — has it moved on purpose?`
          : allowed.reason,
      });
      continue;
    }

    const odd = rect.width % 2 !== 0;
    if (Math.abs(delta) <= args.tolerance) {
      marks.push({
        label: describe,
        size: rect.width,
        direction: 'x',
        centre,
        axis: nearest.name,
        delta,
        verdict: 'ok',
      });
    } else if (odd && Math.abs(delta) <= 0.5) {
      // Not a mistake so much as arithmetic: a box of odd width centres on a
      // half pixel wherever it is put, so it can never sit on an integer axis.
      marks.push({
        label: describe,
        size: rect.width,
        direction: 'x',
        centre,
        axis: nearest.name,
        delta,
        verdict: 'warn',
        note: `odd width — ${Math.ceil(rect.width / 2) * 2}px would land it exactly`,
      });
    } else {
      marks.push({
        label: describe,
        size: rect.width,
        direction: 'x',
        centre,
        axis: nearest.name,
        delta,
        verdict: 'fail',
      });
    }
  }

  /* Horizontal guides share the shell's header frame, mirrored at the foot. */
  const shellAxis = document.querySelector('.shell-axis');
  if (!shellAxis)
    return { ...empty, error: 'no .shell-axis element on the page' };
  const shellStyle = getComputedStyle(shellAxis);
  const shellArea = shellAxis.getBoundingClientRect();
  if (shellStyle.display === 'none') {
    return {
      ...empty,
      error: 'the horizontal guides are not visible at this width',
    };
  }
  const yPositions = layers(shellStyle.backgroundPositionY);
  const ySizes = layers(shellStyle.backgroundSize);
  const yImages = layers(shellStyle.backgroundImage);
  if (yImages.length !== 2 || yPositions.length !== 2 || ySizes.length !== 2) {
    return {
      ...empty,
      error: 'expected header and profile background guide layers',
    };
  }
  const horizontal: Axis[] = [];
  for (let i = 0; i < yImages.length; i += 1) {
    const height = px(
      (ySizes[i] ?? '').split(/\s+/)[1] ?? '',
      shellArea.height,
    );
    const top =
      height === null
        ? null
        : paintedEdge((yPositions[i] ?? '').trim(), shellArea.height, height);
    if (height === null || top === null) {
      return { ...empty, error: `could not read horizontal guide layer ${i}` };
    }
    horizontal.push({ name: '', centre: shellArea.top + top + height / 2 });
  }
  horizontal.sort((a, b) => a.centre - b.centre);
  horizontal.forEach((axis, index) => {
    axis.name = index === 0 ? 'header' : 'profile';
    if (args.selfTest) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;height:var(--shell-axis-width);width:0;${index === 0 ? 'top' : 'bottom'}:var(--shell-axis-offset)`;
      shellAxis.appendChild(probe);
      const rect = probe.getBoundingClientRect();
      axis.probe = rect.top + rect.height / 2;
      probe.remove();
    }
  });
  axes.push(...horizontal);

  for (const [name, selector] of [
    [
      'header',
      '.shell-header-row [aria-label="Safepoint"], .shell-header-row button, .process-header input[aria-label="Process name"], .process-header button',
    ],
    [
      'profile',
      '.shell-profile-row [role="img"], .shell-profile-row p, .shell-profile-row button',
    ],
  ]) {
    const axis = horizontal.find((axis) => axis.name === name);
    if (!axis) continue;
    for (const el of document.querySelectorAll(selector ?? '')) {
      if (el.closest('[inert]')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const centre = rect.top + rect.height / 2;
      const delta = centre - axis.centre;
      marks.push({
        label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
          .trim()
          .slice(0, 26),
        size: rect.height,
        direction: 'y',
        centre,
        axis: axis.name,
        delta,
        verdict: Math.abs(delta) <= args.tolerance ? 'ok' : 'fail',
      });
    }
  }

  /* --------------------------------------------------- fractional borders */

  const borders: BorderFinding[] = [];
  let skippedSheets = 0;
  const fractional = /(?:^|[\s(])(\d*\.\d+)(px|rem)/;
  const widthProperties = [
    'border-width',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-inline-start-width',
    'border-inline-end-width',
    'border-block-start-width',
    'border-block-end-width',
  ];
  const visit = (rules: CSSRuleList, sheetName: string) => {
    for (const rule of Array.from(rules)) {
      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules) visit(grouping.cssRules, sheetName);
      const style = (rule as CSSStyleRule).style;
      const selector = (rule as CSSStyleRule).selectorText;
      if (!style || !selector) continue;
      /*
        One declaration, reported once. A bracketed border width compiles to
        the shorthand and all four longhands, and five lines saying the same
        thing about one rule is the noise that gets a check switched off.
      */
      for (const property of ['border', ...widthProperties]) {
        const value = style.getPropertyValue(property);
        const found = value ? value.match(fractional) : null;
        if (!found) continue;
        /*
          Chrome snaps a border to whole device pixels, so a width that is
          already a whole number of them at this scale lays out as declared --
          1.5px at 2x is three device pixels and nothing is lost.
        */
        const rootSize = parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        );
        const declared =
          parseFloat(found[1] ?? '0') * (found[2] === 'rem' ? rootSize : 1);
        if (Number.isInteger(declared * args.scale)) continue;
        /*
          Only if the rule is actually on the page. Tailwind scans every source
          file, so naming an arbitrary utility anywhere -- a comment, a design
          doc -- is enough to conjure the rule; this very file did that and the
          checker reported its own prose. A rule nothing matches is not a bug.
        */
        let live = false;
        try {
          live = document.querySelector(selector) !== null;
        } catch {
          live = false;
        }
        if (!live) break;
        const where = `${sheetName} ${selector}`;
        if (!borders.some((found) => found.where === where)) {
          borders.push({ where, declared: value.trim(), property });
        }
        break;
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Turbopack's chunk names arrive percent-encoded and are noise beside the
      // selector, which is the part anyone actually acts on.
      const name = decodeURIComponent(sheet.href ?? '')
        .split('/')
        .pop();
      visit(sheet.cssRules, name && name.length < 40 ? name : 'stylesheet');
    } catch {
      skippedSheets += 1;
    }
  }

  return { axes, marks, borders, skippedSheets };
}
