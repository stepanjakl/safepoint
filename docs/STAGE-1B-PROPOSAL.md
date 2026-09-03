# Safepoint Stage 1B proposal: visual vertical slice

Status: vertical slice implemented; see Implementation notes at the end

Audience: the user and the reviewing model. This revision replaces the earlier full-architecture proposal after review feedback. The feedback is summarised in [Review decisions](#review-decisions).

Review question: does this slice make the reading sequence "what the agent proposes, why policy blocks it, which evidence supports each conclusion, which systems would be affected" unmistakable within seconds, while keeping structure, dependencies, and client state minimal?

## What this pass builds

One real screen, all 27 lines, salmon selected, both themes, desktop and narrow widths. Nothing that the screen does not need.

In: application header, batch outcome strip, complete candidate collection, selected-line detail for every SKU (identity, verdict, values, effects rail, readiness matrix, evidence and provenance), static reviewer summary, light and dark themes, container-driven master-detail and list-to-detail layouts, one protected `/workbench` comparison page.

Out until later passes: dynamic workbench routes, specimen files, invented states (loading, error, empty, conflict), dialog, filters, any mutation, Playwright, axe.

## The reading sequence

The central design question is answered by making the detail pane read top to bottom as an argument, with the disagreement first.

```text
┌ Salmon fillets · 2 pack ──────────────────────  Policy  BLOCKED   Outcome  Held ┐
│ ALD-0025 · Meat, fish and plant · SUP-05 Northshore Fresh Foods                │
├─────────────────────────────────┬──────────────────────────────────────────────┤
│ AGENT RECOMMENDATION            │ POLICY RESULT                                │
│ Release                         │ Blocked                                      │
│ "Release at £5.00 assuming the  │ Margin below floor · Funding unverified      │
│ noted supplier funding will be  │                                              │
│ confirmed before commit."       │                                              │
├─────────────────────────────────┴──────────────────────────────────────────────┤
│ Projected margin      9.2 %   ├────────●───────┼──────────────┤  floor 15 %    │
│ Basis                 £5.00 selling · £4.54 cost · £0.00 confirmed funding     │
│ Evidence              Supplier trading terms 07:30 · Operational note 07:20    │
│ Reviewer consequence  Approval unavailable until funding is confirmed          │
├────────────────────────────────────────────────────────────────────────────────┤
│ VALUES                                                                         │
│ Promotional price     £6.50  →  £5.00        −23 %                             │
│ Cost price            £4.54                  source                            │
│ Top-up                138 units              6 per case · MOQ 30               │
│ Window                Sat 5 Sep 00:00  →  Sun 6 Sep 23:59  Europe/London       │
├────────────────────────────────────────────────────────────────────────────────┤
│ AFFECTED SYSTEMS · 6 planned · none executed                                   │
│ ╔══════════════════════════════════════════════════════════════════════════╗  │
│ ║  ●━━━━━━━━●━━━━━━━━━●━━━━━━━━●━━━━━━━━◇━━━━━━━━○                          ║  │
│ ║  Pricebook Top-up   Storefront Label   Supplier Supplier                  ║  │
│ ║  sheet    draft     sandbox   queue    orders   notice                    ║  │
│ ║  LIVE     LIVE      LIVE      LIVE     SIMUL.   PREVIEW                   ║  │
│ ║  planned  planned   planned   planned  planned  planned                   ║  │
│ ╚══════════════════════════════════════════════════════════════════════════╝  │
│ Undo: sheet rows restore if unchanged · storefront restores before next promo  │
│       label queue clears until 06:00 · notice cannot be unsent                 │
├────────────────────────────────────────────────────────────────────────────────┤
│ READINESS · 6 passed · 1 failed                                                │
│ ● Forecast  ● Inventory  ● Supplier  ■ Financial  ● Logistics  ● Rules  ● Ext. │
│ ▾ Financial · required · FAILED                                                │
│   Unverified funding leaves projected margin below policy.                     │
│   Evidence: catalogue 07:30 · supplier terms 07:30 · release policy 01 Sep     │
├────────────────────────────────────────────────────────────────────────────────┤
│ EVIDENCE AND PROVENANCE                                                        │
│ Supplier note 07:20  "The proposed £1 per unit support is awaiting written     │
│                       confirmation."                          untrusted        │
│ Agent interpretation  Funding is likely; release assumes confirmation.         │
│ Source fact           Funding status: unverified · £1.00 per unit offered      │
│ Policy consequence    Unverified funding counts as £0.00 until confirmed.      │
│ ▸ Source records (catalogue, demand, supply, supplier terms, channels)         │
└────────────────────────────────────────────────────────────────────────────────┘
```

Order of dominance when salmon is selected:

1. **Verdict.** Two bounded columns, agent left and policy right, each labelled with its source in the readout style. The policy column carries the strong rule and the blocked colour; the agent column stays neutral. Under them, one ledger aligns the margin readout against the floor, the arithmetic basis, the evidence, and the reviewer consequence. This is the only place the two conclusions sit side by side, so the disagreement cannot be missed and cannot be blended.
2. **Values.** The current-to-proposed ledger. The price row shows the −23% delta because the policy's individual-approval threshold is a price-change percentage and reviewers think in that unit.
3. **Effects rail.** The signature element, encased, with "none executed" in the band title.
4. **Readiness.** A single row of seven glyph cells. Only failed, not-checked, and evidence-unavailable gates open by default. Passed gates stay closed.
5. **Evidence.** The narrative excerpt, agent interpretation, source fact, and policy consequence as four labelled rows. Full source records are one closed disclosure.

Everything above the rail is visible without interaction. Everything below the rail is scannable from its band title and glyph row alone.

Line types that lack a proposal (strawberries held, baby spinach unverifiable, pizza excluded) drop the values and rail sections and replace them with one sentence in the verdict ledger stating why nothing is planned. Absence is shown, not hidden.

## Visual decisions

### Typography: Geist Sans and Geist Mono

Geist Sans carries interface, labels, prose, and the batch title. Geist Mono carries every value, identifier, timestamp, threshold, adapter mode, and lifecycle state, and its tabular figures keep the ledgers aligned. Both load through the `geist` package, which wraps `next/font/local`, so there is no runtime fetch and no layout shift.

Scale, in pixels, with line height and weight:

| Role | Size / line | Weight | Face | Used for |
| --- | --- | --- | --- | --- |
| display | 22 / 26 | 600, −0.01em | Sans | batch title only |
| line title | 17 / 22 | 600 | Sans | selected product name |
| body | 14 / 20 | 400 | Sans | explanations, rationale, notes |
| dense | 13 / 18 | 400 | Sans | candidate rows, ledger labels, evidence |
| meta | 12 / 16 | 400 | Sans | secondary metadata |
| value | 13 / 18 | 500 | Mono, tabular | prices, quantities, percentages, times |
| counter | 20 / 24 | 500 | Mono, tabular | outcome strip counts, time remaining |
| readout | 11 / 14 | 500, +0.08em, uppercase | Mono | band titles, source classifications, modes, states |

Weights are 400, 500, and 600 only. Uppercase readouts are always mono; sentence case everywhere else.

### Colour: native Tailwind, stone for surfaces, gray for elements

No invented hex values. Semantic tokens map to Tailwind's `stone` (warm, for surfaces and rules) and `gray` (cool, for text and action), so the ground reads as paper and the ink reads as instrument.

| Role | Light | Dark |
| --- | --- | --- |
| canvas | stone-100 | stone-950 |
| surface-primary | white | stone-900 |
| surface-inset | stone-50 | stone-950 |
| surface-control | stone-50 | stone-800 |
| surface-selected | stone-200 | stone-800 |
| surface-disabled | stone-100 | stone-900 |
| text-primary | gray-900 | stone-100 |
| text-muted | gray-500 | stone-400 |
| text-inverse | stone-50 | gray-900 |
| rule-faint | stone-200 | stone-800 |
| rule-default | stone-300 | stone-700 |
| rule-strong | gray-400 | stone-500 |
| action-neutral, selection rail | gray-900 | stone-100 |
| focus-ring | blue-600 | blue-400 |
| edge-inner-highlight | white at 85% | white at 12% |
| edge-outer-lowlight | gray-900 at 25% | black at 60% |
| state-advisory | blue-600 | blue-400 |
| state-verified | emerald-600 | emerald-400 |
| state-caution | amber-600 | amber-400 |
| state-blocked | red-600 | red-400 |
| state-destructive | red-700 | red-500 |
| state-unavailable | gray-500 | stone-400 |
| mode-live-sandbox | teal-600 | teal-400 |
| mode-simulated | violet-600 | violet-400 |
| mode-preview | gray-500 | stone-400 |
| mode-unavailable | stone-400 | stone-600 |

Tints for bands and labels are `color-mix(in oklab, <state> 10%, transparent)`, so no second palette exists. Modes are told apart first by glyph: filled circle for live sandbox, hollow diamond for simulated, dotted circle for preview only, struck circle for unavailable. Colour is confirmation, not the carrier.

Each token is declared once with `light-dark()` over the Tailwind variables, for example `--sp-canvas: light-dark(var(--color-stone-100), var(--color-stone-950))`, and exposed through `@theme inline` as `bg-canvas`, `border-rule-strong`, `text-muted`, and so on. `data-theme` on any element overrides the system preference for its subtree, which is what the workbench page uses.

### Surfaces, rules, and shape

- One frame. Header, outcome strip, workspace, and reviewer summary share edges and the strong rule. No card is floating anywhere.
- Section bands are 32px tall inset strips with a readout title on the left and count or disclosure on the right, bounded by default rules. They are the only repeated structural device.
- Ledger rows are `<dl>` pairs on faint rules with the label column fixed at 9rem on desktop and stacked on narrow widths.
- Radii: 2px for regions, 6px for bands and fields, 12px for the primary action and the rail enclosure. Capsules only for the four adapter-mode labels.
- Optical edges: Level 2 on the rail enclosure and the disabled-for-now primary action; Level 1 on secondary buttons; Level 0 everywhere else. One `--edge-strength` variable controls intensity; the workbench page shows 0.5 and 1.0 side by side.
- No `box-shadow`, no gradients outside the optical edges, no blur.

### Candidate rows

44px minimum, two lines, name in dense sans and reason in meta. A 20px glyph column leads each row. The glyph encodes the presentation outcome; the policy eligibility is never shown in the row because the reason line already carries it in words when relevant.

| Outcome | Glyph | Reason line | Colour |
| --- | --- | --- | --- |
| ready | small filled circle | "Eligible · release at £2.00" | verified |
| needs_attention | triangle | first individual-approval finding title | caution |
| held | square | first blocking finding title | blocked |
| unverifiable | struck circle | "Inventory evidence unavailable" | unavailable |
| excluded | dash | "Withdrawn from the brief" | muted |

Selected: 3px leading rail in the action colour, selected surface, name at weight 500. The selection colour is neutral gray, so a selected ready row and a selected held row differ only by their glyph and reason, never by the rail.

Rows are grouped under five category bands (fruit, vegetables and salad, bakery, dairy and chilled, meat, fish and plant) because the fixture supplies the category and reviewers scan by aisle. The bands are not section headers in the listbox sense; they are RAC `Section` headers, which keep arrow-key movement continuous.

### Effects rail

The rail is a signal path: one 2px rule with node markers sitting on it, inside a Level 2 encased enclosure with the band title "Affected systems · 6 planned · none executed". Each node is a 24px marker on the line with three stacked labels below: destination (dense sans), mode (readout, mode colour), state (readout, muted). The markers are the same glyphs as the mode legend, so the line itself tells the reader where the real sandbox ends and simulation begins.

Below the enclosure, one ledger titled "What can be undone" lists each destination's recovery consequence in scenario language. Destinations for this scenario, in the order the effects would run:

| Semantic action | Destination shown | Mode | Undo consequence |
| --- | --- | --- | --- |
| update_promotion_record | Promotion pricebook, Google Sheet | live sandbox | Restores automatically if the row has not changed again |
| record_top_up_recommendation | Top-up order draft, Google Sheet | live sandbox | Restores automatically if the row has not changed again |
| schedule_storefront_promotion | Storefront sandbox | live sandbox | Restores automatically before a later promotion replaces it |
| queue_labels | Label queue, Google Sheet | live sandbox | Can be removed until label production begins at 06:00 |
| release_top_up_amendment | Supplier order system | simulated | Applied in simulation only; nothing to undo |
| send_notification | Supplier notification | preview only | Cannot be unsent; a correction would be a new message |

This table is part of the scenario presenter, not a universal rule. Stage 3's effect planner replaces it.

Narrow widths turn the rail vertical: the rule runs down the left, markers on it, labels to the right, order preserved.

### Outcome strip and header

The header is one 48px row: product mark, batch title in display, then mode and deadline as readouts on the right ("REPLAY · fixture 1.0.0" and "21h 15m to label production"). The outcome strip beneath is four cells separated by default rules, each a counter over a readout label: 27 evaluated, 17 ready, 6 need attention, 4 not releasable, with "2 held · 1 excluded · 1 unverifiable" as the last cell's meta line so the full accounting is visible.

### Mobile detail

The first screen is the outcome strip and list. The detail screen keeps this order: back link and line title, verdict columns stacked with policy first, the margin ledger, values, vertical rail, then closed readiness and evidence disclosures. The reviewer summary is in flow at the end.

## Structure

```text
app/
  layout.tsx                    # lang, Geist font variables, skip link
  globals.css                   # tailwind, tokens, base, edge utilities, readout utility
  page.tsx                      # server: loadReviewedReplay → presentReview → <ReviewWorkspace>
  workbench/page.tsx            # guarded comparison page (see below)

components/
  ui/
    button.tsx                  # RAC Button; primary | secondary; edge level; disabled
    status-label.tsx            # label + glyph for outcome, eligibility, gate result, mode, state
    section-band.tsx
    ledger.tsx                  # <Ledger>, <LedgerRow>
  review/
    review-workspace.tsx        # 'use client': frame, selection from URL, narrow focus handling
    app-header.tsx
    batch-strip.tsx
    candidate-list.tsx          # 'use client': RAC ListBox with Sections
    line-detail.tsx             # identity + the sections below
    verdict-panel.tsx           # agent | policy columns and the margin ledger
    values-ledger.tsx
    effects-rail.tsx
    readiness-matrix.tsx        # glyph row + native <details> per gate
    evidence-section.tsx
    reviewer-summary.tsx

lib/
  review-presentation/
    present-review.ts           # one presenter; formatting helpers inside until size demands otherwise
    present-review.test.ts
  cx.ts
```

Eleven review components, four primitives, one presenter. Files are added only when a component's JSX exceeds comfortable reading, not by category.

## Data across the boundary

`app/page.tsx` reads `searchParams.sku`, validates it against `Sku`, defaults to `ALD-0025`, and renders `<ReviewWorkspace presentation={presentReview(replay)} initialSku={sku} />`.

`ReviewPresentation` carries only strings, numbers, booleans, and ISO timestamps:

- `batch`: title, mode, fixture version, reviewed-at, label deadline, top-up cutoff, remaining label, the seven summary counts, and the static reviewer counts (0, 0, 0, 27).
- `candidates`: 27 rows in fixture order with `sku`, `name`, `unit`, `category`, `categoryLabel`, `outcome`, `outcomeLabel`, `reason`.
- `details`: one `LineDetail` per SKU with `identity`, `agent` (recommendation, label, rationale, uncertainties), `policy` (eligibility, eligibilityLabel, findings, reviewerConsequence), `margin` (projected percent, floor percent, basis text) when a proposal exists, `values`, `effects` or `null`, `gates`, `evidence`.

`outcome` and `policy.eligibility` are separate fields, rendered in separate positions with separate labels. The verdict panel shows eligibility. The identity band shows both, labelled "Policy" and "Outcome". The candidate row shows outcome only.

The payload is measured during implementation. Expected size is around 150 KB uncompressed; the fallback above 250 KB is passing summaries plus the selected detail.

## Selection, layout, and focus

Selection is URL-backed and stays only if the proof holds. The first implementation step is a ten-minute check that Next's search-params integration with `history.replaceState` and `pushState` updates `useSearchParams()` without a server round trip. If it does not, selection falls back to a single `useState` seeded from `initialSku`, and the URL is dropped from this pass.

- Wide layout: both panes render, `replaceState` on selection, focus stays in the listbox.
- Narrow layout: both panes render, CSS shows one based on `data-view`, `pushState` on selection, then focus moves to the detail's line heading (the `<h2>` naming the product). Browser Back returns to the list; "Back to candidates" links to `/` without scrolling.
- Narrow detection is one function, `isNarrowLayout()`, reading `matchMedia('(max-width: 47.99rem)')` at the moment of selection. No `checkVisibility()`. The workbench's 390px frame therefore shows the narrow composition but keeps wide-layout selection behaviour, which is acceptable for a static comparison page.

Listbox and detail relationship for assistive technology:

- The listbox is labelled "Candidates" and carries `aria-controls` pointing at the detail region.
- A visually hidden description on the listbox states: "Moving through candidates updates the line detail beside the list."
- The detail region is a `section` labelled by the selected line's heading, so its accessible name changes with selection.
- No live region. The listbox announces the selected option; adding a status announcement would duplicate it.

Static actions:

- Approve item, Hold, and Reject render as real disabled buttons under the verdict panel. Beside them, visible text explains the state. For a blocked line: "Approve item is unavailable: policy blocked this line." For eligible lines: "Review actions are not available in this replay preview." Nothing depends on `aria-describedby` on a disabled control.
- The reviewer summary shows "0 approved · 0 held · 0 rejected · 27 pending", disabled "Review omissions" and "Commit approved changes", and one visible line: "This replay is read-only. Review actions arrive in a later build."

Keyboard: skip link to the batch heading, Tab enters the listbox on the selected row, Up and Down move focus and selection together, Home and End jump, type-ahead works, Enter and Space toggle each gate and evidence disclosure. Focus is a 2px solid ring offset 2px outside any optical rim. No positive `tabindex`.

## Workbench page

`app/workbench/page.tsx` renders the same `ReviewWorkspace` four times, in `data-theme="light"` and `data-theme="dark"` wrappers, at a wide container and a 390px container, followed by one row of the primary button at `--edge-strength` 0.5 and 1.0 and a row of the four adapter-mode labels. A `?sku=` parameter selects the line in all four frames. The page calls `notFound()` unless `NODE_ENV` is development or `SAFEPOINT_WORKBENCH=enabled`. That is the whole workbench for this pass.

## Packages

| Package | First need |
| --- | --- |
| `react-aria-components` 1.21.0 | `candidate-list.tsx` |
| `geist` 1.7.2 | `app/layout.tsx` font variables |

## Commands

```bash
pnpm add react-aria-components@1.21.0 geist@1.7.2
pnpm dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Tests in this pass: `present-review.test.ts` checks that counts reconcile with `summary` (17 / 6 / 2 / 1 / 1 and 4 non-releasable), that salmon carries agent release, policy blocked, a projected margin of 9.2 against a 15 floor, and a six-node rail all in planned state, that lines without a proposal have no rail, and that outcome and eligibility are distinct fields on every line. Component checks arrive with the workbench and Playwright in the extension pass.

## Review decisions

Recorded from the review of the first proposal so the change of direction is traceable.

| Feedback | Decision |
| --- | --- |
| Build the interface before the design system | This pass is a vertical slice. Primitives are extracted from the slice, not designed ahead of it. |
| Workbench too elaborate | One protected page comparing the slice in four contexts. Specimen files and dynamic routes are dropped. |
| `outcomeLabel` mixed "Blocked" with outcomes | Outcome labels are Ready, Needs attention, Held, Excluded, Unverifiable. Eligibility labels are Eligible, Blocked. Separate fields, positions, and wording. |
| Disabled buttons cannot carry `aria-describedby` | Unavailable-action reasons are visible text beside the controls. |
| Narrow focus target | Focus moves to the selected line's heading, not the back link. |
| Listbox to detail relationship | `aria-controls`, a hidden description, and a detail region named by the selected line. No live region. |
| `checkVisibility()` | Replaced by one isolated `matchMedia` check. |
| Four mapping modules | One presenter file. |
| Unused dialog | Deferred to Stage 2. |
| Universal destination mapping | Scenario-specific table inside the presenter, replaced by Stage 3's planner. |
| Conservative typography and palette | Geist Sans and Geist Mono; native Tailwind stone and gray with semantic states from Tailwind's own hues. |

## Resolved questions

1. **Margin readout.** The presenter computes the projected margin from validated catalogue and supplier facts using the documented formula: selling price minus cost plus confirmed funding, divided by selling price, with unverified funding counted as zero. The interface labels it "Derived display value" with its basis. It is never presented as a policy result; the policy result remains the replayed finding.
2. **Category grouping.** The candidate list is one React Aria ListBox with five `Section` groups. Headings are non-interactive presentation rows, arrow keys move continuously across sections, and there is no nested listbox. The shown count and the 27-line accounting stay visible above the list.

## Implementation notes for the vertical slice

Recorded after the first implementation pass so the next batch starts from what exists rather than from the plan.

- `light-dark()` is polyfilled by Lightning CSS during the Next build into inherited `--lightningcss-light` and `--lightningcss-dark` variables, so the earlier browser-support caveat no longer applies. Because those variables resolve where a token is declared, the token block is declared on `:root, [data-theme]`, which is what lets the workbench render themed subtrees.
- Selection keeps one small `useState` for the last selected SKU so the row stays highlighted after browser Back removes the parameter on a narrow layout. The URL remains the source of truth.
- The serialised page for `/` is about 80 KB of HTML plus about 260 KB of React Server Component payload, 24 KB gzipped. That is above the 250 KB uncompressed line drawn in this proposal; trimming the evidence source-record facts is deferred to the next batch rather than done blind.
- Category grouping uses one `ListBox` with five `ListBoxSection` groups and non-interactive headers, so arrow keys move continuously across all 27 rows and type-ahead works.
- Values are one ledger with current, arrow, proposed, and a note, rather than a separate values component. The rail, verdict, readiness, and evidence sections are separate files because each is a distinct visual device.
- `/workbench` prerenders as a 404 in production builds and reads the query string only when enabled, so it is dynamic only where it is visible.
