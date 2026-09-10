# Styling system

How styling is organised, what is settled, and the conventions that keep it that way. Settled 2026-09-10, after the migration from bespoke CSS to Tailwind utilities.

This supersedes the styling sections of [`STAGE-1B-PROPOSAL.md`](STAGE-1B-PROPOSAL.md), which records what was proposed rather than what was built: the palette moved from `stone`/`gray` to `zinc`, and `globals.css` became three files.

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
- **Pseudo-elements**, which have no element to hang a class on: `::backdrop`, the disclosure `+`/`−` marker, the thread connector, the drawer scrim, the effects rail's line.
- **Keyframe animations** and their reduced-motion answers.
- **Shadow compositions a state extends rather than restates** — the system disc holds its outer ring in `--disc-ring` so the freshness states can extend it without repeating the sheen.
- **Multi-speed transitions** — the reorder row moves at 180ms and tints at 120ms.

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

Four steps, named for what they enclose. Pulled in from Tailwind's 4/8/12/16 so corners read crisper.

| Token | Value | Encloses |
| --- | --- | --- |
| `region` | 2px | hairline: bar segments, chips |
| `section` | 4px | small chrome: badges, grips |
| `control` | 6px | anything pressable |
| `shell` | 10px | panes, cards, dialogs, the drawer |

## Colour

Every role is declared once with `light-dark()` over Tailwind's `zinc` for surfaces, rules, text and action, and Tailwind's own hues for semantic state. `@theme inline` publishes them as `bg-canvas`, `border-rule-strong`, `text-muted` and so on.

`data-theme` on any element overrides the system preference for its subtree. Because Lightning CSS polyfills `light-dark()` with inherited custom properties, a themed subtree must re-declare the tokens — which is why the token block targets `:root, [data-theme]`.

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

Where a value is genuinely dynamic, use a `style` prop rather than an interpolated class. `Glyph` does this: its numeric `size` becomes an inline `rem` width.

### Do not put two utilities for the same property on one element

`cx(BASE, 'pl-0')` where `BASE` contains `pl-2.5` is a coin flip — Tailwind emits utilities in its own order, not the string's, so the winner is whichever it happens to write last. Keep the property in one place, or use a variant that cannot collide.

### Reach for a token before an arbitrary value

Markup carries no arbitrary sizing or typography values. Before writing `text-[13px]`, check for a role; before `rounded-[8px]`, check the ladder. If nothing fits, the scale is missing a step — add it in `tokens.css` rather than a bracket in markup.

Four exceptions remain, all of them values no scale could hold: `border-[CanvasText]`,
`border-l-[Highlight]` and `outline-[Highlight]` are forced-colors system keywords
rather than lengths, and the review dialog's `h-[min(820px,calc(100dvh-64px))]` is a
composite clamp.

### rem for what scales, px for what must not

| Convert to `rem` | Keep in `px` |
| --- | --- |
| font sizes, spacing, radii | border, ring and outline widths |
| breakpoints and container sizes | shadow offsets, blurs and spreads |
| component geometry that holds text | drawn rules and connector lines |
| icon sizes | `999px` / `9999px` pill sentinels |
| | sub-pixel optical nudges |

Tailwind itself follows this split: its breakpoints are rem, its border and ring widths are px. A `0.0625rem` hairline at a 20px root becomes 1.25px and renders blurred.

**Breakpoints must be rem.** A media-query `rem` resolves against the browser's *default* font size, not the root element. A px threshold mixed into a rem scale keeps its position while the others move, so Tailwind's build-time sort order stops matching the runtime order and the mobile-first cascade can resolve backwards.

Named thresholds: `shell` (56.25rem) is where the sidebar and pane can sit side by side and scroll independently; `runs` (68.75rem) is where the run strip becomes a third column; `card` (25rem) is the container width below which the release card drops to one column.

## Development switches

All four are attributes on `<html>`, applied before first paint and persisted to `localStorage`. The picker in the bottom-right writes them; none ships to production.

| Attribute | Choices |
| --- | --- |
| `data-theme` | system, light, dark |
| `data-typeface` | geist, glide, inter |
| `data-mono` | the utility-role family, independent of the set |
| `data-typescale` | base, sharp |
