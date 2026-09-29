# AGENTS.md

Instructions for coding agents working in this repository. Humans should read
[`docs/STYLING-SYSTEM.md`](docs/STYLING-SYSTEM.md) and
[`docs/TECHNICAL-DESIGN.md`](docs/TECHNICAL-DESIGN.md) first; this file only
records the things an agent would otherwise have to rediscover.

`docs/archive/` holds finished plans and trial records. They describe code that
has since changed; never follow a path, token or switch named there without
checking it against `docs/STYLING-SYSTEM.md` and the tree.

## Checking sidebar alignment

The sidebar's icons sit on three vertical axes. Do not measure them by hand and
do not work out the offsets on paper — that is how three half-pixel
misalignments were shipped, each invisible until something measured it.

```
pnpm dev                                    # the guides are development-only
pnpm exec playwright test e2e/rail.spec.ts  # pass/fail, in the suite
pnpm check:rail
pnpm check:rail -- --level all --self-test
pnpm check:rail -- --help
```

The checker reports every marked box, the axis nearest it, and the distance
between them. Exit 0 aligned, 1 something is off, 2 it could not run.

It reads the axis positions out of the live `.rail-axis` element's computed
background rather than from any constant, so the stylesheet is the only place an
axis is defined. **Keep it that way.** The moment a coordinate is written into
`scripts/rail-alignment/measure.ts`, it has become the thing it replaced.

The measurement is shared: the CLI prints it as a table for reading, and
`e2e/rail.spec.ts` runs the same function at every level of both routes so the
suite holds it. Both launch Chrome with `--force-device-scale-factor=2`;
emulating the pixel ratio alone leaves border snapping at 1x, and the 1.5px
search field edge then lays out as 1px.

Two reported states are not failures. A box of **odd width** centres on a half
pixel wherever it is placed and can never sit on an integer axis — the fix is an
even box, not a nudge. An **allowed** entry is a deliberate offset recorded in
the script's allowlist with its reason; it is still watched, and is reported
again if it moves.

## Alignment, when you are changing layout

Put the icon in a rail cell (`MENU_RAIL` in
`components/app-shell/sidebar/menu-parts.tsx`) rather than computing an inset for it.
A cell centres what is in it and needs no arithmetic; a hand-derived offset goes
stale the moment a token moves.

Chrome snaps a `border-width` to whole device pixels — `1.5px` lays out as
`1.5px` at 2× and `1px` at 1× — so never measure against a number written beside
a border. Read `--spacing-menu-edge` / `border-menu-edge`, which the rail axes
read too.

## Conventions worth knowing before editing styles

`docs/STYLING-SYSTEM.md` is authoritative. In short: `app/styles/index.css` is
the one entry and its import order is the cascade order; shared tokens and
foundations live in `app/styles/`; a component's own roles, `@utility` faces and
`@layer components` rules live in a plain `.css` beside its `.tsx` (not a CSS
Module) and are imported from the entry. A sharp test decides what earns a place
in a stylesheet at all, no arbitrary values in markup, and never two utilities
for the same property on one element.

`components/app-shell/` is grouped by feature (`sidebar/`, `process/`, `runs/`,
`thread/`, `assistant/`, `inputs/`, `instructions/`, `system/`; the shell itself
at the root). A new file goes in the folder of the feature it serves; a folder
earns its place when three or more files change together. The sidebar is split
into one component per part it draws, with shared shapes and icons in
`sidebar/menu-parts.tsx`; `e2e/process-menu.spec.ts` covers its search, level
travel and reordering, focus included -- run it after touching any of them.

A comment in a stylesheet earns its place only by preventing a specific wrong
edit: a measured constraint, a browser behaviour, or a cross-file dependency.
Two lines. Longer reasoning goes in `docs/STYLING-SYSTEM.md`, not in the CSS.

`pnpm dev` runs webpack, not Turbopack, on purpose: only webpack gives each rule
a source map to its own stylesheet and lets `tools/postcss-light-dark` fold
Lightning CSS's `light-dark()` polyfill back, so DevTools reads like the source.

## Colours

One colour system. Neutrals are the generated ramp in `app/styles/generated/ramp.css`
(`pnpm colors:custom`, tuned in `scripts/colour-theme/config.ts`); every hue is
Radix, generated into `app/styles/generated/radix.css` by `pnpm colors:radix` from the
scales the stylesheets read. Never edit either by hand. Tailwind's palette is
reset (`--color-*: initial`), so there is no `bg-zinc-*`; markup names roles.
`data-neutral` picks one of five families on `<html>`; nothing else switches
colour.

Surface faces and every neutral role drawn on a surface are offsets in
`scripts/colour-theme/config.ts` (`LAYER_STEP`, `FOLLOWING_ROLES`,
`ANCHORED_ROLES`), written by `pnpm colors:custom` into
`generated/surfaces.css` and between `/* Generated by pnpm colors:custom … */`
markers in the stylesheet that owns them. Change the offset, never the block. A
region painted with a pane or floating face needs `ground-raised` or
`ground-floating`; see `docs/STYLING-SYSTEM.md` → Surface layers.

Every role is declared once and is at most two reads from a colour: read a ramp
or state step (`--sp-neutral-N`, `--sp-state-<scale>-N`) or alias one role that
does. Every edge is an opaque step. After touching a token, run
`pnpm check:tokens` -- it fails on any `var(--…)` nothing defines (which would
otherwise unset a subtree in silence), on any longer chain, on a role nothing
reads (delete the leftover, don't comment it out), and on pure white or black
faded or mixed into a hue (use a ramp or Radix step) -- and
`pnpm check:colours`, which checks role steps and contrast contracts. Tailwind
scans source as plain text, so do not write a real utility or theme variable
name in a comment; use a placeholder such as `--color-<role>`.
The style inspector (hold ⌥ in development, or Ctrl+Shift+\`) shows, for any element,
where each of its utilities and rules is written and what each role it reads
paints; see `docs/STYLING-SYSTEM.md` → Finding where a style is written.
`pnpm trace:token <role>` prints where a role is declared and what it resolves
to in each theme, and inside each surface for one that follows it; use it
instead of reading stylesheets hop by hop.
`/workbench` (development only) is the live colour reference: surfaces, text
and edges on their grounds with measured contrast, state scales and the ramp,
re-read whenever the theme or neutral family changes. Compare colour options
there, where the user can see them, rather than in screenshots.
`/workbench/controls` renders every control in every React Aria interaction
state at once, pinned by `app/workbench/pin.tsx`, and `pnpm check:visual`
records it; add a control there when it gains a face.

## Verification matched to the change

`pnpm check:visual` compares every element's painted colours and box, in thirteen
states and both themes, with `e2e/visual-baseline/`. A difference you intended
is recorded with `pnpm check:visual:update`, and the baseline diff goes in the
same commit; one you did not intend is a regression. Record the baseline on
the machine that checks it -- text metrics depend on installed fonts -- and on
the server Playwright starts (`pnpm dev`, webpack): Turbopack polyfills
`light-dark()` and rounds some mixes one unit apart. It is the one check CI
(`.github/workflows/checks.yml`) does not run, tagged `@local-baseline`.

Choose checks by the possible consequences, not the number of edited lines.
During iteration, run the smallest check that can detect the relevant regression.
Combine the applicable rows below; broader verification is warranted when a
shared dependency or invariant makes the impact uncertain.

| Change                                                                    | Verification                                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation, comments, agent instructions                               | Check accuracy, links, and formatting of changed files. Validate skill metadata when changing skills. No application suite.                                       |
| Static UI wording                                                         | Format and lint changed source files. Inspect the affected UI when wrapping or accessible naming could change.                                                    |
| Local spacing or styling                                                  | Format changed files and inspect the affected component and relevant responsive states. Run `pnpm check:visual`, and `pnpm check:rail` when sidebar geometry changes.                      |
| Colours or tokens                                                         | Run `pnpm check:tokens`, `pnpm check:colours` and `pnpm check:visual`; inspect affected light/dark states and contrast. Rail checker if spacing tokens move.         |
| Component behaviour or local logic                                        | Lint changed source files, run `pnpm typecheck` and relevant tests. Exercise changed interactions, including keyboard/focus and announcements where applicable.   |
| Shared logic, routing, dependencies, build configuration, broad refactors | Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm check:unused` once at completion. Run `pnpm build` when production compilation or bundling is affected. |

Use `pnpm exec prettier --check <files>`, `pnpm exec eslint <source-files>`,
and `pnpm exec vitest run <test-files>` for targeted checks. Typechecking remains
project-wide; passing individual files to `tsc` is not an equivalent substitute.
Markdown is excluded by `.prettierignore`; explicitly check edited Markdown with
`pnpm exec prettier --ignore-path /dev/null --check <markdown-files>`.
Add regression tests for changed behaviour when they provide meaningful proof;
do not create tests that merely mirror static text, styling, or implementation.

Do not repeat a passing check unless relevant inputs changed, a failure needs
investigation, or the user requests verification. Reuse a suitable running dev
server. Start a server, build, browser audit, or full suite only for a specific
verification need. Once the applicable checks pass and the requested result is
verified, stop. Report what was actually checked and any remaining limitation.

## Context and command discipline

- Start with named files and symbols using `rg`; widen the search only when
  needed. Read enough surrounding code to understand dependencies and invariants,
  without arbitrary line limits or rereading unchanged material.
- Read the relevant sections of `docs/STYLING-SYSTEM.md` for styling and
  `docs/TECHNICAL-DESIGN.md` for architecture or domain behaviour. Do not load
  both entire guides for every task.
- Use the local `tailwindcss` skill as the styling entry point when available;
  otherwise use `docs/STYLING-SYSTEM.md` directly. Load specialist skills only for
  the behaviour or integration being changed; read their references selectively.
  Preserve keyboard access, visible focus, and correct status announcements.
- Prefer supported summary reporters. For verbose commands, save the full log
  outside the repository and return the exit status, summary, and decisive failure
  details. Preserve the original command's exit status; do not blindly pipe through
  `head` or `tail`. Retrieve more of the saved log before rerunning for detail.
- Keep updates and final replies concise and clear. Summarize results without
  repeating tool output; retain relevant errors, uncertainty, and verification limits.
- Inspect the working tree once before editing. Preserve pre-existing changes,
  distinguish them from this task, and review the task's diff. Investigate unrelated
  failures only when they block the requested work; report them without expanding
  the task into cleanup. Do not classify a failure as pre-existing without evidence.
