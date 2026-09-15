# AGENTS.md

Instructions for coding agents working in this repository. Humans should read
[`docs/STYLING-SYSTEM.md`](docs/STYLING-SYSTEM.md) and
[`docs/TECHNICAL-DESIGN.md`](docs/TECHNICAL-DESIGN.md) first; this file only
records the things an agent would otherwise have to rediscover.

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
`components/app-shell/process-menu.tsx`) rather than computing an inset for it.
A cell centres what is in it and needs no arithmetic; a hand-derived offset goes
stale the moment a token moves.

Chrome snaps a `border-width` to whole device pixels — `1.5px` lays out as
`1.5px` at 2× and `1px` at 1× — so never measure against a number written beside
a border. Read `--spacing-menu-edge` / `border-menu-edge`, which the rail axes
read too.

## Conventions worth knowing before editing styles

`docs/STYLING-SYSTEM.md` is authoritative. In short: three stylesheets with one
job each, a sharp test for what earns a place in `app/components.css`, no
arbitrary values in markup, and never two utilities for the same property on one
element.

## Colours

`app/radix-colors.css` is generated: run `pnpm colors:radix`, never edit it by
hand. Tailwind scans source as plain text, so do not write a real theme variable
name in a comment — it would be emitted as though a style read it; use a
placeholder such as `--color-radix-<scale>-<step>`. The techniques behind the
workspace menu's decorative hues — `light-dark()` resolved where the colour
paints, saturation ceilings through relative colour syntax, and keeping clear of
the state hues — are under Colour in `docs/STYLING-SYSTEM.md`.

## Checks

```
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```
