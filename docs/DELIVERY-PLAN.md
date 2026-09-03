# Safepoint delivery plan

Status: canonical implementation sequence

Audience: the engineer or agent implementing the portfolio application

## Delivery approach

There is no calendar deadline. Progress is controlled by acceptance gates: a milestone is complete only when its behaviour, tests, and documentation meet the listed conditions.

The application and written case study are the portfolio deliverables. A video is not required. Rehearsal, multi-agent simulation, arbitrary connectors, and enterprise controls belong to the future-product track.

## Scope fence and stop rule

The milestones preserve the full release path, but they are not permission to build every refinement before the central demonstration works.

### Core proof — finish first

- one complete 27-line review workspace with proposal and review counts clearly distinguished;
- deterministic replay and bounded live proposal generation through four read-only tools;
- at least one meaningful judgement based on ambiguous narrative evidence;
- independent policy with a visible agent-policy disagreement;
- approve, hold, reject, and allow-listed edit behaviour;
- one Google Sheets adapter with stable-key lookup, preflight, apply, verification, controlled conflict, and compensation;
- a durable execution workflow, crash reconciliation, and effects ledger;
- keyboard operation, both themes, representative responsive checks, and automated accessibility checks.

### Public-release completion

- the thin application-owned storefront as the second genuine target;
- session isolation, cost controls, cleanup, both kill controls, and replay fallback;
- the complete documented zoom, screen-reader, reduced-motion, and responsive checks;
- deployment monitoring and the written case study.

### Stretch after the complete flow

- SSE resumability beyond baseline polling;
- exhaustive visual-regression coverage of every state and theme;
- extra simulated destinations beyond those needed to explain reversibility;
- deeper operational polish that does not change the core decision.

Do not start stretch work while a core-proof item is incomplete. If implementation pressure appears, reduce presentation breadth before weakening complete accounting, deterministic policy, verification, crash recovery, or accessibility.

## Engineering rules for every milestone

- Keep model access read-only and external writes deterministic.
- Implement the replay path before depending on a live provider.
- Represent money as integer pence and time as ISO 8601 UTC.
- Preserve all 27 promotion-line assessments through generation, review, and audit.
- Keep source truth, model recommendations, deterministic policy, and test-oracle expectations as separate artefacts.
- Give the model bounded ambiguous evidence to interpret; keep reproducible arithmetic and gate obligations in deterministic code.
- Label every destination as live sandbox, simulated, preview-only, or unavailable.
- Classify every readiness gate as required, advisory, or not applicable; never treat missing required evidence as a confidence-only warning.
- Make state transitions explicit and test invalid transitions.
- Keep route handlers thin; place policy and orchestration in application services.
- Keep connector-specific details behind typed adapters.
- Add user-visible loading, empty, failure, conflict, and recovery states with the happy path.
- Treat accessibility as acceptance work, not a final audit.
- Review generated migrations and commit them. Do not use schema push for deployed environments.
- Record architecture changes that contradict these canonical documents in a decision record before implementing them.

## Milestone 0: project foundation

### Build

- Follow [`STAGE-0-BRIEF.md`](STAGE-0-BRIEF.md).
- Pin Node.js 24 LTS and an exact pnpm 10 patch. Record both `engines.node` and `packageManager` in `package.json`.
- Scaffold the smallest Next.js App Router application with strict TypeScript, React, Tailwind CSS, linting, formatting, type-checking, and Vitest.
- Add a secret-free environment example and concise local commands.
- Add no model, database, Workflow, Google, connector, process registry, or speculative later-stage code.

### Acceptance gate

- A clean checkout can install, start, build, lint, type-check, format-check, and test with documented pnpm commands.
- Installed versions are current stable releases with no accidental beta or release-candidate tags.
- The initial page is useful but deliberately small; it does not pretend that the review experience already exists.
- No unused dependency or empty architectural directory has been added “for later”.

## Milestone 1: validated replay and static experience

### Stage 1A: scenario data and contracts

- Add Zod and define the runtime schema and inferred type for the first `PromotionReleasePlan`.
- Keep source facts outside the model proposal and join them only in the validated review projection.
- Build the versioned 27-line Fresh Food Weekend evidence pack, including shortlist provenance, brief, catalogue, demand, supply, supplier, bounded operational notes, channel, and policy sources.
- Record earlier bulk orders and frame every new quantity as a final top-up or amendment.
- Encode 17 ready, six attention, two held, one excluded, and one unverifiable line.
- Keep the agent proposal, replayed policy output, and test-only evaluation oracle as separate artefacts.
- Validate complete accounting, evidence references, timestamps, seeded arithmetic, and malformed-input rejection in Vitest.

Stage 1A is accepted when [`STAGE-1A-BRIEF.md`](STAGE-1A-BRIEF.md) and its repository checks pass. It adds no interface, model, database, policy engine, or external credential.

### Stage 1B: static review interface

- Follow [`STAGE-1B-BRIEF.md`](STAGE-1B-BRIEF.md).
- Add React Aria Components when the implemented collection or disclosure behaviour first requires them.
- Build the desktop master-detail workspace, mobile list-to-detail composition, effects rail, and protected state workbench.
- Create semantic light and dark tokens and representative normal, blocked, omission, conflict, completion, and fallback views.
- Consume only the validated replay loader; do not import raw fixtures or the test oracle.

Stage 1B is accepted when the complete scenario is understandable at desktop and narrow widths, both themes are coherent, agent and policy results remain separate, and the structure supports the documented keyboard model.

### Stage 1C: static integration and accessibility verification

- Add Playwright and axe-core when the first representative checks are implemented.
- Verify that counts reconcile across the summary, list, detail, and omission views without component constants.
- Test representative keyboard paths, focus visibility, 320 CSS pixels, 200% zoom, and both themes. The complete 400% and screen-reader passes remain public-release gates.
- Confirm no static destination or policy replay is presented as a live execution result.

Stage 1C is accepted when representative Playwright and axe checks have no serious or critical accessibility findings and the complete repository gate passes without a model, database, or external credential.

## Milestone 2: local review workflow

### Build

- Add approve, hold, reject, permitted edit, filter, omission-review, and commit-confirmation interactions in resettable local state.
- Use standard collection and dialog keyboard behaviour before supplemental `J` and `K` shortcuts.
- Disable custom shortcuts in editable controls and document them in visible shortcut help.
- Show how an edit resets approval and how a policy disagreement can block commitment.
- Complete the local loading, empty, error, stale, and conflict behaviour needed to understand the review flow.

### Acceptance gate

- A keyboard-only user can account for all 27 lines and prepare only an eligible subset for commitment.
- Editing a permitted value visibly returns the line to pending review.
- Commit confirmation reconciles included, held, rejected, omitted, and blocked lines.
- Reloading deliberately resets this milestone's state; persistence is not implied.

## Milestone 3: deterministic domain core

### Build

- Define proposal, evidence, review-decision, batch-phase, effect-execution, edit, and audit types in plain TypeScript.
- Keep the promotion process as one directly imported typed module. Do not build a string-ID registry, runtime process language, renderer registry, or generic connector router for one process.
- Implement only five effect kinds: executable `set_field`, `append_entry`, and `invoke_command`, plus clearly simulated `transition_state` and `send_message`.
- Implement complete candidate accounting, deterministic calculations, gate-obligation derivation, policy checks, effect planning, canonical value normalisation, state transitions, and release-deadline expiry.
- Replace the static policy replay as the runtime source of policy results and retain it as a regression expectation.
- Reuse the same policy functions after generation, after edits, and at commit preflight.
- Keep the domain layer free of React, Next.js, database, model-provider, and connector imports.

### Acceptance gate

- Unit tests cover valid plans, unsafe proposals, omissions, stale evidence, edits, deadline expiry, and every illegal transition.
- Missing, duplicate, invented, or malformed candidates reject the whole proposal rather than being silently repaired.
- Required unavailable evidence blocks its line; advisory evidence does not silently become mandatory.
- Fixture arithmetic and the test oracle are recomputed in tests rather than restated as constants.

## Milestone 4: live-generation feasibility

### Build

- Implement the four read-only tools against the controlled evidence pack in a development-only harness.
- Write and version a project-owned instruction. Ground its gate vocabulary in Duvo's public Auto-ordering documentation without copying the captured third-party skill file.
- Select the installed stable AI SDK major and an available AI Gateway model from version-matched documentation; record the configured and actual provider/model.
- Generate schema-bound output through the current `generateText` or `streamText` structured-output API.
- Enforce tool-step, output-size, duration, and cost ceilings.
- Run a small fixed suite covering a valid plan, an unsafe recommendation, an omission, ambiguous evidence, malformed output, and a tool failure.
- Keep replay as the application default. Do not add a public generation route, database, or durable workflow in this milestone.

### Acceptance gate

- The model has exactly four read-only tools and no connector credential or write path.
- A real result passes the same schema and policy used by replay; invalid output is wholly rejected.
- Evaluation records model misses even when deterministic policy catches them.
- The designated replay remains a reviewed fixture, not the most flattering captured model run.
- The feasibility result is sufficient to shape the persisted agent contract without coupling the UI to a provider.

## Milestone 5: persistence and durable proposal generation

### Build

- Before creating the Neon project, inspect current Workflow and Vercel region support, select an available Vercel and Neon pair, and measure the deployed database path. Do not assume Workflow is pinned to `iad1`.
- Provision Neon with separate development, preview, and production configuration and define reviewed Drizzle migrations.
- Choose the connection path from the implemented runtime: start by evaluating `node-postgres` with Vercel Fluid compute, compare Neon's HTTP driver where fixed non-interactive transactions suffice, and use WebSockets only for a demonstrated interactive-transaction need. Use a direct connection for migrations.
- Add sandbox sessions, agent and workflow runs, tool evidence, proposal batches, all candidate assessments, review events, effects, attempts, audit events, and rate-limit records.
- Make review mutations server-authoritative with expected revisions; append each review event and update its projection in one short Postgres transaction.
- Wrap live proposal generation in a Vercel Workflow that stores the validated result and ends before human review.
- Treat every Workflow `start()` call as creating a run. Use a unique application operation and atomic first-step claim so duplicate starts cannot create two accepted batches or conceal duplicate model cost.
- Keep replay and live results on the same validation, policy, projection, and rendering path.

### Acceptance gate

- Database constraints prevent duplicate candidate records, operation keys, and effect idempotency keys.
- Exactly 27 assessments persist for every accepted proposal.
- A review survives reload and concurrent stale edits return the current projection rather than overwriting it.
- No model or external network call occurs inside a database transaction.
- Generated migration SQL is reviewed; a clean database migrates from zero; local Drizzle Studio and Neon's hosted interface can inspect the same development data.
- Refreshing or redeploying during generation does not lose completed steps or grant the workflow write authority.

## Milestone 6: durable execution with fake adapters

### Build

- Persist an immutable approved effect or compensation plan and uniquely keyed operation before starting a Vercel Workflow.
- Implement separate commit and compensation workflows. Keep workflow functions focused on orchestration and put database or external side effects in retryable steps.
- Atomically claim the operation in the first step. A duplicate run that loses the claim exits before any effect.
- Implement effect idempotency, dependency ordering, retry classification, verification, uncertain-write reconciliation, deadline stops, and the executor circuit breaker.
- Start with fixture-backed adapters and demonstrate success, preflight conflict, partial failure, compensation, and intervention-required outcomes.
- Use the Neon projection and polling as the user-facing progress source. Treat the Workflow dashboard as operational evidence, not the business ledger.
- Build the effects ledger and intervention views. Add persisted Server-sent Events (SSE) only after polling and durable recovery work.

### Acceptance gate

- Duplicate requests or duplicate workflow runs cannot pass the same operation claim and execute an effect twice.
- Closing the browser or ending the initiating request does not abandon execution.
- An interrupted step in `applying` re-reads and classifies external state before any retry.
- A partial result distinguishes applied, failed, conflicted, compensated, and not-attempted effects.
- Compensation never overwrites unrecognised later work, and the original effect history remains.
- Simulated effects say Applied in simulation; preview-only effects never become applied.

## Milestone 7: isolated Google Sheets sandbox

### Build

- Create the controlled template spreadsheet and server-owned range map.
- Resolve rows from stable SKU and scenario-line keys rather than persisted row numbers.
- Compare on-demand copies, a bounded pre-created pool, and protected per-session ranges. Select only an option that proves quota headroom, cleanup, and cross-session isolation; replay creates no Sheet.
- Implement promotion-record, top-up-recommendation, and label-queue operations with preflight, apply, verify, and compensate behaviour.
- Add the read-only application-rendered Sheet view, one-use controlled conflict injection, 24-hour expiry, and scheduled cleanup.

### Acceptance gate

- A public request cannot choose a spreadsheet, range, or arbitrary value outside the validated proposal.
- Browser code and logs contain no Google or Neon credential.
- A preflight mismatch leaves the external value unchanged; successful apply is reported only after verification.
- One session cannot read or change another session's data.
- Conflict injection is idempotent and cleanup failures are observable.
- Tests distinguish one-request, one-spreadsheet atomicity from the non-atomic multi-target workflow.

## Milestone 8: storefront, hardening, public release, and case study

### Build

- Add the thin session-isolated storefront API, read-only customer view, verification read, and compensation path as the second genuine target.
- Execute reversible targets first and keep the simulated, non-recallable notification last.
- Apply session-cookie, origin, cross-site request-forgery, content-security, rate-limit, redaction, and correlation controls.
- Add per-session, per-IP, global model-cost, tool-step, output-size, and timeout ceilings plus separate generation and executor kill controls.
- Complete the model and executor failure matrices, evaluation suite, and full visual-state regression set.
- Deploy separate preview and production configuration, monitoring, cost alerts, cleanup, and a manual kill-switch procedure.
- Add an About this demo page and write the case study. No video is required.

### Acceptance gate

- A first-time visitor can complete replay without an account; bounded live mode can be disabled without a deployment and falls back honestly.
- An approved storefront effect changes the separate customer view and reports success only after verification.
- Complete review, commit, conflict, and reverse flows pass keyboard-only testing.
- VoiceOver with Safari and NVDA with Chrome can understand the collection, dialogs, statuses, and effects log.
- The complete flow remains usable at 400% zoom, with reduced motion and at narrow viewports.
- Security tests reject changed session IDs, foreign batches, invalid origins, unknown fields, oversized bodies, and repeated idempotency keys.
- Raw cookies, credentials, IP addresses, secrets, and complete provider responses are absent from logs.
- Production exposes no unprotected workbench; expired resources are cleaned up; cleanup failures are observable.
- The case study states synthetic research, storefront-verification, connector, and fixed-scenario limitations accurately.
- All canonical documentation matches the deployed behaviour.

## Test strategy

### Unit tests

- proposal schema and complete candidate accounting;
- evidence-fixture arithmetic and test-oracle consistency;
- seven readiness-gate result mapping;
- required, advisory, and not-applicable gate invariants;
- money, date, and evidence validation;
- every policy rule and severity;
- batch, review, and effect transition tables;
- edit-driven approval reset;
- idempotency-key generation and reuse;
- retry classification;
- release-deadline expiry and executor circuit-breaker transitions;
- line-conditional gate-obligation derivation;
- interrupted-step external-state reconciliation decisions;
- derived batch summaries;
- log redaction and session hashing.

### Integration tests

- agent tool boundary with recorded provider-independent fixtures;
- live-agent recommendation versus independent policy finding;
- Drizzle repository queries and migrations against an isolated database;
- review event and projection transaction;
- each connector contract with fake and sandbox implementations;
- storefront apply, independent read verification, and customer-view projection;
- preflight, apply, verify, and compensate sequences;
- workflow start, replay, retry classification, step correlation, and interrupted-step reconciliation;
- typed effect rendering and connector capability combinations;
- Sheets request failure and collaborative-change simulation;
- stable-key Sheet lookup after row insertion or sorting;
- projection polling after progress-connection loss and, when implemented, SSE resume with `Last-Event-ID`;
- session expiry and cleanup;
- live-to-replay fallback.

### Browser tests

- complete replay review and commit;
- live variation rendered through the same layout;
- agent-policy disagreement and blocked approval;
- high-risk individual approval;
- edit, re-evaluate, and re-approve;
- exclusions review;
- conflict injection and resolution;
- partial failure and intervention;
- compensation success and failure;
- verified changes in both Sheet and storefront views;
- accurate live-sandbox, simulated, preview-only, and unavailable labels;
- keyboard-only operation;
- focus restoration and responsive navigation;
- status and error DOM behaviour;
- theme, zoom, reduced motion, and narrow viewport.

### Manual checks

- screen-reader behaviour with supported browser combinations;
- understandable terminology for a junior engineer and a non-developer operator;
- colour and focus contrast in all themes;
- real public deployment quotas and latency;
- Google Sheets sharing and isolation;
- case-study accuracy against the running application.

## Release and operational checklist

- Confirm the live model identifier still exists and the installed AI SDK documentation matches the code.
- Confirm AI Gateway routing, fallback, budget, and actual-provider recording match the release configuration.
- Confirm Neon, the selected Postgres driver, Vercel Fluid compute when used, and Drizzle remain compatible before upgrading any of them.
- Confirm the deployed Workflow SDK version matches the implementation guidance and inspect a complete proposal, commit, and compensation run in the Vercel dashboard.
- Re-check Workflow plan limits and operational-history retention rather than relying on an assumed duration; keep the Neon ledger authoritative.
- Confirm the recorded Vercel and Neon region pair still matches the deployed application and measured latency.
- Review and apply migrations in preview before production.
- Confirm only environment-variable names, never values, appear in diagnostic output.
- Exercise the kill switch and deterministic replay in production.
- Confirm global and per-session ceilings are configured.
- Confirm cleanup has removed a deliberately expired test session.
- Confirm no real notification integration is configured.
- Export an evaluation report and retain unsuccessful cases.
- Verify all primary-source links in the case study.

## Skill routing during implementation

Use the repository's installed skills at the point their rules apply:

| Work | Skills |
| --- | --- |
| React and TypeScript components | `typescript-best-practices`, `vercel-react-best-practices` |
| Visual system and layouts | `frontend-design` |
| Buttons, collections, dialogs, navigation, and shortcuts | `keyboard` |
| Progress, filters, errors, effects log, and dynamic status | `aria-live-regions` |
| UI review before each public milestone | `web-design-guidelines` |
| Agent tools, structured output, and provider integration | `ai-sdk` |
| General schema, queries, transactions, and migrations | `drizzle-orm-patterns` |
| Neon setup, connections, pooling, and platform behaviour | `neon`, `neon-postgres` |
| Durable proposal, commit, and compensation orchestration | `workflow` |

The official Neon and Vercel Workflow skills are installed, and the obsolete Turso skills have been removed. The `workflow` skill requires guidance matched to the installed SDK version; the Neon skills require current official documentation to be checked because platform capabilities change. Skills guide implementation but do not override this specification or the installed packages' documentation.

The optional `documentation-and-adrs` and `writing-for-agents` skills remain recommendations only.

## Future-product track

Do not begin this work until the public portfolio release meets its acceptance gate.

1. Extract the directly imported grocery process module into a reusable versioned format without weakening compile-time validation.
2. Expand the closed effect union and renderer set beyond the five portfolio effect kinds only when a second process needs them.
3. Define a broader connector capability manifest and an allow-listed operation registry only when direct adapter selection becomes insufficient.
4. Onboard a second process using the same review shell and measure where new effect or value renderers are genuinely required.
5. Rehearse a proposal against a simulation and show predicted side effects.
6. Generate and compare alternative plans under the same policy.
7. Support connector-specific permission and compensation capabilities.
8. Add organisation-level policy configuration and separation of duties.
9. Add authenticated collaborative review and comments.
10. Evaluate additional domains with representative users.
11. Add an optional Duvo runtime adapter that preserves run, case, request, revision, and tool provenance while keeping Safepoint's executor authoritative. Duvo may retain read and staging access, but not duplicate production write authority for the same workflow.
12. Investigate multi-agent planning only where separate roles create a measurable benefit.

Each future capability requires its own threat model, evaluation set, and evidence that it improves decisions rather than merely adding agent complexity.
