# Styling system

How styling is organised, what is settled, and the conventions that keep it that way. Settled 2026-09-10, after the migration from bespoke CSS to Tailwind utilities.

This supersedes the styling sections of [`STAGE-1B-PROPOSAL.md`](STAGE-1B-PROPOSAL.md), which records what was proposed rather than what was built: the palette moved from `stone`/`gray` to `zinc`, and `globals.css` became three files.

Colocated CSS Modules were proposed as an alternative, trialled on one component, and rejected on measurement: they route Cmd+click into `node_modules` rather than to the class, and they compile unlayered, so a module rule silently outranks any utility the markup adds beside it. [Component styling: proposal, independent review, and trial](COMPONENT-STYLING-PROPOSAL.md) records the evidence. The conventions below stand.

## The division

Three jobs. `globals.css` imports the rest, in the order listed below.

| File | Holds | Test for belonging |
| --- | --- | --- |
| `app/tokens/` | every design token, and the `@theme inline` block that publishes them as utilities | is it a value the system decides once? |
| `app/globals.css` | the base layer, the `@utility` extensions, `@property` registrations, forced-colors and print fallbacks | is it a Tailwind extension or a document default? |
| `app/components.css` | what markup cannot express | see below |

Everything else is a utility in the component.

`app/tokens/` is seven files, each named for one job, and the import order in
`globals.css` is the order they are listed in:

| File | Holds |
| --- | --- |
| `ramps.css` | `color-scheme`, the fifteen `[data-neutral=…]` palettes, the half steps |
| `roles.css` | canvas, surfaces, text, rules, action, edges, notch colours |
| `faces.css` | every control and component face, and the ink on it |
| `state.css` | the six state scales, the adapter modes, the Radix palette |
| `type.css` | the families and the type scale |
| `geometry.css` | durations, tile chroma ceilings, notch and slant geometry |
| `theme.css` | the `@theme inline` block: everything published to Tailwind |

Each file that declares themed roles repeats the selector header
`:root, [data-theme], [data-neutral]`, so the re-declaration contract is visible
in each rather than implied once.

### Finding an element's styles

Use `styleDebug` from `lib/style-debug.ts` on an existing DOM element or a
component that forwards data attributes to its DOM root:

```tsx
<div
  {...styleDebug({
    component: 'ProcessMenu',
    part: 'row',
    appearance: 'process-menu-row',
  })}
>
```

In development this emits `data-component`, `data-part` and `data-appearance`.
The helper returns nothing outside development. It adds no elements or browser
listeners; it does not promise build-time removal of every helper call.

- **Component** names the owning component. A part may be rendered by a private
  helper, but keeps the public owner's identity where that makes navigation clearer.
- **Part** names a meaningful styled region: row, badge, track, ring. Omit it
  on the component root. Do not annotate every layout wrapper or glyph.
- **Appearance** names the exact CSS selector or utility defining the treatment,
  without a leading dot. If independently meaningful treatments share an element,
  list their names separated by spaces (for example, `process-menu-link text-menu-link`).
  These are search terms, not a copy of the full class list. Omit it for ordinary utility compositions that have
  no single named treatment. Button retains the short family names `quiet`
  and `accent`, matching `control-quiet` / `control-accent` and their token families.
- **Variant** comes from existing props or the configuration that chooses the
  classes. StatusLabel uses its tone; menu tiles use their hue class.

When an interactive treatment is difficult to trace across utility constants,
put its resting and interactive states together under one searchable class in
`components.css`, inside `@layer components`. This qualifies under the existing
"set of states on one selector" rule below. Keep layout and simple typography in
markup and keep values in tokens. `.process-menu-back` is the reference example:
its rule applies the shared transition and directly names its text and background
tokens for rest, hover and keyboard focus. Its metadata names only
`process-menu-back`; it does not duplicate the state classes or token list.

Preserve the original state semantics when moving rules. Tailwind's `hover:`
variant is guarded by `(hover: hover)`; a bare CSS `:hover` is not equivalent on
touch devices. React Aria's data states are also distinct from native pseudo-classes.

Inspect the element or its nearest marked ancestor, then search the component
name or appearance. LocatorJS provides the source location. Keep paths, line
numbers and token lists out of metadata so they cannot become stale.

| Inspected identity | Where the treatment lives |
| --- | --- |
| ProcessMenu / row / `process-menu-row` | `app/components.css`: the row's states and the custom properties it publishes |
| ProcessMenu / status-badge / `surface-menu-badge` | `app/globals.css`: reads the badge stops inherited from the row |
| ProcessMenu / tile / `surface-menu-tile` | `app/globals.css`: tile face; the hue variant supplies its colour roles |
| ProcessMenu / row-label / `text-menu-link` | `app/tokens/theme.css`: publishes the utility colour; `app/tokens/faces.css`: defines `--sp-menu-link` |
| ProcessMenu / back-heading / `process-menu-back` | `app/components.css`: all appearance states together, directly referencing `--sp-menu-link`, `--sp-text-primary` and `--sp-menu-wash-strong` |
| Button / secondary / `quiet` | `control-quiet` in `app/globals.css`, then `--sp-quiet-*` in `app/tokens/faces.css` |
| Button / ring / `slant-ring` | `app/components.css`: paints the ring using stops inherited from the Button |
| ProcessHeader / count / `header-button-count` | `app/components.css`: geometry; the adjacent `bg-header-button-count` utility supplies colour |
| RunRow / tally-segment / `sheet-seg` | `app/components.css`: segment treatment, with existing state attributes selecting colours |

Appearance describes the configured treatment, not the complete computed style.
Disabled and interaction states, inherited values and caller classes can override
it. Use existing state attributes to see the active state; do not mirror hover,
selection, freshness or disabled state in diagnostic metadata. Shared appearances
are not tokens unique to the element's accessible name.

Diagnostic attributes must never be CSS selectors or behavior hooks. Functional
attributes such as `data-slant`, `data-size`, `data-tone` on the menu badge, and
React Aria's state attributes remain in production. Keep class strings literal
so Tailwind can discover them. When adding a treatment, annotate its meaningful
root and independently painted parts using this convention.

### What earns a place in `components.css`

Only these. If a rule is not one of them, it belongs in markup.

- **Token derivations a utility cannot compute.** The severity scale reads `--severity` from the element's own `data-severity`, so no build-time utility can resolve it. It binds the selected tone’s numbered steps, and an `@theme inline` block publishes colour roles so markup can still say `bg-severity-fill`.
- **Pseudo-elements**, which have no element to hang a class on: `::backdrop`, the disclosure `+`/`−` marker, the thread connector, the drawer scrim, the effects rail's line, the sidebar's edge gradients (`.process-menu-fade`), the fades at the two ends of its list (`.process-list-fade`), and the development alignment guides (`.rail-axis`, `.rail-mark`).
- **Keyframe animations** and their reduced-motion answers.
- **Shadow compositions a state extends rather than restates** — the system disc holds its outer ring in `--disc-ring` so the freshness states can extend it without repeating the sheen.
- **Multi-speed transitions** — the reorder row travels at `--duration-row` and tints at `--duration-state`.
- **A set of states on one selector**, where pulling one arm into markup scatters the rest. `.process-menu-row` is base, `[data-editing]`, `[data-current]`, `[data-dragging]`, and hover/focus-within; a lone `hover:` utility on the element reads as the sixth state but is filed somewhere else, and it applies to the arms the CSS deliberately excludes. Add the state to the rule, not to the class list.
- **A value two elements must share.** The tooltip's face, edge and highlight are read by both the box and the arrow SVG hanging off it, so they are declared once as `--tooltip-*` rather than repeated in two places that can drift.
- **Custom properties as the payload.** `.process-menu-row[data-current]` overrides five `--control-*` stops to retune `control-face`; as utilities that is five `[--control-face-top:…]` brackets. The same row publishes `--menu-badge-face`, `--menu-badge-ring` and `--menu-badge-highlight` for its status badge, whose `surface-menu-badge` utility reads them, so the badge follows the row's states without a variant of its own.

Two more tests, neither of which is about the rule itself. An element that already carries a JS-driven inline `style` gains nothing from co-location, because its most important values are not in the class list either. And a utility that lands on an element whose other states live in `components.css` will be read as belonging to neither file — put it where its siblings are.

## Type scale

Constructed, not picked. Three properties, all of which Tailwind's own scale has:

1. **Sizes in `rem`**, so type answers to the reader's browser font-size setting. `px` silently ignores it.
2. **Line-height as a unitless ratio** whose numerator is the baseline value: `calc(1.125 / 0.8125)` reads as "18px on 13px".
3. **Letter-spacing on the role**, so no component sets tracking.

The one deliberate departure from Tailwind: a **2px baseline** rather than 4px. At 13px a 4px grid offers only 16px (cramped) or 20px (loose), and this interface wants 18px.

| Role | Size | Line | Tracking | Use |
| --- | --- | --- | --- | --- |
| `micro` | 11 | 14 | +0.01em | badges, counts, captions |
| `meta` | 12 | 16 | 0 | secondary and supporting lines |
| `dense` | 13 | 18 | 0 | the interface default for lists and rows |
| `body` | 14 | 20 | 0 | prose and primary copy |
| `title` | 17 | 22 | −0.01em | section and panel titles |
| `counter` | 20 | 24 | −0.02em | figures read at a glance |
| `display` | 22 | 26 | −0.02em | the one editorial line on a screen |

Roles are addressed by name and never by family or size, so the final typeface selection needs no component redesign. `readout` is the same `micro` metric in the utility family, tracked and uppercased, for legends, sources, modes and states.

Two lockups sit outside the scale: `wordmark` and `lockup`. A mark is set optically and keeps its own family, so it keeps its own size and does not follow `data-typescale`.

An alternate `sharp` scale exists for comparison — same lower half, larger and tighter above `body`. Switch it live in the development picker or with `?scale=sharp`.

## Radius

Named for what they enclose. Pulled in from Tailwind's 4/8/12/16 so corners read crisper.

| Token | Value | Encloses |
| --- | --- | --- |
| `region` | 2px | hairline: bar segments, chips |
| `section` | 4px | small chrome: badges, grips |
| `control` | 6px | anything pressable |
| `icon` | 8px | icon squares, and the tiles beside them |
| `shell` | 10px | panes, cards, dialogs, the drawer |

## Colour

Every role is declared once with `light-dark()` over a neutral ramp for surfaces, rules, text and action, and palette-independent scales for semantic state (Radix by default, Tailwind as a development alternative). `@theme inline` publishes them as `bg-canvas`, `border-rule-strong`, `text-muted` and so on.

A role never names a neutral palette. It reads a step from `--sp-neutral-*`, and the ramp names the palette — `zinc` by default. One ramp carries everything: canvas, surfaces, text, rules, menus and notices, and equally the faces that answer a press — quiet and unavailable buttons, fields, keycaps, the badges built on the keycap, the menu count chip.

There used to be two. `--sp-control-*` existed so `data-control-neutral` could give controls a palette of their own, and it cost 230 lines of duplicated ramp, a fourth selector on every role block, and a split token API in which "is this a control role?" was a thing to remember rather than to read. It was removed in favour of one ramp and one switch; every step it carried resolved to the identical `--sp-neutral-*` step whenever the attribute was absent, which was always in production.

Every neutral palette exposes steps at 25-point intervals from 75 through 925,
as well as the 50 and 950 endpoints. Native hundred steps stay unchanged;
half steps are OKLab midpoints of their anchors and quarter steps are midpoints
of the adjacent half/hundred steps. Existing intermediate values are preserved.

The midpoints stay `color-mix()` at runtime rather than baked values so they can never disagree with the neighbours they sit between — if Tailwind retunes a step, they follow. Note that a half step is not a fixed distance: Tailwind's ramp is uneven, so 150 and 250 are ~2.4% in lightness while 350 and 450 are ~8%, wider than several named steps. Lightning CSS emits the neighbour below as a fallback, so a browser without `color-mix()` loses the midpoint rather than the colour.

Five of the fifteen palettes are Tailwind's. Four — taupe, mauve, mist, olive — are generated by `pnpm colors:neutrals` into `app/neutral-palettes.css`. The remaining six are Radix's neutral families — gray, mauve, slate, sage, olive and sand — exposed with `radix-` names so they do not collide with the existing palettes. Radix's twelve semantic steps are mapped onto the app's neutral ramp separately for light and dark mode; the mapping preserves the role positions and contrast expectations of the existing tokens rather than pretending the step numbers are a Tailwind-shaped scale. `pnpm check:tokens` then verifies that every `var(--…)` in the app's CSS resolves against something — the app's stylesheets, Tailwind's installed theme, a property set from TypeScript, or a dependency — so a palette bound by a name nothing defines fails a check rather than silently unsetting a subtree.

`data-theme` and `data-neutral` each re-resolve the tokens for their subtree. Because Lightning CSS polyfills `light-dark()` with inherited custom properties, and a custom property substitutes its `var()`s where it is declared, any subtree that changes one must re-declare the tokens. That is why every themed block targets `:root, [data-theme], [data-neutral]`.

The Playwright/axe browser contrast suite is `pnpm check:contrast`. Its tested
states, reports and limitations are in [CONTRAST-CHECKER.md](CONTRAST-CHECKER.md).

### Tuning a theme

Run **`pnpm dev:styles`** (webpack) rather than `pnpm dev` (Turbopack) when the work is colour. Two things only that mode gives you, and both matter when you are moving between the editor and DevTools:

- **CSS source maps.** `next.config.ts` registers `SourceMapDevToolPlugin` inside its `webpack()` block, which Turbopack never calls, and hands DevTools a `file://` identity so a workspace folder maps a rule back to the file on disk.
- **Readable custom properties.** Tailwind v4 hardcodes its Lightning CSS targets at Chrome 111 / Safari 16.4 / Firefox 128 and reads no `browserslist`, so `light-dark()` is polyfilled into a space toggle no configuration can turn off:

  ```
  --sp-canvas: var(--lightningcss-light, var(--sp-neutral-200))
               var(--lightningcss-dark, var(--sp-neutral-900));
  ```

  `tools/postcss-light-dark` folds that back into `light-dark(…)` so the Styles pane reads character-for-character like `app/tokens/`. It is a postcss plugin, and under Turbopack postcss runs *before* Lightning CSS, so there is nothing to fold yet — hence webpack. It is gated on `NODE_ENV`, so production keeps the polyfill and the browser support that comes with it.

Ink steps are **toward presence**, never "darker": the dark half of a pair moves lighter as the light half moves darker, so a role says the same thing on either canvas. `--sp-text-muted-strong`, `--sp-header-ink` and the sheet's three rungs all read this way, and a pair that moves only one half opens or closes the gap between two roles by half a step without saying so.

Two light-theme values are near their contrast floor and constrain what can go under them. `--sp-text-muted` is `neutral-550` because `neutral-500` reads 3.8:1 on `--sp-surface-inset`, under AA at the micro size the readout is set in; 550 reads 4.8:1, the lightest that still passes. Half a step rather than a whole one, because this role is most of the small text in the app and the quiet it is chosen for can be overdone. The margin is thin enough to be a rule about surfaces: a light surface darker than `--sp-surface-selected` (`neutral-300`, where muted reads 5.2:1) puts the role back under AA, which is why that surface pairs with a primary ink rather than leaving muted on it. The dark halves of both are untouched — they read above 13:1 already, and the two canvases are not failing the same way.

### Dark surface tuning

Dark neutral faces and decorative edges are shifted 50 ramp points deeper,
including their hover and selected states. Unavailable faces use the 900/950
midpoint, 925; the canvas uses 900 and inset uses 950. Status scales and active
field edges retain their existing values. Cyan and teal action faces deepen
further in dark mode to keep white labels above 4.5:1 across their gradients.

The enclosure's white sheen drops from 22% to 16%. Black face highlights use
10%, 20%, 30%, 35% and 40% opacity so their named strengths remain ordered.
These translucent edges are tuned separately from opaque ramp steps.

Dark primary text uses neutral-175, secondary text neutral-350, and stronger
secondary text neutral-250. Header labels and supporting icons, menu links,
run dates and neutral tally numbers follow the same softer hierarchy through
rest, hover and selection. The quietest text stays at neutral-400. Coloured
tally segments use state step 5 backgrounds and step 11 ink in dark mode when
unselected. Selected runs use solid step 10 backgrounds with white ink across
all statuses. Totals stay neutral. Light-mode text is unchanged.

Floating surfaces use neutral-775 for clearer separation from primary panels.
The quiet-button hover top uses neutral-675 to soften its lift and give muted
labels more contrast margin; its bottom remains neutral-750.

The accepted dark hierarchy uses a recessed analysis face with a visible edge,
quieter resting header tabs, a lighter selected run, and muted historical
status labels. Replay badges use neutral surfaces, and unselected ready segments
are quieter than exceptions. These roles live in the shared tokens and utilities;
there is no development comparison switch. The notice keeps its existing face
and uses internal icon alignment in dark mode. Light-mode appearance is preserved.

### State colours

State colours have two layers in `app/tokens/state.css`:

- **Numbered steps** hold palette values: `--sp-state-verified-11` is Radix grass 11 in the default palette, with light and dark variants.
- **Bare names** are text-role aliases: `--sp-state-verified: var(--sp-state-verified-11)`. Use the bare name for state text and icons; use a numbered step when choosing a surface or a specific contrast role.

The six state scales (advisory, verified, caution, decision, blocked and unavailable) expose steps **1, 3, 4, 5, 6, 7, 9, 10, 11 and 12**. Destructive is an action text role and exposes only step 11 and its bare alias. Steps 2 and 8 are not currently part of the app’s token API.

Radix mappings use the same step number in each theme. Tailwind mappings preserve the app’s existing role colours; different step names can resolve to the same shade. In particular, verified 10 and 11 both map to green-700 in light and green-400 in dark. Step numbers do not promise equal lightness increments or contrast on arbitrary backgrounds.

Declare text aliases in each palette scope alongside its steps, because CSS resolves custom-property references where they are declared. `[data-state-palette='radix']` overrides the fallback values; the development picker’s Tailwind option uses the fallback. Palette selection is independent of the decorative tile palette.

Severity buckets republish these steps as `--severity-<step>`, with `--severity` aliasing `--severity-11`. The `severity-ink` utility reads step 11. TypeScript’s tone helpers accept only supported step numbers. When adding a step, update both palettes, the severity mappings and the helper’s `StateStep` type together.

For example, a completed run’s state label uses verified 11 through its bare alias, while the total segment uses verified 10 for its background and verified 1 for its number. These are different roles within the same palette.

### Faces and edges

- **`control-face` is a face and a ring built from registered stops** (`--control-face-top`, `--control-face-bottom`, `--control-ring-top`, `--control-ring-bottom`, `--control-highlight`), so a colour utility restyles it and it animates its own stops. Never put a `transition-*` utility beside it: the utility replaces its property list and the face snaps. Flat controls that answer with a wash take `control-wash` instead.
- **The sheen has two widths.** `--spacing-control-highlight`, a whole pixel, for panes and cards. `control-hairline` asks for `--spacing-control-highlight-hairline` on anything icon- or button-sized, where a full pixel of white inside the ring reads as a second border.
- **A child can follow its parent's state through custom properties.** A row's status badge rests as a keycap and goes bare whenever its row is hovered, focused or current, so the row shows through it: `.process-menu-row` publishes the badge's stops per state and `surface-menu-badge` reads them. The priority between states is then the rule's reading order rather than Tailwind's emission order, and there is no variant per state on the child.
- **A fill laid on a face is a ramp step, not a `color-mix()`.** Give a chip or pill inside a control its own role over `--sp-neutral-*`, picked one step off the face where the fill sits — `--sp-value-pill` is `neutral-200` / `neutral-800` against the quiet face's white→200 and 700→800. A mix resolves against whatever is under it, so its colour is nowhere on the ramp and cannot be matched or reused by name; a step can. Translucent mixes stay for what has to show a surface through it: sheens, washes, highlights.
- **A lit line under a rule is a shadow, not a border.** `shadow-rule-etch` offsets `--sp-rule-etch` by the hairline width. A fractional border snaps to whole device pixels, so a 0.75px border draws as 0.5px on a 2× screen; a shadow's offset paints at the width it asks for.

### Header-control hierarchy

A control group is structural unless it has an intentional shared face. Moving
existing buttons into a group must not silently replace their individual
gradients with the wrapper's background: retain the established resting face on
each item, and give a new group no paint by default.

Treat resting, hover, keyboard focus, pressed, and selected as a complete set
when adding a face or ink role. A selected item may deliberately hold its face
under the pointer, but that is a design decision to encode consistently, not a
missing hover variant. The tab menu's labels and faces therefore name their
resting, interactive, and selected roles separately.

An icon beside a visible label is supporting information. Give it one quieter
ink step at rest, then advance it with the parent through hover, focus, press,
and selected states while keeping it below the label. An icon that is the
control's only visible content inherits the text ink instead. This includes a
responsive control whose label is hidden at that breakpoint: do not leave its
sole visible affordance muted.

### Decorative hue: the workspace menu tiles

The tiles beside the workspace menu's items are the one place colour is decorative rather than semantic. The techniques below are what made them even, and they apply to any per-element hue.

**Resolve `light-dark()` where the colour paints.** A token on `:root` substitutes its `var()`s there, so a hue chosen by a class on one element cannot be resolved on `:root`. Each `menu-tile-<hue>` utility sets five roles, each a light and a dark value — `--tile-face-*`, `--tile-ring-top-*`, `--tile-ring-bottom-*`, `--tile-glyph-*` and `--tile-glyph-hover-*` — and `surface-menu-tile` chooses between each pair with `light-dark()` on the tile itself. The glyph takes the hue through `color`, which `control-face` already transitions.

**Keep palettes behind one set of roles.** Every hue fills its roles from Tailwind's ramps, and again from Radix Colors under a nested `:root[data-tile-palette='radix'] &` inside the same utility. Switching palettes changes values and nothing about how a tile is built.

**Generate Radix; do not import it.** Radix's own stylesheets switch themes with a `.dark` class and reuse the light names for the dark scale, which cannot coexist with `light-dark()` theming. `pnpm colors:radix` runs `scripts/generate-radix-colors.ts` over the installed `@radix-ui/colors` and writes `app/radix-colors.css`: every scale at every step, as `--color-radix-<scale>-<step>` and `--color-radix-<scale>-dark-<step>`, in P3, inside `@theme`. Tailwind emits a theme variable only when something reads it, so the whole set costs nothing until a step is used. Never edit that file by hand; rerun the script after changing the package version.

**Tailwind reads comments too.** It scans source as plain text, so a real theme variable name written in prose — in a stylesheet or a script — is emitted as though a style read it. Write placeholders such as `--color-radix-<scale>-<step>` instead.

**Equal lightness is not equal brightness.** OKLCH lightness is perceptual, but saturated colours look brighter than their lightness says, and by a different amount per hue: most in reds, magentas and blues, least in yellows (the Helmholtz–Kohlrausch effect). No colour space or palette in use corrects for it, which is why both Tailwind's and Radix's scales look uneven across hues. Judge evenness in context and by eye. A greyscale filter measures luminance, which is exactly what this effect makes misleading.

**Cap saturation; keep lightness and hue.** Every tile colour passes through `oklch(from <colour> l min(c, <ceiling>) h)`. A hue already below its ceiling comes through untouched, and only the loud ones are pulled back. The ceilings are tokens in `tokens/geometry.css`, one per part per theme — `--tile-chroma-face-*`, `--tile-chroma-ring-*` and `--tile-chroma-glyph-*`, since a face, a ring and a glyph sit far apart in chroma — and `--tile-chroma-scale` multiplies all of them, so the design pane tunes the set with one slider without changing their proportions. The engaged glyph shares the glyph's ceiling.

**Read a Radix step's role before spending it on colour.** Steps 9 and 10 are solids, 11 is low-contrast text, and 12 is high-contrast text and close to neutral: in light it is darker and duller than step 11, so an engaged glyph mapped to it lost its colour under the pointer. An engaged step should be no darker or duller than the resting one in either theme.

**Keep decorative hues clear of the state hues** — blocked red, caution amber, decision iris, verified grass and advisory blue (the default Radix state palette) — so a tile never reads as a verdict. The processes entry is yellow by choice, the one tile meant to stand out; orange left the set rather than crowd it. Compare decorative greens against verified in the selected state palette; different palette names alone do not guarantee visual separation.

To add a hue, add a `menu-tile-<hue>` block in `globals.css` that fills every role from both palettes, and name the class whole in markup so the scanner sees it.

## Conventions

### A comment earns its place by preventing a wrong edit

A comment in a stylesheet stays only if it would stop a specific wrong edit: a
measured constraint (`4.8:1 on --sp-surface-inset; 500 fails AA at micro`), a
browser behaviour (`Chrome snaps a border to whole device pixels`), or a
dependency another file relies on. Two lines, three where it carries a formula.

Anything longer is a design decision and belongs in this document, under the
section for that part of the system. The stylesheets were 28% comment, with a
22-line essay sitting on one token — which put the prose between the values and
the person tuning them, exactly where it helps least.

Section banners are the exception, and are not per-token prose. One form, so
`Cmd+F` on `/* ──` steps through a file:

```css
/* ── Faces: header button ──────────────────────────────────── */
```

### Never build a class name at runtime

Tailwind scans source files as **plain text**. It cannot see a class assembled from parts, so the CSS is silently never generated and the style silently never applies. There is no error.

```tsx
// Wrong — Tailwind sees neither class
<p className={`text-${size}`} />
<p className={`mt-${spacing > 2 ? '4' : '2'}`} />

// Right — complete class names, chosen at runtime
<p className={size === 'small' ? 'text-meta' : 'text-body'} />
```

Where several elements share a shape, name the whole string once as a module constant — `CARD`, `ICON_BUTTON`, `MENU_LABEL` — and compose with `cx()`. Each constant is a complete literal, so the scanner still sees it.

Where one element's list is long enough to be hard to read, build the constant
with `cx()` and comment each group by what it decides:

```tsx
const NOTICE_BOX = cx(
  // The face: control-face's geometry, the notice's own stops, its sheen.
  'control-face surface-notice shadow-control-highlight-medium-hairline bg-notice-face',
  // The box: the rail column and the text column, tighter below the shell breakpoint.
  'rounded-shell grid grid-cols-[auto_1fr] items-center gap-x-1.5 py-3 pr-3 pl-0 max-shell:py-2.25',
  // The type.
  'text-state-advisory text-micro leading-normal',
);
```

`cx()` rather than a joined array for one reason, and it is an editor reason.
Tailwind IntelliSense only offers hover and completion inside the positions it
is told about: `classAttributes` covers `className="…"` and nothing else, which
is why a class list named as a constant has never had hover in this repo.
`"tailwindCSS.classFunctions": ["cx"]` in `.vscode/settings.json` adds the
function, and every `cx()` call in the codebase gains hover with it. A joined
array cannot be covered that way without a brittle regex, and apostrophes in the
comments break it.

Two things this still does not buy. Prettier does not sort classes outside a
`className` literal — `prettier.config.mjs` sets no `tailwindFunctions` — so the
grouping is yours to keep in order. And Cmd+click on a utility class goes
nowhere in any arrangement; see below.

### Cmd+click goes to names, never to classes

Tailwind IntelliSense provides no go-to-definition for class names, and no
setting enables it. What does navigate is a name: Cmd+click `NOTICE_BOX` or
`ICON_SHAPE` and you land on the definition. That is the whole reason class
lists worth reading are given names.

CSS custom properties navigate too, through the css-variables extension, and it
needs two things from `.vscode/settings.json`. `.next` is excluded, or
`var(--sp-*)` resolves into compiled chunks instead of `app/tokens/`. And
`tailwindcss` is in `cssVariables.languages`: the `*.css → tailwindcss`
association changes every CSS file's language id, the extension only answers for
the ids in that list, and its default list omits `tailwindcss`. Without the entry,
Cmd+click and completion on variables go silent in CSS files while still working
in TSX.

The Unused CSS Classes extension is switched off for this workspace
(`"unusedCssClasses.enable": false`). It reads every `@utility` name as a class,
but counts a class as used only when it appears as a bare token in `className`
or a `cx()`-style call. A utility named in a plain constant, or reached only
through a variant such as `group-hover/enter:surface-menu-tile-hover`, is
reported unused when it is not. Tailwind's build decides what is used.

Where a value is genuinely dynamic, use a `style` prop rather than an interpolated class. `Glyph` does this: its numeric `size` becomes an inline `rem` width.

### Do not put two utilities for the same property on one element

`cx(BASE, 'pl-0')` where `BASE` contains `pl-2.5` is a coin flip — Tailwind emits utilities in its own order, not the string's, so the winner is whichever it happens to write last. Keep the property in one place, or use a variant that cannot collide.

### Reach for a token before an arbitrary value

Markup carries no arbitrary sizing or typography values. Before writing `text-[13px]`, check for a role; before `rounded-[8px]`, check the ladder. If nothing fits, the scale is missing a step — add it in `app/tokens/` rather than a bracket in markup.

The rule is about values a scale could hold — a size, a radius, a type role, a duration.
What legitimately stays in brackets is everything a scale could not:
`border-[CanvasText]`, `border-l-[Highlight]` and `outline-[Highlight]` are forced-colors
system keywords rather than lengths; `h-[min(820px,calc(100dvh-64px))]` and the three
`w-[min(…)]` clamps are composite expressions; `grid-cols-[…]` and `transition-[…]` take a
track list and a property list, neither of which is a value at all; `content-['']` is what
a pseudo-element costs; and `top-[0.65em]` is an optical nudge, which the px table below
names as its own category.

Deliberately not a count. A number in a document rots the first time someone adds a line,
and this one had rotted — `border-[1.5px]` sat in the sidebar for months while this
paragraph said there were four exceptions and none of them was that.

Durations are the one part of the scale Tailwind cannot name for us: there is no
`--duration-*` theme namespace, so `duration-pane` would never generate. The three steps
live outside `@theme` and markup reaches them with Tailwind's custom-property syntax —
`duration-(--duration-pane)`. Still a token, still one definition, and `duration-[220ms]`
stays out of markup.

| Token | Value | For |
| --- | --- | --- |
| `--duration-state` | 150ms | one control answering a pointer |
| `--duration-row` | 180ms | a row settling into a new position |
| `--duration-pane` | 220ms | a whole pane travelling |

### The sidebar's four spacing tokens

`--spacing-menu-fade` is the width of the gradient at each edge of the sidebar, and the
inset the aside holds so nothing sits under one at rest. It is also the height of the
fades at the two ends of the list, and the padding inside the scroller that keeps the
first and last rows clear of them.

`--spacing-menu-rail` is the leading column every band starts with — the brand mark, a
menu item's icon, the reorder handle, the avatar. Each sits in a cell of
that width with `place-items-center`, so they share one vertical axis without any of them
knowing its own size, and the axis is simply half the rail. Wide enough for the largest of
them, so nothing shrinks to fit.

**Put the icon in a cell rather than working out its offset.** Every hand-derived inset in
this sidebar has been wrong at least once: a 30px button in a 34px rail needs 2px, a 36px
mark needs *minus* one, and both numbers go stale the moment the rail moves. A cell needs
no arithmetic and cannot go stale. Two boxes still carry an offset — the brand mark, whose
lockup glues it to its wordmark so it cannot take a cell, and the search glyph, whose field
derives its inset in `.menu-search-field` from the rail, the edge and the glyph's own box
rather than stating it — and both say why in a comment.

`--spacing-menu-end` is the trailing column, the rail's mirror. A row's status badge and
the search field's keycap both sit one cell in from the pane's content edge. It is one
token because those two live in different files, and drift between them is exactly what
the axis exists to catch.

`--spacing-menu-edge` is the edge a row and a grip each draw, and it is a whole pixel.
Everything measured from that edge reads the token, never a number written beside it.
**Chrome snaps a `border-width` to whole device pixels and lays it out at the snapped
width** — `1.5px` is `1.5px` on a 2× screen and `1px` on a 1× one — so only a whole pixel
lays out the same everywhere. The two heavier edges sit where they cannot move an axis:
`--spacing-menu-current-edge` runs along the current row's bottom, and
`--spacing-field-edge` is taken back out of the search field's own insets. `pnpm
check:rail` measures at 2× by default; `--scale 1` shows the other case.

Published a second time as `--border-width-menu-edge`, because `border-*` resolves its
width from that namespace and never from `--spacing-*`; without it `border-menu-edge`
would quietly fall through to the colour branch and mean nothing. It points at the spacing
token rather than repeating the value, so there is still one definition.

### Checking the rail

Switch the guides on from the design pane's **Debug → Icon axis**: four red axis lines,
and a blue crosshair drawn from each marked box's own centre. If the two do not meet, the
box is misaligned. The inner-left guide mirrors the inner-right guide using the
same spacing tokens. The demo notice is a self-contained card; its dark
layout centres the icon in its own column and does not carry a rail marker.

For numbers rather than eyes, start `pnpm dev` and run:

```
pnpm check:rail             # the default: /examples/states, processes level
pnpm check:rail -- --level all --self-test
```

It reports every marked box, the axis it is nearest, and the distance between them. It
reads the axis positions **out of the live `.rail-axis` element's computed background**
rather than from any constant, so the stylesheet is the only place an axis is defined and
the checker cannot disagree with it — change a token and the expected values move on their
own. `--self-test` derives them a second, independent way and requires the two to agree.

Two things it reports that are not failures. A box of **odd width** centres on a half
pixel wherever it is placed, so it can never sit on an integer axis; the fix is an even
box, not a nudge. And an entry in the script's allowlist is a deliberate offset that was
signed off — it is still watched, and reported again if it moves.

`--json` for structure, `--screenshot` for a picture. The numbers are cheaper to read than
the picture and strictly more informative; reach for the screenshot to show a person.

### The notch and slanted controls

`Notch` (`components/ui/notch.tsx`) is the bite a pane's corner takes so controls can sit
on the canvas beside a header. `Button`'s `slant` prop — `left`, `right` or `both` — leans
a control's edges to sit parallel to it; `both` is for the first of two that share a seam.

Both are clipped with `clip-path: shape()`, one layer per band: face, edge and sheen, each
between two copies of the outline offset square to every side. That is what keeps a
hairline one pixel wide down a slope and round an acute or obtuse corner — a skewed box
thins its slanted border to cos(angle) and shears its corners into ellipses. A slant
control's layers read its `control-face` stops, so variants, hover and disabled restyle and
animate it as they would a square button. The outlines read the box through container
units, so nothing needs to know how tall the header is. The notch is the last
cell of a header row: it stretches with the row, so its floor lands on the rule the other
cell draws however the heading wraps.

| Token | Default | Decides |
| --- | --- | --- |
| `--notch-angle` | 25deg | the lean of every slanted edge, from vertical |
| `--notch-bend-top` | `--radius-shell` | where the slope leaves the top edge |
| `--notch-bend-bottom` | unset: the first control's bottom-left radius + `--notch-gap` | where the slope lands on the floor; unset, it stays concentric with the control beside it |
| `--slant-height` | one title line + 2 × (`--spacing-shell-inset` + `--spacing-control-edge`) | a slanted control's height, sized so the heading -- centred in a header that holds the notch's inset evenly above and below the controls -- keeps at least the shell inset above and below; the edge-width either side gives back the icons' 1px optical lift evenly |
| `--notch-corner` | `--radius-shell` | where the floor turns down the pane's side |
| `--notch-gap` | 0.375rem | canvas held between the controls and every edge round them -- the slope, the floor, the pane's top edge and side -- square to each; `.notch` insets by the gap plus `--spacing-control-edge` where the edge is drawn inside its box, and by the gap over cos(angle) along the slope |
| `--slant-gap` | 0.25rem | between two slants sharing a seam, square to it |
| `--slant-corner-balance` | 0.5 | how far a slanted corner's radius follows its angle: 0 is one radius on every corner, 1 gives each the tangent length of a square corner |
| `--notch-bend-balance` | 0.5 | the same for the notch's top bend, held lower so it stays no softer than the pane's corners |
| `--slant-angle` / `--slant-radius` | the notch angle / `--radius-shell` | a slant that should differ from its notch |
| `--notch-face` / `--notch-edge` / `--notch-highlight` / `--notch-pane` | `--sp-notch-*` | colours, per instance: canvas, the pane's ring, its sheen, its face |

Which edges lean is decided where the controls sit, not inside them. The process header
holds two: the Instructions button, which opens the process setup drawer, as `slant="both"`,
then the icon-only placeholder for drafting the next instructions as `slant="left"`, whose
far side stays square, parallel to the pane's side and the notch's gap in from it (`components/app-shell/process-header.tsx`). An icon-only slant takes `px-3` over
the button's own padding and needs an `aria-label`; it is a placeholder, so it is
`aria-disabled` but still focusable, like the sidebar's placeholders, so its tooltip is
reachable.

Override any of them on an element — `[--notch-angle:30deg]` — and everything inside
follows. Slant angle and radius are read with fallbacks rather than declared on `:root`, so
changing the notch's angle on a subtree still reaches the buttons in it.

Two things this asks of the pane. Its face is a layer behind the content rather than its
own background, because a clip never reaches a border and the notch has to cover the edge it
bites through. And the content steps in by `--spacing-control-edge`, the width
`control-face` draws, which the notch pulls back over with `-mt-control-edge
-mr-control-edge`.

### rem for what scales, px for what must not

| Convert to `rem` | Keep in `px` |
| --- | --- |
| font sizes, spacing, radii | border, ring and outline widths |
| breakpoints and container sizes | shadow offsets, blurs and spreads |
| component geometry that holds text | drawn rules and connector lines |
| icon sizes | `999px` / `9999px` pill sentinels |
| | border widths, and **whole** ones: a fraction snaps to whole device pixels, so it lays out differently at 1× and 2× |
| | sub-pixel optical nudges |

Tailwind itself follows this split: its breakpoints are rem, its border and ring widths are px. A `0.0625rem` hairline at a 20px root becomes 1.25px and renders blurred.

**Breakpoints must be rem.** A media-query `rem` resolves against the browser's *default* font size, not the root element. A px threshold mixed into a rem scale keeps its position while the others move, so Tailwind's build-time sort order stops matching the runtime order and the mobile-first cascade can resolve backwards.

Named thresholds: `shell` (56.25rem) is where the sidebar and pane can sit side by side and scroll independently; `runs` (68.75rem) is where the run strip becomes a third column; `card` (25rem) is the container width below which the release card drops to one column.

## Development switches

All of them live on `<html>` — attributes, apart from one inline custom property — applied before first paint and persisted to `localStorage`. The design pane in the bottom-right writes them; none ships to production.

| Attribute | Choices |
| --- | --- |
| `data-theme` | system, light, dark |
| `data-neutral` | the one neutral palette: slate, gray, zinc, neutral, stone, taupe, mauve, mist, olive, or a `radix-*` neutral; also `?neutral=` |
| `data-typeface` | geist, glide, inter |
| `data-mono` | the utility-role family, independent of the set |
| `data-typescale` | base, sharp |
| `data-state-palette` | the semantic state palette: `radix` (default) or `tailwind`; also `?states=tailwind` |
| `data-tile-palette` | the workspace menu tiles' palette: Tailwind (no attribute) or `radix`; also `?tiles=radix` |
| `--tile-chroma-scale` | inline on `<html>`: the multiplier on the tiles' saturation ceilings; the default leaves no inline value, so the tokens stand |
| `data-motion-speed` | CSS transition and animation playback: 1, 0.5, 0.2, 0.1 |
| `data-rail-guides` | `on` draws the sidebar's icon axes; see Checking the rail |
