# Browser contrast checks

The custom source analyser has been removed. `@axe-core/playwright` now checks
rendered colour contrast in Chromium against the real home page.

## Run

```sh
pnpm exec playwright install chromium   # once, and after Playwright upgrades
pnpm check:contrast
pnpm check:colour-system
pnpm check:contrast:report
```

Playwright starts `pnpm dev:styles` on port 3000, or reuses a running server
locally. In CI it requires its own server. To test another running development
or production server without starting one:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm check:contrast
```

Use `pnpm exec playwright install --with-deps chromium` when provisioning a
Linux CI runner. Commit the lockfile and use `pnpm install --frozen-lockfile`.

## Scope and repeatability

`e2e/home-contrast.spec.ts` runs the home page, workspace navigation menu,
focused process search and release-review dialog in **light and dark mode**.
The default neutral and state palettes are used; this is not an all-palette or
all-component audit. New visible elements in these states are scanned without
adding colour-pair registrations. New routes, hidden panels and interaction
states need explicit tests.

Each test has a fresh browser context. Viewport, locale, timezone, colour scheme
and reduced motion are fixed. Tests wait for expected UI and fonts; animations
and transitions are disabled for the scan. The LocatorJS and design-control
editor overlays are hidden because they are development tools, not app UI.
No application selectors are excluded from axe.

The tests use the application's recorded fictional home-page data. If that
fixture changes, update the relevant readiness assertions and interactions.
The theme is also set on the root so production builds, which omit development
preferences, can be tested. The suite does not test the theme picker itself.

## Results

Only axe's `color-contrast` rule is enabled. This is a contrast suite, not a
complete accessibility audit. The shared helper is `e2e/contrast.ts`.

- **Confirmed violations fail** the test, with no accepted baseline or allowlist.
- **Incomplete findings** produce console warnings and test annotations. They
  are never counted as passes. To fail on incomplete findings too:
  `CONTRAST_STRICT=1 pnpm check:contrast`.
- Every scan attaches the full axe JSON (including passes, violations,
  incomplete and inapplicable results) and a full-page screenshot.
- Failed tests also retain a Playwright trace. Open `pnpm check:contrast:report`
  for the HTML report. Reports live in ignored `playwright-report/` and
  `test-results/` directories.

Gradients, overlapping layers and other backgrounds axe cannot determine may
need manual review. Axe's rendered-content eligibility rules also mean this
is not a pixel-by-pixel audit of every visible glyph (including content marked
`aria-hidden`). A green run means no confirmed violations in the tested states;
it does not mean that all contrasts or all accessibility criteria passed.

A regression self-test first checks black text on white, then changes it to
low-contrast grey and asserts that axe detects the specific element. This uses
isolated browser content and does not modify application files.

## Extending coverage

Add a test that opens the state through normal UI controls, waits for its
content, and calls `expectContrast(page, testInfo, 'state-name')`. Both theme
projects run it automatically. Keep tests independent and use accessible
locators. Do not suppress findings to make a run green; fix the underlying
issue or report it explicitly.

Vitest excludes `e2e/`; browser tests run through `pnpm check:contrast` separately
from `pnpm test`.

`pnpm check:colour-system` is the focused colour-system regression layer. It
checks the neutral-family preference contract (URL, storage, blocked storage,
the design pane and reset), that every family paints its own ramp, that every
structural edge is opaque, that the primary action is flat under the pointer,
that muted ink never sits on the selected surface, that state text clears
4.5:1 on every surface it can sit on and white labels hold 3:1 on the accent
and commit faces -- measured as the page resolves them, since those are mixes
of Radix steps the ramp contracts do not cover -- and forced colours and
narrow layout.

The axe sweep covers home, the workspace menu, search, arrange mode, a
tooltip, the release review, and both example pages, which put every run
outcome and freshness side by side.

The current fictional home data has two confirmed findings that predate the
2026-09-24 colour refactor: the decorative `aria-hidden` pale wordmark and the
simulated commit-state label. The broader `check:contrast` suite continues to
fail on confirmed violations until those existing state treatments are resolved.
