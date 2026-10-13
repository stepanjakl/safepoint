# Colour testing

Status: current guide to the perceptual colour checks, first used on the filter tabs.

A contrast ratio says whether text is readable. It does not say whether a hover
face is visible, whether a grey pill looks as light as a red one, whether the
same part keeps its look on every surface, or whether a person with
deuteranopia can tell two pills apart. This guide describes the checks that
answer those questions, what each one may and may not be asked, and how to add
them to another component.

```sh
pnpm check:perception           # the blocking contracts, light project
pnpm check:perception:report    # the same, plus the advisory report
pnpm exec vitest run scripts/colour-theme   # metrics and contracts, no browser
```

Start the dev server first, or let Playwright start it (`playwright.config.ts`).
The calibration page is `/workbench/calibration`.

## The principle

**Models give invariants and regressions. People give the one subjective
number. The number is then a contract.**

Colour models disagree about what "equally light" means for pale tints, and
they cannot all be right. So nothing here asks a model to _decide_ a look. A
model may say that a part is exactly as far from its surface as it was last
week, that it clears a visibility floor, or that two parts moved apart. When the
models disagree on a sign, the question goes to a person, and the answer is
recorded in `PERCEPTUAL_OFFSETS` (`scripts/colour-theme/config.ts`) so the next
person starts from it.

## Concepts

**Lightness, brightness, chroma.** Lightness is how light a colour is relative
to white (CIE L\*, OKLab L). Brightness is how bright it _appears_. Chroma is how
colourful it is. The three come apart: two colours of equal lightness can differ
in brightness once one is saturated.

**Helmholtz–Kohlrausch (H-K) effect.** A saturated colour looks brighter than a
grey of the same luminance. Plain lightness models (CIE L\*, OKLab, CAM16 J)
cannot see it, so a pastel red and a grey of equal L look unequal: the grey looks
darker. This is the "the neutral pill looks darker" problem. The Hellwig and
Fairchild (2022) model adds it to CAM16 (`J_HK`). It is peer reviewed, but it
is a model: it overpredicts the weaker effect found in some older datasets.
Treat its answer as a band, not a point; we report it at three adapting
luminances (4, 16 and 64 cd/m²).

**ΔE2000.** A colour-difference formula that includes chroma and hue. About 1 is
the smallest difference seen side by side in a lab; around 2 to 3 is "acceptable
difference"; real screens, small marks and noisy backgrounds need more. Our
floors for UI marks start at 4 and are targets to be tuned, not standards.
ΔE2000 says how _different_ two colours are; it does not say which is lighter.

**WCAG 2 ratio and APCA.** WCAG 2.2 contrast (4.5:1 for text) is the only
standard that counts today and is our blocking floor. WCAG 3 has no contrast
algorithm yet, and APCA (reported as Lc, signed for polarity) was dropped from
the draft; it may return. APCA is reported beside WCAG as advice (guide: Lc 60
for body text), never as a gate.

**Constructive and detective checks.** A _detective_ check measures a colour
after the fact (a contrast ratio). A _constructive_ check tests the rule the
colour was built from. The surface lift is constructive: every part is its
step's lightness plus the surface's lift (`--sp-ground-lift-*`), so the test is
that the distance from the ground is the same on every surface. A constructive
test fails earlier, at the line that broke, and it covers colours nobody wrote a
test for. Prefer it; keep ratios as the floor.

**Colour-vision deficiency (CVD).** Roughly 1 in 12 men and 1 in 200 women have
one. Protanopia and deuteranopia (red-green) are the common kinds. We simulate
with the Machado et al. (2009) matrices and, in the browser, with Chromium's own
emulation, and the two are cross-checked against each other (they agree within
ΔE 8 on every pill). A part that relies on colour alone must differ in lightness
or carry a label.

**Forced colours.** Windows High Contrast drops background images, box shadows
and every colour but the system's. A state drawn only by those vanishes.

**Gamut.** Radix colours are Display P3. Computed values arrive as `color()`,
`oklab()` or `rgb()`; every metric converts through `colorjs.io`, so nothing is
silently clipped to sRGB before it is measured. Screenshot samples are 8-bit
sRGB.

## The four tiers

| Tier         | Question                        | How                                                                                                                        | Gate                                      |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0 Invariants | Did anything drift or break?    | Computed colours read from the live page; OKLab distance, WCAG, ΔE2000 floors, state order, across surfaces and 5 families | CI, **blocking**                          |
| 1 Ensemble   | Do the models agree?            | One colour through OKLab, CIE L\*, CAM16 J, Hellwig J and J_HK, Helmlab; spread and sign                                   | report, advisory; disagreement ⇒ a person |
| 2 Other eyes | Does it survive other palettes? | Chromium vision emulation plus pixel sampling; forced colours; Machado cross-check                                         | forced colours **blocking**, CVD advisory |
| 3 People     | What looks equal?               | `/workbench/calibration`: side by side, flicker, greyscale, blur, CVD; median of several settings                          | manual; result recorded as an offset      |

Never ask tier 0 to judge a look, and never ask a person to catch a drift. Each
tier is the cheapest one that can answer its question.

## How the checks are built

```
scripts/colour-theme/perceptual/
  metrics.ts      numbers: lstar, oklabL, deltaE2000, wcag, apca, simulate, hellwig, lightnessModels
  types.ts        Reading (one measured colour) and Finding (one verdict)
  runner.ts       open a page at a theme and family; vision emulation; pixel sampling
  contracts.ts    the catalogue: pure functions over readings
  recipes/        one file per component: what to drive, what to read, which contracts
  report.ts       the advisory report
e2e/colour-perception.spec.ts   tier 0 over every family, surface and theme
e2e/colour-vision.spec.ts       tier 2
app/workbench/calibration/      tier 3
```

A **recipe** describes a component's colours as data: the page, the surfaces and
strips to drive, and for each state (rest, hover, chosen, spied) which element's
colour to read and what it sits on. The runner returns `Reading`s; contracts are
functions from readings to `Finding`s that carry the numbers behind them, so a
red check says what moved:

```
constant-surface:pill-top dark/graphite/primary/all/pill-top:
  ΔL +0.199 against canvas +0.247 (drift -0.048, limit ±0.012)
```

Two levels apply to most floors. Under `minimum` the contract fails the build.
Between `minimum` and `target` it is advice. A value that only just clears the
build floor is a warning to move the design.

## Contract catalogue

| Builder            | Asks                                                                                                                              | Starting values (filter tabs)                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `constantDistance` | Does a part keep its OKLab distance from its ground across surfaces, or across families?                                          | ±0.012 across surfaces, ±0.02 across families             |
| `toneMatch`        | Is the neutral where the tones are, in H-K lightness (J) at 3 adapting luminances, and are tones within OKLab 0.02 of each other? | limit ±3.5 J (target ±2); spread limit 0.04 (target 0.02) |
| `visibleAgainst`   | Is the part ΔE2000 away from what it sits on?                                                                                     | floors 2.5 to 4, targets 3.5 to 6, by state               |
| `strongerThan`     | Does a state answer the one before it (chosen pill beats the hover face)?                                                         | ties allowed to 0.002                                     |
| `readable`         | WCAG ratio (blocking) and APCA Lc (advice) for text on a part                                                                     | 4.5:1; Lc 60                                              |
| `distinguishable`  | Do two tones stay apart by colour or by lightness under a deficiency?                                                             | ΔE2000 ≥ 8 or ΔL ≥ 0.05, advisory                         |

Floors are set under the smallest distance measured when they were written. To
move one, change it in the recipe and say why in the commit; to prove a contract
can fail, break the construction on purpose (for example, zero the dark lift in
`components/ui/filter-tabs.css`: 236 contracts turn red, each reporting the drift
of the missing lift) and put it back.

## Reading a failure

**Dark chips vanish on floating** (found before these checks existed). In dark,
surfaces get lighter as they rise, but the chips were fixed colour steps, so on
floating they sat within 1.01 to 1.18 of the track. The fix was constructive:
derive every part from its surface (`docs/interface/STYLING-SYSTEM.md → Parts
that are not neutral steps`), then test the construction (`constantDistance`).

**The neutral pill looks darker than the coloured ones.** Equal OKLab lightness,
unequal appearance: the H-K effect. `toneMatch` measures the gap in J_HK. With
equal OKLab lightness the neutral sat 2.5 to 4.5 J _darker_ than its
neighbours; after lightening it by one to two ramp steps the gap is within
about ±1.7 J. The plain models report the neutral as _lighter_ after the fix;
they are not wrong, they cannot see H-K.

**Tone spread in dark.** The dark Radix rungs differ by hue (red 4 is darker than
iris 4 and grass 4): spread 0.02 to 0.034 OKLab lightness where light is about
0.008. `tone-spread` reported it as advice. The fix is a measured offset per tone
in dark (`--filter-trim-dark` in `components/ui/filter-tabs.css`: red +0.014,
iris −0.003, grass −0.011), taken from the same report; the spread is now under
the 0.02 target in every state and the advisory is gone.

**The chosen tab disappears in forced colours.** Found by
`forced colours keep the chosen tab visible`: the pill's gradient and the chip
were backgrounds, so under `forced-colors: active` the chosen tab looked exactly
like the others. Fixed in `components/ui/filter-tabs.css` with system colours
(`Highlight`, `HighlightText`) and an outline for the spied tab. A check
asserting a state is visible in the mode that deletes colour is the only way
this class of bug is found.

**Blocked and Ready under deuteranopia.** ΔE2000 1.8 to 2.5 and ΔL 0.007 to 0.01:
red and green pills are the same colour to a deuteranope. They carry labels and
positions, so the contract is advisory and the colours stay as they are: a
lightness difference between the two would break the tone match the strip is
built on. If colour ever has to carry the meaning alone, add a lightness step
between the two tones and relax `toneMatch` for that pair.

## Calibration (tier 3)

Use it when tier 1 says the models disagree on sign, or when someone says "that
neutral looks off".

1. Open `/workbench/calibration` on the display you design on, in the theme
   under review. Choose the surface and the part.
2. Move the nudge until the neutral (right) stops standing out from the
   coloured swatches (left). Use flicker (8 Hz): when two colours alternate,
   the colour difference blurs and a remaining _lightness_ difference shows as
   flicker. Greyscale and blur help too.
3. Click "These look equally light". Do it at least three times, starting once
   from above and once from below the match; the page shows the median and the
   spread. A wide spread means the pair cannot be told apart by lightness.
4. Move the neutral step in the stylesheet by the median (one ramp step is
   about 0.022 OKLab lightness), then put the H-K gap the page reports into
   `PERCEPTUAL_OFFSETS`. The contract now tolerates that gap and nothing more.

This is a screening aid, not a laboratory measurement: browsers do not control
luminance, gamma or frame timing. Repeat on another display if it matters.

## Adding a component

1. Put one of each variant, on each surface, in the workbench with
   `data-surface` and `data-strip` attributes (see "Filter tabs, live" in
   `app/workbench/controls-gallery.tsx`).
2. Write `recipes/<component>.ts`: a `read…` function (drive states, return
   readings) and a `check…` function (choose contracts and floors).
3. Call them from a spec like `e2e/colour-perception.spec.ts`; reuse the family
   and theme loops.
4. Run it. Record the smallest measured distance per state, set floors beneath
   them, targets at or above them.
5. Break the construction on purpose once, to see the contract fail.
6. Add the component to the table in this guide's "Reading a failure" if it
   taught you something.

## Limits

- **Tools disagree and that is information.** Plain lightness models, the H-K
  model and Helmlab (a space fitted to colour-difference data, a single-author
  preprint) can differ in sign for the same pair. The report prints the row; do
  not pick the one you like.
- **Thresholds are starting values.** They come from lab studies and from this
  strip's measured distances, not from your users.
- **The browser is the instrument.** Chromium only; vision emulation and
  forced colours are Chromium features. Pixel samples are flat fills, never text.
- **Not covered:** spatial effects (a 16px chip beside a 20px tab changes how
  colour is seen; S-CIELAB models this), ambient light, and displays that are not
  sRGB or Display P3. Image-difference tools such as FLIP or SSIM compare images,
  not tokens, and add nothing for flat fills.

## References

- Hellwig and Fairchild (2022), "Brightness, lightness, colorfulness, and chroma
  in CIECAM02 and CAM16", Color Research & Application 47(5).
- Hellwig, Stolitzka and Fairchild (2022), "Extending CIECAM02 and CAM16 for the
  Helmholtz–Kohlrausch effect", Color Research & Application 47(5). Our port is
  checked against the published vector in `metrics.test.ts`.
- Sharma, Wu and Dalal (2005), the CIEDE2000 reference implementation notes and
  test data (also in `metrics.test.ts`).
- Machado, Oliveira and Fernandes (2009), "A physiologically-based model for
  simulation of color vision deficiency", IEEE TVCG.
- Szafir, Stone and Gleicher (2014), "Adapting color difference for design".
- Material Color Utilities (HCT): a tone difference of 40 guarantees 3:1 and 50
  guarantees 4.5:1, contrast "by construction".
- Roselli (April 2026), "WCAG 3 contrast as of April 2026", for where APCA stands.
- Yıldız (2026), "Helmlab", arXiv 2602.23010.
