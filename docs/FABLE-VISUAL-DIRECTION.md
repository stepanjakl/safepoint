# Safepoint visual direction for Fable

Status: authoritative visual handoff for Stage 1B

Audience: Fable and the designers or frontend engineers reviewing its proposal

## Purpose

This document translates Safepoint's product and experience specifications into a concrete visual grammar. It describes how the interface should feel, how information should be divided, and how controls should communicate priority. It does not change the scenario, the replay data, the interaction contract, or the Stage 1B implementation boundary.

Safepoint is a **precision instrument ledger**: a dense operational workspace built from flat planes, crisp divisions, calibrated data, and carefully encased controls. It should feel closer to a preflight console, financial review ledger, or well-made measuring instrument than to a chat product or a dashboard of independent cards.

The interface has one job: help an operations specialist decide whether an agent-proposed batch is safe to execute. Visual detail must make that decision easier. Detail that does not identify structure, state, provenance, consequence, or interaction priority does not belong.

Exact typefaces and colour values are provisional. Fable should define semantic tokens and representative values, but component anatomy must not depend on a particular font or palette. The final families and values will be selected later without redesigning the interface.

## Reference synthesis

The supplied references form four useful families. They are sources of visual grammar, not templates to copy.

### Instrument panels and recorders

The radio, recording, watch, and monitoring interfaces contribute:

- compact readouts with an obvious primary value;
- visible scales, thresholds, and progress along a path;
- bounded functional zones rather than undifferentiated cards;
- controls whose shape and edge treatment communicate their role;
- strong light and dark variants with the same information hierarchy;
- spatial representation of a process instead of prose describing it.

Translate these qualities into tabular values, policy thresholds, readiness checks, and the effects rail. Do not reproduce rotary knobs, fake screws, reflective glass, or hardware controls with unfamiliar web behaviour.

### Dense operational workspaces

The finance, workflow, administration, and split-view references contribute:

- master-detail layouts that keep the collection and selected record in view;
- narrow toolbars, section bands, data grids, and aligned value rows;
- compact controls with stable labels;
- selected records identified by a rail, outline, or local surface change;
- progressive detail that remains visually connected to its parent;
- neutral working surfaces that leave semantic colour available for state.

Use these patterns for the candidate collection, value comparisons, evidence, policy findings, and the in-flow review summary. Avoid turning every subsection into a floating container.

### Approval, comparison, and risk interfaces

The rule editors, payment reviews, comparison views, and configuration screens contribute:

- explicit separation between a proposed action and the evidence used to judge it;
- before-and-after or base-and-comparison alignment;
- visible consequences next to the control that causes them;
- confirmation surfaces that retain context;
- blocked and disabled states that explain why an action is unavailable;
- status labels that combine words, symbols, and restrained colour.

Use these qualities to keep the agent recommendation, deterministic policy result, reviewer consequence, and execution state distinct.

### Line-led and optically edged controls

The supplied CodePen and the line-led structure of [stepanjakl.com](https://stepanjakl.com/) contribute:

- hierarchy produced by borders, internal divisions, and surface changes rather than drop shadows;
- controls constructed from an outer lowlight, an inner highlight, and a shallow face treatment;
- hover and pressed states produced by changing edge emphasis rather than adding glow;
- restrained use of blur or translucency for a genuinely floating layer;
- visibly crafted controls within an otherwise calm composition.

Use the complete optical-edge treatment only where interaction priority justifies it. Its purpose is to make a control feel precisely encased, not to make the entire application glossy.

## Visual thesis

The large surfaces stay quiet. The edges carry information.

Permanent structure is expressed with solid rules. Interactive priority may be expressed with optically layered borders. Semantic state is expressed with text, symbols, and colour. These systems must remain distinct:

| System | Primary visual device | It must not become |
| --- | --- | --- |
| Application structure | Shared edges, rules, alignment, surface tone | Floating card composition |
| Selection | Leading rail, reinforced boundary, local tone | A semantic success colour |
| Interaction priority | Control face, solid outline, selective optical rim | Gloss on every button |
| Semantic state | Label, glyph, semantic colour, programmatic state | Colour-only communication |
| Process and propagation | Connected effects rail | Decorative workflow diagram |
| Evidence and provenance | Section band, source label, observed time | Unstructured explanatory prose |

The distinctive risk is concentrated in one place: the effects rail and the high-priority controls share a precisely encased, instrument-like edge language. Everything around them remains disciplined and flat.

## Workspace composition

### Desktop

Treat the desktop view as a continuous instrument face, not a page containing cards.

```text
┌──────────────── application header ────────────────────────────────────────┐
│ Safepoint  /  Fresh Food Weekend  /  mode  /  deadline                    │
├──────────────── batch outcome strip ───────────────────────────────────────┤
│ 27 evaluated  |  17 ready  |  6 need attention  |  4 held or unverified   │
├──────────── candidate collection ────────┬──────── selected-line detail ───┤
│ collection tools and shown count         │ identity and policy state        │
├──────────────────────────────────────────┼───────────────────────────────────┤
│ selected row                             │ current → proposed values         │
│ attention row                            ├───────────────────────────────────┤
│ ready row                                │ agent recommendation | policy     │
│ held row                                 ├───────────────────────────────────┤
│ excluded row                             │ readiness and evidence            │
│ unverifiable row                         ├───────────────────────────────────┤
│                                          │ effects rail and consequences      │
├──────────────── reviewer summary and next action ──────────────────────────┤
│ approved / held / rejected / pending                  review omissions      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The application header, outcome strip, workspace, and reviewer summary span the same overall frame.
- The candidate pane should normally occupy approximately 340–380px or one quarter to one third of the available width. The detail pane receives the remaining space.
- Major panes share edges. Do not put the candidate list and detail view inside separate floating cards.
- Strong rules separate application regions. Standard rules divide sections and rows. Faint rules align related values within a section.
- A section header is a compact band containing a label, optional provenance marker, and right-aligned metadata or disclosure control.
- Limit visible boundary nesting to two levels wherever possible. If a panel contains a bordered panel containing another bordered cell, remove one boundary or use alignment instead.
- Surface shifts are permitted only when they clarify containment, selection, editability, evidence provenance, or a modal layer.

### Mobile and narrow widths

- The batch outcome and candidate list form the first view.
- Selecting a candidate moves to a full-width detail view with a visible Back to candidates control.
- Preserve the selected item and list scroll position when returning.
- Convert side-by-side comparisons into labelled stacked rows without changing their order or blending their meanings.
- Keep the reviewer summary in flow. Do not use an overlay that covers content or keyboard focus.
- Reflow the effects rail vertically when a horizontal rail would force labels to truncate or nodes to overlap.
- Density may reduce through layout reflow, but no outcome, source, threshold, adapter mode, or recovery consequence may disappear.

## Structural rules and surfaces

### Boundary hierarchy

Define at least three rule roles:

1. **Strong rule**: application regions, selected detail boundary, dialog perimeter, and critical separation.
2. **Standard rule**: section borders, rows, fields, controls, and comparison cells.
3. **Faint rule**: internal alignment, column guidance, metadata separation, and inactive subdivisions.

Every required boundary must remain understandable without a shadow. A boundary may be reinforced by a nearby surface change, but a tonal shift alone should not carry essential containment.

### Surface hierarchy

Define replaceable roles for:

- page canvas;
- primary working surface;
- secondary or inset working surface;
- editable field surface;
- neutral control face;
- selected surface;
- dialog or floating surface;
- disabled surface.

Large background gradients are not part of the product UI. A very shallow gradient may exist inside an encased control face, but it must not spread across a workspace pane, evidence section, or table.

### Shape hierarchy

- Major workspace regions: square or 0–4px radius.
- Section groups and input fields: approximately 4–8px radius.
- Encased primary controls and important compound controls: approximately 10–14px radius.
- Full capsules: compact statuses, filters, modes, and tightly bounded metadata only.

Radius communicates component type. Do not apply one large radius to every container.

## Typography roles

Define the following roles without locking font families:

- **Display/editorial**: the product thesis and batch title only. Use sparingly so the operational workspace remains direct.
- **Interface sans**: navigation, labels, explanations, evidence, controls, and ordinary values. It must remain clear at compact sizes and medium density.
- **Tabular or monospaced utility**: prices, percentages, quantities, identifiers, timestamps, thresholds, adapter modes, and effect states.

Additional rules:

- Use sentence case for actions, navigation, field labels, state explanations, and section headings.
- Reserve uppercase with increased tracking for short legends, machine-like readouts, source classifications, and compact section markers.
- Use tabular numerals wherever values compare vertically or change over time.
- Keep labels close to the values they identify. Do not rely on placeholder text as a label.
- Use weight, size, alignment, and spacing before using colour to create hierarchy.
- The final font selection must provide compatible metrics or be tested for layout changes at narrow widths and 200% zoom.

## Semantic colour architecture

Exact values will be chosen later. Implement components against semantic roles rather than palette names or utility colours.

### Neutral roles

- `canvas`
- `surface-primary`
- `surface-inset`
- `surface-control`
- `surface-selected`
- `text-primary`
- `text-muted`
- `rule-faint`
- `rule-default`
- `rule-strong`
- `edge-inner-highlight`
- `edge-outer-lowlight`
- `action-neutral`
- `focus-ring`

### Semantic roles

- `state-advisory`
- `state-verified`
- `state-caution`
- `state-blocked`
- `state-destructive`
- `state-unavailable`
- `mode-simulated`
- `mode-preview`
- `mode-live-sandbox`

Use neutral graphite treatments for primary actions and selection. Reserve chromatic colour primarily for semantic meaning. A selected row is not automatically safe, and a prominent button is not automatically successful.

Every state combines colour with a label, icon or glyph, and programmatic state. Essential text and control boundaries must continue to meet contrast requirements at the weakest point of any gradient.

## Optical-edge system

### Purpose

Inner and outer gradient borders provide **optical edge definition**, not conventional elevation. They make selected controls feel carefully encased while leaving the surrounding workspace flat.

The effect should resemble a precision-machined or glass-covered control edge:

- an outer lowlight separates the component from its surroundings;
- an inner highlight catches the implied light source;
- an optional shallow face gradient gives the control material consistency;
- no drop shadow, glow, or blurred halo is required.

Use one consistent light direction across the interface. Do not rotate gradients arbitrarily between components.

### Construction

- Maintain a solid base border beneath every gradient treatment. It provides contrast and a fallback when masking is unavailable.
- The outer rim sits approximately 1px outside the component and transitions from a restrained upper edge to a darker or denser lower edge.
- The inner rim sits inside the component boundary and uses a light upper highlight that fades toward a quieter lower edge.
- The optional face gradient is extremely shallow and contained by the component surface. It must never form a glossy hotspot behind text or icons.
- Use pseudo-elements or dedicated presentation elements for rims. They must use `pointer-events: none` and must not change the hit area or accessible name.
- Keep content in a separate foreground layer so edge opacity and face treatments never reduce text clarity.
- Provide a solid-border fallback for unsupported masking, print, and forced-colours modes.

### Treatment levels

#### Level 0: structural edge

A solid border with no optical gradient. Use it for permanent panes, sections, rows, tables, evidence, policy findings, status messages, and disabled controls.

#### Level 1: quiet inner edge

A solid base border plus a faint inner highlight. Use it for secondary buttons, inputs, selects, small icon buttons, and compact segmented controls where the extra definition improves affordance.

#### Level 2: complete encased edge

A base border, outer lowlight, inner highlight, and optional shallow face gradient. Use it selectively for:

- the primary batch action;
- Commit approved changes and confirmation controls;
- the active mode or selected segment in an important compound control;
- the effects-rail enclosure;
- a genuinely floating dialog or toolbar that otherwise cannot use shadow;
- one subtle and one stronger workbench specimen used to choose the final intensity.

Do not apply Level 2 to candidate rows, evidence sections, policy findings, tables, ordinary comparison cells, non-interactive badges, alerts, or disabled controls. Overuse would make every element look raised and equally clickable.

### Interaction states

| State | Required treatment |
| --- | --- |
| Default | Quiet outer lowlight, restrained inner top highlight, stable readable face |
| Hover | Increase edge definition or exchange gradient emphasis slightly; no glow |
| Focus visible | Separate solid 2px focus indicator outside the decorative rim |
| Pressed | Reduce the inner highlight and reverse or flatten the face gradient; optional 1px movement without layout shift |
| Selected | Retain the control face and add a persistent structural marker, not only a brighter gradient |
| Disabled | Remove sheen, flatten the face, retain readable text, and expose the unavailable state |
| Forced colours | Use system border, background, text, and focus colours without masks |

Use 120–180ms colour and opacity transitions. Do not animate a travelling sheen or continuously pulse the rim. Reduced motion must not remove state information.

### Blur and translucency

Opaque surfaces are the default. Backdrop blur may be explored for a rare dialog or floating toolbar when the underlying context remains readable and the fallback remains opaque. It is not a workspace material and must not be applied to panes, evidence, candidate rows, or routine controls.

## Component anatomy

### Application header and batch strip

- Keep both full width and aligned to the workspace frame.
- The header identifies product, batch, mode, and deadline. The outcome strip presents evaluated, ready, attention, and held-or-unverified counts.
- Separate each summary value with alignment and rules rather than independent statistic cards.
- Use the tabular role for counts and time remaining.
- Mode and deadline must be labelled; do not communicate either with colour alone.

### Candidate collection

- Treat the collection as a list or grid, not a stack of cards.
- Each row contains product identity, concise outcome or reason, and any required status marker.
- Selection uses a strong leading rail, a reinforced boundary, and a subtle surface shift.
- Selection colour remains neutral so it cannot be mistaken for ready or verified.
- Keep proposal outcome and future reviewer decision in separate positions and labels.
- Preserve a minimum 44px interactive row target while allowing compact two-line content.
- Keep the shown count and the complete 27-item accounting visible.

### Selected-line identity

- Lead with product name, SKU, category, and the current policy eligibility.
- Use a compact section classification for Blocked, Attention, Ready, Held, Excluded, or Unverifiable.
- Keep identifiers and timestamps in the utility type role.
- A blocked title area must not resemble a destructive action button.

### Current and proposed values

- Present values as aligned ledger cells with an explicit direction from current to proposed.
- Align like values vertically and use tabular numerals.
- Put the field label above or beside the value; do not force the reviewer to infer units.
- Editable values may use a Level 1 edge treatment. Read-only values remain flat.
- Show validation and policy thresholds next to the affected value rather than in a distant alert.

### Agent recommendation and policy result

- Present them as adjacent but independently bounded regions.
- Label the source of each conclusion in full.
- Never combine the agent recommendation and deterministic policy result into a single status.
- Give the policy result enough visual weight to control eligibility without erasing the recorded recommendation.
- Keep reason, evidence, threshold, and next action aligned as ledger rows.

### Readiness matrix

- Show forecast, inventory, supplier, financial, logistics, business-rule, and external-signal checks in a compact matrix.
- Each check exposes outcome, required or advisory obligation, source, observed time, and evidence availability.
- Distinguish Failed, Not checked, Evidence unavailable, and Not applicable by label and glyph as well as colour.
- Expand details in place or in an adjacent region without detaching them from the selected check.

### Evidence and provenance

- Separate source excerpt, agent interpretation, deterministic fact, and policy consequence.
- Use section bands and provenance markers rather than quotation-card styling.
- Keep observed time and source identity visible but subordinate.
- Long narrative evidence may wrap; values and source labels should remain aligned.

### Effects rail

The effects rail is the signature element. It behaves like a signal path, not a generic stepper.

- Connect destinations with one continuous line whose direction reflects the real effect order.
- Each node exposes destination name, adapter mode, lifecycle state, and recovery consequence.
- Planned, applying, applied, failed, compensated, not attempted, simulated, preview-only, and unavailable must remain distinct.
- Use node shape, label, line treatment, and semantic colour together.
- The enclosure may use Level 2 optical edging, but the nodes themselves should remain compact and legible.
- Any progress animation follows real execution state. It does not run on a decorative timer.
- In the static Stage 1B view, make planned state explicit and do not imply that effects executed.
- Reflow vertically on narrow screens while preserving order and labels.

### Buttons and actions

- **Primary**: neutral solid face, Level 2 encased edge, direct action label.
- **Secondary**: opaque surface, solid outline or Level 1 inner edge.
- **Tertiary**: text-led with a clear hover and focus boundary when required.
- **Destructive**: structurally consistent with secondary actions, using the destructive semantic role and an explicit consequence.
- **Disabled**: flat edge, no sheen, readable label, and an accessible explanation when the reason is not otherwise visible.

Do not use a full capsule for ordinary actions. Commit approved changes keeps the same wording through confirmation and result states.

### Status labels and metadata

- Combine a concise label, glyph, solid border, and restrained semantic tint.
- Do not use gradient rims on a non-interactive badge; optical edging would imply clickability.
- Use capsules only when the content is short and self-contained.
- Avoid a loose collection of colourful chips. Group related metadata into an aligned row or section.

### Inputs and selection controls

- Keep a persistent label outside the field.
- Use a clear editable surface, standard border, and optional Level 1 inner edge.
- Use tabular numerals for numeric values and preserve units.
- Focus uses a solid external indicator, never only a gradient change.
- Error text explains the correction and stays associated with the field.
- Tabs share a baseline and use a structural active marker rather than detached pills.

### Dialogs and floating layers

- Use backdrop contrast, a strong perimeter, and optional Level 2 optical edging instead of shadow.
- Keep the background context visible enough to understand what is being confirmed.
- Use an opaque fallback if blur is unsupported or reduces legibility.
- Keep Cancel and the primary action visible together.
- Initial focus, Escape behaviour, focus containment, and focus restoration follow the interaction specification.

### Empty, unavailable, and partial states

- Empty states explain what is absent and what can happen next.
- Unavailable evidence identifies the missing source and its consequence.
- A partial outcome shows completed, failed, and not-attempted effects together.
- Disabled examples must look deliberately unavailable rather than unfinished.
- Success receives no more visual detail than failure, compensation, or manual follow-up.

## Density and spacing

- Use an 8px rhythm with 4px adjustments for compact metadata and value rows.
- Preserve at least 44px for interactive targets even when visual rows appear denser.
- Use alignment and shared padding to make repeated structures scannable.
- Reduce vertical padding before reducing type size.
- Do not use empty space to simulate importance when a label, rule, or alignment can express it more efficiently.
- Keep identifiers, values, and status labels on predictable baselines.

## Accessibility and resilience

- Text contrast must meet at least 4.5:1 in context. Essential control boundaries and focus indicators must meet at least 3:1 against adjacent colours.
- Evaluate gradient edges at their weakest point. A solid base border must preserve the essential boundary when the gradient becomes low contrast.
- State is never communicated by colour, gradient direction, or sheen alone.
- All interactive components expose visible keyboard focus independent of hover.
- Optical-rim presentation layers do not receive focus, pointer events, or accessibility-tree entries.
- At 200% and 400% zoom, content reflows without hidden controls, clipped evidence, or overlapping rail labels.
- Under `prefers-reduced-motion`, replace movement with immediate state changes.
- Under `forced-colors: active`, remove masks and gradients and use system colours and solid borders.
- Test masked gradient borders in Chromium and Safari. Unsupported masking must degrade to a complete, usable solid-border control.

## Workbench requirements

The protected workbench should include representative static specimens, not an open-ended component library:

- primary control with Level 2 subtle edging;
- primary control with the strongest permitted Level 2 edging;
- solid, Level 1, and Level 2 controls shown together;
- default, hover, focus-visible, pressed, and disabled control states;
- light and dark theme versions;
- ready, attention, blocked, held, excluded, and unverifiable candidate rows;
- Passed, Failed, Not checked, Evidence unavailable, and Not applicable readiness checks;
- planned, simulated, preview-only, unavailable, failed, and compensated effect nodes;
- agent recommendation beside a disagreeing policy result;
- a no-shadow dialog with solid and optically edged perimeter variants;
- forced-colours and reduced-motion fallbacks where the workbench supports them.

Choose the final rim intensity only after comparing the subtle and stronger variants in context. The stronger variant is a ceiling, not the default for all controls.

## Visual acceptance checklist

- The interface reads as one operations instrument rather than a collection of cards.
- Permanent structure is understandable with gradients and colour removed.
- The effects rail is the most distinctive element and exposes real propagation meaning.
- Optical rims are concentrated on high-priority interactive elements.
- No `box-shadow` is required to understand containment, selection, focus, or interaction priority.
- No status badge looks interactive merely because of edge treatment.
- Agent and policy conclusions are visually and semantically separate.
- All 27 candidates remain discoverable and the visible summary reconciles with the replay.
- The static view never implies that an effect has executed.
- Light mode establishes the material language; dark mode preserves the same hierarchy without glow.
- Fonts and exact colours can be replaced at the token layer without changing component anatomy.
- The layout remains understandable at 1440×900, 1280×800, 768×1024, and 390×844, and at 200% and 400% zoom.

## Paste-ready Fable prompt

```text
Design and implement Safepoint Stage 1B as a static precision instrument ledger around the accepted promotion-release replay.

Read these sources before editing:
1. docs/STAGE-1B-BRIEF.md
2. docs/FABLE-VISUAL-DIRECTION.md
3. docs/EXPERIENCE-SPEC.md, especially Primary workspace, Visual direction, Readiness and evidence presentation, Keyboard interaction, and Complete view-state inventory
4. docs/STAGE-1A-BRIEF.md
5. lib/promotion-release/index.ts and the return value of loadReviewedReplay()

Preserve the required data boundary and all 27 candidates. Begin with salmon fillets (ALD-0025) selected. Keep source facts, agent recommendation, deterministic policy result, presentation outcome, reviewer decision, and effect execution state distinct.

The visual direction is a shadowless, line-built operations console. Use continuous workspace regions, shared edges, strong alignment, flat evidence and policy sections, tabular data, compact labels, and neutral selection. Treat exact typefaces and colour values as provisional semantic tokens; do not hardcode component styling to a final palette.

Use selective inner-highlight and outer-lowlight gradient borders as optical edge definition. Maintain a solid base border and accessible fallback. Apply the complete double-rim treatment only to high-priority actions, a selected important compound control, the effects-rail enclosure, and a genuinely floating dialog or toolbar. Keep panes, candidate rows, tables, evidence, policy results, alerts, non-interactive badges, and disabled controls flat and solid-bordered. Do not use box shadows, glow, decorative gradients, excessive blur, generic glassmorphism, card proliferation, or literal hardware controls.

Make the effects rail the signature element: a real signal path that exposes destination, adapter mode, lifecycle state, and recovery consequence. In Stage 1B it must clearly remain planned rather than executed.

In the protected workbench, compare a subtle and a stronger permitted double-rim treatment before choosing the production intensity. Include solid-border fallbacks, visible focus, forced-colours handling, reduced-motion handling, and representative light and dark states.

Before changing code, return:
1. the exact component and route structure;
2. the packages you would add and the first implemented component that needs each one;
3. the server/client boundary and the exact data passed across it;
4. the responsive master-detail behaviour;
5. the semantic-token and theme approach, including provisional typography and colour roles;
6. the keyboard and focus model;
7. the representative workbench states, including the two optical-rim intensities;
8. the commands you will run;
9. any requested departure from the briefs.

Do not add later-stage behaviour, new scenario data, model calls, persistence, external writes, or abstractions that Stage 1B does not need.
```
