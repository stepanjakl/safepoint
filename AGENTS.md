# AGENTS.md

Instructions for coding agents working in this repository. Humans should read
[`docs/interface/STYLING-SYSTEM.md`](docs/interface/STYLING-SYSTEM.md) and
[`docs/engineering/ARCHITECTURE.md`](docs/engineering/ARCHITECTURE.md) first; this file only
records the things an agent would otherwise have to rediscover.

`docs/archive/` holds finished plans and trial records. They describe code that
has since changed; never follow a path, token or switch named there without
checking it against `docs/interface/STYLING-SYSTEM.md` and the tree.

## Checking sidebar alignment

The sidebar's icons sit on three vertical axes. Do not measure them by hand and
do not work out the offsets on paper — that is how three half-pixel
misalignments were shipped, each invisible until something measured it.

```
pnpm dev                                    # the guides are development-only
pnpm exec playwright test e2e/shell/rail.spec.ts  # pass/fail, in the suite
pnpm check:rail
pnpm check:rail -- --level all --self-test
pnpm check:rail -- --help
```

The checker reports every marked box, the axis nearest it, and the distance
between them. Exit 0 aligned, 1 something is off, 2 it could not run.

It reads the axis positions out of the live `.rail-axis` element's computed
background rather than from any constant, so the stylesheet is the only place an
axis is defined. **Keep it that way.** The moment a coordinate is written into
`scripts/checks/rail-alignment/measure.ts`, it has become the thing it replaced.

The measurement is shared: the CLI prints it as a table for reading, and
`e2e/shell/rail.spec.ts` runs the same function at every level of both routes so the
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

`docs/interface/STYLING-SYSTEM.md` is authoritative. In short: `app/styles/index.css` is
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
`sidebar/menu-parts.tsx`; `e2e/shell/process-menu.spec.ts` covers its search, level
travel and reordering, focus included -- run it after touching any of them.

Content entrance animations wait for every surrounding screen, section or panel
transition to settle. Use `SettledLayer` / `useScreenSettled`, pause CSS entrances
and their stagger delays while held, and start shared entrance clocks afterward.
See `docs/interface/STYLING-SYSTEM.md` → Motion.

Text that changes in place morphs; it never jumps. A `Button` or
`DecisionButton` whose label is plain words does this by itself
(`MorphingLabel`, `components/ui/morphing-text.tsx`), so write the label as text,
not as an element. Anything else that changes its words or figures -- a pill, a
count, a label beside an icon -- wraps them in `MorphingText`.

A comment in a stylesheet earns its place only by preventing a specific wrong
edit: a measured constraint, a browser behaviour, or a cross-file dependency.
Two lines. Longer reasoning goes in `docs/interface/STYLING-SYSTEM.md`, not in the CSS.

`pnpm dev` runs webpack, not Turbopack, on purpose: only webpack gives each rule
a source map to its own stylesheet and lets `tools/postcss-light-dark` fold
Lightning CSS's `light-dark()` polyfill back, so DevTools reads like the source.

## Colours

One colour system. Neutrals are the generated ramp in `app/styles/generated/ramp.css`
(`pnpm colors:custom`, tuned in `scripts/colours/colour-theme/config.ts`); every hue is
Radix, generated into `app/styles/generated/radix.css` by `pnpm colors:radix` from the
scales the stylesheets read. Never edit either by hand. Tailwind's palette is
reset (`--color-*: initial`), so there is no `bg-zinc-*`; markup names roles.
`data-neutral` picks one of five families on `<html>`; nothing else switches
colour.

Surface faces and every neutral role drawn on a surface are offsets in
`scripts/colours/colour-theme/config.ts` (`LAYER_STEP`, `FOLLOWING_ROLES`,
`ANCHORED_ROLES`), written by `pnpm colors:custom` into
`generated/surfaces.css` and between `/* Generated by pnpm colors:custom … */`
markers in the stylesheet that owns them. Change the offset, never the block. A
region painted with a pane or floating face needs `ground-raised` or
`ground-floating`; see `docs/interface/STYLING-SYSTEM.md` → Surface layers.

A pill keeps its distance from whatever it sits on, face and ink: set it once,
on the component, with surface-following roles or a tone lifted by
`--sp-ground-lift-*`, never anchored to one surface or given a role for one
placement. A band across a surface takes `ground-band`. `pnpm check:colours`
refuses a pill painted against one ground; see
`docs/interface/STYLING-SYSTEM.md` → Pills follow their ground.

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
paints; see `docs/interface/STYLING-SYSTEM.md` → Finding where a style is written.
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

## The definitions engine

`lib/engine/` turns a process's instructions into checked, approved
formulas (the Brunch orders process; `docs/processes/brunch-orders/PLAN.md` →
The engine, as built). It must stay process-agnostic: no scenario word in its
code or prompts. A process supplies everything specific through its
`DefinitionProcess` (`SUBJECT` and its `DataShape`, typed in
`lib/engine/subject.ts`), declared in `lib/processes/<process>/` and handed on:
`components/engine/` screens receive the subject as props from the run screen
in `components/processes/<process>/`, and `server/` reaches a process only
through the registry, `server/operations/kept-processes.ts`; ESLint refuses an
import of `@/lib/processes` from `lib/engine/`, `components/engine/` and the
rest of `server/`. Prompt examples use
placeholders such as `values.<id>`, because a real example steers the model.

- **Saved model output is a contract.** Variable names and value
  representations end up inside accepted formulas, so settle them before a
  draft is accepted. A change to the stored shape (`types.ts`) means
  migrating the kept rulebooks by script, through `putRevision` and
  `saveSet`, then `pnpm rulebooks:export` for `fixtures/` and
  `pnpm fixtures:e2e` for the browser tests' copies.
- **A check is a shape, never a model-written formula.** The model fills one
  of the shapes in `shape-schema.ts`; `shapes.ts` writes the formula and the
  sentence a person approves. A rule no shape says is refused for a person to
  rephrase. Widen what shapes can say there, generically, rather than letting
  a formula back in; time goes through declared moments, never signed hours.
- **Fix behaviour with checks, not prompt wording.** Prompt tweaks corrected
  one draft and broke the next. A new rule belongs in `checks.ts`, where both
  the model's check tool and Accept enforce it. Where nothing can check an idea,
  try it before believing it: a throwaway script over the real model, on
  instructions unrelated to any process, costs a few requests
  (`DEVELOPMENT-LOG.md` → Accounting for every sentence).
- **To see why a draft came out as it did,** use the debug buttons on the Rules
  step (`rules-debug.tsx`): what code finds of each rule, and its formula on
  every record, without asking a model. Add a new check to `reviewBreakdown` as
  well as `review`, through their shared parts, so the drawer shows it.
- **Passing every check does not mean a rule is right.** A model's examples come
  from the same reading as its formula. Two independent writes disagreeing is the
  best signal so far, so it goes to a person; don't settle it with a vote.
- **Before asking a person to redraft,** check the idea without them:
  `DEVELOPMENT-LOG.md` → How to find out whether a draft is right.
- **No test spends quota or writes to `fixtures/`.** Use the stand-in models
  in `models.fixture.ts` and `inScratchDirectory()`. The browser test serves
  a frozen rulebook, because drafting replaces the kept one.
- **The engine does no file IO, and sits below the app.** `lib/engine/`
  imports no `node:fs`, React, Next, `@/server`, `@/lib/shell`, `@/components`
  or `@/app`; the types it works on are its own (`lib/engine/subject.ts`), and
  the shell imports them, never the reverse. Whatever reads or writes a kept file is under
  `server/` (`storage/`, `jobs/`, `operations/`, `workflows/`), and every
  module there opens with `import 'server-only'`, so a client bundle that
  reaches one fails `pnpm build`. ESLint holds the same lines
  (`eslint.config.mjs`). The one exception is `lib/engine/limits.ts`, which reaches the database through
  `server/storage/models/model-limits.ts`. Vitest aliases `server-only` to an empty
  module.
- **Drafts, rewrites and proposals are Vercel Workflow runs**
  (`server/workflows/`, started by `server/jobs/`). A workflow function only
  orchestrates; a `'use step'` function loads its work by dynamic import
  (`draft-steps.ts`), because the workflow's bundle keeps a step module's
  imports and `pnpm build` refuses the database driver in its sandbox. A
  step is handed ids, never what they name, and may run twice, so it looks
  for what it would make before making it (`server/workflows/steps.test.ts`).
  Under Vitest the run is the workflow called in the test's process
  (`runner.ts`); a test hands a job its stand-in models as before.
- **Where things are kept.** Everything is in the database
  (`docs/engineering/DATABASE.md`): PGlite under `data/pglite/` with no
  `DATABASE_URL`. Rulebooks and data profiles are read and written only
  through `server/storage/rules/rulebooks.ts`: per instructions version the
  rulebook under review, each accepted revision (written once, by its
  fingerprint) and the head, and each act on a rule as a `rule_decisions`
  row. What a person approves is still reviewed in git:
  `fixtures/<process>/rulebooks/<version>-<instructions hash>/` (`current.json`,
  `<rulebook id>.json`, `revisions.json`) and `fixtures/<process>/profile/`
  seed a database that lacks them on first need (inserting what it lacks,
  never overwriting what it holds), and `pnpm rulebooks:export` writes the
  database's state back to them byte for byte; commit what it changes. Never
  edit those files by hand: seeding refuses a file whose id is not its body
  or that is not written as the export writes it. A migration of an
  accepted rulebook makes a new revision through `putRevision` with reason
  `migrated`, then the export; it never rewrites one. Runs (and the
  instruction versions they run under), each decision on a record as an
  event, runs' reads, a source's reads, proposals, cross-checks and their
  partial answers, job progress (drafts and proposals), the record of each
  write to a sheet, each model request and the learned model limits are in
  the database only. Nothing a run produces is kept in `data/` any more;
  `pnpm db:import` copies the files an older checkout kept there.
  A test that keeps rows uses `inScratchDatabase()` (`inScratchStorage()`
  where it also needs a scratch directory, which is also where seeding looks
  for `fixtures/`, so a test that keeps rules starts empty); the database is
  emptied before each test, not made again. A test keeping rules keeps its
  instructions first (`keepText`, `findKept` in `lib/engine/set.fixture.ts`).
  The browser tests' server runs on PGlite in `data/pglite-e2e/` whatever
  `.env.local` says (`playwright.config.ts`), seeded from `fixtures/` as its
  first request needs.
  `e2e/fixtures/` are frozen copies, held to the engine by
  `lib/engine/e2e-fixtures.test.ts`. A browser test that starts a run does
  so on that same database, which every test shares, so it selects its runs by
  the id the server gave (`data-run-id` on a row, `e2e/support/kept-runs.ts`), never by
  position; `e2e/support/kept-decisions.ts` stands in for the decisions procedures
  where a test serves its own proposal.
- `docs/processes/brunch-orders/DEVELOPMENT-LOG.md` records what went wrong and why. Add to it when
  something non-obvious does.

Browser storage keys are `safepoint.<thing>.v<N>`, versioned so a change of
shape starts afresh; development preferences are `safepoint.dev.<thing>`.
Window events are `safepoint:<thing>`.

## Annotations from the browser (Agentation)

In development the owner annotates the running app with the Agentation toolbar
(`components/dev/agentation-toolbar.tsx`); `pnpm dev` starts its server on port
4747 (`scripts/runtime/dev.ts`), and the `agentation` MCP server reads it. When asked to
**wait for**, **watch** or **take** annotations:

1. Run `pnpm agentation:wait` in the background. It blocks until the owner
   presses Send Annotations, then prints the batch (id, comment, element,
   source file, page) and exits 0. Exit 2 means the server is down: ask for
   `pnpm dev`.
2. For each annotation: `agentation_acknowledge`, make the change and verify it
   as the table below requires, then `agentation_resolve` with a one-line
   summary. When a note is unclear, `agentation_reply` with the question
   rather than guessing; use `agentation_dismiss` with a reason for one you will
   not act on.
3. Report briefly, then start `pnpm agentation:wait` again unless told to stop.

`AGENTATION=off` in the environment of `pnpm dev` starts no server and draws no
toolbar (`scripts/runtime/dev.ts` sets `NEXT_PUBLIC_AGENTATION`; Playwright's
server is started that way).

"Check my annotations" without waiting means `agentation_get_all_pending` now.
Annotations are held in memory, so they last as long as `pnpm dev`.

## Verification matched to the change

`pnpm check:visual` compares every element's painted colours and box, in ten
states and both themes, with `e2e/visual-baseline/`. A difference you intended
is recorded with `pnpm check:visual:update`, and the baseline diff goes in the
same commit; one you did not intend is a regression. Record the baseline on
the machine that checks it -- text metrics depend on installed fonts -- and on
the server Playwright starts (`pnpm dev`, webpack): Turbopack polyfills
`light-dark()` and rounds some mixes one unit apart. It is the one check CI
(`.github/workflows/checks.yml`) does not run, tagged `@local-baseline`.

The Playwright `dark` project renders the light theme. The app's theme comes
from a stored preference (`safepoint.dev.theme` in localStorage), not the
browser's colour scheme. To check dark, set that preference.

Choose checks by the possible consequences, not the number of edited lines.
During iteration, run the smallest check that can detect the relevant regression.
Combine the applicable rows below; broader verification is warranted when a
shared dependency or invariant makes the impact uncertain.

| Change                                                                    | Verification                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation, comments, agent instructions                               | Check accuracy, links, and formatting of changed files. Validate skill metadata when changing skills. No application suite.                                                                                                                                                  |
| Static UI wording                                                         | Format and lint changed source files. Inspect the affected UI when wrapping or accessible naming could change.                                                                                                                                                               |
| Local spacing or styling                                                  | Format changed files and inspect the affected component and relevant responsive states. Run `pnpm check:visual`, and `pnpm check:rail` when sidebar geometry changes.                                                                                                        |
| Colours or tokens                                                         | Run `pnpm check:tokens`, `pnpm check:colours` and `pnpm check:visual`; inspect affected light/dark states and contrast. A part drawn in a tone or on a surface also takes `pnpm check:perception` (`docs/interface/COLOUR-TESTING.md`). Rail checker if spacing tokens move. |
| Component behaviour or local logic                                        | Lint changed source files, run `pnpm typecheck` and relevant tests. Exercise changed interactions, including keyboard/focus and announcements where applicable.                                                                                                              |
| Shared logic, routing, dependencies, build configuration, broad refactors | Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm check:unused` once at completion. Run `pnpm build` when production compilation or bundling is affected.                                                                                        |

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
- Read the relevant sections of `docs/interface/STYLING-SYSTEM.md` for styling and
  `docs/engineering/ARCHITECTURE.md` for architecture or domain behaviour. Do not load
  both entire guides for every task.
- Use the local `tailwindcss` skill as the styling entry point when available;
  otherwise use `docs/interface/STYLING-SYSTEM.md` directly. Load specialist skills only for
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
