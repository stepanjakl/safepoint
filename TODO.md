# Safepoint build plan

This is the working implementation checklist. Build one small, usable slice at a time and keep the application easy to read, test, and change.

The detailed requirements remain in [`docs/`](docs/README.md). If this checklist and the specification disagree, resolve the decision in the documentation before writing more code.

## Working rules

- Prefer a complete vertical slice over broad scaffolding.
- Keep business rules in plain TypeScript, separate from React, Next.js, database, model, and connector code.
- Add a dependency only when the current slice needs it.
- Give every batch explicit acceptance criteria and non-goals.
- Keep the replay mode working as live integrations are added.
- Finish, test, review, and commit one batch before starting the next.

## Ordered build

- [ ] **0. Establish the project foundation**
  - Confirm the database choice before installing a driver. The current recommendation is Neon Postgres with Drizzle ORM.
  - Choose and record the Node.js version and package manager.
  - Create the smallest viable Next.js and TypeScript application.
  - Add formatting, linting, type-checking, unit-test, and environment-example commands.
  - Keep model, database, and Google credentials out of this stage.
  - **Gate:** a clean checkout installs, starts, checks, and tests with documented commands.

- [ ] **1. Build the static review interface**
  - Render the fixed 27-line scenario from one versioned replay fixture.
  - Build the summary, candidate list, detail view, evidence and policy sections, and effects rail.
  - Include ready, adjusted, held, excluded, unverifiable, loading, empty, error, and conflict examples in a protected workbench.
  - Establish semantic design tokens, light and dark themes, responsive layout, visible focus, and semantic components.
  - **Gate:** the complete scenario is understandable on desktop and mobile without an API or database.

- [ ] **2. Add the local review workflow**
  - Add approve, hold, reject, permitted edit, filter, omission review, and commit-confirmation interactions.
  - Add standard keyboard behaviour first; make `J` and `K` optional, documented shortcuts that are disabled in editable fields.
  - Show policy disagreement and explain why approval may still be blocked.
  - Keep state local and resettable.
  - **Gate:** a keyboard-only user can review all 27 lines and prepare a safe subset for commitment.

- [ ] **3. Extract and test the domain core**
  - Define the proposal, evidence, review decision, effect, execution, and audit types.
  - Validate complete candidate accounting and reject unsupported model output.
  - Implement deterministic calculations, policy checks, gate obligations, effect planning, state transitions, and canonical value comparison.
  - Keep this layer free of React, Next.js, database, and provider imports.
  - **Gate:** unit tests cover valid plans, unsafe proposals, omissions, stale evidence, edits, and illegal transitions.

- [ ] **4. Add persistence**
  - Define Drizzle schemas and migrations for sessions, proposal batches, candidates, evidence, review events, effects, attempts, and execution jobs.
  - Add a simple seed and reset path for local development.
  - Confirm that data can be inspected through Drizzle Studio and the selected hosted database interface.
  - **Gate:** a review survives reload and its history can be inspected without reading raw database files.

- [ ] **5. Build deterministic execution with fake adapters**
  - Implement durable jobs, leases, idempotency, ordering, retries, verification, and crash reconciliation.
  - Start with an in-memory or fixture-backed Google Sheets adapter.
  - Demonstrate success, preflight conflict, partial failure, safe compensation, and intervention-required outcomes.
  - **Gate:** execution can resume safely after an interrupted worker without duplicating an effect.

- [ ] **6. Connect the isolated Google Sheets sandbox**
  - Give each session an isolated sheet or controlled range.
  - Resolve rows by stable product identifier rather than a remembered cell address.
  - Preflight expected values, write approved changes, immediately verify them, and support controlled external-edit injection.
  - Expose only a read-only viewer link to visitors.
  - **Gate:** the real sheet path demonstrates verified success, conflict detection, and compensation without exposing credentials.

- [ ] **7. Add live proposal generation**
  - Give the model exactly four read-only tools: catalogue and pricebook, sales, stock, and promotion-rule lookup.
  - Require structured output and validate it before policy evaluation.
  - Keep arithmetic, mandatory rules, approval, execution, and recovery outside the model.
  - Evaluate correct proposals, unsafe proposals, omissions, stale data, ambiguous evidence, and tool failures.
  - Fall back automatically to the labelled replay when live generation is unavailable.
  - **Gate:** bounded model variation changes recommendations or explanations without changing source facts or bypassing safety rules.

- [ ] **8. Harden and publish the portfolio application**
  - Add the thin storefront sandbox as the second real, verified effect target.
  - Complete WCAG 2.2 AA checks: automated, keyboard-only, zoom, reduced motion, and manual screen-reader testing.
  - Add session expiry, limits, timeouts, redacted logs, hashed retained network identifiers, dependency fallbacks, and a global kill switch.
  - Deploy the public sandbox and write the case study. No video is required.
  - **Gate:** the release checklist in [`docs/DELIVERY-PLAN.md`](docs/DELIVERY-PLAN.md) passes in the deployed environment.

## Later product work

- [ ] Rehearse a proposed plan before execution.
- [ ] Compare alternative plans and explain trade-offs.
- [ ] Add richer connector capabilities and organisation-level policy.
- [ ] Add collaborative review and enterprise identity.
- [ ] Explore an optional Duvo runtime adapter after the provider-independent workflow is proven.

## Fable and Codex collaboration

Use the models as proposer and reviewer, not as two simultaneous implementers of the same files.

1. Give Fable only the next unchecked stage or a smaller batch within it. Ask for scope, proposed file tree, dependencies, data flow, acceptance criteria, and explicit non-goals before code.
2. Ask Codex to compare that proposal with the canonical documents and critique unnecessary abstractions, hidden coupling, accessibility gaps, unsafe agent authority, and work that belongs to a later stage.
3. Resolve material disagreements before implementation. Record any architectural change in the relevant document.
4. Let one model implement the agreed batch. Do not ask it to scaffold later stages “for completeness”.
5. Let the other model review the actual diff and test results. Separate blocking correctness issues from optional improvements.
6. Return fixes to the implementer, rerun the checks, and commit the working slice.
7. Swap proposer, implementer, and reviewer roles when useful, but keep one owner per batch.

Do not hand large uncommitted rewrites back and forth. A model hand-off should contain the current batch brief, relevant documentation links, changed files, test output, known limitations, and the exact review question.

### Batch brief template

```text
Stage and batch:
User outcome:
In scope:
Out of scope:
Relevant documents:
Acceptance criteria:
Files expected to change:
Commands that must pass:
Known decisions or constraints:
Question for this model:
```
