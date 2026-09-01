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
- a durable execution job, crash reconciliation, and effects ledger;
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

## Milestone 1: foundation and complete static experience

### Build

- Scaffold Next.js App Router with strict TypeScript settings and the current supported React version.
- Install Tailwind CSS and React Aria Components using their version-matched documentation.
- Create semantic light and dark tokens, the typography roles, and the effects-rail primitive.
- Add the protected component and state workbench.
- Design the versioned fictional evidence pack for all 27 lines, including upstream shortlist provenance, brief, catalogue, demand, supply, supplier, bounded operational notes, channel, and policy fixtures.
- Record earlier bulk orders and frame any new quantity as a final top-up or amendment.
- Encode the stable replay: 17 ready lines, six requiring adjustment or attention, and four held, excluded, or unverifiable.
- Encode a test-only oracle for the deliberately seeded observations without exposing it to the UI or agent.
- Build the desktop master-detail workspace and the mobile list-to-detail navigation.
- Implement approve, hold, reject, and permitted edit interactions in local fixture state.
- Build the core normal, blocked, omission, edit, commit, conflict, partial-result, compensation, and fallback states. Preserve the complete experience-specification inventory as the public-release regression checklist.

### Acceptance gate

- Counts reconcile across summary, filters, detail, exclusions, and commit confirmation.
- Every seeded exception is supported by internally consistent numbers, timestamps, and source records.
- The fictional promotion cycle and upstream shortlist approval are traceable from every candidate without implying real user research.
- The replay can show agent recommendation and deterministic policy as separate facts.
- Light and dark themes are complete, not colour-inverted placeholders.
- The primary flow works at 320 CSS pixels and at 200% zoom; the full 400% zoom pass remains a public-release gate.
- Every action is keyboard-operable with visible and unobscured focus.
- Standard arrow-key behaviour works before optional `J` and `K` alternatives.
- Automated accessibility tests have zero serious or critical findings.
- Visual regression snapshots cover representative normal, blocked, conflict, and completion states in both themes; exhaustive coverage is release-hardening or stretch work.
- No model, database, or external credential is required to run the interface locally.

## Milestone 2: typed proposal generation and replay parity

### Build

- Define the runtime schema and inferred TypeScript type for `ProposalBatch`.
- Define the process-specific `PromotionReleasePlan` contract within the proposal boundary.
- Implement the four read-only tools against the controlled evidence pack.
- Write and version a project-owned promotion-release instruction. Ground its gate vocabulary in Duvo's public Auto-ordering documentation, but do not copy the captured third-party skill file unless publication rights are confirmed.
- Add the fixed server-owned instruction and bounded generation loop with the current AI SDK APIs.
- Validate complete output, candidate uniqueness, allowed identifiers, evidence references, money, and dates.
- Store a versioned replay fixture using exactly the same schema.
- Add visible mode labels and automatic fallback reasons.
- Create the first fixed evaluation suite and hidden oracle, including seeded observations, safe alternative recommendations, omissions, tool failures, and malformed results.
- Include at least one ambiguous narrative case and one case with multiple policy-compliant alternatives so the model demonstrates judgement rather than arithmetic.

### Acceptance gate

- The model has no write tool or path to a connector credential.
- Both live and replay proposals enter the same validator and render through the same review components.
- Invalid output is never partially accepted.
- Missing or invented candidates fail validation.
- Contradictory gate obligation and result combinations fail validation; required unavailable evidence blocks the affected line.
- Tool-step, output-size, duration, and cost limits are enforced in tests.
- Live failure falls back to a clearly labelled replay without losing the primary workflow.
- The provider and exact model identifier are configuration, not embedded product copy.
- Evaluation results identify model and prompt/schema versions.
- A model that misses an enforceable seeded risk is recorded as an evaluation miss even when deterministic policy blocks it.
- Live explanation and recommendations may vary without changing the layout, source facts, or deterministic safety result.

## Milestone 3: policy, review persistence, and audit history

### Build

- Provision the Turso development database only after confirming project and billing context.
- Define the Drizzle SQLite schema and generate the initial migration.
- Add sandbox sessions, proposal batches, all candidate assessments, review events, evidence, and audit events.
- Implement and version deterministic rules for margin, uplift provenance, earlier and top-up orders, stock position, minimum and multiple quantities, supplier timing, funding, channel dates, evidence completeness, and conflicts.
- Derive required, advisory, and not-applicable gate obligations per line from process rules and server-owned context.
- Make batch phase and review transitions server-authoritative.
- Add expected-revision checks to review mutations.
- Reset approval when an editable value changes and re-run policy.
- Enforce release-deadline expiry in server-owned policy: a stale uncommitted batch moves to intervention required and cannot release automatically.

### Acceptance gate

- Database constraints prevent duplicate candidate records and effect idempotency keys.
- Exactly 27 assessments persist for every accepted scenario proposal.
- Invalid state transitions fail without a partial database update.
- Review action and audit append happen in the same short database transaction.
- Reloading or opening another browser tab produces the same server-authoritative state.
- Concurrent edits return a conflict and current projection rather than last-write-wins data loss.
- No network call occurs inside a database transaction.
- Generated migration SQL is reviewed and a clean database can migrate from zero.

## Milestone 4: isolated Google Sheets sandbox

### Build

- Create the controlled template spreadsheet and server-owned range map.
- Use stable SKU and scenario-line keys to resolve current rows; do not persist row numbers as business identity.
- Run an isolation spike comparing on-demand copies, a bounded pre-created copy pool, and protected per-session ranges. Select only an option that proves quota headroom, cleanup, and cross-session isolation; replay creates no Sheet.
- Implement controlled Sheet operations for promotion records, top-up recommendations, and label-queue entries with preflight, apply, verify, and compensate behaviour.
- Add the read-only, application-rendered Sheet view.
- Add the one-use controlled conflict injection.
- Implement 24-hour expiry and cleanup for sandbox resources.

### Acceptance gate

- A public request cannot choose a spreadsheet, range, or arbitrary value outside the validated proposal.
- Browser code and logs contain no Google or Turso credential.
- Preflight mismatch leaves the external value unchanged and records a conflict.
- Apply success is reported only after a verification read.
- One session cannot read or change another session's data.
- Conflict injection is idempotent and affects only the documented cell.
- Expired sessions reject operations and their external resources are queued for cleanup.
- Tests distinguish atomic updates within one spreadsheet request from the non-atomic multi-target workflow.

## Milestone 5: orchestration, ledger, storefront, and compensation

### Build

- Persist planned effects before execution.
- Persist commit and compensation as durable jobs. Route handlers return after enqueueing; they do not own the batch lifetime.
- Implement database-backed job leases, heartbeats, and a reconciler for expired leases.
- Re-read and classify any effect stranded in `applying` before retrying it.
- Execute required reversible effects before the simulated notification.
- Add bounded retry classification and unique idempotency keys.
- Add an executor circuit breaker that is checked before every new external attempt, including work from an already-running batch.
- Use projection polling as the baseline progress and recovery path. Add persisted SSE with resumable event identifiers only after durable execution is proven.
- Build the effects ledger and intervention views.
- Implement reverse-order compensation with a fresh preflight for every target.
- After that core flow works through Google Sheets, implement the thin session-isolated storefront service, allow-listed promotion API, verification read, compensation path, and read-only customer view.
- Implement clearly labelled simulated SAP, dedicated label-service, and notification adapters only where they improve the effect demonstration.

### Acceptance gate

- A duplicate commit request cannot duplicate an effect.
- Closing the browser or ending the initiating request does not abandon the durable job.
- A worker crash after apply but before verification is reconciled by reading the target before any retry.
- An approved storefront effect changes the separate customer view and is reported successful only after verification.
- Simulated effects say Applied in simulation; preview-only effects never enter an applied state.
- Every attempt has an immutable record and safe error code.
- Baseline polling recovers progress from the persisted projection. If SSE is enabled, reconnection resumes from persisted events and then refreshes the projection.
- The browser closing does not cancel or lose a server-owned execution.
- A partial failure shows applied, failed, conflicted, and not-attempted effects separately.
- If the release deadline passes during commit, the in-flight request settles and is verified, no new effect starts, and untouched effects show Not attempted — deadline reached.
- Compensation never overwrites a value changed after Safepoint's original apply.
- The original effect history remains after compensation.
- Simulated notification is visibly non-recallable and never sends a real message.

## Milestone 6: accessibility, security, reliability, and evaluation

### Build

- Add skip navigation, route focus management, dialog focus behaviour, and stable status infrastructure.
- Apply session-cookie, origin, cross-site request-forgery, content-security, and rate-limit controls.
- Add per-session, per-IP, global model-cost, tool-step, output-size, and timeout ceilings through deployment configuration.
- Add separate live-generation and executor controls; verify replay remains available when generation is disabled.
- Complete the model and executor failure matrices.
- Add structured redacted logs and correlation identifiers.
- Run the fixed evaluation set against the selected provider configuration.
- Complete the full visual-state regression set after the core flow and layouts stabilise.

### Acceptance gate

- Complete review, commit, conflict, and reverse flows pass keyboard-only testing.
- VoiceOver with Safari and NVDA with Chrome can understand the collection, dialogs, statuses, and effects log.
- The complete flow remains usable at 400% zoom without losing content or function.
- Repeated or overlapping asynchronous actions do not announce stale or duplicate results.
- Focus is not lost after filtering, deleting a temporary state, closing a dialog, or navigating back on mobile.
- Security tests reject changed session IDs, foreign batches, invalid origins, unknown fields, oversized bodies, and repeated idempotency keys.
- Raw cookies, credentials, IP addresses, prompts containing secrets, and complete provider responses are absent from logs.
- Both kill controls, release-deadline expiry, exhausted budget, model timeout, Sheets failure, progress-connection loss, and compensation conflict all have tested recovery behaviour.
- Evaluation output includes failures and omissions, not only successful runs.

## Milestone 7: public release and case study

### Build

- Deploy the application with separate preview and production configuration.
- Verify function and database regions are appropriately colocated.
- Configure monitoring, cost alerts, cleanup schedule, and a documented manual kill-switch procedure.
- Write the case study around the problem, boundary decisions, design iterations, failure handling, evidence, and remaining limitations.
- Add an About this demo page explaining fixed inputs, session expiry, simulated systems, live/replay modes, and data handling.

### Acceptance gate

- A first-time visitor can complete replay mode without an account.
- Live mode is bounded, isolated, and can be disabled without a new deployment.
- Production contains no development workbench unless its explicit protection is verified.
- Expired resources are cleaned up and cleanup failures are observable.
- The case study makes no claim of customer validation or production-grade arbitrary-agent safety.
- The public narrative contains no private application context.
- All canonical documentation matches the shipped behaviour.
- A release checklist has been completed on desktop and mobile in light and dark themes.

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
- expired-lease reconciliation decisions;
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
- durable job claim, heartbeat, lease expiry, and crash reconciliation;
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
- Confirm Turso and Drizzle driver compatibility before upgrading either dependency.
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
| Schema, queries, transactions, and migrations | `drizzle-orm-patterns` |
| Hosted database connection and credentials | `turso-cloud` |

The optional `documentation-and-adrs` and `writing-for-agents` skills remain recommendations only.

## Future-product track

Do not begin this work until the public portfolio release meets its acceptance gate.

1. Extract the grocery scenario into a versioned process definition without weakening compile-time validation.
2. Formalise the closed effect union and renderer registry beyond the three portfolio effect kinds.
3. Define a connector capability manifest and an allow-listed operation registry.
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
