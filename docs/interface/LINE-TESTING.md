# Line testing

Status: current guide to `pnpm check:lines` and `/workbench/edge-lab`, first
used on the retina edge mode.

A computed style says what width a line asked for. It does not say what each
browser painted. Chrome draws a 0.75px shadow as one solid device pixel and a
second at half strength, which reads as 0.75px. Safari rounds the same shadow
to whole device pixels, edge by edge, so a ring can be one pixel on some sides
and two on others, and a divider can stop a pixel short of the frame it should
meet. Nothing in the DOM shows this; only the pixels do. This guide describes
the checker that reads them, how to read what it prints, and what it has found.

```sh
pnpm check:lines                                        # the edge lab, Chromium and WebKit
pnpm check:lines -- --browser chromium,webkit,safari    # and Safari itself
pnpm check:lines -- --route /processes/brunch-orders    # a real screen
pnpm check:lines -- --theme dark --scale 3              # dark theme, at 3×
pnpm check:lines -- --route /workbench/rounded-edges --browser chromium,safari --loupe
pnpm lines:compare -- --box .shell-pane --corner 'bottom left' --radius 10 \
  --reference /workbench/rounded-edges --reference-box '[data-specimen="layered/pane"]'
pnpm check:lines -- --help
pnpm exec playwright test e2e/design/line-geometry.spec.ts --project=light
pnpm exec vitest run scripts/checks/line-geometry       # the measuring code, no browser
```

Exit 0 clean, 1 findings that fail, 2 it could not run.

## Before running it

- **`pnpm dev` running.** The checker uses `http://localhost:3000` unless
  given `--url`.
- **WebKit installed** for Playwright: `pnpm exec playwright install webkit`.
- **For Safari:** quit it first (⌘Q, not just closing its windows).
  `safaridriver` must start Safari itself; a Safari you opened refuses the
  session and the request times out. Its log says _Safari was not launched for
  automation_. Settings › Developer › _Allow remote automation_ must be on, and
  `safaridriver --enable` run once. The checker opens its own Safari window and
  closes the session when it is done; you can reopen your own Safari afterwards.
  Safari stops rendering while its window is covered or in the background, so
  it comes to the front while it is measured; the checker refuses to measure a
  frame Safari has not painted. Chromium and WebKit run headless.

Safari draws at the screen's own pixel ratio (2× on a Retina Mac); `--scale`
sets the ratio for Chromium and WebKit only. Its window cannot be larger than
the screen, so when Safari is asked for it is captured first and every browser
is read at the viewport it got (the checker says so). Safari's screenshots also
carry one or two levels of colour-conversion noise on flat faces, which the
tolerances allow for.

## How it measures

Each browser loads the page in the edges mode and theme asked for, waits for
fonts, and is then prepared so that only faces and lines are left: glyphs are
made transparent with `-webkit-text-fill-color` (lines drawn in `currentColor`
keep their colour), icons, images and the development overlays are hidden, and
transitions and scrollbars are turned off. Nothing moves. The screenshot is then
read in device pixels.

**A profile** is the run of pixels across one edge, from outside to inside,
trimmed to the pixels that differ from both sides. It is printed as each
pixel's luminance:

```
174·206   one pixel of the line colour, then one between it and the face:
          a 0.75px line at 2×, drawn with a soft last pixel
174·174   two solid pixels: 1px at 2×, or 0.75px rounded up
174       one solid pixel: 0.5px at 2×, or 0.75px rounded down
```

**A segment** is a straight line found in the image itself: in every column
(for horizontal lines) or row (for vertical ones), a stack of thin runs between
two wide ones, repeated along the line. Because it needs no DOM box, it finds
lines drawn by pseudo-elements, gradients and shadows as readily as borders.

**A junction** is where one segment ends against another, and reads as one of:

- `meets` -- it stops on the other line's near side,
- `enters N` -- it paints N pixels into the other line,
- `gap N` -- N background pixels between them,
- `overshoot N` / `pokes N past` -- it runs through and out the other side.

A line the same colour as the edge it crosses does not show inside it, so
poking through is found as a short stub just past the edge.

## Reading the edge lab

`/workbench/edge-lab` has no text. Every specimen sits in a cell of whole
pixels; only its own declared offset is fractional. The sections are rings
(border, inset and outset shadows, ring with highlight), single lines (border,
inset shadow, gradient stop, element height) and junctions (a frame's ring over
its highlight, with a header rule and column divider meeting it, as the process
sheet draws them). Each recipe is drawn at 0.5, 0.75, 1 and 1.5px and at offsets
of 0, .25, .33, .5 and .75px; the 0.75px rows add radius and composited
variants.

Each specimen declares what it is, and the checker reads only that:

| Attribute       | Meaning                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-approach` | `border` rounds down to whole device pixels; `layered` rounds up with a soft last pixel; `native` is a fractional shadow or gradient left to the browser; `live` reads the app's own tokens |
| `data-sides`    | which sides carry the line (`all` or `bottom`)                                                                                                                                              |
| `data-total`    | the full width in CSS px, ring and highlight together                                                                                                                                       |

Border and layered specimens **must** be even on every side and at three points
along each, as thick as declared, and alike in every browser (within two
luminance levels). Native and live specimens are **reported** and never fail
the run: they are what is being studied. The junction-live row reads
`--edge-ring`, `--spacing-control-highlight` and `--edge-hairline`, so it moves
when those tokens do.

The table has one row per recipe, width and variant, and one column per
browser. A column shows ✓ or ✗ and the top edge's profile at offset 0. Below
the table, each ✗ is broken down by browser and offset:

```
ring-inset/0.75/plain  [native, reported]
  webkit: +0: differs from chromium: 174·206 there, 174·174 here
stack-layered/0.75/radius  [layered, must pass]
  safari: +0: differs from chromium: 174·210·246 there, 174·206·243 here
```

`uneven` lists every distinct profile and where it was read (`bottom 25%` is a
quarter of the way along the bottom side). `3dp where 2dp is meant` compares the
profile's length with the declared width.

The last grid holds **notch specimens**: the app's own `Notch` and slanted
`Button` on a pane fragment, the pane and header drawn as `app-shell.tsx` and
`process-header.tsx` draw them (the header is `.process-header`, so its rule
is the live one), with the sheet's frame under the right notch for the lit
line under the rule and the arc round the turn (`process-sheet.css`). Their offset widens the button rather than moving the box,
so the notch's sloped edge lands on every fraction of a pixel, which is what
`NotchSnap` corrects. Rows: `right` and `left` (the menu's mirrored notch), as
the app draws them. (Held at `--notch-snap: 0`, the specimens off the grid
differed from Chrome in about twice as many pixels: the snap earns its place.) A notch has slopes and bends that no side profile can
read, so each one is judged two ways: its straight lines for thickness steps,
gaps and overshoots, as a junction is, and its whole box against the reference
browser by pixels, unaligned, failing past 16 levels (the cross-engine corner
floor plus a little). Both are reported, never gated: the lab compares
browsers, and the notch still differs between them (see
[Open work](#open-work)).

```
notch/right/plain  [live, reported]
  webkit: +0.33: differs from chromium by up to 39 levels, 407 pixels past 8 (mean 0.19)
```

To add a specimen, add a recipe to `RINGS`, `LINES` or `JUNCTIONS` in
`app/workbench/edge-lab/page.tsx` and its rule in `edge-lab.css`. Keep the cell
sizes whole pixels.

Any workbench page whose elements carry `data-specimen` is read the same way,
as `/workbench/rounded-edges` is. `--loupe` writes every specimen at offset 0
enlarged eight times, the browsers side by side in the order given, to
`test-results/line-geometry/loupe/`: the way to see a difference of one device
pixel or a few levels of grey.

## Reading a screen

Any route other than the lab is read as a screen. For each browser it prints
how many lines it found and their thicknesses, then the findings, with
positions in CSS px from the top left:

```
/processes/brunch-orders in webkit (2×): 46 lines — 1dp×15 2dp×4 3dp×26 4dp×1
  1 finding(s) on this screen, 37 difference(s) from chromium; marked up in …
  red     at 260.0,65.0 css px: pokes 2dp past the line it meets
  magenta at 261.0,64.5 css px: 1dp here, 2dp in the reference
```

**Red** is a fault on that screen alone: a line that changes thickness along its
length, a gap at a junction, a line poking through. **Magenta** is a difference
from the reference browser (the first `--browser`): thicker or thinner, other
layers, missing, or ending elsewhere. Each browser's screenshot is written,
dimmed and boxed, to `test-results/line-geometry/<route>-<browser>.png`.

A screen's findings are reported and do not fail the run unless `--strict` is
given. Layout can differ slightly between browsers where text metrics differ,
which shows as lines that are missing or end elsewhere; thickness and layer
differences are the ones to act on.

## How a layered line works

A layered line draws Chrome's soft last pixel itself, from widths that are whole
device pixels, so no browser has anything to round. With one device pixel as a
length (`--dp` in the app, `--lab-dp` on the lab; `DevicePixelScript` sets it
from `devicePixelRatio` and updates it when that changes):

```css
--solid: max(var(--dp), round(down, var(--w), var(--dp)));
--soft: calc(var(--solid) + var(--dp));
--cover: calc((var(--w) - var(--solid)) / var(--dp) * 100%);
box-shadow:
  inset 0 0 0 var(--solid) var(--line),
  inset 0 0 0 var(--soft)
    color-mix(in srgb, var(--line) var(--cover), transparent);
```

At 2× a 0.75px line is 0.5px solid and one more pixel at 50%, which is exactly
what Chrome paints. The same recipe works for outset rings, single sides,
gradient stops and ring-with-highlight stacks. `ring-border-layered` draws the
solid part as a `border` instead, and only the soft pixel as a shadow.

The app draws every fractional edge this way. `app/styles/geometry.css` splits
each width token into `-solid`, `-soft` and `-cover` (`--edge-ring-solid`,
`--highlight-pane-cover`, …, and `--ring-pane-*` for a ring with a pane's sheen
inside it); a rule whose width is its own, such as a control's ring plus its
sheen, splits it locally the same way. See
[Faces and edges](STYLING-SYSTEM.md#faces-and-edges).

## Rounded controls

`/workbench/rounded-edges` draws a control's ring and sheen five ways on the
app's widths and shapes (button, icon square, pill, card, pane): fractional
shadows as before, layered (what the app draws), a 0.5px border ring, layered
borders (every band a border, on the element and two pseudo-elements), and a
border for the ring's solid pixel with only its soft pixel as a shadow. In
Safari, measured on 22 November 2026:

| Option               | Safari against Chrome                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| fractional           | uneven: one pixel on two sides, two on the others                                         |
| layered              | even; the sheen's soft last pixel lands a few levels lighter inside a radius; pills exact |
| 0.5px border ring    | identical in every browser, the ring one device pixel instead of one and a half           |
| layered borders      | identical in every browser on the straight sides                                          |
| border + soft shadow | the ring as Chrome's; the sheen as layered                                                |

Inside a radius, Safari softens the inner edge of any inset shadow along the
straight sides; it draws a border exactly. Round the corners themselves, with
Safari's captures aligned to Chrome's, the curve differs least with layered
shadows (worst pixel 11-13 levels, under ten pixels past 8 levels per corner),
then layered borders (19-22), then a 0.5px border (28-37) and fractional
shadows (36-45): each engine antialiases a curve its own way, whatever draws
it. The app keeps layered shadows.

## What has been measured

On 22 November 2026: Chrome (Playwright's Chromium), Playwright's WebKit 27.2
and Safari 27.2 on macOS 15.8.2, at 2×, light and dark.

| Drawn as               | Chrome              | WebKit (Playwright)          | Safari                                |
| ---------------------- | ------------------- | ---------------------------- | ------------------------------------- |
| border, any width      | rounded down, even  | the same                     | the same                              |
| 0.75px inset spread    | solid + 50%         | 2 solid                      | 1 or 2, by side and position          |
| 0.75px outset spread   | 50% + solid         | 1 or 2, by side and position | 1 or 2, by side and position          |
| 0.75px one-sided inset | solid + 50%         | 1 solid                      | 1 solid                               |
| 0.75px gradient stop   | 1 solid             | 2 solid                      | 2 solid                               |
| 0.75px element height  | 1 or 2, by position | as Chrome                    | 1 or 2, the opposite positions        |
| layered, any width     | as declared         | identical to Chrome          | identical to Chrome, without a radius |

"By side and position": one pixel on two sides and two on the other two, the
sides swapping as the box moves by a fraction of a pixel -- the uneven rings
seen in Safari. Playwright's WebKit is not Safari: it disagrees with Safari on
several native cases. Judge Safari with `--browser safari`.

At the sheet-style junction, Safari and WebKit draw the native header rule at
one pixel instead of two and paint it a pixel into the frame's ring, and move
the column divider a pixel right. Drawn layered, the junction is identical in
all three.

The data table's corners, once its clip moved one element in
(`.data-table-clip`): the bottom corner identical to an unclipped ring in
Chromium and WebKit (0 levels; 17-18 before), the top within 2. The pane's
corner, once its clip was rounded tighter: within 3 of the workbench reference
(19 before).

## Investigating a difference

What worked, in this order:

1. **Find it.** `pnpm check:lines -- --route <screen>` marks every line that
   differs between browsers or changes along its length; `--loupe` on a page of
   specimens, or `pnpm lines:compare` on any region, enlarges it.
2. **Compare against something known to be right.** A workbench specimen drawn
   the same way (`/workbench/rounded-edges`, the edge lab) in the _same_
   browser is the reference for a live screen; another browser is the
   reference for an engine difference. Make sure the reference is right where
   it is compared: an unclipped table is a fair reference at its bottom
   corners, not at its top ones, where its header band then shows past the
   curve.
3. **Measure what you mean.** `lines:compare --radius` scores only the pixels
   on a corner's arc, so a rule or row shifted nearby does not count against
   the curve. Crops are aligned within two device pixels first: text above a
   box lays out a pixel apart in different engines, and every box below it
   moves with it.
4. **Isolate the cause with CSS variants, not edits.** `--variant 'name=css'`
   adds a stylesheet for one capture: switch a clip off, hide a layer, try a
   radius. A diagnostic variant (`overflow: visible`) that fixes the
   difference names the cause; a candidate fix then has to match it. Injected
   rules lose to the page's own on specificity -- use `!important`, or the
   variant silently changes nothing.
5. **Check positions, not only widths.** `--probe`-style box reads
   (`capture.ts` `probes`) give each element's box in CSS px; times the pixel
   ratio, any fraction is a box between device pixels, which engines round
   differently.
6. **Iterate headless, confirm in Safari.** Playwright's WebKit reproduces most
   of Safari's rounding and runs without a window. Confirm in Safari once, and
   run a Safari capture twice before believing it (see below).

## Causes found, and the rule each gives

| Cause                                                                 | What it looked like                                                                   | Rule                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fractional width in a shadow, gradient stop, clip or element height | Safari's rings one pixel on two sides, two on the others; rules a pixel thin or thick | Draw it as whole-device-pixel layers: `-solid` and `-soft` from `geometry.css`                                                                            |
| A box edge between device pixels                                      | A curve or line a third or half of a device pixel off in WebKit                       | Put the box on the grid: whole-pixel tokens, or, for a box sized by its content, snap it as `NotchSnap` does                                              |
| A clip whose curve is the ring's own curve                            | The ring's outermost pixel thinner round the corners, in every browser                | Never clip a ring on its own curve: round the clip tighter when the face is a separate layer (the pane), or clip in an inner element (`.data-table-clip`) |
| `overflow-clip-margin`, which Safari does not support                 | Rules stopping two device pixels short of the ring                                    | In `@supports not (overflow-clip-margin: 1px)`, clip the paint with `clip-path: inset(-1px round …)` and the element's radii grown by that pixel          |
| A border or outline round a curve in Chrome                           | The same ring 20-30 levels off the shadow-drawn one on the arc                        | Draw rounded rings as shadows; borders only where there is no curve to match                                                                              |
| Safari softening an inset shadow inside a radius                      | The last soft pixel 3-4 levels lighter                                                | Inherent; below what can be seen. Corners differ between engines by 12-13 levels at most, whatever draws them                                             |
| A `clip-path` that ends on its own box's edge (WebKit)                | The notch's face let the pane's ring show through as a faint line above the turn      | Let the shape and its box reach past the edge it covers (`.notch-face`, 1px)                                                                              |
| A fill's background box ending on a half device pixel                 | The slanted button's top ring two solid pixels: the face's box snapped down off it    | Paint a fill past its clip (`--s-bleed`), so only the clip's edge is antialiased                                                                          |
| A curved line drawn as one antialiased band                           | The notch's bends one blurred band where the pane's own corners read solid then soft  | Draw it as the straight sides are: a solid band and a soft one, each clipped (`.notch-edge`, `.notch-edge-soft`)                                          |
| Two layered lines laid one over the other                             | The notch's floor and turn on the header's rule: the soft row doubled, 20 levels dark | Lay the upper line's soft row on what the lower one's lies on -- the highlight, in `.notch-under` -- never on the other line                              |
| Half pixels that cancel out                                           | Fixing one edge onto the grid moves another off (the narrow notch)                    | Change the geometry as a whole, never one length of it                                                                                                    |

## Pitfalls in measuring

- **Safari renders only while visible.** A covered or background window stops
  painting, and WebDriver then returns an old frame: the same variant measured
  fixed in two runs and broken in a third. `capture.ts` now refuses to
  measure when no animation frame arrives, and shoots until two frames agree.
- **Playwright's WebKit is not Safari.** It differs on several native cases
  (see the table above). Iterate in it; decide in Safari.
- **A page that polls never goes network-idle.** Captures wait for `load` and
  then for the page to settle.
- **Infinite animations cannot be finished**; captures pause them.
- **Safari's screen bounds its window.** When Safari is asked for, the checkers
  capture it first and read every browser at the viewport it got.
- **Colour noise.** Safari's screenshots carry 1-2 levels of noise on flat
  faces, and its long lines come out as many short segments in a screen
  reading; the tolerances allow for the first, and the segment count is not a
  verdict.
- **A T-junction is not a poke-through.** A line that continues past a junction
  can change its layers for a few pixels; the checker counts a stub only when
  nothing continues after it.
- **The dev server recompiles under you** while files change: a timed-out page
  is usually that, not the change under test.

## Open work

- **The slanted button's own width.** The notch's inset is now rounded up to
  a device pixel (`--notch-inset`, and `--spacing-shell-header` with it: 6px
  where 5px gap and 0.75px edge made 5.75), which put the button's top and
  bottom on the grid and halved the notch specimens' difference from Chrome
  at offsets 0 and 0.5 (worst 49 to 20-22). Where the button's width is
  itself a fraction (offsets 0.25, 0.33, 0.75; in the app, its label's
  width), its slanted side is still off the grid and WebKit differs by 32-47.
  `NotchSnap` could round the button's width up the same way it rounds the
  notch's.
- **The narrow notch.** Its floor (`--narrow-title-height`, 41.75px) and its
  side turn (`--notch-corner` minus the edge, 9.25px below) are half device
  pixels that add up to a whole one. WebKit draws the narrow header's band a
  device pixel thicker than Chrome. Redraw the notch's floor, side turn, cover
  and arc on the grid together, then re-measure the notch-join test's rows
  (`e2e/shell/process-dividers.spec.ts`, "mobile notch borders").
- **The top of the runs column in Safari** -- the divider meeting the header
  rule, the sheen below the header at the pane's left edge -- after the sheet
  rework then in progress settles.
- **The visual baseline** (`pnpm check:visual:update`) once the tree is
  otherwise clean, so it records these edges and nothing else.

## Limits

- **Rounded corners in Safari.** Safari softens an inset shadow inside a
  `border-radius` along its straight sides as well: a layered 0.75px ring reads
  `174·205·236` where Chrome reads `174·206`. The third pixel is about four
  levels off the face, below what can be seen but above the checker's
  tolerance, so those rows fail in Safari by design. A plain `border` with the
  same radius is exact on straight sides; see [Rounded controls](#rounded-controls).
- **3× screens.** WebKit is uneven at 3× where a box sits off the device-pixel
  grid, and four-layer stacks gain a pixel on one side even on it, because one
  device pixel (1/3px) is not a whole number of WebKit's 1/64px layout units.
- **Corners in the lab are not measured.** Each engine antialiases curves its
  own way; profiles are read on straight sides, clear of the radius. Use
  `lines:compare --radius` for a curve.
- **Zoom.** Browser zoom gives fractional ratios such as 2.2×, where no CSS
  width is a whole number of device pixels; expect small differences there.
- **CI runs Chromium on Linux only.** The spec's Chromium half runs there; the
  WebKit comparison runs on macOS only (`@local-baseline`), since Linux WebKit
  does not paint with Safari's graphics stack.

## Where things are

| File                                       | Does                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `scripts/checks/check-line-geometry.ts`    | `pnpm check:lines`: lab tables, screen readings, marked-up screenshots, loupes              |
| `scripts/checks/compare-lines.ts`          | `pnpm lines:compare`: one region across browsers, a reference page and CSS variants         |
| `scripts/checks/line-geometry/capture.ts`  | captures from Playwright and Safari's WebDriver: page preparation, extra CSS, element boxes |
| `scripts/checks/line-geometry/analyse.ts`  | profiles, segments, junctions, comparisons -- pixels in, no browser                         |
| `scripts/checks/line-geometry/evaluate.ts` | verdicts: the lab against its declarations, a screen against itself                         |
| `scripts/checks/line-geometry/compare.ts`  | region crops, aligned comparison, arc masks, enlarged sheets                                |
| `scripts/checks/line-geometry/png.ts`      | PNG decoding and encoding with `node:zlib`                                                  |
| `app/workbench/edge-lab/`                  | the lab page and its recipes                                                                |
| `app/workbench/rounded-edges/`             | a rounded control's ring and sheen five ways                                                |
| `app/styles/geometry.css`                  | `--dp` and every width split into `-solid`, `-soft`, `-cover`                               |
| `components/ui/device-pixel-script.tsx`    | sets `--dp` before first paint and when the ratio changes                                   |
| `components/ui/notch-snap.tsx`             | puts a notch's loose edge on a device pixel                                                 |
| `components/app-shell/resizable-shell.css` | the pane's clip, rounded tighter than its ring                                              |
| `components/app-shell/runs/runs-list.css`  | `clip-past-pane-highlight`, with Safari's `clip-path` fallback                              |
| `e2e/design/line-geometry.spec.ts`         | holds the lab in the suite                                                                  |
