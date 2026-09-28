# Styling system

How styling is organised, what is settled, and the conventions that keep it that way. Settled 2026-09-10, after the migration from bespoke CSS to Tailwind utilities; reorganised 2026-09-24 into one colour system and component-owned stylesheets.

This supersedes the styling sections of [`STAGE-1B-PROPOSAL.md`](STAGE-1B-PROPOSAL.md), which records what was proposed rather than what was built.

Colocated CSS Modules were proposed, trialled on one component, and rejected on measurement: they route Cmd+click into `node_modules` rather than to the class, and they compile unlayered, so a module rule silently outranks any utility the markup adds beside it. [Component styling: proposal, independent review, and trial](archive/COMPONENT-STYLING-PROPOSAL.md) records the evidence. What the app adopted instead is a **plain** stylesheet beside the component, imported through the Tailwind entry: its rules stay in `@layer components`, its names stay global and searchable, and `@utility` and `@apply` work because it compiles in the same pass.

## The division

`app/styles/index.css` is the one stylesheet the app loads. It imports everything else, and its import order is the cascade order.

| Where                             | Holds                                                                                                          | Test for belonging                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `app/styles/` tokens              | the ramps, the roles that read them, state, type, geometry, and the `@theme inline` block that publishes them  | is it a value the system decides once?              |
| `app/styles/` foundations         | the base layer, the control face and the families that fill it, and treatments several components read        | does more than one component read it?               |
| `components/<area>/<name>.css`    | one component's own roles, `@utility` faces and `@layer components` rules, beside its `.tsx`                    | does exactly one component read it?                 |

Everything else is a utility in the component.

| File in `app/styles/` | Holds                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `generated/ramp.css`  | generated: the neutral ramp, one block per family                                              |
| `generated/radix.css` | generated: the Radix scales some stylesheet reads, light and dark                              |
| `roles.css`           | `color-scheme`, canvas, surfaces, text, rules, action                                          |
| `state.css`           | the six state scales and the adapter modes                                                     |
| `type.css`            | the families and the type scale                                                                |
| `geometry.css`        | durations, tile chroma ceilings, notch and slant geometry                                      |
| `theme.css`           | the `@theme inline` block: the shared roles and scales published to Tailwind                   |
| `base.css`            | the base layer, and the `readout` and `value` type utilities                                   |
| `controls.css`        | `@property` stops, `control-face`, the accent, quiet and off families, fields, shared edges     |
| `severity.css`        | the `[data-severity]` buckets and the `severity-*` colours                                     |
| `disclosure.css`      | the `+`/`−` marker on a `<details>` summary                                                    |
| `drawer.css`          | the drawer's scrim, slide and widths                                                           |

A component stylesheet is laid out in one order: a banner, the `:root` roles only it reads, an `@theme inline` block for the ones its markup names as utilities, its `@utility` faces, then `@layer components`. So `sidebar/process-list.css` beside `process-list.tsx` holds the rows' states, the drop slot, the status badge and the list's fades: one file answers "what paints a process row". A stylesheet imported by nothing is never loaded, so `pnpm check:tokens` fails on any `.css` that `index.css` does not import.

**A component's class has one home.** Every class a component stylesheet styles -- the last compound of a selector, so `.sheet-seg > .value` styles `.value` -- is styled by no other component stylesheet, and `pnpm check:tokens` fails when a split leaves a rule behind. A class seen in DevTools is then one search from every rule that paints it. A class from `app/styles/` is shared by design, and a component may refine it in its own context.

Every role is declared once, in one `:root` block, is read somewhere -- `pnpm check:tokens` fails on a role nothing reads, so deleting the line that used one flags the leftover (the ramp and state-scale steps are API and exempt) -- and is **at most two reads from a colour**: a role reads a ramp or state step directly, or aliases one role that does. `pnpm check:tokens` fails on a longer chain and prints it. So `bg-menu-wash` → `--sp-menu-wash` → `--sp-neutral-200` → `rgb(…)`, and nothing deeper.

`pnpm trace:token <role>` prints that chain for any role -- each hop, the file and line that declares it, split by theme, down to the step's value -- and `--neutral <family>` traces it in another family.

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
the component's stylesheet, inside `@layer components`. This qualifies under the existing
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

| Inspected identity                                | Where the treatment lives                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ProcessList / row / `process-menu-row`            | `components/app-shell/sidebar/process-list.css`: the row's states and the custom properties it publishes                      |
| ProcessList / status-badge / `surface-menu-badge` | `process-list.css`: reads the badge stops inherited from the row                                                              |
| WorkspaceMenu / tile / `surface-menu-tile`        | `sidebar/workspace-menu.css`: tile face; the hue variant supplies its colour roles                                            |
| ProcessList / row-label / `text-menu-link`        | `sidebar/process-menu.css`: defines `--sp-menu-link`, which every part of the sidebar reads, and publishes it                 |
| ProcessMenu / back-heading / `process-menu-back`  | `sidebar/process-menu.css`: all appearance states together, directly referencing `--sp-menu-link`, `--sp-text-primary` and `--sp-menu-wash-strong` |
| Button / secondary / `quiet`                      | `control-quiet` and `--sp-quiet-*`, both in `app/styles/controls.css`                                                         |
| Button / ring / `slant-ring`                      | `components/ui/notch.css`: paints the ring using stops inherited from the Button                                              |
| ProcessHeader / count / `header-button-count`     | `components/app-shell/process/process-header.css`: geometry, and the `bg-header-button-count` colour beside it                |
| RunRow / tally-segment / `sheet-seg`              | `components/app-shell/runs/runs-list.css`: segment treatment, with existing state attributes selecting colours                |

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

### What earns a place in a component's stylesheet

Only these. If a rule is not one of them, it belongs in markup. The same tests apply to `app/styles/`; the only difference is how many components read the rule.

- **Token derivations a utility cannot compute.** The severity scale reads `--severity` from the element's own `data-severity`, so no build-time utility can resolve it. It binds the selected tone’s numbered steps, and an `@theme inline` block publishes colour roles so markup can still say `bg-severity-fill`.
- **Pseudo-elements**, which have no element to hang a class on: `::backdrop`, the disclosure `+`/`−` marker, the thread connector, the drawer scrim, the effects rail's line, the sidebar's edge gradients (`.process-menu-fade`), the fades at the two ends of its list (`.process-list-fade`), and the development alignment guides (`.rail-axis`, `.rail-mark`).
- **Keyframe animations** and their reduced-motion answers.
- **Shadow compositions a state extends rather than restates** — the system disc holds its outer ring in `--disc-ring` so the freshness states can extend it without repeating the sheen.
- **Multi-speed transitions** — the reorder row travels at `--duration-row` and tints at `--duration-state`.
- **A set of states on one selector**, where pulling one arm into markup scatters the rest. `.process-menu-row` is base, `[data-editing]`, `[data-current]`, `[data-dragging]`, and hover/focus-within; a lone `hover:` utility on the element reads as the sixth state but is filed somewhere else, and it applies to the arms the CSS deliberately excludes. Add the state to the rule, not to the class list.
- **A value two elements must share.** The tooltip's face, edge and highlight are read by both the box and the arrow SVG hanging off it, so they are declared once as `--tooltip-*` rather than repeated in two places that can drift.
- **Custom properties as the payload.** `.process-menu-row[data-current]` overrides five `--control-*` stops to retune `control-face`; as utilities that is five `[--control-face-top:…]` brackets. The same row publishes `--menu-badge-face`, `--menu-badge-ring` and `--menu-badge-highlight` for its status badge, whose `surface-menu-badge` utility reads them, so the badge follows the row's states without a variant of its own.

Two more tests, neither of which is about the rule itself. An element that already carries a JS-driven inline `style` gains nothing from co-location, because its most important values are not in the class list either. And a utility that lands on an element whose other states live in its stylesheet will be read as belonging to neither place — put it where its siblings are.

## Type scale

Constructed, not picked. Three properties, all of which Tailwind's own scale has:

1. **Sizes in `rem`**, so type answers to the reader's browser font-size setting. `px` silently ignores it.
2. **Line-height as a unitless ratio** whose numerator is the baseline value: `calc(1.125 / 0.8125)` reads as "18px on 13px".
3. **Letter-spacing on the role**, so no component sets tracking.

The one deliberate departure from Tailwind: a **2px baseline** rather than 4px. At 13px a 4px grid offers only 16px (cramped) or 20px (loose), and this interface wants 18px.

| Role      | Size | Line | Tracking | Use                                      |
| --------- | ---- | ---- | -------- | ---------------------------------------- |
| `micro`   | 11   | 14   | +0.01em  | badges, counts, captions                 |
| `meta`    | 12   | 16   | 0        | secondary and supporting lines           |
| `dense`   | 13   | 18   | 0        | the interface default for lists and rows |
| `body`    | 14   | 20   | 0        | prose and primary copy                   |
| `title`   | 17   | 22   | −0.01em  | section and panel titles                 |
| `counter` | 20   | 24   | −0.02em  | figures read at a glance                 |
| `display` | 22   | 26   | −0.02em  | the one editorial line on a screen       |

Roles are addressed by name and never by family or size, so the final typeface selection needs no component redesign. `readout` is the same `micro` metric in the utility family, tracked and uppercased, for legends, sources, modes and states.

Two lockups sit outside the scale: `wordmark` and `lockup`. A mark is set optically and keeps its own family, so it keeps its own size and does not follow `data-typescale`.

An alternate `sharp` scale exists for comparison — same lower half, larger and tighter above `body`. Switch it live in the development picker or with `?scale=sharp`.

## Radius

Named for what they enclose. Pulled in from Tailwind's 4/8/12/16 so corners read crisper.

| Token     | Value | Encloses                                |
| --------- | ----- | --------------------------------------- |
| `region`  | 2px   | hairline: bar segments, chips           |
| `section` | 4px   | small chrome: badges, grips             |
| `control` | 6px   | anything pressable                      |
| `icon`    | 8px   | icon squares, and the tiles beside them |
| `shell`   | 10px  | panes, cards, dialogs, the drawer       |

## Colour

There is one colour system. Neutrals come from a generated ramp; every hue comes from Radix. Tailwind's palette is removed -- `@theme inline` opens with `--color-*: initial` -- so `bg-zinc-200` does not compile and colour completion offers only the app's roles. `@theme inline` emits no variables, so a stylesheet always reads an `--sp-*` role, never a `--color-*` name; `white` and `black` are written as keywords.

`light-dark()` lives in the roles, never in the ramp: a step is a colour, and which step each theme reads is stated beside the role. `data-theme` is only ever set on `<html>`, so every role block targets `:root` alone.

### The neutral ramp

One restrained, slightly warm, Zinc-adjacent family on a **single ramp**: 41 fixed steps from 0 through 1000 in increments of 25, 0 always the lightest, read by both themes. Source anchors, the semantic inventory and the contrast contracts live in `scripts/colour-theme/config.ts`. Color.js maps the sampled OKLCH colours to sRGB, and `pnpm colors:custom` writes `app/styles/generated/ramp.css` plus `docs/generated/colour-theme-report.json`. The steps are written as values -- `--sp-neutral-575: rgb(…)` -- not as aliases of a per-family name, so DevTools shows a colour one read away from a role.

`pnpm check:colours` regenerates in memory and fails on stale output, invalid or duplicate steps, reversed lightness, a role whose CSS resolves to a different step than `config.ts` assigns, or a failed required contrast contract. The role validator follows the `@import` list in `app/styles/index.css`, so a component stylesheet is validated the moment it is imported, and takes the last declaration of each role as the cascade does, skipping `@media` and `@supports`.

Lightness falls by a flat 0.02237 per step, so one index means the same everywhere and a structural edge can be stated as an offset rather than measured at every face. Chroma follows Tailwind zinc's own chroma-against-lightness curve: near-achromatic where surfaces sit, humped through the midtones where text and edges live, easing off again at the dark end.

**Five families share that one shape**, differing only in hue and a chroma multiplier, so adding one costs a pair of numbers rather than a ramp. Because contrast follows lightness, a family costs no contrast retuning.

| Family   | Hue | Chroma | Character                                                                 |
| -------- | --- | ------ | ------------------------------------------------------------------------- |
| Graphite | 286 | ×1     | Cool violet-grey on Tailwind zinc's hue. The default.                     |
| Steel    | 250 | ×2.4   | Blue and colder, earning distinctness with chroma as Tailwind slate does. |
| Clay     | 70  | ×1.5   | Warm amber-grey, near Tailwind stone.                                     |
| Moss     | 155 | ×1.5   | Green-grey, between Radix sage and olive.                                 |
| Ash      | —   | ×0     | No tint at all.                                                           |

Graphite binds on `:root`; the others on `:root[data-neutral='<family>']`, so the attribute is only needed to leave the default. Every family is generated and contract-checked independently.

Every fill and edge on a pane sits one step under where the ramp was first assigned (2026-09-24): the panes read a shade darker, and because the ramp's lightness falls by the same amount per step, every offset between a pane and what is painted on it is exactly what it was. The canvas kept its original step, and so did what lies directly on it -- the sidebar's washes, current row, badges and notice, and the canvas rule etch -- so the sidebar is unchanged and a pane now stands one step nearer the canvas. Ink did not move, except muted text, which went one step darker in light to hold its margin on the inset surface. Light floats at step 25, primary at 50, canvas at 75, inset at 125; dark at 775, 850, 900, 975.

Dividers inside a pane (the header's rule, the runs column's edge, the sheet head's line) take `--sp-raised-edge`, the pane's own edge colour, because their ground is the pane; `--sp-divider-etch` is only for rules on the canvas.

A handful of cross-theme warnings are expected and left standing. Light's canvas-to-floating span is three steps where dark's is six, and light text near the white end reaches ratios dark cannot. They are warnings precisely so visual margin does not become an undocumented compliance rule.

### Radix for every hue

`pnpm colors:radix` writes `app/styles/generated/radix.css` from the installed `@radix-ui/colors`: every step of every scale some stylesheet reads, light as `--radix-<scale>-<step>` and dark as `--radix-<scale>-dark-<step>`, in P3. The list of scales is found by scanning the stylesheets, so reading a new scale means rerunning the script, and `pnpm check:tokens` fails until you do. They are plain `:root` properties rather than theme variables, so no `bg-radix-*` utility exists: markup reaches a hue through a role.

### Accent and Save order

The primary action (cyan) and the Save-order toggle (teal) are **Radix fitted to Tailwind**: each stop is the blend of two adjacent Radix steps nearest the Tailwind colour it replaced, within ΔE 0.015 for most -- about the threshold of noticing. Radix keeps its vivid mid-tones in the dark scale, which is where Tailwind's cyan and teal sit, so the light theme reads dark-scale steps too; that is deliberate, not a slip. Candidates were compared side by side on `/workbench`.

Both are **flat under the pointer**: `--sp-accent-hover` and `--sp-commit-hover` are one colour each, and the hover utilities put it on both face stops, both ring stops and the highlight, so the control reads as a single fill. Keyboard focus takes the same colour. White labels on the light accent's glowing top reach only about 1.9:1, as Tailwind's did; the bottom and the hover reach 3.6:1.

#### Ink that a surface cannot carry

`--sp-text-muted` reads below AA on `--sp-surface-selected` in light. That is safe only because every consumer of that fill swaps its ink to primary in the same rule. A Playwright test asserts that no element painting the selected fill has muted-coloured text anywhere inside it.

Quieten text with a role, never with `opacity`. The contrast contracts measure a role's colour, not what an opacity leaves of it, so faded ink escapes them; `text-muted` is already the quietest text that clears AA. The one exception, the "of" in a run's tally, is measured and noted beside its face.

Prefer a step that works on every ground it actually paints on over ink that adapts to its surface. Contextual ink is possible -- custom properties inherit, and `surface-menu-badge` already reads stops its row publishes -- but it makes "muted" stop being a colour, it cannot be reasoned about locally, and it does not survive a portal. Keep it for declared, contract-checked exceptions.

### Finding where a style is written

- **Style inspector** (development only): **hold ⌥ Option** (Alt) and point at an element; ⌥-click pins it, so the panel stays once the key is up. **Ctrl+Shift+\`**, or Debug → Inspect styles in the design pane, keeps it on without holding anything. The page never sees the pinning click. ⌥⇧ stays LocatorJS's gesture, ⌥ does nothing while a text field has focus, and ⌥-click on the sidebar handle still resets its width. It lists every one of the app's own utilities, `@theme` entries and matching rules on that element, each linked to its file and line, with its declarations -- including those it pulls in with `@apply` and those under a state or media query, dimmed when they are not applying. Every `var()` in a declaration unfolds into the chain that paints it: the class that sets that property on this element or on the nearest ancestor that does (named, since custom properties inherit; a `@property` with `inherits: false`, like the control stops, stops at the element), then the role on `:root` or the preference selector that reaches `<html>`, down to the ramp or Radix step, each with its colour here. Only the `light-dark()` branch the element paints is followed. An `@apply` of a Tailwind theme utility counts as the declaration it writes (`@apply shadow-control-highlight` is `box-shadow`), and an `@theme inline` value is read on the element that uses it, since Tailwind copies it there. The filter field at the top keeps only the declarations whose property, value or chain names what you type -- `shadow`, `--control-highlight` -- and stays set while you move between elements; Escape clears it. A custom property a class sets says which declaration reads it, and each paint swatch names the class it comes from. Rules for the element's classes that are not matching now (a state, an ancestor) are folded below; Tailwind's own utilities are listed last. **JSX** opens the markup, **Parent** steps out. Links open VS Code; set `localStorage['safepoint.dev.editor'] = 'cursor'` for Cursor. The index is read from the stylesheets each time it opens (`app/api/dev/stylesheets`), so it is never stale.
- **`pnpm trace:token <role>`** prints the same chain in the terminal, per theme and neutral family, and reads the stylesheets through the same reader (`lib/dev/stylesheets.ts`).
- **Alt+Shift+click** (LocatorJS) jumps straight to an element's JSX.
- **`/workbench/controls`** shows the real controls in every interaction state side by side: rest, hovered, keyboard focus, pressed and disabled. `Pin` sets the attribute React Aria would, so the face paints exactly as it does under the pointer, and the visual baseline records the page. A control styled with a CSS pseudo-class (`hover:`) rather than React Aria's attributes cannot be pinned and shows at rest.
- **Edit in DevTools, save to disk.** Next.js serves Chrome's automatic workspace file (`/.well-known/appspecific/com.chrome.devtools.json`) in development, so Sources → Workspace offers to connect the repository in one click (Chrome 135+). A Styles-pane edit then saves to the component's own `.css`, the file its source map names.

### Tuning a theme

`pnpm dev` runs **webpack**, not Turbopack, for two things only webpack gives you, and both matter when you are moving between the editor and DevTools. Measured on Next 16.3; revisit when Turbopack catches up:

- **CSS source maps per stylesheet.** `next.config.ts` registers `SourceMapDevToolPlugin` inside its `webpack()` block and hands DevTools a `file://` identity, so every rule maps to the file it is written in. Under Turbopack Tailwind has already inlined the imports, and every rule maps to `app/styles/index.css`.
- **Readable custom properties.** Tailwind v4 hardcodes its Lightning CSS targets at Chrome 111 / Safari 16.4 / Firefox 128 and reads no `browserslist`, so `light-dark()` is polyfilled into a space toggle no configuration can turn off:

  ```
  --sp-canvas: var(--lightningcss-light, var(--sp-neutral-200))
               var(--lightningcss-dark, var(--sp-neutral-900));
  ```

  `tools/postcss-light-dark` folds that back into `light-dark(…)` so the Styles pane reads character-for-character like the source. It is a postcss plugin, and under Turbopack postcss runs _before_ Lightning CSS, so there is nothing to fold yet — hence webpack. It is gated on `NODE_ENV`, so production keeps the polyfill and the browser support that comes with it.

Ink steps are **toward presence**, never "darker": the dark half of a pair moves lighter as the light half moves darker, so a role says the same thing on either canvas. `--sp-text-muted-strong`, `--sp-header-ink` and the sheet's three rungs all read this way, and a pair that moves only one half opens or closes the gap between two roles by half a step without saying so.

`--sp-text-muted` is as quiet as it can be while clearing the 4.75:1 target on `--sp-surface-inset` (contract `muted-on-inset-surface`); it moved one step darker when the panes did, the one ink that followed them. It is most of the small text in the app, so the quiet it is chosen for can be overdone, and a light surface darker than `--sp-surface-selected` puts it back under AA -- which is why that surface pairs with a primary ink.

### State colours

State colours have two layers in `app/styles/state.css`:

- **Numbered steps** hold Radix values: `--sp-state-verified-11` is Radix grass 11, with light and dark variants. Unavailable is the neutral ramp.
- **Bare names** are the text role: `--sp-state-verified` is step 11 in dark and, in light, two fifths of the way from 11 to 12. Radix tunes 11 against its own palest steps, and on the app's panes it read 4.0-4.5:1; the mix clears AA on every surface while keeping most of the hue. `text-severity-ink` is deepened the same way. Use the bare name (or a role built on it) for any state text; fills and tints read the numbered steps.

The six state scales (advisory, verified, caution, decision, blocked and unavailable) expose steps **1, 3, 4, 5, 6, 7, 9, 10, 11 and 12**. Destructive is an action text role and exposes only steps 11 and 12 and its bare alias. Steps 2 and 8 are not part of the app's token API. Every scale uses the same step number in each theme.

Severity buckets republish these steps as `--severity-<step>`, with `--severity` aliasing `--severity-11`. The `severity-ink` utility reads step 11. When adding a step, update the scale and the severity mappings together.

For example, a completed run's state label uses verified 11 through its bare alias, while the total segment uses verified 10 for its background and verified 1 for its number. These are different roles within the same palette.

### Faces and edges

- **`interact:` is one state for hovered, keyboard-focused and pressed.** Every React Aria control face answers all three alike, so write `interact:control-quiet-hover`, or `group-interact/<name>:` for a child, rather than three `data-[…]` variants. It is defined in `app/styles/controls.css` with `:is()`, so it carries the same weight as a `data-[…]` variant and is emitted after them. A control that must not answer a press -- a selectable row, say -- keeps its separate variants.
- **`control-face` is a face and a ring built from registered stops** (`--control-face-top`, `--control-face-bottom`, `--control-ring-top`, `--control-ring-bottom`, `--control-highlight`), so a colour utility restyles it and it animates its own stops. Every stop registers as `transparent`, the highlight included: a face paints only what it sets, so deleting a face's `--control-highlight` removes its sheen rather than leaving a default behind. Never put a `transition-*` utility beside it: the utility replaces its property list and the face snaps. Flat controls that answer with a wash take `control-wash` instead.
- **The sheen has two widths.** `--spacing-control-highlight`, a whole pixel, for panes and cards. `control-hairline` asks for `--spacing-control-highlight-hairline` on anything icon- or button-sized, where a full pixel of white inside the ring reads as a second border.
- **A child can follow its parent's state through custom properties.** A row's status badge rests as a keycap and goes bare whenever its row is hovered, focused or current, so the row shows through it: `.process-menu-row` publishes the badge's stops per state and `surface-menu-badge` reads them. The priority between states is then the rule's reading order rather than Tailwind's emission order, and there is no variant per state on the child.
- **A fill laid on a face is a ramp step, not a `color-mix()`.** Give a chip or pill inside a control its own role over `--sp-neutral-*`, picked one step off the face where the fill sits — `--sp-header-button-count` sits a step off the header button's face in each theme. A mix resolves against whatever is under it, so its colour is nowhere on the ramp and cannot be matched or reused by name; a step can.
- **Every edge is a step too.** Sheens, etches and highlights are opaque ramp steps, one role per surface that paints one (`--sp-raised-edge`, `--sp-card-etch`, `--sp-sheet-row-etch` …), pinned in `config.ts` and checked by `pnpm check:colours`. In light, every edge is exactly one step lighter than the face it lies on -- the lightest faces sit at step 25 so that even they keep a visible edge at step 0. A Playwright test fails on any edge role with a partial alpha, and `pnpm check:tokens` fails on pure white or black anywhere at partial strength -- faded (`rgb(255 255 255 / 25%)`, `#ffffff40`) or mixed into a hue (`color-mix(… white …)`): a sheen on a coloured face is a step of that hue's Radix scale, like the menu tiles' step 2 or the accent's dark 6/7.
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

**Keep the hue behind one set of roles.** Every `menu-tile-<hue>` utility fills the same ten roles from one Radix scale, so a hue changes values and nothing about how a tile is built.

**Radix is generated, not imported** -- see Radix for every hue above.

**Tailwind reads comments too.** It scans source as plain text, so a real utility or theme variable name written in prose is emitted as though a style read it. Write placeholders such as `--color-<role>` in comments.

**Equal lightness is not equal brightness.** OKLCH lightness is perceptual, but saturated colours look brighter than their lightness says, and by a different amount per hue: most in reds, magentas and blues, least in yellows (the Helmholtz–Kohlrausch effect). No colour space or palette in use corrects for it, which is why both Tailwind's and Radix's scales look uneven across hues. Judge evenness in context and by eye. A greyscale filter measures luminance, which is exactly what this effect makes misleading.

**Cap saturation; keep lightness and hue.** Every tile colour passes through `oklch(from <colour> l min(c, <ceiling>) h)`. A hue already below its ceiling comes through untouched, and only the loud ones are pulled back. The ceilings are tokens in `tokens/geometry.css`, one per part per theme — `--tile-chroma-face-*`, `--tile-chroma-ring-*` and `--tile-chroma-glyph-*`, since a face, a ring and a glyph sit far apart in chroma — and `--tile-chroma-scale` multiplies all of them, so the design pane tunes the set with one slider without changing their proportions. The engaged glyph shares the glyph's ceiling.

**Read a Radix step's role before spending it on colour.** Steps 9 and 10 are solids, 11 is low-contrast text, and 12 is high-contrast text and close to neutral: in light it is darker and duller than step 11, so an engaged glyph mapped to it lost its colour under the pointer. An engaged step should be no darker or duller than the resting one in either theme.

**Keep decorative hues clear of the state hues** — blocked red, caution amber, decision iris, verified grass and advisory blue (the default Radix state palette) — so a tile never reads as a verdict. The processes entry is yellow by choice, the one tile meant to stand out; orange left the set rather than crowd it. Compare decorative greens against verified in the selected state palette; different palette names alone do not guarantee visual separation.

To add a hue, add a `menu-tile-<hue>` block in `sidebar/workspace-menu.css` that fills every role, rerun `pnpm colors:radix` if the scale is new, and name the class whole in markup so the scanner sees it.

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
`var(--sp-*)` resolves into compiled chunks instead of the stylesheet that declares it. And
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

Markup carries no arbitrary sizing or typography values. Before writing `text-[13px]`, check for a role; before `rounded-[8px]`, check the ladder. If nothing fits, the scale is missing a step — add it in `app/styles/` rather than a bracket in markup.

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

| Token              | Value | For                                |
| ------------------ | ----- | ---------------------------------- |
| `--duration-state` | 150ms | one control answering a pointer    |
| `--duration-row`   | 180ms | a row settling into a new position |
| `--duration-pane`  | 220ms | a whole pane travelling            |

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
mark needs _minus_ one, and both numbers go stale the moment the rail moves. A cell needs
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

| Token                                                                  | Default                                                                   | Decides                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--notch-angle`                                                        | 25deg                                                                     | the lean of every slanted edge, from vertical                                                                                                                                                                                                                                       |
| `--notch-bend-top`                                                     | `--radius-shell`                                                          | where the slope leaves the top edge                                                                                                                                                                                                                                                 |
| `--notch-bend-bottom`                                                  | unset: the first control's bottom-left radius + `--notch-gap`             | where the slope lands on the floor; unset, it stays concentric with the control beside it                                                                                                                                                                                           |
| `--slant-height`                                                       | one title line + 2 × (`--spacing-shell-inset` + `--spacing-control-edge`) | a slanted control's height, sized so the heading -- centred in a header that holds the notch's inset evenly above and below the controls -- keeps at least the shell inset above and below; the edge-width either side gives back the icons' 1px optical lift evenly                |
| `--notch-corner`                                                       | `--radius-shell`                                                          | where the floor turns down the pane's side                                                                                                                                                                                                                                          |
| `--notch-gap`                                                          | 0.375rem                                                                  | canvas held between the controls and every edge round them -- the slope, the floor, the pane's top edge and side -- square to each; `.notch` insets by the gap plus `--spacing-control-edge` where the edge is drawn inside its box, and by the gap over cos(angle) along the slope |
| `--slant-gap`                                                          | 0.25rem                                                                   | between two slants sharing a seam, square to it                                                                                                                                                                                                                                     |
| `--slant-corner-balance`                                               | 0.5                                                                       | how far a slanted corner's radius follows its angle: 0 is one radius on every corner, 1 gives each the tangent length of a square corner                                                                                                                                            |
| `--notch-bend-balance`                                                 | 0.5                                                                       | the same for the notch's top bend, held lower so it stays no softer than the pane's corners                                                                                                                                                                                         |
| `--notch-sheen-fade`                                                   | 0%                                                                        | where the notch's sheen starts fading toward transparent at the floor, measured down from the pane's top edge; the corner below the floor carries no sheen |
| `--slant-angle` / `--slant-radius`                                     | the notch angle / `--radius-shell`                                        | a slant that should differ from its notch                                                                                                                                                                                                                                           |
| `--notch-face` / `--notch-edge` / `--notch-highlight` / `--notch-pane` | `--sp-notch-*`                                                            | colours, per instance: canvas, the pane's ring, its sheen, its face                                                                                                                                                                                                                 |

Which edges lean is decided where the controls sit, not inside them. The process header
holds two: the Instructions button, which opens the process setup drawer, as `slant="both"`,
then the icon-only placeholder for drafting the next instructions as `slant="left"`, whose
far side stays square, parallel to the pane's side and the notch's gap in from it (`components/app-shell/process/process-header.tsx`). An icon-only slant takes `px-3` over
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

| Convert to `rem`                   | Keep in `px`                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| font sizes, spacing, radii         | border, ring and outline widths                                                                                     |
| breakpoints and container sizes    | shadow offsets, blurs and spreads                                                                                   |
| component geometry that holds text | drawn rules and connector lines                                                                                     |
| icon sizes                         | `999px` / `9999px` pill sentinels                                                                                   |
|                                    | border widths, and **whole** ones: a fraction snaps to whole device pixels, so it lays out differently at 1× and 2× |
|                                    | sub-pixel optical nudges                                                                                            |

Tailwind itself follows this split: its breakpoints are rem, its border and ring widths are px. A `0.0625rem` hairline at a 20px root becomes 1.25px and renders blurred.

**Breakpoints must be rem.** A media-query `rem` resolves against the browser's _default_ font size, not the root element. A px threshold mixed into a rem scale keeps its position while the others move, so Tailwind's build-time sort order stops matching the runtime order and the mobile-first cascade can resolve backwards.

Named thresholds: `shell` (56.25rem) is where the sidebar and pane can sit side by side and scroll independently; `runs` (68.75rem) is where the run strip becomes a third column; `card` (25rem) is the container width below which the release card drops to one column.

## Development switches

All of them live on `<html>` -- attributes, apart from a few inline custom properties -- applied before first paint and persisted to `localStorage`. The design pane in the bottom-right writes them; none ships to production.

| Attribute             | Choices                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `data-theme`          | system, light, dark                                                                                                           |
| `data-neutral`        | the neutral family: `graphite` (no attribute, default), `steel`, `clay`, `moss`, `ash`; also `?neutral=`                      |
| `data-typeface`       | geist, glide, inter                                                                                                           |
| `data-mono`           | the utility-role family, independent of the set                                                                               |
| `data-typescale`      | base, sharp                                                                                                                   |
| `--tile-chroma-scale` | inline on `<html>`: the multiplier on the tiles' saturation ceilings; the default leaves no inline value, so the tokens stand |
| `data-motion-speed`   | CSS transition and animation playback: 1, 0.5, 0.2, 0.1                                                                       |
| `data-rail-guides`    | `on` draws the sidebar's icon axes; see Checking the rail                                                                     |
