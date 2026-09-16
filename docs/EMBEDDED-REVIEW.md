# Embedded review direction

Status: current product and implementation direction, September 2026. This supersedes the standalone-first composition in the Stage 1B briefs, experience specification and Fable handoff. Their evidence, authority and accessibility requirements still apply.

Safepoint appears as a compact review response in an existing conversation. It expands into a focused review surface and eventually returns a durable result to that same conversation. The conversation provides context; the structured change set defines what a person reviews.

## Process navigation and brand

Status: implemented, 9 September 2026. Use the canonical [product terminology](PRODUCT-BRIEF.md#product-terminology).

### Menu hierarchy

The demonstration has two functioning menu levels. The root contains one **Processes** entry with a process icon, a rounded count badge, and a right chevron; there is no Workspace label. Opening it reveals the process list. A left chevron, labelled **Back to menu**, sits beside the centred **Processes** heading and returns to the root. Start on the process level when opening an existing process route so the current selection is visible.

Only actual process examples appear in the list: Promotion release and Support handoff. The unrelated Workspace and Recent placeholder groups have been removed. The state gallery is linked from the development workbench rather than listed among processes. The root level is intentionally minimal: it demonstrates navigation rather than implying additional product features.

Changing menu levels preserves the open review, selected process, and saved order. Entering Processes slides the menu content to the left; returning to Workspace reverses the direction. Keep the brand stationary and clip motion to the menu viewport. The transition takes 220 ms and respects reduced-motion preferences. Only the active level is interactive and exposed to assistive technology. Keyboard focus follows the level change and returns to the Processes entry when going back; rapid direction changes must not leave duplicate controls or stranded focus.

### Process list

The section heading is muted uppercase with a fine divider. Process rows use the same semibold weight in every state, with slightly muted default text, darker active text, a subtle hover background, and a stronger active background. Rows are 40 px tall on a 42 px pitch. The back control uses a simple SVG chevron. A blue information box with an information icon explains that the workspace uses fictional replay data and makes no live changes.

In normal mode, hovering highlights a row and clicking or pressing Enter opens its available run. Hover never opens a session. Keep the current process visibly selected. The existing replay slice only supplies the current recorded run; earlier placeholder runs must not appear newly navigable.

**Add process** and **Arrange processes** sit to the right of the logo. Add process remains an explicitly unavailable preview placeholder. Hovering or keyboard-focusing Arrange processes previews all drag handles without enabling dragging or disabling links. Clicking it enables ordering, makes all handles available, applies the primary control style, and changes its accessible name and tooltip to **Save order**. Clicking Save order confirms the browser-local order. There are no separate ordering tools or Cancel button; handles support pointer dragging and Up/Down/Home/End keys. Returning to the root preserves an unfinished draft. There is no menu-announcement section. If browser storage is unavailable, the order is kept for the current visit.

Action tooltips use concise names; status tooltips retain the detailed run breakdown. Status shapes are paired with the blocked count for blocked runs, or the total item count otherwise. The Processes heading highlights as a group on hover, with a lighter chevron surface. A divider sits directly below search.

A search field beneath the brand filters process names case-insensitively and includes an empty state. At the root it filters the Processes entry. Changing menu levels clears the query. Entering Arrange mode clears the query and temporarily disables search, so ordering always operates on the complete list.

The profile footer contains Maya’s name, a deterministic `@outpacelabs/avatars` gradient avatar and a three-dot **Settings** placeholder. The fictional Maya seed uses teal, cyan, blue and zinc colours. The blue replay information box remains above it.

A compact coloured status shape retains its space when the process name overflows. The accessible name includes the process and status; hovering or keyboard-focusing it opens a structured tooltip on the right, with automatic placement fallback at narrow widths. The tooltip contains a status pill, labelled review counts, and replay context. Derive its information from the same review data as the main panel. Explain the latest available run's status and relevant counts in its tooltip, retaining replay context. Reveal a truncated process name in full on hover and keyboard focus. Essential status information remains available without hover, including on touchscreens.

### Shared brand component

The shared `Brand` component replaces the boxed `s.` mark with a teal pill containing the favicon's existing white checkmark geometry on the left and **SAFEPOINT** on the right. It uses Nunito at weight 800, 11 px, with 0.12 em tracking, independent of the development typeface selector. Next.js loads and self-hosts the font. The pill and favicon share teal `#007c78` with a white checkmark. No glyph distortion is used. The uppercase brand is an intentional exception to normal sentence-case interface labels.

### Shared tooltip component

The shared `Tooltip` component serves navigation names, the icon-only toolbar controls, status shapes, and connected-system discs. Every tooltip uses a placement-aware rounded arrow with curved shoulders. The arrow and tooltip share a solid surface, outer edge and inset highlight, avoiding colour seams. The arrow sits one pixel farther out from the original rounded treatment. Rich content is optional, so short control hints retain the compact treatment. Its restrained entrance and exit motion takes inspiration from the [Ariakit Tooltip with Motion example](https://ariakit.com/examples/tooltip-framer-motion). Placement, spacing, surface, typography, dismissal, and reduced-motion behavior are consistent across consumers. Hover uses a 350 ms warmup and a 150 ms close delay; keyboard focus opens immediately. `OverflowTooltip` measures the rendered label and only reveals a name tooltip when it is truncated.

The implementation uses the installed React Aria components. Ariakit supplies unstyled primitives and flexible composition through its `render` prop; its linked example adds Motion for animation. [React Aria supports custom styling and animation](https://react-aria.adobe.com/styling), so reproducing this interaction does not require a second accessibility library. React Aria entrance/exit states drive CSS opacity/transform animations. The menu and reorder preview also use CSS transforms; no additional animation or accessibility dependency is required.

Tooltips open on hover and keyboard focus, dismiss on Escape, stay within the viewport, and remain hoverable. Keep accessible names on their triggers and associate supplemental descriptions without duplicate announcements. A tooltip is supporting information, not the only means of identifying a control or understanding a blocking status.

### Verification

Automated browser checks cover menu navigation, rapid reversal and focus restoration, current-route highlighting, pointer and keyboard reordering, Escape drag cancellation, unfinished draft preservation, persistence across routes/reloads, unavailable browser storage, 320 px and 390 px layouts, truncated names, hover/focus tooltips, Escape dismissal, hoverable tooltip surfaces, and reduced motion. Light and dark layouts were visually inspected. Unit tests cover malformed saved preferences, changed process lists, reorder boundaries, and statuses derived from actual review plans. These checks do not replace testing with assistive technology.

## Process header and setup

Status: direction agreed 15 September 2026. The editable title, setup drawer, side panel, and Settings tab are implemented; the data status and Data tab replace the current systems summary and Systems tab next. Use the [product terminology](PRODUCT-BRIEF.md#product-terminology) and the [read path](TECHNICAL-DESIGN.md#read-path-from-connection-to-snapshot).

A process page answers two questions before any run is opened: will the next run have what it needs, and what can it change? The header states that; the setup drawer explains it. What a particular run read belongs to that run's thread and evidence, not to the header.

### Header

One row, flush with the notch: the process title, the data status, then the notch holding **Instructions** with its version and the refine placeholder.

The **title** is an input dressed as the heading. Pointing at it shows a field face lighter than the sheet; clicking places the caret at the end of the name. Enter or leaving the field keeps a change, Escape restores the name, and an empty name keeps the old one. The name is shared with the sidebar and the drawer.

The **data status** replaces the stacked system discs, which say which systems exist but not whether the next run is safe to start:

```text
Promotion release   In 9 · ▲ 1 stale  →  Out 4 · sandbox   ╱ Instructions v4 ╲
```

- **In** gives the count of inputs and the worst condition in words — "1 stale", "login expired", "2 need mapping". With nothing to report it is only the count.
- **Out** gives the count of outputs and the least real adapter mode among them — "sandbox", "simulated" — and nothing when every output is live.
- It describes readiness for the next scheduled or manual run, for example "Ready for Thu 09:00".
- Each half opens the setup drawer at its own section. State is never carried by colour or shape alone.
- At narrow widths both halves collapse to counts; a condition that needs attention stays visible.

### Setup drawer

A slide-over with three tabs: **Instructions**, **Data**, and **Settings**. A detail opened from the drawer opens in a second panel on its left; the control that opened it closes it again, and choosing another item swaps the content in place.

#### Data tab

A list, not a canvas: it has to stay legible at 50 inputs.

```text
INPUTS                                    Ready for Thu 09:00
● Current shelf price     Shopify · Products          18 min ago
▲ Supply position         Postgres · dc_supply        26 h · limit 24 h
○ Supplier terms          No source                   Connect…
◐ Policy rules            policy.pdf · extracted      3 passages low confidence

OUTPUTS
Promotion price           Storefront        sandbox · restores automatically
Shelf labels              Label service     simulated · manual follow-up
```

- An input row reads requirement, then source, then condition. An input with no source is a row with a Connect action, not an absence.
- An output row reads what changes, then the target, then adapter mode and reversibility in consequence language.
- Conditions follow the four in the technical design — connection, binding, freshness, coverage — each with its own words and its own fix.
- Future: a map view with inputs on the left, the process and its instruction version in the middle, and outputs on the right, lines coloured by condition. It is an overview of the list, not an editor.

#### Input detail

Opens in the side panel, with five sections:

1. **Records** — normalised records, with the raw source record available, filterable, and linked to the review items that cite them.
2. **Mapping** — source fields against the input's schema, with changes shown when the source's structure moves.
3. **History** — snapshots by run, with what changed between them.
4. **Usage** — the checks that depend on the input and what a run would do without it.
5. **Access** — the connection, its owner, scopes, credential expiry, and Reconnect.

#### Adding an input

A guided flow in the side panel: choose a connector, with the workspace's existing connections first; authenticate or reuse a connection; choose the resource and preview it; confirm suggested field mappings; set required, maximum age, and read mode; then test the read ("1,284 records · 2 failed validation") before attaching. Adding an output follows the same flow, starts in sandbox mode, and becomes live only after a successful sandbox run.

#### Settings tab

In the order it is reached for: the name, the schedule (the same control and store as the runs rail), notifications, and last archive or delete. Archive is the ordinary way to end a process: it stops the schedule and hides the process but keeps its runs and reviews. Permanent deletion takes the record of what runs changed with it, so it is only for a process that has never run.

### Portfolio boundary

- Connections live at workspace level; the drawer shows a process's bindings and links to the connection. Workspace connection management is Future.
- The scenario's evidence files stand in for snapshots. Adding and removing inputs is a browser-local mock over those files and changes no recorded run, review, or citation.
- Outputs cannot be changed. Notifications, archive, and delete are unavailable placeholders.
- The schedule and the process name are saved in the browser; nothing starts a run from the schedule.

## Two surfaces

The inline response names the process and batch, accounts for every item in three groups, shows the leading blocker, and offers one primary review action. Ready means ready for human review, never approved or applied. Replay mode and the absence of applied changes remain visible.

The expanded surface groups items by disposition, most severe first. It starts on the leading blocker, when one exists. A filter exposes every group and all items. The selected item leads with one operational conclusion, its reason, what would resolve it, and proposed changes. Supporting facts, recorded policy findings, agent checks, provenance and intended destinations are disclosures. Source facts, model interpretation and policy findings remain separate data even when the first view summarises them.

The host may provide a panel or full-screen view using the shared review body. The local demonstration uses a modal dialog, full-screen at narrow widths. Escape and the visible close action return focus to the invoker; closing does not imply a decision. Selection belongs to each component instance, not the host's global URL. Container width controls the list/detail layout. Browser history is a future host-adapter responsibility.

No approval, edits, commitment or execution are implemented in this replay slice. There are no decorative approval buttons. The footer explains the current boundary. Future approval must bind an exact revision and visible scope; changed facts or proposals invalidate affected approval. Approved, applied and verified remain distinct states. Execution must survive closing the review.

## Release plan contract

`lib/review/plan-contract.ts` carries the card: an ordered severity scale (`blocked`, `awaiting a decision`, `deferred`, `will apply`), typed deltas, and a discriminated commit status. `lib/review/plan-derivations.ts` owns every count. Nothing is stored twice, so the verdict line and the pills beneath it cannot disagree; a test asserts they use the same word for the same bucket.

Colour is bound to a bucket's position on the scale, never to its label, so a fifth bucket is a token change. Approval is a property on the row rendered as a chip, not a bucket: a fifth pill would break the ordinal read.

Deltas are built from typed source values, never parsed back out of display text. `before: null` means the prior value was not observed; `create` means no prior value exists. Collapsing those is how invented before-values get in. An unrecognised delta kind degrades to `opaque` so a row never renders as a gap, but a malformed *known* kind still fails validation, because swallowing it would hide an adapter bug behind a plausible-looking row.

Exclusion, when it lands, adjusts `selectedCounts` only. `evaluationCounts` ignores it and drives the bar, the pills, the verdict and the state, so excluding the last blocker can never turn a blocked plan into "all clear".

### `deferred` has no producer

The bucket is on the scale and nothing populates it. The natural producer is `requiresApproval`: an effect awaiting another person's sign-off is intentionally held back this run, which makes approval both a row chip and an input to disposition. That needs the evaluation envelope to carry an approver identity, and the promotion fixtures to mark at least one line as requiring external approval. Until then the promotion replay renders three buckets and the support fixture exercises the fourth.

## Replay boundary

No control names an operation this slice cannot perform. Under `mode: 'replay'` apply, retry, undo and re-run render as receipt text, never buttons; the only live controls are navigation. Applied and partially applied states label themselves simulated receipts. When applying is genuinely impossible the action changes — `Resolve blockers` — rather than being greyed out.

`/examples/states` renders all eight states plus a 2,000-effect plan as an interactive harness with synthetic detail payloads. Above five items in a group the card rolls up by reason. The modal pages lists exceeding 200 matching items in groups of 50, keeping the selected item on its rendered page. Set changes retain exact added and removed values in the detail pane, and execution failures show each item’s failure reason separately from its evaluation findings.

## Reuse boundary

`lib/review/contracts.ts` defines a validated presentation contract: batch identity and revision, complete item summaries, operational groups, changes, facts, checks, findings, evidence and intended effects. This is a UI contract, not a general policy engine or an execution authorisation.

The promotion adapter maps the validated grocery replay into that contract. A small synthetic support-handoff fixture exercises the same card and review components without SKU, currency, margin or grocery gate assumptions. It is a presentation example with recorded checks, not a second production process or connector. Both are explicit direct imports; there is no plugin registry or configuration language.

The next domain slice should standardise the evaluation envelope (versioned input snapshot, evaluation time, policy version, findings and evidence references). Process modules retain typed inputs, normalisation, units, business rules and allowed operations. Normalisation must retain provenance and uncertainty; valid JSON does not make an assertion true. Implement the required deterministic policies before allowing proposal edits.

Only batch summaries reach the initial client. Detail is fetched on selection, validated, checked against the requested identity and revision, and cached within the review instance. The read-only replay route serves fixed synthetic data. It is not a production authorisation boundary. Production host integration needs authentication, scope checks and an adapter for the host's actual display capabilities.

## Visual rules

Keep the Fable grammar: quiet stone surfaces, graphite text, restrained state colour, tabular Geist Mono values and precisely bounded controls. Give the batch and selected decision generous space. Use sentence case for normal labels. Reserve uppercase readouts for small system identifiers. Flat shared edges separate related information; do not enclose every subsection. The effects rail becomes a supporting destination list before execution, reserving sequence and progress for the future deterministic effect plan.

The compact response is the signature object: a complete, accountable summary small enough to belong in a conversation. The larger dialog supplies working room without reproducing a dashboard in miniature.

## Acceptance and next work

- All 27 grocery candidates remain discoverable: 17 ready, six needing attention, four unable to proceed.
- Salmon remains blocked despite the agent's release recommendation. Unavailable evidence is never labelled passed, zero, or merely not applicable.
- Proposed changes are separate from costs, funding and forecasts. Missing current values are labelled as unavailable snapshots, not invented before values.
- The support fixture uses the same components and transport contract.
- Verify dialog entry/exit, focus restoration, filtering, selection, disclosure, failed detail loading and retry, narrow host containers, both themes, and contrast.
- Next: calculate actual policy before editable review; then add revision-bound decisions, exact-scope confirmation, persistence and durable execution. Host-specific MCP or Duvo integration follows verified host capabilities.

Original reference images were not available in this checkout. Visual implementation follows the written Fable synthesis; direct image fidelity remains to be reviewed when those references are available.
