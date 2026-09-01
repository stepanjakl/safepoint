# Safepoint project review

Status: canonical decision record

Audience: product, design, and engineering contributors

Last reviewed: 1 September 2026

This document explains what was kept, corrected, deferred, or rejected when the original project notes were consolidated. Those source files remain unchanged in a local, version-control-excluded archive.

## Executive assessment

Safepoint starts from a strong product insight: when an AI system can change real data, a transcript is not enough. People need to inspect the proposed effects, see omissions, approve at an appropriate level, and understand what happened after execution.

The original material described that insight well, but mixed several kinds of document:

- a portfolio brief;
- role-specific application research;
- interface exploration;
- implementation notes;
- styling research;
- an eventual product roadmap.

That mixture created contradictions. The most important were an agent that both staged and wrote changes, marketing language that implied stronger rollback guarantees than the underlying compensating-write mechanics, several incompatible UI stacks, and lifecycle state represented as one overloaded status field.

The rewrite keeps the thesis and the strongest interaction ideas. It gives each concern one owner and narrows the portfolio build to a credible public sandbox.

## Findings from the official Duvo documentation

The official documentation review changes the competitive framing but supports the core architecture. Duvo already supplies several controls that the earliest Safepoint notes risked presenting as absent. Safepoint must acknowledge those capabilities and make its additional value concrete.

| Official Duvo capability | Evidence | Consequence for Safepoint |
| --- | --- | --- |
| Standard and custom connections are Model Context Protocol (MCP) servers with service-specific actions. | [Connections overview](https://docs.duvo.ai/user-guide/connections/connections-overview) | Duvo has implemented connectors; agent tool selection is not connector implementation. Safepoint normalises supported actions but preserves service and operation semantics. |
| Human approval and a pre-flight list of intended writes are existing patterns. | [Safe testing](https://docs.duvo.ai/user-guide/getting-started/test-safely), [human-in-the-loop design](https://docs.duvo.ai/user-guide/assignment-features/hitl-design) | Do not position Safepoint as introducing approval. Its differentiation is typed, line-level review, complete accounting, independent policy, and effect-level execution evidence. |
| Approval requests have one owner, no automatic timeout, and no automatic escalation. | [When the Agent Should Ask, Not Act](https://docs.duvo.ai/best-practices/when-to-ask-a-human) | The time-sensitive demo needs a server-enforced expiry that fails safe instead of relying on a paused agent. |
| Runs retain transcripts, tool calls, evaluations, and case history. | [Make Every Run Auditable](https://docs.duvo.ai/best-practices/auditable-runs) | Do not claim Duvo lacks audit. Preserve its run and case identifiers as provenance while maintaining a separate external-effects ledger. |
| Exact, contestable calculations should run in a script while the agent orchestrates. | [Let a Skill Do the Math](https://docs.duvo.ai/best-practices/let-a-skill-do-the-math) | This validates the model-proposes/code-calculates boundary. Safepoint extends it through policy and execution. |
| Auto-ordering uses forecast, inventory, supplier, financial, logistics, business-rule, and external-signal gates. | [Auto-ordering skill](https://docs.duvo.ai/user-guide/skills/available-skills/auto-ordering) | The scenario gate vocabulary is publicly supportable. Safepoint additionally classifies each gate as required, advisory, or not applicable. |
| Promotion selection can hand approved products to a pricing-agent queue. | [Promo Product Selection playbook](https://docs.duvo.ai/user-guide/playbooks/merchandising/promo-product-selection) | Treat the 27 lines as an upstream approved shortlist and position Safepoint as the downstream release checkpoint. |
| Hosted APIs, custom MCP, browser automation, and Computer Use offer different integration paths. | [Connection patterns](https://docs.duvo.ai/user-guide/connections/integration-patterns) | Connector capabilities must disclose their execution path because preflight, verification, idempotency, and compensation strength vary. |
| Risk guidance covers monetary impact, reversibility, external visibility, regulatory exposure, and system criticality. | [High-risk guardrails](https://docs.duvo.ai/user-guide/security/high-risk-guardrails) | Reuse these dimensions for effect-level risk presentation, while enforcing hard limits in code rather than in model instructions alone. |

Two terminology traps are now explicit:

- Duvo's agent-revision rollback changes future Agent Operating Procedure (AOP) behaviour; it does not reverse effects already created in external systems. Safepoint calls external-state repair compensation.
- Duvo's run sandbox is a temporary file workspace. It is not equivalent to Safepoint's isolated public scenario, spreadsheet, and storefront state.

The future integration opportunity is credible but intentionally out of portfolio scope. Duvo's [Developer Platform API](https://docs.duvo.ai/user-guide/running-assignments/api-overview) can expose runs, messages, cases, webhooks, and human requests to a specialised Safepoint client. Such an adapter should preserve upstream identifiers and return the review outcome without granting the proposal-generating model direct commit authority.

## Response to the independent direction audit

A subsequent adversarial review judged the Codex direction stronger but identified scope, runtime, recovery, realism, and interaction-design weaknesses. The useful findings are incorporated without removing the broader product record.

| Audit finding | Decision | Resulting direction |
| --- | --- | --- |
| The seven-milestone plan risks becoming a small-team programme rather than a focused portfolio build. | Accepted with qualification | Keep no artificial calendar deadline, but introduce Core proof, Public-release completion, Stretch, and Future scope fences. Do not start stretch work before the central flow works. |
| Browser-independent execution was promised without a runtime mechanism. | Accepted | Proposal generation, commit, compensation, and cleanup use Vercel Workflows rather than a long route-handler request or a hand-built lease worker. |
| A crash can strand an effect in `applying`. | Accepted | Workflow replay restores orchestration, but the retried step must still re-read the external target and classify the attempt before any write. |
| A future Duvo adapter could allow both Duvo and Safepoint to write after approval. | Accepted as a future constraint | Safepoint must be the sole production-effect executor. A resumed Duvo run may record the outcome but cannot possess equivalent production write authority for that workflow. |
| Gate obligation cannot always be static for a process. | Accepted | Required, advisory, and not-applicable obligations are derived per line from process rules and server-owned context. |
| Ordering promotion volume the day before launch is implausible. | Accepted | Main orders happen earlier; the checkpoint may propose only final top-up or amendment quantities. |
| Per-session Sheet copies may be operationally expensive. | Open pending evidence | Run an isolation and quota spike. Compare copies, a pre-created pool, and protected ranges; assume none is safe without measurement. |
| The storefront verifies an application-owned projection. | Accepted as a limitation | Keep it thin and useful as a visible second target, but do not present its verification as independent third-party evidence. |
| Technical recovery categories lost the original's memorable consequence language. | Accepted | Retain typed capability values and restore plain-language recovery windows and costs in the interface. |
| Accessibility checks should be cut to improve feasibility. | Partly rejected | Sequence comprehensive checks later, but retain WCAG 2.2 AA, zoom, keyboard, reduced-motion, and manual screen-reader acceptance for public release. |
| A hard career-driven calendar timebox should return. | Rejected as a canonical product constraint | Use a strict scope and stop rule. Private application timing does not belong in the public specification. |

The audit's strongest strategic challenge is also retained: if deterministic code can produce the entire answer from complete structured fixtures, the model is decorative. The scenario must therefore include bounded ambiguous narrative evidence and safe alternatives that require judgement. Deterministic code still owns reproducible arithmetic, non-negotiable rules, and write execution.

## Response to the Fable scaffolding audit

A later implementation-readiness audit found the stack coherent and the first stage ready to scaffold, but exposed one real documentation conflict and several claims that needed qualification. The useful recommendations are retained below; assertions that were too broad are corrected rather than copied.

| Audit finding | Decision | Resulting direction |
| --- | --- | --- |
| `TODO.md` deferred live generation until after Sheets while the delivery plan placed it before persistence. | Accepted | Use one replay-first sequence: static replay, local review, domain core, a small live-generation feasibility pass, persistence and durable generation, fake execution, Sheets, then release hardening. |
| Milestone 1 required browser accessibility and visual checks while Playwright was described as a later dependency. | Accepted | Add Playwright and axe in the first interface milestone, when those checks first become real. |
| Node.js 24, pnpm 10, Next.js, Tailwind, React Aria Components, Zod, Neon, Drizzle, AI SDK, and Workflow form a coherent stack. | Accepted with stage-time verification | Keep the stack, pin stable installed versions when each dependency is first used, and avoid beta or release-candidate examples unless deliberately chosen. |
| Workflow should force the application and database into `iad1`. | Corrected | Do not assume one Workflow region. Before creating Neon, inspect the installed Workflow and Vercel region support, choose an available pair, and measure it. See Vercel's [function-region guidance](https://vercel.com/docs/functions/configuring-functions/region). |
| The review-event transaction will probably require Neon's WebSocket driver. | Corrected | Fixed non-interactive transactions can use Neon's HTTP path. For Node.js on Vercel, evaluate `node-postgres` with Fluid compute first; use WebSockets only for a demonstrated interactive-transaction need. See Neon's [connection-method guidance](https://neon.com/docs/connect/choose-connection). |
| Workflow `start()` is simply an at-least-once operation. | Qualified | Each `start()` call creates a run, so request retries can create duplicate runs; steps may also retry. A unique application operation and first-step claim prevent duplicate effects, not duplicate run records. See the official [idempotency guidance](https://github.com/vercel/workflow/blob/main/docs/content/docs/v4/foundations/idempotency.mdx). |
| Workflow history has a fixed one-day Hobby and seven-day Pro retention period. | Not adopted | Do not encode unverified plan durations. Check the deployed plan at release and keep the Neon ledger authoritative regardless of operational-history retention. |
| A React-Aria-specific Tailwind helper is required. | Qualified | Tailwind supports `data-*` state variants directly. Add a helper only when a real component benefits from it; React Aria imports may live in reviewed UI primitives or feature components where appropriate. |
| The eight-kind effect taxonomy should be scaffolded now, even if only five kinds are used. | Revised | The portfolio union contains only five reviewed kinds: three executable sandbox effects and two simulated effects. Creation, deletion, and file transfer remain future concepts. |
| String-based process, renderer, value-schema, and connector registries add generality. | Deferred | Use a directly imported typed promotion module, direct renderers, and explicit adapter selection. Introduce registries only after a second process or connector proves the need. |

This audit is advisory input, not a new source of product truth. The canonical decisions are the reconciled documents and the behaviour verified during implementation.

## What is worth preserving

### Review effects, not prose

The main view should be a structured change set rather than a chat transcript. A short rationale can provide context, but the user must be able to inspect the object, field, before-value, proposed value, target system, and risk.

### Make omissions visible

A plausible result can still be wrong because the agent missed an item. Safepoint therefore shows the complete evaluation set: staged items, deliberately excluded items, and items the agent could not verify.

### Use progressive disclosure

The first screen answers three questions: what is changing, what needs attention, and what can I do next? Tool evidence, audit details, and reversal mechanics remain available without dominating the primary task.

### Treat reversal as a product surface

Reversal is not merely a backend feature. The interface must explain what can be restored automatically, what is already restored, and what requires human intervention.

### Design the failure states deliberately

Conflicts, stale values, partial execution, model failure, and dependency failure are core states. They are not edge cases to add after the happy path.

### Put the business decision above the data edit

The original price-update scenario is plausible: grocery promotions require coordinated prices, dates, labels, and channel setup. It is nevertheless too narrow as the primary story because it makes Safepoint look like a safer spreadsheet editor.

The revised scenario asks whether a promotion is operationally and commercially ready to release. Price changes remain a real downstream effect, alongside final top-up recommendations, storefront scheduling, label readiness, and indicative enterprise-system actions. This exposes the judgement, missing evidence, cross-system consequences, and partial reversibility that justify a dedicated review surface.

### Considered scenario alternatives

| Scenario | Strength | Decision |
| --- | --- | --- |
| Promotion release and replenishment | Recognisable grocery event, uncertain evidence, deterministic constraints, several effect types, and a customer-visible result | Selected for the portfolio |
| Pure inventory-replenishment exceptions | Highly plausible and easy to measure through availability and stock cover | Keep as a future process; alone it risks resembling an existing exception queue more than a distinct Safepoint proposition |
| Supplier cost-increase challenge | Strong category-management judgement using contracts, commodities, should-cost, and margin evidence | Future candidate; the first version would have fewer convincing executable effects |
| Regulatory and label compliance | High consequence, explicit missing evidence, and useful cross-market checks | Defer; legal sensitivity and fast-changing rules would require stronger subject-matter validation |
| Grocery invoice or freight audit | Clear financial value, document evidence, approval, and ERP correction | Future candidate; it is less visibly grocery-specific and shifts the story towards finance operations |

## Corrections and resolved contradictions

| Original idea or contradiction | Resolution | Reason |
| --- | --- | --- |
| The agent can write a labels file during generation. | The agent has four read-only tools and returns a validated proposal. Only deterministic application code can write. | Review must occur before effects are created. |
| If an agent can select an integration action, the platform probably has no connector implementation. | Separate integration definition, authorised connection, executable action, and agent selection. The action still requires implementation somewhere, whether managed or supplied through Model Context Protocol (MCP). | Orchestration and connector implementation are different responsibilities. |
| Reading a value, writing, and reporting the previous value is sufficient conflict prevention. | Treat the returned previous value as post-write evidence. Enforce an expected-value preflight before writing and still document the remaining race window. | Reporting an unexpected value after mutation does not prevent the mutation. |
| Every external action is fundamentally a key-value change. | Use a closed union of typed effects with a shared lifecycle. | Commands, state transitions, deletions, messages, files, and asynchronous workflows have materially different consequences. |
| A staged item can be `edited`, `committed`, `reverted`, or `conflicted` in one status field. | Batch phase, review decision, effect execution, and edit history are separate dimensions. | These facts can coexist and should not create illegal states. |
| Before-values captured during generation are enough for commit. | Commit performs a fresh preflight read and verifies the result after writing. | Staged data can become stale while a person reviews it. |
| Google Sheets has no transaction support. | One spreadsheet `batchUpdate` request is atomic, but no transaction spans Sheets and the other targets. | This matches the [Google Sheets API contract](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate). |
| The savepoint and rollback language can imply database-like reversal, although the original mechanics already anticipated before-values, conflicts, and compensating writes. | Cross-system reversal uses compensating actions and can require intervention. | Preserve the original recovery mechanics while removing the stronger marketing implication. See the [compensating transaction pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction). |
| `NETPR` is presented without sufficient object context as a shelf selling price. | The public scenario uses plain retail fields. Optional SAP mappings use documented sales-price terminology and name the relevant business object. | An ambiguous technical field does not communicate a shopper-facing selling price reliably. See [SAP retail sales-price documentation](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9905622a5c1f49ba84e9076fc83a9c2c/be98c7536e8e2a4be10000000a174cb4.html). |
| The review begins at 08:45 and a next-day 06:00 deadline is 9 hours 14 minutes away. | The interface shows approximately 21 hours 15 minutes. | The original calculation was incorrect. |
| The source alternates between roughly 24 items, 23 changes, four exclusions, and a longer candidate list. | The scenario contains exactly 27 lines. The replay has 23 potentially releasable lines and four held, excluded, or unverifiable; live recommendations may vary while all lines remain accounted for. | Counts reconcile without pretending model judgement is fixed. |
| Styling recommendations move between Tailwind, StyleX, Catalyst, Radix, and Headless UI. | Tailwind CSS and semantic tokens provide styling; React Aria provides accessible behaviour. | It is the smallest coherent stack for this portfolio build. |
| A fixed `edited` lifecycle state signals that a value changed. | Edits are immutable audit events attached to a change. | An approved or committed item may also have been edited. |
| A successful recorded model run is the evaluation strategy. | Use a fixed evaluation suite with expected successes and failures. A replay is designated from the suite, not selected for looking impressive. | This reduces cherry-picking and makes regressions visible. |
| The demo cannot fail. | Replay mode has no live dependency and must remain usable when live mode fails. | Absolute reliability claims are not credible; controlled degradation is. |
| Turso and SQLite were selected before the need for a convenient hosted data interface and Postgres-style constraints was reconsidered. | Use Neon Postgres with Drizzle. Inspect data locally through Drizzle Studio and remotely through Neon's Tables interface. | This remains simple on Vercel while making application and audit data easier to inspect. See [Neon Tables](https://neon.com/docs/guides/tables) and [Drizzle's Neon integration](https://orm.drizzle.team/docs/connect-neon). |
| The application should implement its own background queue, leases, heartbeats, and expired-lease reconciler. | Use separate Vercel Workflows for proposal generation and approved-effect execution. Keep the effects ledger and connector reconciliation in Safepoint. | Durable orchestration is generic infrastructure rather than the product's distinctive value. Workflow durability does not make external writes exactly once. See [Vercel Workflows](https://vercel.com/workflows). |
| A development-state route is omitted from production builds. | Use a protected workbench with an explicit environment guard. | Route inclusion is a build and deployment decision, not a naming convention. |
| Rehearsal is part of the first portfolio build. | Rehearsal moves to the future-product track. | Review, verified execution, and compensation already demonstrate the core thesis. |
| The captured Automatic Ordering skill should be copied into the public demo. | Use Duvo's public [Auto-ordering documentation](https://docs.duvo.ai/user-guide/skills/available-skills/auto-ordering) to ground the seven-gate vocabulary, but write and version the project instruction independently. Do not copy the captured file unless publication rights are confirmed. | The high-level method is public; the exact captured artefact still has uncertain publication rights. |
| The model must always produce the reviewed replay answer. | Keep source truth and deterministic rules fixed while allowing bounded variation in explanation and safe recommendations. | This demonstrates real model variability without making safety depend on it. |
| Every displayed target should appear to execute. | Google Sheets and the storefront are working sandboxes. Other targets are explicitly simulated, preview-only, or unavailable. | The interface must distinguish an implemented effect from an indicative connector. |

## Product decisions

### Decided

- Safepoint is category-general. Grocery promotion release is the demonstration scenario, not the product boundary.
- Safepoint is a specialised review and execution-boundary capability. It may be embedded in a wider agent runtime or used as a focused application.
- Its differentiation is effect-level review, omission visibility, verification, and compensation, not a claim that other automation platforms lack human approval or audit.
- Duvo's generic pre-flight and human-request capabilities are acknowledged. Safepoint adds a specialised process-aware review and deterministic external-effect boundary.
- The interface uses a consistent review grammar, not a universal raw key-value editor. Service and operation semantics remain visible.
- The portfolio output is a public working application plus a written case study.
- The sandbox uses a server-owned instruction and fixed scenario data. Live model judgement can vary within the registered process contract.
- The agent derives its plan from a versioned fictional evidence pack; it is not given a pre-authored proposal.
- The evidence pack includes bounded narrative material so the agent interprets ambiguity rather than repeating deterministic calculations.
- Critical facts are recalculated by deterministic policy and shown separately from model recommendations.
- Every readiness gate is designated required, advisory, or not applicable by the process definition rather than by the model.
- Gate obligation is derived per line because top-up need, channel, and supply context can change which checks apply.
- An unanswered approval never becomes permission; passing the release deadline prevents new effects and requires intervention or regeneration.
- Google Sheets and the storefront sandbox produce real, verified demonstration effects. Other systems disclose their simulation mode.
- Both light and dark themes are present from the first interface milestone.
- Email remains a simulated final effect.
- Neon Postgres and Drizzle own durable application state, migrations, and the effects ledger.
- Vercel Workflows own durable orchestration; they do not replace Safepoint's ledger, connector idempotency, verification, or compensation.
- Each Workflow start creates a run. Application operation keys and atomic first-step claims prevent duplicate business execution when requests or starts repeat.
- The Neon driver and Vercel/Neon region pair are selected from measured runtime needs during persistence, not assumed during scaffolding.
- Vercel AI SDK uses AI Gateway for the live proposal path, with the configured and actual provider/model recorded for every run.
- Node.js 24 LTS is the application runtime and pnpm 10 is the package manager. Bun remains a valid considered alternative, but adopting it only for package installation would add a second runtime toolchain without improving the portfolio's core proof.
- Playwright and axe begin with the first interface milestone because accessibility and representative visual checks are part of that milestone's acceptance gate.
- The first implementation uses one directly imported promotion process module and five effect kinds. General registries and broader effect taxonomies are future work.
- The portfolio has no fixed calendar deadline. Progress is controlled by acceptance gates.
- The public narrative is self-contained and contains no private career or application context.

### Assumptions

- Maya, Alderton's, and their operating process are synthetic design hypotheses, not findings from field research.
- The 06:00 label deadline is a fictional constraint chosen to make sequencing and urgency visible.
- Bulk promotion orders occurred earlier; any quantity changed during the scenario is a final top-up or amendment.
- Google Sheets is an intentionally legible stand-in for an operational system. It is not presented as an ideal retail architecture.
- A read-only spreadsheet viewer can be made public without exposing service-account credentials or unrelated data.
- Category ownership varies by retailer; Maya's category-operations role is a synthetic simplification of commercial, replenishment, pricing, and promotion responsibilities.

### Future

- Rehearse proposed plans against a simulation before execution.
- Compare alternative plans and explain trade-offs.
- Add richer connectors and organisation-level approval policies.
- Support collaborative review and enterprise identity.
- Investigate stronger connector-specific concurrency controls.
- Add an optional Duvo runtime adapter only after the provider-independent portfolio workflow is proven.

## Technical risks

| Risk | Planned treatment |
| --- | --- |
| Model output is malformed or unsupported. | Validate the complete proposal against a closed schema and show a recoverable error. |
| Data changes during review. | Re-read expected values before every write and surface conflicts. |
| One target succeeds and another fails. | Persist every effect, stop according to policy, and offer safe compensation. |
| A workflow step is interrupted after applying an effect but before verification. | On retry, re-read and classify the target before recording success or attempting another write. |
| A repeated request or ambiguous Workflow start creates duplicate runs. | Reuse a unique application operation, atomically claim it in the first workflow step, and require a separate idempotency key for every effect. |
| A paused approval outlives the operational deadline. | Expire commit eligibility, apply nothing automatically, and require a fresh proposal or explicit intervention. |
| A platform-level disable switch stops future runs but not an active executor. | Maintain a separate Safepoint executor circuit breaker checked before every new external attempt. |
| The model appears unnecessary because all evidence and conclusions are deterministic. | Include bounded ambiguous evidence and alternative policy-compliant plans; evaluate interpretation and uncertainty separately from arithmetic. |
| A public visitor causes cost or quota abuse. | Fixed input, isolated sessions, quotas, timeouts, a kill switch, and replay fallback. |
| The audit trail leaks model prompts or personal data. | Store only bounded evidence required by the scenario and exclude personal data. |
| Automated accessibility checks create false confidence. | Combine automation with keyboard, zoom, reduced-motion, and screen-reader checks. |

## Source coverage

This table records the destination of each major source area. It is a coverage map, not a line-by-line concordance.

| Archived source | Substantive material | Canonical destination | Treatment |
| --- | --- | --- | --- |
| `CLAUDE.md` | Thesis, concrete scenario, audience, working decisions | `README.md`, `PRODUCT-BRIEF.md` | Retained and generalised |
| `CLAUDE.md` | Stack and definition of done | `TECHNICAL-DESIGN.md`, `DELIVERY-PLAN.md` | Revised |
| `CLAUDE.md` | Personal working preferences and external research locations | This review only where relevant | Private context removed |
| `CONCEPT.md` | Need for the portfolio piece and product thesis | `PRODUCT-BRIEF.md` | Retained |
| `CONCEPT.md` | Human context and honesty mechanics | `PRODUCT-BRIEF.md`, `EXPERIENCE-SPEC.md` | Retained, labelled synthetic |
| `CONCEPT.md` | Feature tiers and simplification proposal | `DELIVERY-PLAN.md` | Converted into acceptance-gated milestones |
| `CONCEPT.md` | Provider choice and agent architecture | `TECHNICAL-DESIGN.md` | Provider-neutral contract; provider is configuration |
| `CONCEPT.md` | Master-detail interface and review actions | `EXPERIENCE-SPEC.md` | Retained and completed |
| `CONCEPT.md` | Grocery price-change scenario | `PRODUCT-BRIEF.md`, `EXPERIENCE-SPEC.md` | Retained as a downstream effect and expanded into promotion-release review |
| `CONCEPT.md` | Role and interview positioning | None | Rejected from canonical product documentation |
| `CONCEPT.md` | Open decisions | This review | Resolved or labelled future |
| `ARCHITECTURE.md` | Next.js, React, TypeScript, persistence, and AI integration | `TECHNICAL-DESIGN.md` | Retained with clearer boundaries |
| `ARCHITECTURE.md` | Flat staged-change status | `TECHNICAL-DESIGN.md` | Replaced by orthogonal state dimensions |
| `ARCHITECTURE.md` | Debugging and state gallery | `EXPERIENCE-SPEC.md`, `DELIVERY-PLAN.md` | Retained as protected workbench |
| `ARCHITECTURE.md` | Quality gates | `DELIVERY-PLAN.md` | Expanded |
| `ENGINEERING-MAP.md` | Agent loop, tools, transactions, idempotency, accessibility, evals | `TECHNICAL-DESIGN.md` | Applied to concrete design |
| `ENGINEERING-MAP.md` | Repository and service patterns | `TECHNICAL-DESIGN.md` | Used where complexity justifies them |
| `ENGINEERING-MAP.md` | Missing compensation vocabulary | `TECHNICAL-DESIGN.md` | Added explicitly |
| `SKILLS.md` | Installed skill inventory and routing | `README.md`, `DELIVERY-PLAN.md` | Condensed to phase-specific guidance |
| CSS-in-JS transcript | Styling trade-offs | This review | Preserved as research; StyleX not selected |
| Design-system transcript | Visual grammar, restrained surfaces, typography, elevation | `EXPERIENCE-SPEC.md` | Retained as design principles |
| Design-system transcript | Catalyst, Radix, Headless UI, and StyleX recommendations | This review | Considered alternatives, not dependencies |

Official Duvo documentation is external product evidence, not archived source material. It informs the relationship-to-platform analysis, scenario provenance, gate vocabulary, connector model, audit boundary, and future adapter described across the canonical documents. It does not override the portfolio's read-only-model and deterministic-executor decisions.

## Local archive integrity

The seven local source files were hashed before and after the move. The matching SHA-256 values below confirm that the private archive is byte-identical to the source set. The archive itself is intentionally not part of the public repository.

| Archived file | SHA-256 |
| --- | --- |
| `ARCHITECTURE.md` | `2d8a997cb77091a0955c3fe78d7cd942e5cffa01059233a9976b5f916e8faf2e` |
| `CLAUDE.md` | `c7d49f2c0fddcb40c6c3dab1756b3a218650e91449fa7fc12114128b56ecfe9e` |
| `CONCEPT.md` | `dcf82dfa88b91dbe27ad644f2b983fc8fb76a856f905987f433c9966307248f2` |
| `ENGINEERING-MAP.md` | `a7ae1c178f238d758817a28937f148b168bb8f3d79d06a50b63a8dfc07c187bd` |
| `SKILLS.md` | `1d86c65e33132585a841f933aa74e10f5c7c0eff95e626ab6adce6470a7b2493` |
| `ChatGPT-CSS in JS Truth Check-20260831-1416.md` | `68d2565002e2a35979af6143de1c5943baaeb238572c2ed8be0bb92e29233504` |
| `ChatGPT-Tailwind Design System Comparison-20260831-1417.md` | `afc72be93f66772cde5fce48b19cbe00bb8059597137eabe25015c1f8f868ab4` |

## Project skills

The project manifest includes the official `neon`, `neon-postgres`, and `workflow` implementation skills. The obsolete `turso-cloud` and `turso-db` skills were removed when persistence moved to Neon Postgres.

Two optional documentation skills may add value later:

- [`documentation-and-adrs`](https://www.skills.sh/addyosmani/agent-skills/documentation-and-adrs) can help maintain architectural decision records once implementation choices begin to change.
- [`writing-for-agents`](https://www.skills.sh/mattpocock/skills/writing-for-agents) can help if the repository later introduces a neutral root `AGENTS.md`.

They are recommendations only and are not installed.
