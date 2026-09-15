# Styling system

How styling is organised, what is settled, and the conventions that keep it that way. Settled 2026-09-10, after the migration from bespoke CSS to Tailwind utilities.

This supersedes the styling sections of [`STAGE-1B-PROPOSAL.md`](STAGE-1B-PROPOSAL.md), which records what was proposed rather than what was built: the palette moved from `stone`/`gray` to `zinc`, and `globals.css` became three files.

Colocated CSS Modules were proposed as an alternative, trialled on one component, and rejected on measurement: they route Cmd+click into `node_modules` rather than to the class, and they compile unlayered, so a module rule silently outranks any utility the markup adds beside it. [Component styling: proposal, independent review, and trial](COMPONENT-STYLING-PROPOSAL.md) records the evidence. The conventions below stand.

## The division

Three stylesheets, each with one job. `globals.css` imports the other two.

| File | Holds | Test for belonging |
| --- | --- | --- |
| `app/tokens.css` | every design token, and the `@theme inline` block that publishes them as utilities | is it a value the system decides once? |
| `app/globals.css` | the base layer, the `@utility` extensions, `@property` registrations, forced-colors and print fallbacks | is it a Tailwind extension or a document default? |
| `app/components.css` | what markup cannot express | see below |

Everything else is a utility in the component.

### What earns a place in `components.css`

Only these. If a rule is not one of them, it belongs in markup.

- **Token derivations a utility cannot compute.** The severity scale reads `--severity` from the element's own `data-severity`, so no build-time utility can resolve it. It derives four weights, and an `@theme inline` block republishes each as a colour so markup can still say `bg-severity-fill`.
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

Every role is declared once with `light-dark()` over a neutral ramp for surfaces, rules, text and action, and Tailwind's own hues for semantic state. `@theme inline` publishes them as `bg-canvas`, `border-rule-strong`, `text-muted` and so on.

A role never names a neutral palette. It reads a step from one of two ramps, and the ramp names the palette — `zinc` by default:

| Ramp | Carries |
| --- | --- |
| `--sp-neutral-*` | canvas, surfaces, text, rules, menus, notices |
| `--sp-control-*` | the faces that answer a press: quiet and unavailable buttons, fields, keycaps and the badges built on the keycap, the menu count chip |

`--sp-control-*` follows `--sp-neutral-*` unless `data-control-neutral` gives it a palette of its own. The intermediate steps (150, 250, 350, 750) are computed as oklab midpoints of their neighbours, so every palette has them. Moving a role between the groups is a change to the ramp name on that one line.

`data-theme`, `data-neutral` and `data-control-neutral` each re-resolve the tokens for their subtree. Because Lightning CSS polyfills `light-dark()` with inherited custom properties, and a custom property substitutes its `var()`s where it is declared, any subtree that changes one must re-declare the tokens. That is why the token block targets `:root, [data-theme], [data-neutral], [data-control-neutral]`.

### Faces and edges

- **`control-face` is a face and a ring built from registered stops** (`--control-face-top`, `--control-face-bottom`, `--control-ring-top`, `--control-ring-bottom`, `--control-highlight`), so a colour utility restyles it and it animates its own stops. Never put a `transition-*` utility beside it: the utility replaces its property list and the face snaps. Flat controls that answer with a wash take `control-wash` instead.
- **The sheen has two widths.** `--spacing-control-highlight`, a whole pixel, for panes and cards. `control-hairline` asks for `--spacing-control-highlight-hairline` on anything icon- or button-sized, where a full pixel of white inside the ring reads as a second border.
- **A child can follow its parent's state through custom properties.** A row's status badge rests as a keycap and goes bare whenever its row is hovered, focused or current, so the row shows through it: `.process-menu-row` publishes the badge's stops per state and `surface-menu-badge` reads them. The priority between states is then the rule's reading order rather than Tailwind's emission order, and there is no variant per state on the child.
- **A lit line under a rule is a shadow, not a border.** `shadow-rule-etch` offsets `--sp-rule-etch` by the hairline width. A fractional border snaps to whole device pixels, so a 0.75px border draws as 0.5px on a 2× screen; a shadow's offset paints at the width it asks for.

### Decorative hue: the workspace menu tiles

The tiles beside the workspace menu's items are the one place colour is decorative rather than semantic. The techniques below are what made them even, and they apply to any per-element hue.

**Resolve `light-dark()` where the colour paints.** A token on `:root` substitutes its `var()`s there, so a hue chosen by a class on one element cannot be resolved on `:root`. Each `menu-tile-<hue>` utility sets five roles, each a light and a dark value — `--tile-face-*`, `--tile-ring-top-*`, `--tile-ring-bottom-*`, `--tile-glyph-*` and `--tile-glyph-hover-*` — and `surface-menu-tile` chooses between each pair with `light-dark()` on the tile itself. The glyph takes the hue through `color`, which `control-face` already transitions.

**Keep palettes behind one set of roles.** Every hue fills its roles from Tailwind's ramps, and again from Radix Colors under a nested `:root[data-tile-palette='radix'] &` inside the same utility. Switching palettes changes values and nothing about how a tile is built.

**Generate Radix; do not import it.** Radix's own stylesheets switch themes with a `.dark` class and reuse the light names for the dark scale, which cannot coexist with `light-dark()` theming. `pnpm colors:radix` runs `scripts/generate-radix-colors.ts` over the installed `@radix-ui/colors` and writes `app/radix-colors.css`: every scale at every step, as `--color-radix-<scale>-<step>` and `--color-radix-<scale>-dark-<step>`, in P3, inside `@theme`. Tailwind emits a theme variable only when something reads it, so the whole set costs nothing until a step is used. Never edit that file by hand; rerun the script after changing the package version.

**Tailwind reads comments too.** It scans source as plain text, so a real theme variable name written in prose — in a stylesheet or a script — is emitted as though a style read it. Write placeholders such as `--color-radix-<scale>-<step>` instead.

**Equal lightness is not equal brightness.** OKLCH lightness is perceptual, but saturated colours look brighter than their lightness says, and by a different amount per hue: most in reds, magentas and blues, least in yellows (the Helmholtz–Kohlrausch effect). No colour space or palette in use corrects for it, which is why both Tailwind's and Radix's scales look uneven across hues. Judge evenness in context and by eye. A greyscale filter measures luminance, which is exactly what this effect makes misleading.

**Cap saturation; keep lightness and hue.** Every tile colour passes through `oklch(from <colour> l min(c, <ceiling>) h)`. A hue already below its ceiling comes through untouched, and only the loud ones are pulled back. The ceilings are tokens in `tokens.css`, one per part per theme — `--tile-chroma-face-*`, `--tile-chroma-ring-*` and `--tile-chroma-glyph-*`, since a face, a ring and a glyph sit far apart in chroma — and `--tile-chroma-scale` multiplies all of them, so the design pane tunes the set with one slider without changing their proportions. The engaged glyph shares the glyph's ceiling.

**Read a Radix step's role before spending it on colour.** Steps 9 and 10 are solids, 11 is low-contrast text, and 12 is high-contrast text and close to neutral: in light it is darker and duller than step 11, so an engaged glyph mapped to it lost its colour under the pointer. An engaged step should be no darker or duller than the resting one in either theme.

**Keep decorative hues clear of the state hues** — blocked red, caution amber, verified emerald and advisory blue — so a tile never reads as a verdict. The processes entry is yellow by choice, the one tile meant to stand out; orange left the set rather than crowd it. Green is Tailwind's and Radix's green, not the emerald the verified state uses.

To add a hue, add a `menu-tile-<hue>` block in `globals.css` that fills every role from both palettes, and name the class whole in markup so the scanner sees it.

## Conventions

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
`var(--sp-*)` resolves into compiled chunks instead of `tokens.css`. And
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

Markup carries no arbitrary sizing or typography values. Before writing `text-[13px]`, check for a role; before `rounded-[8px]`, check the ladder. If nothing fits, the scale is missing a step — add it in `tokens.css` rather than a bracket in markup.

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
menu item's icon, the reorder handle, the notice icon, the avatar. Each sits in a cell of
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

Switch the guides on from the design pane's **Debug → Icon axis**: three red axis lines,
and a blue crosshair drawn from each marked box's own centre. If the two do not meet, the
box is misaligned.

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
| `--notch-bend-top` / `--notch-bend-bottom` | 0.5rem | where the slope leaves the top edge and lands on the floor |
| `--notch-corner` | `--radius-shell` | where the floor turns down the pane's side |
| `--notch-gap` | `--spacing-shell-inset` | canvas held around the content, square to each edge |
| `--slant-gap` | 0.25rem | between two slants sharing a seam, square to it |
| `--slant-angle` / `--slant-radius` | the notch angle / `--radius-control` | a slant that should differ from its notch |
| `--notch-face` / `--notch-edge` / `--notch-highlight` / `--notch-pane` | `--sp-notch-*` | colours, per instance: canvas, the pane's ring, its sheen, its face |

Which edges lean is decided where the controls sit, not inside them. The process header
holds two: the Instructions drawer as `slant="both"`, then the icon-only placeholder for
drafting the next instructions as `slant="left"`, whose far side stays square against the
pane's edge (`components/app-shell/process-view.tsx`). An icon-only slant takes `px-3` over
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
| `data-neutral` | the palette under `--sp-neutral-*`: slate, gray, zinc, neutral, stone, taupe, mauve, mist, olive; also `?neutral=` |
| `data-control-neutral` | the palette under `--sp-control-*`, or match (no attribute); also `?controls=` |
| `data-typeface` | geist, glide, inter |
| `data-mono` | the utility-role family, independent of the set |
| `data-typescale` | base, sharp |
| `data-tile-palette` | the workspace menu tiles' palette: Tailwind (no attribute) or `radix`; also `?tiles=radix` |
| `--tile-chroma-scale` | inline on `<html>`: the multiplier on the tiles' saturation ceilings; the default leaves no inline value, so the tokens stand |
| `data-motion-speed` | CSS transition and animation playback: 1, 0.5, 0.2, 0.1 |
| `data-rail-guides` | `on` draws the sidebar's icon axes; see Checking the rail |
