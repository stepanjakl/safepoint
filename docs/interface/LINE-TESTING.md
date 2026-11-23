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

## Where the edge meets other lines

The pane's edge is two device pixels at 2x, and most of the edge work of
November 2026 was about what happens where another line meets them. The
names used here, in the code and on `/workbench/soft-rows`:

| Name         | What it is                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| solid row    | the ring's outer device pixel, the ring colour (`--edge-ring-solid`)       |
| soft row     | the ring's next device pixel, the ring colour at `--edge-ring-cover`       |
| highlight    | the pane's lit pixel inside the ring (the sheen)                           |
| rule         | a hairline across the sheet: a row rule, a head's rule, the header's rule  |
| band         | a full-width fill: a section head, the boundary band (`.sheet-break`)      |
| lit row      | a hovered, focused or current row's fill                                   |
| ring overlay | `.shell-pane::after` (z 5): the pane's solid and soft rows, over the sheet |
| sheet layer  | `.process-sheet-swap` (z 1): everything in the sheet, under the overlay    |

The stacking decides most of it. The ring overlay lies over the sheet so no
band or row can cover the ring; nothing inside the sheet layer can rise above
it, whatever its `z-index`; the header (z 10) lies over both.

### How it is drawn now: a translucent soft row

The soft row is the ring colour at half strength over whatever lies beneath,
so a rule running under it still reads as ring there and joins the solid row
by itself. Where two soft rows land on one pixel they double, and that is
what each piece below prevents:

- **The header's rule runs solid on top, then soft**, so the row under the
  header reads like the pane's sides: 174, 210, 246 in light, 58, 39, 19 in
  dark. At desktop width it is two background bands, not an inset shadow, and
  its soft row is translucent over the highlight the sheet frame paints one
  device pixel above itself (`.process-sheet-frame` box-shadow), so the
  column divider (`--divider-from-rule`) runs up through it to the solid row.
- **The notch's edge is two bands**, solid and soft, so its bends read as the
  straight sides do. Its floor starts at `--notch-floor`, the edge's painted
  depth, so it lies on the rule pixel for pixel.
  - `.notch-lining` lays the highlight under the soft band along the floor,
    so it does not double the rule's soft row. Only there: anywhere else it
    would show (a stripe under a band, a streak at the foot).
  - `.notch-edge-soft` is masked off the pane side's own soft column, which
    reaches up into the bottom of the turn.
  - Every layer starts `--n-lead` back along the top edge, on a device pixel
    counted from the pane's side (`--n-lead-x`): a start between pixels left
    a one-pixel seam where the bend leaves the edge.
- **Bands stop before the soft row.** `sheet-band` paints a band
  `--band-start`/`--band-end` short of a side its column bleeds to
  (`sheet-bleed`, `sheet-bleed-end`, the flat `.drawer-aside`, which bleeds
  1px like them). Rules still run to the ring. Without this the soft row
  reads ring over band (47 in dark, 203 in light) beside a band.
- **The slanted control's face bleeds past its clip** (`--s-bleed`): at 0 its
  box snapped to a device pixel and left the top ring two solid pixels.

### Translucent or opaque: the experiment

An opaque soft row -- one fixed shade, ring mixed with highlight -- cannot
double, so it would need none of the lining, the mask or the band pull-back.
It was tried as injected CSS against the current drawing, in Chromium,
WebKit and Safari, light and dark, at the bend, foot, turn, a band and the
divider:

| Case                                | Translucent (now)        | Opaque                           |
| ----------------------------------- | ------------------------ | -------------------------------- |
| Bend, turn, plain side              | correct                  | the same, within 2-7 levels      |
| A band beside the side              | needs the pull-back      | correct with nothing extra       |
| Two soft rows on one pixel          | needs the lining or mask | correct                          |
| A rule meeting the side             | joins                    | one pixel short (174 to 210)     |
| The notch's foot crossing the rule  | unbroken                 | the rule's solid row broken (36) |
| The divider through the header rule | joins                    | the gap returns                  |
| Safari against Chrome               | within about 10 levels   | within about 10 levels           |

An opaque soft row paints over anything that meets or crosses it. Ending a
line exactly at the soft row does not help: the soft row is then between the
line and the solid row, and reads as a pixel's gap. To join, the line has to
be painted over the soft row -- above the ring overlay, which the sheet layer
does not allow -- and a crossing, such as the notch's foot, has no edge to
stop at. Translucency needs a fix where two soft rows meet (a few places,
round the notch); opacity needs one wherever another line meets the edge
(every rule, divider and crossing).

`/workbench/soft-rows` shows each case enlarged, a square per device pixel,
the two side by side.

### The opaque soft row, as built

Both styles are now drawn, switched by `data-soft-rows` (the design
controls' "Soft rows", `?soft-rows=` in the address; translucent when unset).
The attribute only sets two variables (`app/styles/geometry.css`), so it
works on any ancestor and the nearest wins -- `/workbench/soft-row-styles`
shows both at once that way:

- `--soft-row-in-face`: the pane's soft row moves from the ring overlay, over
  the sheet, into the pane's face, under it (`resizable-shell.css`). A rule
  running to the ring then paints over the soft row and joins the solid row,
  which answers the first broken row of the table.
- `--soft-row-under`: the notch's soft band is mixed with the sheen rather
  than laid over what is beneath.

The other two broken rows needed no mode of their own:

- The notch's soft band leaves out the header rule's solid row (two
  background bands, above and below it), so the foot crosses the rule
  without breaking it in either style.
- The header rule's soft row stays translucent over the highlight the sheet
  frame paints under it, which is exactly the opaque shade and lets the
  divider through.

With the soft row under the sheet, the burden moves: anything in the sheen's
colour that reaches the ring would now cover it. Each such piece stops at the
ring's whole depth (`--edge-ring-depth`) in both styles: the bands
(`sheet-band`), the head's lit line (now `.sheet-head::after`, as a shadow
cannot be shortened at one end), the sheet frame's arc round the turn, and
the lit line beside a column divider (`--column-divider-lit`, ended by a
clip, `--column-divider-clip`, while the divider runs on). The dividers themselves end on the
solid row, on whole pixels (`--divider-to-ring`).

Measured: the two styles differ on the lab page by 6-7 levels at most
(antialiasing on curves), the side check finds nothing in any tab in either
style, and in Safari both match Chrome within about 10 levels at the bend,
foot, turn, a band and the divider. The junction tests run in both styles,
and undoing any of the pieces above fails exactly its own check.

### A rule with its lit line is one line

The pane's edge is its ring and sheen drawn as one 1.5px line split once into
device pixels: solid, the soft row mixed with the sheen, the sheen -- three
rows at 2x. A rule with a lit line beside it used to be two lines, each split
on its own (soft, solid, sheen, half-sheen: four rows), so its sheen read
thicker and doubled beside the pane's single crisp one. In the process sheet
it is now drawn as the pane's edge, solid outside: the header's rule, the
section heads' rules (`.sheet-head`, its lit line in `::after`) and the column
dividers (`--column-divider`, `--column-divider-lit`, the lit line ended above
the ring's soft row by a clip). The mix row is opaque, ring mixed with the
sheen, since under a rule there is a band, not the sheen. At 2x the sheen is
then one whole, opaque pixel; at 1x and 3x a fraction of it remains, laid on
whatever is beside the line.

`e2e/shell/edge-junctions.spec.ts` compares a section head's rule and a
divider with the pane's side, row for row.

`rule-below` and `rule-above` (drawer headers and footers, definition cards,
the section band) keep their heavier 1px rule -- the owner's choice on
`/workbench/section-rules`, which shows it beside the 0.75px option and the
old drawing -- with one whole row of sheen. Both end at the surface's ring:
the rule at its solid row, which it joins by covering the soft row, the sheen
at its soft row. A border or a shadow cannot stop short of its box's ends, so
one pseudo-element paints both, each band inset by its own amount; the border
keeps its place, unpainted, and forced colours keep it plain.

### Every line meets the edge it reaches

The rules all of the above keep, at any surface with a ring:

1. Nothing crosses the solid row: along an edge it is the ring's shade from
   end to end.
2. A line that meets the edge joins it through the soft row: on the line's
   solid row the soft row takes the line's shade.
3. Everywhere else the soft row keeps its own shade, whatever lies beside it:
   a band, a turn, or the soft row of a line meeting it. Never a shade
   between the two -- that is two soft rows on one pixel. The one exception
   is a lit row: its fill runs to the solid row (`--row-band-start`), so
   beside it the soft row is the fill, or in the translucent style the soft
   row over the fill. Above a lit first row the head's rule gives its soft
   row to the fill too (`.sheet-head::before`). `surface-edges.spec.ts`
   holds both ("a lit row's fill meets the solid rows round it"), and
   `crossingFaults` compares only the solid row on a side with a lit row.

`e2e/support/edge-pixels.ts` reads an element's edges as strips a few pixels
deep and checks the three (`edgeFaults`, `surfaceFaults`). A line counts only
where it runs straight in from the edge, so text and icons near it do not.
`e2e/shell/surface-edges.spec.ts` holds the app's pane in every tab and both
soft row styles, the section rule card and definition cards to them; along the
pane's foot, which the sheet scrolls under, a line may also stop at the soft
row. Undoing a fix shows as the rule it breaks: a sheen across the ring reads
"the solid row 246, not 176".

### Where two lines meet inside a surface

The three rules hold a line against a ring. Where a column divider meets a
rule inside the sheet, neither is a ring, and they need rules of their own
(`crossingFaults`):

1. Each keeps its profile through the meeting: the rule reads the same left
   and right of the divider, the divider the same above and below the rule.
2. The solid row and column stay solid where they cross. A rule from the
   left ends at the divider's solid column; one from the right, or across,
   runs on through its soft column.
3. The pixel where the two soft rows cross is a soft shade, never both: two
   soft rows on one pixel read darker than either (in dark, 49 among 40s).

`surface-edges.spec.ts` finds every crossing from the page -- the header's
rule, and each section head that ends or starts at a divider -- in Runs and
Instructions, both themes and both soft row styles. Rule 3 of the edge used to
allow a blend beside a line, and that let this doubling through, at the
dividers and where the header's rule and each head's meet the pane's side;
it no longer does. The pane's side is read from the header's rule down, not
from below it: a check that starts past a junction cannot see it.

Below a band the divider carries its lit line and the band's rule carries
its own, and they meet in an L inside the corner, as the pane's ring and
sheen do; the band covers both. `/workbench/section-rules` shows the meeting
as it was, as drawn, and with no highlight in the corner.

### In every browser, at every width

The specs read Chromium at 1440px. `pnpm check:junctions`
(`scripts/checks/check-edge-junctions.ts`) runs the same rules -- the pane's
sides and foot, each divider's crossings, the lit first row -- on the live
app in Chromium, WebKit and Safari, both themes and both soft row styles, at
the widths given (`--width 1000,1312`; Safari's window is bounded by the
screen, 1312px here). Undoing the header rule's or the run strip's fix fails
it at exactly that place.

What it found that the specs could not: below 52rem the run list becomes a
strip across the top, and its bottom rule's soft row doubled at both sides
-- in every engine. What a whole-screen diff of Safari against the others
found that is not an edge: Safari paints the blue fills a greyer blue,
dithers gradients, and Chromium places the header's tab pills a device pixel
off WebKit and Safari (text widths differ).

### Floating edges

Tooltips and popovers draw their ring and sheen as the pane does: each soft
row an opaque mix of what it lies between. Their dark outline lies over
whatever is behind them, so it is drawn as the ring is but in fixed steps: a
solid device pixel of the outline (`--sp-*-outline`, neutral-925 in dark) and
beyond it a fainter one (`--sp-*-outline-soft`, neutral-875), its soft row;
both are transparent in light. Four lines in all, each one device pixel.

The tooltip's arrow draws the same layers. At 2x every layer is a stroke on
the box's outer edge line, twice the layer's depth wide and clipped to the
arrow's inside (`TooltipArrowShape`), so ring, soft row and highlight run on
from the box's own; the outline and its soft row are strokes on that line
under the fill, so only their outer halves show. The single-stroke paths are
the default edges' arrow. `/workbench/floating-edges` shows the edge five
ways: as it was, opaque inside, the outline at 0.5px and at 1px, and the
app's.

### The list as a strip

Below 52rem the Runs and Instructions lists are a strip across the top
(`.sheet-strip`), with the run or version under it. The strip's floor is a
rule drawn as bands, its padding the rule's whole depth so it ends on a
device pixel. A lit item's fill meets the solid rows above and below it --
the list reaches over the head rule's soft row and the strip's own, and
each item pads out by as much -- and the dividers between items reach both
solid rows.

### Pages and tests

- `/workbench/edge-junctions` builds the app's pane in small from its own
  parts -- pane, face, ring overlay, header with the notch, sheet frame, a
  column with a head, rules, a lit row and the boundary band -- twice: with a
  head under the notch's turn (as Instructions) and without (as Runs). It is
  900px wide: below 52rem the sheet's list becomes a horizontal strip.
- `e2e/shell/edge-junctions.spec.ts` reads its pixels in both edge modes and
  themes: no seam at the bend, the rule unbroken under the foot, the divider
  reaching the rule's solid row, and down both sides every rule reaching the
  solid ring while the soft row keeps its shade everywhere else (a blend is
  allowed beside a rule, the T-junction). Each of today's fixes, undone on the
  page alone, fails exactly its own check.
- `e2e/shell/process-dividers.spec.ts` checks the same divider join in the
  app's Runs and Instructions views.
- The edge lab's notch specimens now include the sheet frame (lit line and
  arc), clipped as the app clips it.

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

| Cause                                                                         | What it looked like                                                                        | Rule                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fractional width in a shadow, gradient stop, clip or element height         | Safari's rings one pixel on two sides, two on the others; rules a pixel thin or thick      | Draw it as whole-device-pixel layers: `-solid` and `-soft` from `geometry.css`                                                                            |
| A box edge between device pixels                                              | A curve or line a third or half of a device pixel off in WebKit                            | Put the box on the grid: whole-pixel tokens, or, for a box sized by its content, snap it as `NotchSnap` does                                              |
| A clip whose curve is the ring's own curve                                    | The ring's outermost pixel thinner round the corners, in every browser                     | Never clip a ring on its own curve: round the clip tighter when the face is a separate layer (the pane), or clip in an inner element (`.data-table-clip`) |
| `overflow-clip-margin`, which Safari does not support                         | Rules stopping two device pixels short of the ring                                         | In `@supports not (overflow-clip-margin: 1px)`, clip the paint with `clip-path: inset(-1px round …)` and the element's radii grown by that pixel          |
| A border or outline round a curve in Chrome                                   | The same ring 20-30 levels off the shadow-drawn one on the arc                             | Draw rounded rings as shadows; borders only where there is no curve to match                                                                              |
| Safari softening an inset shadow inside a radius                              | The last soft pixel 3-4 levels lighter                                                     | Inherent; below what can be seen. Corners differ between engines by 12-13 levels at most, whatever draws them                                             |
| A `clip-path` that ends on its own box's edge (WebKit)                        | The notch's face let the pane's ring show through as a faint line above the turn           | Let the shape and its box reach past the edge it covers (`.notch-face`, 1px)                                                                              |
| A fill's background box ending on a half device pixel                         | The slanted button's top ring two solid pixels: the face's box snapped down off it         | Paint a fill past its clip (`--s-bleed`), so only the clip's edge is antialiased                                                                          |
| A curved line drawn as one antialiased band                                   | The notch's bends one blurred band where the pane's own corners read solid then soft       | Draw it as the straight sides are: a solid band and a soft one, each clipped (`.notch-edge`, `.notch-edge-soft`)                                          |
| Two layered lines laid one over the other                                     | The notch's floor and turn on the header's rule: the soft row doubled, 20 levels dark      | Lay the upper line's soft row on what the lower one's lies on -- the highlight, in `.notch-under` -- never on the other line                              |
| A rule's soft row painted by a layer above a line that should meet it         | The column dividers stopped a device pixel short of the header rule's solid row            | Paint the soft row translucent, its highlight beneath in the lower layer, and run the line up through it (`.process-header`, `.process-sheet-frame`)      |
| Layers that begin on a fraction of a device pixel over a line they repeat     | A one-pixel seam where the notch's bend leaves the pane's top edge                         | Start them a little back along the line, on a device pixel counted from an edge on the grid (`--n-lead-x`)                                                |
| A curve's soft band over a straight side's own soft row                       | The turn's last pixels a soft row too light; under a band, a stray stripe                  | Mask the curve's soft band off the side's soft column (`.notch-edge-soft`); never paint a fixed colour under it                                           |
| A negative spread to shorten a shadow on a box no wider than twice the spread | The Runs divider's lit line gone entirely: the shadow shrank to nothing                    | Shorten a shadow with a `clip-path` on its box instead (`--column-divider-clip`); a spread shrinks both sides                                             |
| A box ending a fraction of a device pixel into a row                          | The lit line beside a divider covering part of the ring's soft row at the pane's foot      | End boxes on whole pixels counted from an edge on the grid (`--divider-to-ring`); a browser snaps the box before it shortens a shadow                     |
| Something in the sheen's colour reaching the ring under an opaque soft row    | A light pixel in the ring's soft row under a head's lit line, a divider's, the frame's arc | Every lit line, band and arc stops at the ring's whole depth (`--edge-ring-depth`)                                                                        |
| A rule and its lit line drawn as two lines                                    | The lit line two rows, the second half-strength, and thicker than the pane's own           | Draw them as one line split once, as the pane's ring and sheen are (`--ring-pane-*`), solid outside                                                       |
| A border or outer shadow running the full width of its box                    | A section rule's sheen painted across the surface's ring at both ends                      | Paint rule and sheen in one pseudo-element whose bands are inset to the ring's solid and soft rows (`rule-below`)                                         |
| A divider's soft column under a rule's translucent soft row                   | A bright pixel where each column divider meets the header's rule                           | Start the soft column below the rule's soft row (`--divider-soft-from` in `--column-divider-clip`)                                                        |
| A translucent soft row over its own rule's solid layer                        | A section head's rule two solid rows while the row under it is lit, 0.75px beside it       | Keep a rule's soft row opaque, mixed with the sheen, whatever lies beneath (`.sheet-head`)                                                                |
| A divider painted above a rule that runs across it                            | The band's rule broken for one pixel where it crosses the Instructions divider             | Open the divider's clip on the rule's solid row, so the rule beneath shows through (`--divider-rule-row`)                                                 |
| A rule's soft row reaching the side under its translucent soft column         | A dot where the header's rule, and each section head's, meets the pane's left side         | Start the rule's soft row at the ring's depth, as a band (`--header-rule-from`; the head's rule as bands in `.sheet-head::before`)                        |
| A rule drawn as a full-width inset shadow at a narrower layout                | The run strip's bottom rule doubled the soft row at both sides of the pane, below 52rem    | Draw it as bands whose soft row stops at `--band-start`/`--band-end`; check narrower widths too (`check:junctions --width`)                               |
| A divider's soft column reaching the foot under its translucent soft row      | A dot where each column divider meets the pane's foot                                      | End the soft column with the lit line, above the ring's soft row (`--column-divider-clip`); the solid column runs on                                      |
| Half pixels that cancel out                                                   | Fixing one edge onto the grid moves another off (the narrow notch)                         | Change the geometry as a whole, never one length of it                                                                                                    |

## Pitfalls in measuring

- **A check whose range starts past a junction cannot see it.** The pane's
  left side was read from two rows below the header, so the dot where the
  rule meets it was never looked at. Read every edge through the lines that
  meet it; skip only what another check owns, and say which.
- **A tolerance can admit the fault.** "A blend beside a line" let every
  doubled soft pixel at a T-junction pass. Allow only the shades a correct
  drawing has, and prove the check fails on the fault before trusting it.

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
- **Playwright's emulated ratio is not a 2x screen in Chrome.** A
  `deviceScaleFactor` alone leaves Chrome snapping layout at 1x, which put a
  box half a pixel off and made a fine rule look broken. Launch Chromium with
  `--force-device-scale-factor=2` as the checkers do.
- **Playwright's WebKit accepts what Safari rejects.** A notch layer with a
  clip path of its own and a gradient sized in container units drew in
  WebKit and broke the notch in Safari. After any change to the notch's clip
  paths or masks, confirm in Safari before calling it done.
- **Safari's first capture after a page loads can be unsettled.** The first
  variant of a `lines:compare` run read 60 levels off where a rerun read 9.
  Rerun before believing a single large difference.
- **The sheet's tab is restored from a cookie**, so `lines:compare` cannot open
  Instructions; the Runs view has the same band-against-the-side case.
- **A user's screenshot is usually scaled.** Read its pixels for ratios and
  steps, not absolute positions.
- **A pixel test is only trusted once it has failed.** Undo the fix it guards
  -- in the specimen page's stylesheet, never the component -- and run it: it
  must fail, on its own check and no other. Two checks written this session
  passed on broken pixels until this was done.
- **An element screenshot taller than the window is stitched**, leaving a seam
  that reads as a broken line. Read strips from the whole page
  (`edgeStrips`, `fullPage`), and only the strips: copying a whole pane's
  pixels out of the browser is slow enough to time a test out.
- **The development toolbar (`.sp-devctl`) sits over the bottom of the
  window**, and the pointer lights whatever row it rests on. Hide the one and
  move the other away before reading pixels.
- **A specimen on a fractional position draws its ring between pixels.** A
  grid of `1fr` columns put a card at x = 418.66px; give specimens whole-pixel
  sizes and gaps.
- **A pseudo-element cannot read variables set on its sibling** (`::before`
  on `::after`); set them on the element itself, or write them out.
- **A page cannot override a Tailwind utility from `@layer components`**: the
  utilities layer outranks it. A workbench variant of a utility goes outside
  any layer.

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
- **Which soft row is the default.** Both are built and measured (above);
  translucent binds when nothing is set. WebKit still shows the bend's lead a
  column 2-3 levels off in either.
- **`pnpm check:tokens`** fails on classes styled from two stylesheets,
  among them `.data-table-clip` (data-table.css and engine-run.css) and the
  notch's `.notch-face`, `.notch-edge` and `.slant` in process-header.css.
- **The visual baseline** (`pnpm check:visual:update`) once the tree is
  otherwise clean, so it records these edges and nothing else -- the
  header's rule, now solid on top, among them.

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

| File                                                                | Does                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/checks/check-line-geometry.ts`                             | `pnpm check:lines`: lab tables, screen readings, marked-up screenshots, loupes              |
| `scripts/checks/compare-lines.ts`                                   | `pnpm lines:compare`: one region across browsers, a reference page and CSS variants         |
| `scripts/checks/line-geometry/capture.ts`                           | captures from Playwright and Safari's WebDriver: page preparation, extra CSS, element boxes |
| `scripts/checks/line-geometry/analyse.ts`                           | profiles, segments, junctions, comparisons -- pixels in, no browser                         |
| `scripts/checks/line-geometry/evaluate.ts`                          | verdicts: the lab against its declarations, a screen against itself                         |
| `scripts/checks/line-geometry/compare.ts`                           | region crops, aligned comparison, arc masks, enlarged sheets                                |
| `scripts/checks/line-geometry/png.ts`                               | PNG decoding and encoding with `node:zlib`                                                  |
| `app/workbench/edge-lab/`                                           | the lab page and its recipes                                                                |
| `app/workbench/soft-row-styles/`                                    | the junction panes in both soft row styles at once                                          |
| `app/workbench/section-rules/`                                      | `rule-below` and `rule-above` three ways, and a divider meeting a band's rule three ways    |
| `e2e/support/edge-pixels.ts`, `e2e/shell/surface-edges.spec.ts`     | the three rules every edge keeps, where two lines cross, and the app held to them           |
| `app/workbench/soft-rows/`                                          | each way the edge meets another line, enlarged: the soft row translucent beside opaque      |
| `app/workbench/edge-junctions/`, `e2e/shell/edge-junctions.spec.ts` | the app's pane in small, and pixel tests of every place its edge meets another line         |
| `app/workbench/rounded-edges/`                                      | a rounded control's ring and sheen five ways                                                |
| `app/workbench/floating-edges/`                                     | a popover's and a tooltip's edge four ways: before, opaque inside, outline 0.5px, 1px       |
| `scripts/checks/check-edge-junctions.ts`                            | `pnpm check:junctions`: the pane's junction rules in Chromium, WebKit and Safari, any width |
| `app/styles/geometry.css`                                           | `--dp` and every width split into `-solid`, `-soft`, `-cover`                               |
| `components/ui/device-pixel-script.tsx`                             | sets `--dp` before first paint and when the ratio changes                                   |
| `components/ui/notch-snap.tsx`                                      | puts a notch's loose edge on a device pixel                                                 |
| `components/app-shell/resizable-shell.css`                          | the pane's clip, rounded tighter than its ring                                              |
| `components/app-shell/runs/runs-list.css`                           | `clip-past-pane-highlight`, with Safari's `clip-path` fallback                              |
| `e2e/design/line-geometry.spec.ts`                                  | holds the lab in the suite                                                                  |
