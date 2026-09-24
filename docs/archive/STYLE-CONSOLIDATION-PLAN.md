# Style consolidation and code-quality handoff

## Objective and current instruction

Make a rendered element's appearance easy to identify, understand and edit.
The target workflow is: inspect an element, find one named treatment, read its
states together, follow a token directly to its definition. Preserve the current
visual design, public component APIs, interactions and accessibility behaviour
unless a concrete defect justifies a separately documented fix.

The user explicitly requested this plan for another model. The latest instruction
is **skip tests**. Do not run automated tests or browser checks while that instruction
remains in force. Continue with source review and report the resulting verification
limits. The verification matrix below is a deferred checklist, not permission to
ignore that instruction. Do not claim runtime parity from source inspection.

## Read before editing

- `AGENTS.md`: repository constraints and required checks when enabled.
- `docs/STYLING-SYSTEM.md`: authoritative ownership rules and metadata convention.
- `docs/TECHNICAL-DESIGN.md`: architecture and behaviour boundaries.
- `docs/COMPONENT-STYLING-PROPOSAL.md`: measured editor and CSS Modules findings.
- Applicable TypeScript, React, keyboard, live-region, Tailwind and safe-refactor
  skills. Repository rules take precedence over generic examples. Consult current
  official documentation against installed versions when technical uncertainty
  arises; do not introduce a framework migration to solve navigation problems.

Inspect `git status` and the current contents first. This workspace already has
extensive unrelated edits, including a token-file split. Do not reset, overwrite,
stage or commit that work as part of this cleanup. Establish a session-start patch
or equivalent record so your own changes can be reviewed independently of HEAD.

## Completed reference slice

The process menu's back heading is now styled by `.process-menu-back` in
`app/components.css`, inside `@layer components`:

- Resting ink reads `--sp-menu-link`.
- Hover and keyboard focus read `--sp-text-primary` and `--sp-menu-wash-strong`.
- Hover remains inside `(hover: hover)`, matching the former utility variant.
- `@apply control-wash` retains the shared transition contract.
- Geometry and simple typography remain in `process-menu.tsx`.
- The previous `MENU_BACK_APPEARANCE` constant is removed.
- `styleDebug` identifies the treatment as `process-menu-back`.

The intended appearance and behaviour are unchanged. Live verification was not
completed: sandboxed Chromium could not launch, automatic approval review rejected
an outside-sandbox launch due to an account usage limit, and the user subsequently
instructed us to skip tests. Do not reuse earlier passing checks as evidence for
this CSS extraction.

## Architecture to retain

| Concern | Owner |
| --- | --- |
| Shared design decisions and values | The seven files under `app/tokens/` |
| Tailwind publication of tokens | `app/tokens/theme.css` |
| Shared painting/transition utilities | `app/globals.css` |
| Named interactive treatments, grouped states, pseudo-elements, derived values | `app/components.css`, in the appropriate cascade layer |
| Layout and straightforward typography | JSX utilities |
| Development-only identity | `lib/style-debug.ts`, applied to existing DOM nodes |

Extract a treatment when its visual states are scattered, its ownership is unclear,
or its dependencies require repeated detective work. Do not move every utility to
CSS. Conversely, do not leave one state in JSX when its siblings have moved into a
named treatment. The existing components.css eligibility rules remain authoritative.

Use direct existing semantic tokens in component rules. Do not create one alias per
DOM element. Introduce component-specific tokens only when the appearance needs
independent tuning; record who shares the original token before changing values.
Keep `control-face`, slant geometry, and other shared paint mechanisms shared.

## Phase 1: inventory and prioritisation

Inspect `components/ui`, `components/app-shell`, `components/review` and relevant
route markup under `app`. Review development galleries after production components;
they can expose variants and states but should not dictate production abstractions.

Create a short inventory in this document as work proceeds. For each meaningful
treatment record the component/part, current style locations, state triggers,
shared token dependencies, disposition (consolidate, already clear, or defer),
and verification status. Count treatment coverage, not raw attribute additions.
Components rendering only providers or composition need no invented DOM root.

Prioritise these batches; inspect actual current code before assuming a defect:

| Batch | Starting files | Particular relationships to preserve |
| --- | --- | --- |
| Menu | `components/app-shell/process-menu.tsx` | Row editing/current/dragging priority; inherited badge stops; text states; workspace tiles and hues; search; arrange/save; notice and account controls |
| Header and shared controls | `process-header.tsx`, `components/ui/button.tsx`, `switch.tsx`, `tooltip.tsx`, `notch.tsx` | React Aria states; selected/freshness combinations; count/icon hierarchy; separate face/ring layers; tooltip arrow sharing |
| Runs and timeline | `run-row.tsx`, `section-row.tsx`, `thread-step.tsx`, `system-cluster.tsx`, `system-parts.tsx` | Tally severity; row hover propagation; inherited ink; connector and disc paint |
| Panels and forms | `drawer-aside.tsx`, `process-panels.tsx`, `input-detail.tsx`, `process-settings.tsx`, `schedule-control.tsx`, `instructions-panel.tsx`, `text-diff.tsx`, `assistant-panel.tsx` | Focus restoration; inert leaving panels; controlled inputs; resizing and overflow; diff/status semantics |
| Review surfaces | `components/review/` | Severity buckets; selected candidate; gate disclosures; release state; effects rail; modal and drawer behaviour |
| Remaining UI | Other components and route markup | Record already-clear cases and explain intentional omissions |

## Phase 2: consolidate one treatment at a time

1. Trace the full existing treatment: base, hover, focus-visible/focus-within,
   pressed, selected/current, disabled, invalid, expanded and loading where used.
   Include parent-state effects on children, pseudo-elements and responsive rules.
2. Record state precedence and the distinction between native `disabled`,
   `aria-disabled`, React Aria data attributes and native pseudo-classes. Preserve
   existing no-op placeholders and their accessibility semantics.
3. Choose one descriptive searchable selector, such as `.process-menu-back`.
   Keep the existing token family unless independent tuning is justified.
4. Move the coherent appearance and state set into `@layer components`. Use
   existing shared utilities for paint/transition mechanics where appropriate.
   Preserve hover media guards, reduced-motion behaviour and forced-colors rules.
5. Remove replaced appearance utilities/constants at the call site. Retain layout
   and typography utilities that do not conflict. Audit cascade order and specificity:
   moving a utility to the component layer changes its precedence relative to
   remaining utilities. Never solve that silently with `!important`.
6. Point `styleDebug.appearance` to the named treatment. Keep component and part
   names meaningful. Remove metadata that merely duplicates a lengthy class list.
7. Review the source diff for unintended geometry, token-value or interaction
   changes. Record unverified behaviour rather than implying it was exercised.
8. Finish that treatment before proceeding to another family. Update the inventory
   and authoritative documentation when a general convention changes.

## Phase 3: metadata and naming cleanup

`styleDebug` currently emits component, part, appearance and variant attributes only
in development. Retain its small API and its ability to run in both server and
client components. No extra wrapper nodes, browser listeners or React state.

- Annotate meaningful roots and independently painted parts, not every span.
- Confirm wrappers actually forward metadata to DOM. The earlier drawer annotation
  had to move from a private component call to its actual DOM root.
- Use one stable treatment name for consolidated components. Inventory older
  space-separated utility lists and Button's `quiet`/`accent` shorthand; migrate
  deliberately where that improves navigation, without renaming public variants
  simply to make metadata uniform.
- Derive variants from the props/configuration already choosing classes.
- Do not mirror active states, embed file paths/line numbers, or maintain token lists.
- Metadata must not become CSS selectors, behaviour hooks or test selectors.
- Diagnostic omission in production is required; complete elimination of every
  helper call is not currently guaranteed. Do not add a build plugin without a
  demonstrated need.

## Phase 4: focused style and code-quality improvements

Review these alongside each migrated family. Fix concrete local problems and
record larger unrelated findings separately rather than expanding the refactor.

- Conflicting utilities for the same property, redundant declarations, accidental
  inherited values, dead styles and stale comments. Check all references before
  deleting a selector or token, including string constants and development pages.
- Arbitrary values and repeated derived measurements: use existing tokens first.
  Add a token only for a reusable design decision; do not tokenise every number.
- Shared constants/helpers: retain ones expressing a real contract; remove ones
  whose sole purpose was spreading one treatment across files. Do not extract
  components merely to shorten markup or add generic style registries.
- CSS comments: at most two lines for a measured constraint, browser behaviour or
  cross-file dependency. Put longer rationale in the styling documentation.
- TypeScript: keep concrete types, use narrowing and `satisfies`, and avoid new
  casts or `any`. Preserve public props and ref forwarding.
- React: preserve server/client boundaries, state ownership and stable keys. Avoid
  added effects, memoisation or wrappers unless they solve an evidenced problem.
- Accessibility: check keyboard operation, visible focus, hit targets, labels,
  contrast across states, disabled semantics, focus restoration, reduced motion
  and forced colours. A live-region change requires its specific skill; do not
  add announcements as a side effect of styling consolidation.
- Colour: preserve theme/neutral subtree re-resolution and `light-dark()` semantics.
  Never edit generated palettes by hand. Shared tokens can affect other consumers.
- Alignment: preserve rail cells and existing geometry. Never calculate compensating
  icon offsets or hard-code axis positions into the alignment checker.

## Deferred verification matrix

Only execute these checks if the user's skip-tests instruction is lifted. Until
then document source-level review and outstanding runtime checks explicitly.

For each relevant batch, capture before/after evidence on representative screens:
light/dark themes, affected neutral palettes, wide/narrow layouts, mouse hover,
keyboard focus, touch/no-hover mode, and applicable disabled/selected/dragging states.
Compare computed paint, transition properties/durations, geometry and screenshots.
Exercise keyboard navigation and focus restoration; a screenshot is insufficient.

Use `pnpm dev:styles` for colour inspection. Inspect the available browser skill
and runtime before selecting tooling. Never bypass a rejected approval request.

Run the repository gates when authorised:

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm check:tokens
```

Use focused additional checks when affected: `pnpm check:rail` and
`pnpm check:rail -- --level all --self-test` for sidebar geometry; the documented
contrast checks for supported surfaces. Read `docs/CONTRAST-CHECKER.md` before
claiming contrast coverage. Verify a production build when shared CSS architecture
or metadata behaviour changes materially; inspect that diagnostic attributes are
absent while functional state attributes remain.

Do not introduce tests that merely repeat class strings. Add regression coverage
only for meaningful state, accessibility or production-boundary behaviour when
needed and authorised. Separate existing failures from new regressions. At this
handoff, `assistant.tsx` had an unused Tooltip import and formatting issue; recheck
current contents before classifying any future failure as pre-existing.

## Completion and handoff

The broad consolidation is complete when every meaningful production treatment in
the inventory has been consolidated or explicitly reviewed as already clear, and
remaining exceptions are explained. A representative component should be traceable
from DOM identity to one coherent state rule and directly to its semantic tokens.

Deliver a concise account of migrated families, token-sharing decisions, substantive
code-quality fixes, deferred findings and verification performed or skipped. Update
`docs/STYLING-SYSTEM.md` to describe the final system, and leave this document's
inventory/checklist current so another model can resume without repeating discovery.
Do not describe the whole app as covered based solely on the number of annotations.

Start with the remaining ProcessMenu treatments after reviewing the completed
`.process-menu-back` reference. Do not execute all phases as one unreviewable rewrite.
