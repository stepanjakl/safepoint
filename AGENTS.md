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
pnpm check:rail
pnpm check:rail -- --level all --self-test
pnpm check:rail -- --help
```

The checker reports every marked box, the axis nearest it, and the distance
between them. Exit 0 aligned, 1 something is off, 2 it could not run.

It reads the axis positions out of the live `.rail-axis` element's computed
background rather than from any constant, so the stylesheet is the only place an
axis is defined. **Keep it that way.** The moment a coordinate is written into
`scripts/check-rail-alignment.ts`, it has become the thing it replaced.

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

When the work is colour, run `pnpm dev:styles` rather than `pnpm dev`. Only the
webpack path gets CSS source maps and `tools/postcss-light-dark`, which folds
Lightning CSS's `light-dark()` polyfill back so DevTools reads like the source.

## Colours

One colour system. Neutrals are the generated ramp in `app/styles/generated/ramp.css`
(`pnpm colors:custom`, tuned in `scripts/colour-theme/config.ts`); every hue is
Radix, generated into `app/styles/generated/radix.css` by `pnpm colors:radix` from the
scales the stylesheets read. Never edit either by hand. Tailwind's palette is
reset (`--color-*: initial`), so there is no `bg-zinc-*`; markup names roles.
`data-neutral` picks one of five families on `<html>`; nothing else switches
colour.

Every role is declared once and is at most two reads from a colour: read a ramp
or state step (`--sp-neutral-N`, `--sp-state-<scale>-N`) or alias one role that
does. Every edge is an opaque step. After touching a token, run
`pnpm check:tokens` -- it fails on any `var(--…)` nothing defines (which would
otherwise unset a subtree in silence) and on any longer chain -- and
`pnpm check:colours`, which checks role steps and contrast contracts. Tailwind
scans source as plain text, so do not write a real utility or theme variable
name in a comment; use a placeholder such as `--color-<role>`.
`pnpm trace:token <role>` prints where a role is declared and what it resolves
to in each theme; use it instead of reading stylesheets hop by hop.

## Verification matched to the change

Choose checks by the possible consequences, not the number of edited lines.
During iteration, run the smallest check that can detect the relevant regression.
Combine the applicable rows below; broader verification is warranted when a
shared dependency or invariant makes the impact uncertain.

| Change                                                                    | Verification                                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation, comments, agent instructions                               | Check accuracy, links, and formatting of changed files. Validate skill metadata when changing skills. No application suite.                                       |
| Static UI wording                                                         | Format and lint changed source files. Inspect the affected UI when wrapping or accessible naming could change.                                                    |
| Local spacing or styling                                                  | Format changed files and inspect the affected component and relevant responsive states. Run `pnpm check:rail` when sidebar geometry changes.                      |
| Colours or tokens                                                         | Run `pnpm check:tokens`; inspect affected light/dark states and relevant contrast checks. Run the rail checker if spacing tokens affect sidebar geometry.         |
| Component behaviour or local logic                                        | Lint changed source files, run `pnpm typecheck` and relevant tests. Exercise changed interactions, including keyboard/focus and announcements where applicable.   |
| Shared logic, routing, dependencies, build configuration, broad refactors | Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm test` once at completion. Run `pnpm build` when production compilation or bundling is affected. |

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
