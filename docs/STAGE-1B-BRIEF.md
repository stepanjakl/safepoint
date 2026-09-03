# Safepoint Stage 1B brief

Status: ready for Fable proposal

Audience: the model designing and implementing the first static review interface

## Outcome

Build a polished, understandable static review workspace around the accepted Stage 1A replay. The interface should make the product thesis clear before local review actions, a real policy engine, persistence, or external execution exist.

Spend design effort on hierarchy, comparison, evidence legibility, the effects rail, responsive behaviour, and both themes. Do not redesign the scenario or architecture.

## Read first

1. [`EXPERIENCE-SPEC.md`](EXPERIENCE-SPEC.md), especially Primary workspace, Visual direction, Readiness and evidence presentation, Keyboard interaction, and Complete view-state inventory.
2. [`FABLE-VISUAL-DIRECTION.md`](FABLE-VISUAL-DIRECTION.md), the authoritative visual handoff, component anatomy, optical-edge rules, workbench states, and paste-ready proposal prompt.
3. [`STAGE-1A-BRIEF.md`](STAGE-1A-BRIEF.md).
4. `lib/promotion-release/index.ts` and the return value of `loadReviewedReplay()`.
5. [`PRODUCT-BRIEF.md`](PRODUCT-BRIEF.md), only Demonstration scenario and Product principles.
6. [`TODO.md`](../TODO.md), Stage 1B and Fable and Codex collaboration.

## In scope

- Replace the small landing page with the static review destination.
- Add React Aria Components when an implemented collection, disclosure, tabs, or other primitive needs it.
- Add semantic design tokens and complete light and dark themes.
- Build the desktop master-detail workspace and mobile list-to-detail composition.
- Render the batch summary, candidate collection, selected-line detail, agent recommendation, separate policy result, gate matrix, evidence excerpts, proposed values, and effects rail.
- Represent live-sandbox, simulated, preview-only, and unavailable destinations honestly.
- Add a protected workbench for representative static states needed during design.
- Establish native and React Aria keyboard behaviour, visible focus, reduced-motion foundations, and semantic landmarks.

## Required data boundary

- Import only `loadReviewedReplay()` and exported types from `lib/promotion-release`.
- Load data in a server component and pass the smallest serialisable values required by client components.
- Derive labels and counts from the returned review lines and summary.
- Do not import raw files from `fixtures/`.
- Never import `tests/fixtures/promotion-release/evaluation-oracle.json`.
- Do not move agent recommendation, policy eligibility, evidence, or outcome into one status field.
- Treat `outcome` as a presentation classification, not a review decision or execution state.

## Required first view

The initial selection should be salmon fillets (`ALD-0025`) because it demonstrates the central disagreement:

- source fact: £5.00 proposed price and £4.54 cost;
- agent recommendation: release, assuming funding will be confirmed;
- policy replay: blocked because unconfirmed funding leaves 9.2% margin against a 15% floor;
- reviewer consequence: approval unavailable until the blocking condition changes.

The collection must also make the strawberries hold, baby-spinach unverifiable state, withdrawn pizza, and six attention lines easy to find.

## Out of scope

- Local approve, hold, reject, edit, filter, commit, reverse, or shortcut behaviour beyond static disabled examples.
- A calculated policy engine or changes to the policy replay.
- Model prompts, AI SDK, tools, APIs, databases, workflows, sessions, adapters, or external writes.
- A general component library, process registry, connector registry, state manager, animation package, or chart package.
- Changes to fixture values, contracts, or canonical product decisions without raising a blocking issue first.
- Screenshot review in this batch unless the user later asks for it.

## Acceptance gate

- The full 27-line scenario is understandable at desktop and narrow widths.
- The visible summary reconciles with the loader's `17 / 6 / 2 / 1 / 1` outcome distribution.
- Agent and policy conclusions are visually and semantically separate.
- The interface does not imply that static effects have executed.
- Light and dark themes use semantic tokens rather than duplicated component colours.
- Exact fonts and colour values remain provisional and replaceable at the token layer.
- Permanent structure is understandable without shadows or gradient decoration.
- Optical gradient borders remain concentrated on the high-priority controls and effects-rail treatments permitted by the visual handoff, with solid-border and forced-colours fallbacks.
- Tab order follows reading order, focus is visible, and no static control falsely appears interactive.
- Build, lint, type-check, formatting, unit tests, and representative component checks pass.
- No API, model, database, credential, or later-stage abstraction appears in the diff.

## Fable proposal prompt

Use the paste-ready prompt in [`FABLE-VISUAL-DIRECTION.md`](FABLE-VISUAL-DIRECTION.md). Before editing code, return:

1. the exact component and route structure;
2. the packages you would add and the first implemented component that needs each one;
3. the server/client boundary and the exact data passed across it;
4. the responsive master-detail behaviour;
5. the semantic-token and theme approach, including provisional typography and colour roles;
6. the keyboard and focus model;
7. the representative workbench states, including the subtle and strongest-permitted optical-rim variants and their fallbacks;
8. the commands you will run;
9. any requested departure from this brief.

The review question is: does this proposal create a distinctive, credible operations workspace from the accepted replay while keeping component structure, dependencies, and client state as small as possible?
