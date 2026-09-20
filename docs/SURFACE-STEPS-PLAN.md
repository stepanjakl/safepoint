# Custom colour system and surface steps plan

Status: Phase A and the Phase B1 comparison infrastructure are complete; opaque
surface recipes have not started. Code inspected 2026-09-18 and rechecked
against commit `9e65560` on 2026-09-19; sequence revised following the user's
direction, plan review, and decision to retain a focused ramp workbench.

## Outcome

**Build the custom colour system first. Highlight, divider, and tooltip recipe
remapping is a subsequent phase, not part of the first implementation.**

Deliver one art-directed neutral family with separately tuned light and dark
scales, each containing 41 fixed steps, 0–1000 inclusive in increments of 25.
Generate these from a small configuration, define explicit semantic colour and
contrast relationships, and expose an **Original / Custom** comparison in Design
controls. Original remains the default. Keep Tailwind for styling and existing
accent/status palettes initially; validate their use against the custom surfaces.

Phase A ends with a reproducible, reviewable first theme and its verification
report. Do not automatically continue into Phase B or remove the original system.
The later edge experiment must compare against the established custom theme so
palette changes and highlight changes can be evaluated independently.

## Baseline and relevant code

Preserve the working tree, not just HEAD. The files that were modified during the
first inspection are now part of commit `9e65560`; at the 2026-09-19 recheck only
this plan was untracked. Recheck before implementation and do not revert,
overwrite, or attribute later user changes to this task.

| File                                                           | Relevant responsibility                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/tokens/roles.css`                                         | Surface ladder, already-opaque rule strengths, translucent enclosure edge, notch aliases                                                              |
| `app/tokens/faces.css`                                         | Five opacity-based highlight strengths; analysis, keycap, notice, and menu recipes                                                                    |
| `app/tokens/ramps.css`                                         | Shared neutral ramp, including intermediate steps and palette rebinding                                                                               |
| `app/tokens/theme.css`                                         | Tailwind role aliases; inset highlights and separator shadows                                                                                         |
| `app/globals.css`                                              | Registered control stops; `control-face`; `surface-raised`, `surface-floating`, `surface-analysis`, `surface-recessed`, `surface-notice`; `enclosure` |
| `app/components.css`                                           | Tooltip box/arrow, notch, sheet row edges, menu state overrides                                                                                       |
| `components/dev/design-preferences.ts`                         | HTML dataset preferences, persistence, subscriptions                                                                                                  |
| `components/dev/design-preferences-script.tsx`                 | Development-only preference restoration before first paint; URL overrides                                                                             |
| `components/dev/design-pane.ts`                                | Appearance controls and Reset defaults                                                                                                                |
| `components/dev/design-controls.tsx`                           | Development-only Tweakpane loading and keyboard access                                                                                                |
| `components/ui/tooltip.tsx`                                    | Shared tooltip implementation and arrow markup                                                                                                        |
| `components/app-shell/process-menu.tsx`                        | Menu separator pairings and badge states                                                                                                              |
| `components/app-shell/process-header.tsx`, `process-sheet.tsx` | Panel divider consumers                                                                                                                               |
| `components/review/release-card.tsx`                           | Solid separator-shadow consumers                                                                                                                      |
| `e2e/home-contrast.spec.ts`, `playwright.config.ts`            | Contrast checks, neutral palette coverage, light/dark projects                                                                                        |

The current surface steps are:

| Role     | Light | Dark |
| -------- | ----- | ---- |
| Canvas   | 200   | 900  |
| Inset    | 200   | 950  |
| Primary  | 100   | 850  |
| Floating | 50    | 775  |
| Control  | 50    | 750  |

These are neutral-ramp indices, not measured contrast or a universal elevation
formula. Analysis has its own dark face at 875. Hover, selected, disabled, and
gradient controls are separate recipes; do not force them into one elevation
ordering.

Highlights currently use white alpha in light mode and black alpha in dark mode.
`--sp-rule-etch` aliases a face highlight despite painting on several backgrounds.
Tooltip box and arrow already share three local colour variables, which is the
right arrangement to preserve. The enclosure edge also paints a fading gradient:
replacing its colour alone does not make the whole gradient opaque.

Treat the live token definitions as the baseline: parts of the styling guide's
dark-tuning prose differ from current values. The unused
`components/dev/dark-hierarchy-preview.ts` is not an active comparison mechanism;
do not revive its unrelated overrides or clean it up as part of this task.

## Preliminary cleanup: reduce the obsolete workbench

Remove the old workbench's seven gallery components under `components/dev/` after
confirming they have no other importers, then recursively remove helper modules,
assets, and dependencies only when another reference check proves they became
orphaned. Replace the route with one development-only, data-driven comparison of
generated 41-step themes. It is a primitive ramp diagnostic, not a component
gallery or theme editor. Verify the cleanup with a reference search, formatting of
touched files, lint of touched source, and project typecheck before beginning
Phase A.

This cleanup removes the only active nested `data-theme` previews. The new custom
colour system is root-scoped only. Do not add support or tests for nested
`data-theme`, nested `data-neutral`, or nested colour-system switching. Keep the
existing root `data-theme` and `data-neutral` preferences: Theme still selects the
application theme, and Neutrals still selects Original's palette.

## Phase A: build the colour system first

### A1. Inventory relationships and capture the baseline

Read the current generators, styling guide, token checker, and contrast test
helpers before editing. Reuse their conventions where they fit; do not introduce
a second independent token hierarchy or a runtime colour engine. Relevant
additional starting points are `scripts/generate-neutral-palettes.ts`,
`scripts/generate-radix-colors.ts`, `package.json`, and the helpers imported by
`e2e/home-contrast.spec.ts`.

Create a finite machine-readable contract inventory containing stable role
identifiers, their light/dark step assignments, allowed foreground/background
pairs, interaction states, and contrast requirements. Include primary/secondary
text, fields, buttons, meaningful boundaries, focus indicators, analysis and
notice panels, keycaps, selected rows, tooltips, and adjacent surfaces. Classify
each contract as `required`, `advisory`, or `visual`; expand the inventory only
when a real painted combination exposes a coverage gap.

Keep two validation layers. The generator checks opaque serialized colours and
explicitly modelled pairs. Playwright checks browser-resolved custom properties,
compositing, gradients, registered properties, portals, and representative real
states. Do not reproduce a general CSS painting engine in the generator. Where a
gradient carries text or required information, sample its interior using the
actual interpolation semantics and report the least-contrasting position; a
computed gradient string or its two endpoints is not sufficient proof.

Separate requirements from visual preferences:

- WCAG 2.2 AA ordinary text: at least 4.5:1; qualifying large text: at least 3:1.
  Use actual size/weight when classifying text, not its token name.
- Required visual information identifying controls, states, and graphical objects:
  at least 3:1 against the relevant adjacent colour. Classify applicable boundaries
  and focus indicators explicitly instead of imposing this on every border.
- Decorative highlights and separators: visual targets, without an invented WCAG
  minimum. Record inactive-control exceptions where applicable.
- Record which roles must remain distinguishable without colour alone. Palette
  validation does not establish whole-application WCAG conformance.
- Give each normative contrast contract its required WCAG minimum and, where
  useful, a separate higher design target. Falling below the minimum fails;
  falling below the target warns, so visual margin does not become an undocumented
  compliance rule. Perceptual metrics may inform judgment but do not replace the
  WCAG 2.2 acceptance calculation.

Capture original screenshots and a committed computed-colour fixture at
`e2e/fixtures/original-zinc-colours.json` before integration, with fixed theme,
Zinc palette, viewport, route, state, and reduced motion. Treat screenshots as
Playwright review artifacts rather than cross-machine goldens. Original means the
current working tree at implementation time; its canonical URL is
`?colours=original&neutral=zinc`.

### A2. Establish the first theme's visual direction

Use the current appearance as the starting reference. The agreed direction is a
restrained, slightly warm, Zinc-adjacent neutral: recognisably art-directed without
making the interface visibly beige or blue. Tune a compact set of real application
states: layered panel, dense secondary text, field, button, selected row, and
tooltip. Choose useful background and text endpoints, desired surface separation,
and chroma at light/mid/dark positions. Record those decisions as configuration
anchors and inspect them in both root themes before broad integration.

Light and dark are two coordinated curves, not an automatic reversal. Preserve a
consistent numbering direction: 0 is the lightest end and 1000 the darkest in
both. Endpoints are deliberately chosen colours; they need not be pure white and
black. Indices express ordering, not equal contrast ratios or elevation.

### A3. Implement deterministic generation

Use Color.js as a build-time development dependency. At plan review the current
release was `0.7.1` under the MIT licence; confirm that again at installation and
pin the exact package version as well as the lockfile because generator output
must not move after an ordinary install. Use its explicit sRGB gamut mapping and
WCAG 2.1 contrast API; note that `toGamut()` mutates unless called on a clone. Do
not implement colour-space conversion, gamut mapping, or contrast formulae from
scratch. Leonardo is an optional exploration tool, not a second required generator
or source of truth. Material Color Utilities is an alternative studied, not an
additional dependency for this implementation.

Suggested new files (adapt naming to repository conventions):

- `scripts/colour-theme/config.ts`: typed, serializable first-theme configuration,
  curve anchors, role assignments, and contrast contracts. Keep build-only theme
  configuration outside `lib/` so it cannot be mistaken for runtime application
  code.
- `scripts/colour-theme/generate.ts`: validate configuration, sample curves, map
  gamut, emit stable CSS and a machine-readable report.
- `app/custom-colours.css`: generated primitive values and the complete mechanical
  root binding from those primitives to `--sp-neutral-*`, with a generated-file
  header. Semantic role ownership remains within the seven token files.
- `docs/generated/colour-theme-report.json`: committed deterministic values,
  spacing diagnostics, gamut adjustments, and contract results.
- Focused generator/contract tests. Avoid machine-specific paths or timestamps in
  committed output.

Represent curves with ordered OKLCH anchors. Begin with predictable piecewise
interpolation rather than an unconstrained spline that can overshoot. Validate
lightness/chroma ranges; interpolate hue over a documented arc if hue varies.
Generate all 41 steps per theme upfront, including currently unused ones. Tune
curve anchors rather than hand-editing emitted CSS. Adjacent steps should remain
useful throughout the range; finer spacing must not be reserved only for surfaces.
The curve need not have constant perceptual spacing, but report unexpectedly large
gaps and near-duplicates so dense labels do not conceal a coarse or collapsed ramp.

Target sRGB for the first theme. Perform explicit gamut mapping before calculating
contrast or serializing output. Emit opaque, sRGB-bounded `rgb(...)` values with a
documented fixed precision. Parse the serialized strings back through Color.js and
run ordering, duplicate, and contract checks against those reparsed values so the
report measures what CSS receives. Do not rely on browser clipping. Generate a
deterministic report of step values, lightness, adjacent colour differences, gamut
adjustments, and contract results.

Expose `colors:custom` for writing and `check:colours` for generating entirely in
memory, comparing committed output, and checking contracts without modifying any
file. Checks must fail for missing or duplicate indices, invalid values,
reversed/non-monotonic lightness, unintended duplicate colours after serialization,
stale generated output, and failed required contrast relationships. Keep
visual-spacing and design-target warnings distinct from normative failures.
Generation must be deterministic and require no network or runtime JS.

### A4. Map the first theme to semantic roles

Keep generated primitives separate from the semantic API. Use a dedicated
generated namespace, for example `--sp-custom-neutral-light-<step>` and
`--sp-custom-neutral-dark-<step>`, and bind the existing neutral ramp interface
under the custom selection. Import `app/custom-colours.css` after the existing
generated palette files and before `app/components.css`. Its binding selector is
root-only and more specific than the Original palette selectors:

```css
:root[data-colour-system='custom'] {
  /* Generated --sp-neutral-0 through --sp-neutral-1000 bindings. */
}
```

This root rule must win over the retained root `data-neutral` value and the old
interpolated ramp declarations through both specificity and source order. Do not
add descendant selectors for nested theme or palette scopes.

Start from existing role assignments, then explicitly tune custom-mode mappings
for surfaces, text, existing border roles, and interaction states to meet the
contracts. Adjust an individual role assignment before changing a curve; change
the curve when several failures reveal a systematic problem. Keep semantic
mappings in their responsible token files. Use the installed PostCSS parser to
read and validate those mappings against configuration rather than maintaining a
regex or a second hand-copied map, so the report cannot test different colours
from those actually painted.

Preserve the present highlight/divider implementation in this phase, including
alpha formulas, aliases, widths, and tooltip box/arrow sharing. Their final
composited appearance may change because the underlying surface changes; document
this as part of the palette experiment. Do not introduce numbered edge recipes,
replace alpha highlights, or normalize tooltip treatments yet. Proposed edge
contracts may be inventoried for Phase B without being activated.

Keep existing accent/status definitions and decorative tile hues. Test their text,
icons, fills, and boundaries against the new neutral backgrounds. Prefer adjusting
the custom neutral recipe when needed. Report unresolved conflicts explicitly;
do not silently waive a requirement or expand into replacing every colour family.
Gradient text checks must consider the worst contrast along the painted gradient,
not assume that checking endpoints always suffices.

### A5. Add the comparison control

Use `Colour system` with `original` / `custom` values and `Original` / `Custom`
labels; `data-colour-system` on `<html>`; storage key
`safepoint.dev.colour-system`; URL parameter `colours`. This replaces the previously
planned surface-system preference, which has not been implemented.

The existing Neutrals picker controls Original. Custom selects the one new neutral
family; disable the picker in that mode and retain its Original value for switching
back. Keep Theme active for both systems. The retained root `data-neutral` value
must have no visual effect in Custom and must apply again immediately on returning
to Original. Nested theme, palette, and colour-system scopes are unsupported.

Reuse read/set/persist/emit, subscriptions, reset, and the pre-paint development
script, but make resolution explicit and independently testable. Read and validate
the URL without touching storage; only if it has no valid choice, attempt storage
inside its own `try`. A valid URL choice wins over valid storage, then Original.
An invalid URL value is ignored and may fall through to valid storage. An explicit
`?colours=original` must defeat stored Custom while leaving no attribute. Storage
failures must not block a valid URL choice or in-session switching. The picker wins
in-session; an explicit URL choice wins again on reload. Reset restores Original.
No attribute means Original. Production remains Original by default and does not
restore experimental preferences or show the control.

### A6. Review and stop before highlight remapping

Use the focused development workbench to inspect all 41 generated primitives and
the live application routes for semantic review. Do not add component specimens or
theme editing to the workbench. Review representative real screens and states via
`?colours=original&neutral=zinc` / `?colours=custom`.

Validate the generated data and actual browser paints. Include root light/dark/system
themes, dense text, coloured states, keyboard focus, tooltips, forced colours, and
narrow layouts. Colour-vision simulations can supplement review; inspect labels/icons
that convey status without hue. Keep Original palette smoke checks separate from
the one custom family; a custom version of every existing neutral palette is not
required.

Phase A deliverables are configuration, generator, generated CSS, semantic
assignments, contrast contracts/report, tests, the focused ramp workbench,
comparison control, and documentation.
Report the chosen visual direction, actual checks, known limits, and reproducible
comparison URLs. The first theme must pass required contracts and remain visually
reviewable; stop here for the user's theme review. Do not begin Phase B merely
because Phase A checks pass.

## Phase B: later opaque edge, divider, and tooltip recipes

Apply this phase to the reviewed custom theme, with its palette and background
mappings held fixed. Original/Custom continues to compare colour systems. The
intended candidate replaces white/black alpha-derived structural highlights with
opaque colours chosen from the custom neutral ramp. This preserves the theme's
hue and chroma, makes the painted colour independent of whatever lies behind it,
and gives every declared face/edge pair an exact, testable contrast relationship.

That guarantee belongs to the pair, not to an edge step in isolation: one opaque
colour does not have constant contrast against arbitrary backgrounds, and the
41-step ramp is perceptually ordered rather than contrast-linear. Define edges
per surface recipe; do not derive them mechanically as `face ± 25` or replace all
existing highlights with one global step.

Add a separate Custom-only `Edge treatment` comparison (`existing` / `opaque`),
defaulting to existing, with independent persistence and reset. Keep it during
review so the alpha implementation remains a trustworthy baseline. Do not reuse
the colour selector to change both experiments simultaneously.

### B1. Establish edge comparison and baseline proof — complete

- Add the Custom-only `Edge treatment` control with `existing` / `opaque` values
  and labels `Existing` / `Opaque recipes`.
- Use `data-edge-treatment` on `<html>`, storage key
  `safepoint.dev.edge-treatment`, and URL parameter `edges` for reproducible
  comparisons. Reuse the existing read/set/persist/emit pattern.
- Valid URL value wins over a valid stored value, then existing. Invalid inputs
  are ignored and may fall through to valid storage. Read and validate the URL
  before accessing storage in its own `try`; a blocked storage API must not prevent
  an explicit URL choice or in-session switching. Keep this handling local to the
  new preference.
- Restore before first paint using the existing development script. Reset defaults
  restores existing edges; subscriptions refresh the picker. Changing the picker wins
  for the current session; an explicit URL override wins again on reload.
- No edge attribute must produce existing edges. Production retains original
  by default and has no comparison control or preference restoration.
- Capture representative custom-theme screenshots/computed colours with existing
  edges before remapping. Prove switching back restores that baseline, and that
  the edge preference has no effect in Original colour mode.
- Stop after the comparison plumbing and baseline proof. Until B2 supplies an
  opaque recipe, selecting Opaque may intentionally resolve to the existing
  treatment; do not invent step assignments merely to make this stage look
  different.

### B1.5. Palette review before recipes — decision open

Inspection before B2 found that the measurement layer could not see several
things it claimed to check, and that some of what it did report was mistuned
rather than wrong. Fixed first, because these are the instruments B2's recipe
table depends on:

- Duplicate detection compared serialized strings, which cannot collide once
  lightness must decrease. It now compares 8-bit quantized colour.
- The spacing warning band was `[0.006, 0.045]` against an actual range of
  `[0.0065, 0.0383]` — inside by a hair at both ends, so it warned about
  nothing. Replaced by criteria on the ramp's own shape plus cross-theme
  comparability.
- The role validator read three stylesheets, took the _first_ declaration per
  scope, and tested scope by substring. It now reads five in import order, takes
  the last per scope, skips conditional at-rules, and normalizes the selector.
  On first run it caught `--tooltip-face` resolving to the forced-colours
  keyword `Canvas`.

With those in place the palette measures as follows. Ten warnings, no failures.

| Finding                                                                                                      | Status                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light's adjacent-gap spread is 5.9x against dark's 2.4x                                                      | Largely forced. A light ramp anchored at white must cover white to canvas in 8 steps and canvas to muted text in 14, which dictates 3.27x before any tuning. Not a defect on its own. |
| Light needs a larger index offset than dark for the same edge strength (+125 vs +50 at the floating surface) | Real, and a fact for the B2 recipe table to record. Not a capability limit: the concentrated curve puts 13 indices in the light surface band where a uniform curve puts 7.            |
| `--sp-text-muted` on `--sp-surface-selected` reads 3.59:1                                                    | Real. Original records 5.2:1. Guarded today only by four hand-written ink swaps and no contract. Caused by step 300's lightness, not by spacing.                                      |
| Five cross-theme contrast breaches, and `primary-to-floating-surface` separation differing 4.16x             | Real, and caused by role assignments. Confirmed by measurement: they survive every curve candidate essentially unchanged.                                                             |
| Dark `analysisFace` and `noticeFace` both 875; dark `surfaceSelected` and `surfaceControl` both 750          | Real. Both pairs are distinct in light and identical in dark.                                                                                                                         |
| Dark surfaces average 2.0x the chroma of light surfaces                                                      | Real but modest. An earlier estimate of 6x came from dividing chroma by lightness; OKLCH chroma is already perceptual, so the absolute ratio is the right comparison.                 |

Three curve revisions are generated and measured for comparison on `/workbench`:
`concentrated` (in use), `uniform` (light made even, dark held), and `unified`
(both themes on one curve, so a step is a colour rather than a colour per theme,
which is the model `ramps.css` already describes). Re-pointing every role to the
nearest step drifts at most 0.0105 ΔEOK, below the threshold of noticing, so a
candidate can reproduce the reviewed appearance.

The curve choice buys a uniform index for writing B2 recipes and nothing else:
it fixes no contrast breach and slightly worsens the chroma ratio. The role
fixes are needed under every candidate.

**Decision: the unified ramp is adopted and Custom now is it.** The
concentrated and uniform revisions are retired, the remap shim is gone, and
Custom's role assignments are stated directly in the new ramp's coordinates in a
`:root[data-colour-system]` block at the end of `roles.css`, `faces.css` and
`state.css`. The full migration was taken rather than keeping the shim because
through a remap the old step names regain non-uniform spacing and several alias
each other — which destroys the one property the unified ramp was chosen for,
that an edge can be stated as a fixed offset. B2 would have been harder than it
is today.

The migration reproduces the reviewed appearance exactly: every sampled surface
and ink matched the pre-migration preview channel for channel.

Role fixes applied on top, with their measured effect:

| Change                                                                    | Effect                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dark `--sp-text-muted` 225 → 325                                          | canvas 9.68 → 7.02:1; cross-theme ratio 1.83x → 1.33x; hierarchy depth 0.69 → 0.50 against light's 0.34                                                   |
| dark `--sp-text-muted-strong` 150 → 225, `--sp-text-muted-soft` 275 → 425 | the three rungs keep their spacing as muted moves                                                                                                         |
| dark `--sp-notice-face` 850 → 825                                         | notices and analysis panels stop being one colour in dark                                                                                                 |
| dark `--sp-surface-selected` 725 → 700                                    | a selected control stops matching a resting one                                                                                                           |
| dark `--sp-rule-faint` 725 → 625                                          | the floating panel's ring was 1.09:1 and invisible; now 1.58:1, no longer dependent on its alpha sheen                                                    |
| `--sp-tooltip-edge`, new role, light 425 / dark 450                       | the tooltip face aliases the floating surface, so the edge was the only separation and read 1.92–2.04:1; now clears 3:1 over canvas, primary and floating |
| menu chip count → `--sp-text-muted-strong`                                | the chip fills at the selected ground's depth and carried micro text at 3.69:1                                                                            |

Contracts added for the pairs that had none: the tooltip edge over canvas,
primary surface, floating surface and its own face; the faint rule on the
floating and primary surfaces; the keycap ring on its face; and the menu chip's
ink. A Playwright test asserts no element painting the selected fill contains
muted-coloured text, which is what makes the below-AA muted-on-selected pairing
safe. That test found the menu chip on its first run.

Five cross-theme warnings remain and are deliberate. Light's surfaces sit
against the ramp's white ceiling, so light text on them reaches ratios dark
cannot, and light's canvas-to-floating span is one step where dark's is three.
Closing them means darkening the light theme.

Both open questions are settled, and both settled as "leave it":

- **The muted move does not carry further.** Measured on each theme's canvas,
  the quiet-ink ladder is monotonic in both and every cross-theme ratio is
  1.37x or under — muted-soft 3.62/4.96, muted 5.29/7.02, sheet-time 6.41/8.27,
  muted-strong 7.75/9.68, sheet-date 11.85/10.45, header-ink 12.70/12.11,
  primary 15.53/13.96. Moving muted brought the family into alignment; moving
  the rest would break what is now consistent.
- **`--sp-text-primary` and `--sp-action` stay on one step.** They already
  shared in light before any of this, and a neutral action label is the same
  job as primary text. The collision warning recorded a difference that was
  0.0125 deltaEOK and not load-bearing.

The family's hue is now Tailwind zinc's: `UNIFIED_HUE` 286 with no drift, which
holds within half a degree across zinc's own ramp, and a chroma curve sampled
from zinc's chroma-against-lightness shape — near-achromatic where surfaces
sit, humped through the midtones where text and edges live. Every contrast
ratio moved by under 0.03 in the rotation, which is the predicted behaviour of
changing hue at fixed lightness.

### B2 progress: structural surfaces wired

The five shared alpha strengths were not replaced with five opaque colours.
Each surface that paints an edge has a role of its own -- `--sp-raised-edge`,
`--sp-floating-edge`, alongside the existing analysis, notice and keycap
highlights -- aliasing the old sheens so Existing is unchanged, and diverging
only under `[data-colour-system='custom'][data-edge-treatment='opaque']`.

Dark's values are what its black sheens already composite to, measured rather
than chosen, so the dark half of Opaque restates Existing exactly:

| Surface  | Light face -> edge | Dark face -> edge |
| -------- | ------------------ | ----------------- |
| raised   | 25 -> 0            | 825 -> 875        |
| floating | 0 -> none          | 750 -> 825        |
| analysis | 0 -> none          | 850 -> 875        |
| notice   | 50 -> 25           | 825 -> 850        |
| keycap   | 25 -> 0            | 775 -> 825        |

Both themes darken except where light lifts by one step. Light cannot do
otherwise: its faces sit within two steps of the ramp's white end, so a lit
edge has nowhere to go. Floating and analysis have **no light edge at all** --
their faces are step 0 and there is no lighter step -- so their rings carry the
boundary, as the recessed surface's already does. That is the plan's
"a level may explicitly have no top edge", used deliberately rather than by
omission.

Retained alpha, all of it deliberate:

- `--sp-edge-inner`, the enclosure gradient, fades to transparent. A fade is
  the effect, not an edge colour.
- The accent and commit control sheens, which lie over coloured gradients and
  sit outside the neutral conversion.
- `--sp-menu-tile-highlight`, a decorative hue tile.
- The registered `--control-highlight` initial value, which is a literal
  because registration requires one.

### B3 progress: dividers and the tooltip

Dividers are named for the ground they land on, not the element that declares
them, because a shadow cast outside a box paints on its neighbour. The grounds
were measured in the browser rather than assumed: the header, menu rules, sheet
head, sheet rows at rest and the notch all cast onto the canvas, so they share
one role; the band and the lit row have their own.

| Divider                      | Ground       | Light | Dark |
| ---------------------------- | ------------ | ----- | ---- |
| `--sp-divider-etch`          | canvas       | 25    | 925  |
| `--sp-card-etch`             | card face    | 0     | 825  |
| `--sp-sheet-break-etch`      | sheet band   | 0     | 850  |
| `--sp-sheet-row-etch`        | resting row  | 25    | 925  |
| `--sp-sheet-row-etch-active` | lit row      | 25    | 800  |
| `--sp-notch-highlight`       | canvas       | 25    | 925  |
| `--sp-tooltip-highlight`     | tooltip face | 0     | 825  |

Each is what its own alpha already composites to on that ground, so Opaque
restates the line rather than redrawing it.

**One distinction is lost in light.** The sheet row's resting and hover etches
composite six values apart out of 255, and one ramp step at that lightness is
eight, so both land on step 25. The row still answers hover through its
background. This is the ramp's resolution at the white end, not a wiring
mistake, and it is the sort of thing B4's review should judge.

`--sp-quiet-face-top` now reads the ramp's lightest step under Custom instead of
`#fff`. It was the last face in the interface that did not belong to the
palette, and on a tinted family a pure-white control top reads as a foreign
object. Original keeps `#fff`.

### The remaining alpha, converted

The three exceptions that were not fades were converted too. Two of them carry
a hue rather than a neutral, so they mix against the stop their edge actually
lies on rather than against transparency. The painted colour is then knowable
without knowing what sits behind the control -- which is the objection that
keeps neutral fills on ramp steps, met a different way where no ramp exists.

- `--sp-accent-edge` and `--sp-commit-edge`. A gradient has no single
  background, so each pairs with the stop its edge sits on. Light lifts a step
  into its own family -- cyan 300, teal 400 -- rather than restating the
  composite, which lands back on the face's own colour and draws nothing, the
  same finding as the light surfaces.
- The menu tiles' sheen, mixed against each tile's own face so it follows the
  hue. It cannot be a root token: the mix needs `--tile-face-*`, which a hue
  utility sets on the element, and a custom property's `var()` references
  resolve where the property is declared. It is an unlayered rule so it
  outranks the utility it overrides.
- `--sp-enclosure-sheen`. A fade to transparent is the one edge whose colour
  genuinely depends on what lies under it, so making it opaque meant changing
  the effect rather than the value: a one-pixel band where there was a
  gradient. Kept as an image token because `light-dark()` resolves colours and
  not gradients.

Only the registered `--control-highlight` initial value still carries alpha. It
is a literal because `@property` registration requires one, it is theme-blind,
and nothing that sets its own stops ever reaches it.

### A rule that could not answer its row

The boundary between run rows was two lines with different owners: the rule on
the list item and the etch on the row. The etch answered hover and selection;
the rule could not, because the item knows nothing about the row's state, so
the two disagreed a pixel apart about whether anything had happened.

The rule moved onto the row. Geometry is unchanged -- the border sits in the
same pixel, and an inset shadow paints inside the padding edge, so the etch
still falls below it -- and the rule now comes forward with the row, from
`--sp-rule-faint` to `--sp-rule-default`. A test asserts the hovered row's rule
moves and its neighbour's does not.

Still to do: B4's review pass across routes and states.

### B2. Define surface recipes, then wire the proposal

Keep the existing seven-file token organization: role definitions in `roles.css`,
component recipes in `faces.css`, Tailwind exposure in `theme.css`, utility
assignments in `globals.css`, and only qualifying structural rules in
`components.css`. Keep experimental overrides scoped to the opaque selection.

Use numbered structural levels with an explicit mapping:

| Proposed family | Existing role |
| --------------- | ------------- |
| `surface-0`     | Inset         |
| `surface-1`     | Canvas        |
| `surface-2`     | Primary       |
| `surface-3`     | Floating      |

For each level define only the roles it actually needs, such as
`--sp-surface-2-face`, `--sp-surface-2-edge-top`,
`--sp-surface-2-edge-bottom`, `--sp-surface-2-divider`, and
`--sp-surface-2-divider-highlight`. Numbers identify surface levels, not offsets
to calculate from the current colour. Prefer `edge-*` over the ambiguous
`highlight` where the colour describes a structural boundary. Keep existing
semantic names as aliases where useful; do not rename every component or add
unused utilities.

First retain existing background steps and choose opaque edge steps around them,
so comparison isolates the edge treatment. Record the chosen light/dark neutral
indices in a recipe table together with the resolved contrast ratio and
perceptual difference for every declared face/edge pair. Exact edge values require
visual tuning and are not decided by this plan. Dark edges currently often
darken; do not silently turn every dark inset edge into a bright sheen. A level
may explicitly have no top edge, preserving recessed and quiet states.

Route each consumer to its own recipe, preserving baseline values in existing-edge
mode and leaving Original colour mode untouched. Do not merely replace the five
global opacity strengths with five opaque colours: the same strength currently
paints over different faces. Keep analysis, notice, keycaps, and neutral control
states as explicit companion recipes where their backgrounds differ from the
structural ladder. Preserve gradient controls; if an edge paints across a
gradient, choose and document a deliberate recipe rather than claiming a
universal one-step relationship.

CSS correctness requirements:

- Read only `--sp-neutral-*` for proposed neutral colours; never hardcode zinc or
  edit generated palettes. Existing intermediate ramp steps may be used.
- Audit custom-property resolution at `:root`. Ensure the root Custom selector
  outranks the retained root Original-palette attribute and rebinds any dependent
  aliases there; the existing Original nested-scope behaviour is outside this task.
- Apply the opaque selection at the document root only. Do not implement or test
  nested theme, palette, edge-treatment, or colour-system scopes.
- Keep registered `--control-*` animation behaviour and explicit assignments.
  `--control-highlight` is registered with `inherits: false` and a literal alpha
  initial value; do not assume inherited recipe values override that fallback.
- Preserve transparent highlights in states that intentionally have no edge.
- Leave coloured accents, status fills, decorative tile hues, washes, and shadows
  outside the neutral conversion. Inventory shared highlight consumers so changing
  a neutral token cannot accidentally recolour those treatments.
- Opaque ramp steps are the default for structural edges, borders, divider lines,
  control perimeters, keycap edges, and tooltip boundaries. Keep alpha only where
  showing through or fading is the actual effect, such as a wash, shadow, sheen,
  or fade to transparent. Record every retained alpha exception rather than
  treating transparency as the generic highlight mechanism.
- A gradient has no single background colour. Pair its perimeter with the weakest
  relevant point of the gradient or give the component a deliberately opaque
  perimeter; do not claim one exact contrast ratio across the full fill.

### B3. Apply the same pairing to dividers and tooltips

Dividers should consume the recipe of the surface they paint on. Route both the
line and its companion highlight, including `shadow-rule-etch`, separator
shadows, sheet rows/current rows, and header/panel boundaries. A shadow drawn
outside a box paints on its neighbour: inspect that background instead of
assuming the declaring element owns it. Preserve geometry and existing widths.
Use local recipe assignments or scoped aliases where needed; avoid a global
rule-strength remap that changes unrelated boundaries.

Give tooltips dedicated opaque face, ink, and edge roles, plus a second edge only
if the visual recipe needs it, with one fixed combination per theme. Wire these
into the existing `--tooltip-*` contract so the box and arrow match. Choose
sufficient separation over canvas, primary, floating, and selected surfaces; a
dedicated edge can distinguish a tooltip even where the face matches. Test plain
and rich tooltips, all placements, and notch anchors. Keep the existing
forced-colour overrides, portal behaviour, and placement geometry. Do not add a
box-only drop shadow.

For `enclosure`, explicitly choose an opaque treatment in opaque mode if included
in the conversion; retaining a fade to transparent is valid only as a documented
fade effect, not as an opaque edge result.

### B4. Make comparison reviewable

Use live application routes and existing components. Do not create a workbench,
sample section, specimen route, or second preview application. Review structural
levels, analysis/notice, keycaps, divider pairs, and tooltips on the real screens
that own them. Exercise rest, hover, keyboard focus, selected, and disabled states
where relevant, using the global switch.

Document the final mapping, intentional exceptions, and how to compare with
`?colours=custom&edges=existing` / `?colours=custom&edges=opaque` in
`docs/STYLING-SYSTEM.md`. Qualify the
existing statement that translucent mixes are used for highlights: it describes
existing-edge mode and intentional adaptive effects, not opaque structural-edge
mode. Keep unrelated stale prose out of scope.

## Verification shared by both phases

During implementation use targeted checks. At completion, shared token routing
and preference changes warrant `pnpm lint`, `pnpm typecheck`,
`pnpm format:check`, `pnpm test`, and `pnpm check:tokens` once. Explicitly format
check edited Markdown with `--ignore-path /dev/null`. Run `pnpm build` if the
implementation changes production gating or bundling. Report unrelated failures
with evidence; do not expand into cleanup.

Use `pnpm dev:styles`, reusing a suitable running server, for browser checks.
Keep `check:contrast` focused on contrast and add a separate focused Playwright
script such as `check:colour-system` for switching, reload persistence, URL
precedence, invalid/blocked storage, reset, and restoration of Original computed
paints. Change `check:contrast` to target the contrast spec explicitly so the new
preference suite is not silently folded into it. Check actual computed colours
rather than only the attribute. The token checker detects missing names, not
invalid cascade resolution.

Run relevant contrast coverage in both colour systems and light/dark projects.
Inspect the custom family in both themes. For Original regression coverage, inspect
zinc plus a warm, cool, and Radix neutral; smoke-check existing palette resolution.
Phase B additionally checks both edge treatments on Custom. Include the root system
theme, portalled tooltips, forced colours, and representative narrow layouts.
Verify text and meaningful boundaries/focus contrast; decorative highlights need
visual judgment rather than an invented universal contrast threshold. Run the rail
checker only if geometry or spacing inputs change.

Phase A acceptance:

- Exactly 41 opaque generated neutral steps per theme, deterministic output,
  valid gamut, ordered lightness, and documented curve parameters.
- A single authoritative set of role assignments and passing required contrast
  contracts, checked against serialized values and representative browser paints.
- Original remains unchanged/default; its canonical comparison is
  `?colours=original&neutral=zinc`. Switching, reload, URL precedence, reset, and
  blocked-storage handling work without losing app state or moving layout.
- Existing highlight/divider recipes are preserved. No Phase B remapping is
  included in the first-theme implementation.
- Configuration and tooling are build-time only, with generated CSS at runtime.
- Custom is root-scoped only and adds no nested-theme support or replacement
  preview route.
- The theme, report, and comparison are ready for review; no automatic promotion.

Additional Phase B acceptance:

- Original is unchanged, remains default, and is restored immediately by the
  selector and Reset defaults.
- Opaque mode has explicit surface/edge/divider recipes, with measured face/edge
  pairings and no unintended alpha structural highlights in the declared
  migration scope.
- Switching changes colours without remounting the app, losing UI state, moving
  layout, or requiring reload.
- Tooltip box and arrow remain seamless and distinguishable over relevant surfaces.
- Both edge treatments work on Custom in light/dark; Original's supported neutral
  palettes remain unaffected. Focus stays visible and forced-colour behaviour survives.
- The handoff reports checked screens, final step mappings, exceptions, actual
  test results, and any limits. Leave the switch and original implementation in
  place for the user's visual decision.

## Technical references

- [Color.js](https://colorjs.io/): colour spaces, gamut mapping, contrast and
  difference calculations; preferred build-time foundation.
- [CSS Color 4: OKLab/OKLCH](https://www.w3.org/TR/css-color-4/#ok-lab): perceptual
  colour representation, not a substitute for contrast validation.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
  [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):
  acceptance requirements and applicability.
- [Leonardo](https://leonardocolor.io/): optional contrast-led palette exploration.
- [Radix scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale):
  reference for existing role relationships, not a constraint on custom step count.

Consult current official APIs when implementing. Do not claim the theme guarantees
human perception, aesthetic quality, or full WCAG conformance from colour maths
alone; the contract checks and actual interface review address different needs.
