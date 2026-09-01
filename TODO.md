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
  - Follow the exact hand-off in [`docs/STAGE-0-BRIEF.md`](docs/STAGE-0-BRIEF.md).
  - Use Node.js 24 LTS, an exact pnpm 10 patch, Next.js App Router, React, strict TypeScript, and Tailwind CSS.
  - Record Neon Postgres with Drizzle ORM as the persistence choice and Vercel as the deployment target.
  - Check current stable package compatibility before installing anything; do not copy release-candidate tags from examples accidentally.
  - Keep the installed `neon`, `neon-postgres`, and `workflow` skills aligned with their current official documentation. The obsolete Turso skills have been removed.
  - Create the smallest viable Next.js and TypeScript application.
  - Add formatting, linting, type-checking, unit-test, and environment-example commands. Do not add a dependency that no Stage 0 file uses.
  - Keep model, database, workflow, connector, and Google code or credentials out of this stage.
  - **Gate:** a clean checkout installs, starts, checks, and tests with documented commands.

- [ ] **1. Build the validated replay and static review interface**
  - Add Zod, React Aria Components, Playwright, and axe when they are first used in this stage. Tailwind's native `data-*` variants are sufficient unless a concrete component proves that a helper package adds value.
  - Define the first `PromotionReleasePlan` schema and validate one versioned 27-line replay fixture before rendering it.
  - Build the summary, candidate list, detail view, evidence and policy sections, and effects rail.
  - Include ready, adjusted, held, excluded, unverifiable, loading, empty, error, and conflict examples in a protected workbench.
  - Establish semantic design tokens, light and dark themes, responsive layout, visible focus, and semantic components.
  - Derive every count from the validated fixture; do not repeat the expected totals as component constants.
  - **Gate:** the scenario is understandable on desktop and mobile without an API or database, the fixture parses in a unit test, keyboard navigation works, and Playwright plus axe report no serious or critical accessibility findings on representative states.

- [ ] **2. Add the local review workflow**
  - Add approve, hold, reject, permitted edit, filter, omission review, and commit-confirmation interactions.
  - Add standard keyboard behaviour first; make `J` and `K` optional, documented shortcuts that are disabled in editable fields.
  - Show policy disagreement and explain why approval may still be blocked.
  - Keep state local and resettable.
  - **Gate:** a keyboard-only user can review all 27 lines and prepare a safe subset for commitment.

- [ ] **3. Extract and test the domain core**
  - Define the proposal, evidence, review decision, effect, execution, and audit types.
  - Implement only `set_field`, `append_entry`, `invoke_command`, `transition_state`, and `send_message`. The first three are executable sandbox effects; the latter two are clearly simulated when used.
  - Keep the promotion process as one directly imported typed module. Do not add string-ID registries, a generic process configuration language, or a connector router for the one implemented process.
  - Validate complete candidate accounting and reject unsupported model output.
  - Implement deterministic calculations, policy checks, gate obligations, effect planning, state transitions, and canonical value comparison.
  - Keep this layer free of React, Next.js, database, and provider imports.
  - **Gate:** unit tests cover valid plans, unsafe proposals, omissions, stale evidence, edits, and illegal transitions.

- [ ] **4. Prove bounded live generation against the domain contract**
  - Create a development-only feasibility harness around the fixed instruction, four read-only tools, and production Zod schema.
  - Select the current stable AI SDK major and an available model through AI Gateway from version-matched documentation; record both as implementation decisions.
  - Enforce tool-step, output-size, duration, and cost ceilings.
  - Run a small representative suite containing a valid plan, an unsafe recommendation, an omission, ambiguous evidence, and a tool failure.
  - Keep replay as the default application path. Do not add a public generation endpoint, persistence, or a long-lived human-review workflow in this stage.
  - **Gate:** the feasibility report proves that model output can pass the real schema, makes failures visible, and does not select a replay because it was the most flattering run.

- [ ] **5. Add persistence and durable proposal generation**
  - Provision a Neon development database with separate preview and production configuration reserved for later stages.
  - Define Drizzle Postgres schemas and migrations for sessions, agent and workflow runs, proposal batches, candidates, evidence, review events, effects, attempts, and audit events.
  - Before creating the Neon project, choose and record a supported Vercel and Neon region pair and measure the deployed path; do not assume Workflow is pinned to `iad1`.
  - Compare `node-postgres` with Vercel Fluid compute against Neon's HTTP driver for the implemented access pattern. Use WebSockets only if an interactive transaction is actually required, and use the direct connection for migrations.
  - Add a simple seed and reset path for local development.
  - Confirm that data can be inspected through local Drizzle Studio and Neon's hosted Tables interface.
  - Run live proposal generation as a separate Vercel Workflow that stores a validated proposal and ends before human review.
  - Treat every `start()` call as a new run. Use a unique application operation and atomic first-step claim so duplicate starts cannot create two accepted batches or hide duplicate model cost.
  - **Gate:** a review survives reload, its history is inspectable, and redeploying during generation cannot lose completed steps or grant the model write authority.

- [ ] **6. Build deterministic execution with fake adapters**
  - Add Vercel Workflow SDK and implement separate commit and compensation workflows.
  - Keep orchestration in workflow functions and network or database side effects in workflow steps.
  - Use a unique Neon operation record and an atomic first-step claim so duplicate workflow starts cannot both execute effects.
  - Implement effect idempotency, ordering, retry classification, verification, and uncertain-write reconciliation in Safepoint's own domain and connector layers.
  - Start with an in-memory or fixture-backed Google Sheets adapter.
  - Demonstrate success, preflight conflict, partial failure, safe compensation, and intervention-required outcomes.
  - Correlate Vercel workflow runs and steps with the persistent effects ledger; do not treat the workflow event history as the business audit record.
  - **Gate:** execution can resume safely after an interrupted workflow step without blindly duplicating an uncertain external effect.

- [ ] **7. Connect the isolated Google Sheets sandbox**
  - Give each session an isolated sheet or controlled range.
  - Resolve rows by stable product identifier rather than a remembered cell address.
  - Preflight expected values, write approved changes, immediately verify them, and support controlled external-edit injection.
  - Expose only a read-only viewer link to visitors.
  - **Gate:** the real sheet path demonstrates verified success, conflict detection, and compensation without exposing credentials.

- [ ] **8. Harden and publish the portfolio application**
  - Add the thin storefront sandbox as the second real, verified effect target.
  - Complete WCAG 2.2 AA checks: automated, keyboard-only, zoom, reduced motion, and manual screen-reader testing.
  - Add session expiry, limits, timeouts, redacted logs, hashed retained network identifiers, dependency fallbacks, and a global kill switch.
  - Inspect proposal, commit, compensation, and cleanup runs in Vercel's workflow dashboard while keeping the Neon ledger as the user-facing source of truth.
  - Deploy the public sandbox and write the case study. No video is required.
  - Confirm bounded live generation falls back automatically to the labelled replay when a model or dependency is unavailable.
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
