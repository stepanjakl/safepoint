# Safepoint product brief

Status: canonical product direction

Audience: product, design, engineering, and portfolio reviewers

## One-sentence description

Safepoint is an interface for inspecting, approving, executing, and reversing changes proposed by an AI agent before those changes affect real systems.

## The problem

AI agents are increasingly able to use tools, edit records, and trigger business processes. A chat transcript can explain what an agent said, but it is a poor control surface for what the agent intends to change.

Before approving an action, a person needs to know:

- which records and systems will be affected;
- the current and proposed values;
- which changes are risky or unusual;
- what the agent checked, missed, or could not verify;
- which effects can be reversed;
- what actually happened during execution.

Without that structure, a fluent answer can hide a plausible but incomplete plan.

## Product thesis

The safest useful boundary between an AI agent and an operational system is a typed proposal reviewed through a purpose-built interface, followed by deterministic execution.

This boundary does not turn variable model output into a deterministic model response. Instead, it constrains what downstream systems are allowed to do. A response that does not match the supported proposal schema is rejected; accepted intent is subjected to deterministic policy, human approval, and application-owned execution.

Safepoint therefore separates three responsibilities:

1. The model interprets incomplete or ambiguous evidence and proposes intent.
2. The application calculates reproducible facts, applies policy, and collects approval.
3. Deterministic adapters execute, verify, and, when necessary, compensate for effects.

The transcript is supporting evidence. The proposed effects are the primary object of review.

The model must earn its place. Code handles questions for which two careful people using the same formula should reach the same answer, such as margin, order multiples, date validity, and stock arithmetic. The model handles bounded judgement, such as reconciling a loosely written promotion objective with supplier notes, explaining uncertainty, or proposing a safe alternative when several actions satisfy policy. A scenario made entirely of complete structured fields would not demonstrate this distinction convincingly.

## Relationship to agent platforms

Safepoint complements an agent platform rather than replacing its orchestration, connections, queues, human requests, or run history. Duvo, for example, already supports human-in-the-loop approval and recommends a pre-flight review that lists intended writes before execution. It also records run transcripts and tool activity. See Duvo's official guidance on [safe testing](https://docs.duvo.ai/user-guide/getting-started/test-safely) and [auditable runs](https://docs.duvo.ai/best-practices/auditable-runs).

Safepoint adds a narrower, process-aware control surface. It normalises a proposal into registered business effects, accounts for the complete candidate set, evaluates critical rules outside the model, supports line-level review, and records the preflight, apply, verification, and compensation lifecycle of each external effect. Its proposition does not depend on claiming that a wider agent platform lacks approval or audit.

## Intended users

The category-general user is an operations specialist who understands the business decision but should not need to inspect prompts, JSON, or application logs.

Examples include:

- a category or promotion-operations manager reviewing whether a promotion is ready to release;
- a finance operator reviewing payment or ledger corrections;
- a support lead reviewing bulk account updates;
- a people-operations specialist reviewing HR system changes;
- a commerce operator reviewing catalogue or fulfilment updates.

The portfolio scenario uses Maya, a fictional category-operations manager and release coordinator at the fictional UK grocer Alderton's. This persona and division of responsibility are design hypotheses, not validated user research. In a real retailer, commercial approval, replenishment, pricing, and promotion setup may belong to different people. Maya coordinates the final checkpoint; she does not personally replace every upstream specialist.

## User needs

### Understand the proposal

Maya needs a concise summary and a complete list of candidate items. She must be able to compare each current value with its proposed value without reconstructing the plan from prose.

### Find risk quickly

She needs deterministic warnings for low margin, implausible demand, duplicated inbound supply, supplier or logistics constraints, unusually large changes, stale evidence, incomplete data, and effects that cannot be automatically reversed.

### Control the level of approval

She needs to approve safe items in bulk, hold or reject individual items, and edit permitted values. Approval should not silently include items she has not reviewed.

### Trust the result

After committing, she needs a durable record of each attempted effect, its verification result, and any follow-up required.

### Recover safely

If the result is wrong, she needs to know which effects can be compensated automatically and which require manual intervention.

## Demonstration scenario

At 08:45 on Thursday 3 September 2026, Maya reviews whether Alderton's Fresh Food Weekend promotion is safe to release. The fictional final supplier top-up cutoff is at 12:00, and store labels must be ready by 06:00 the following day, exactly 21 hours and 15 minutes after review. The promotion runs on Saturday 5 and Sunday 6 September. The campaign and timing are synthetic and exist to make operational sequencing visible.

The agent evaluates exactly 27 promotion lines against a coherent fictional evidence pack rather than receiving a pre-authored answer. It must consider:

- the promotion brief, prices, dates, and forecast uplift;
- catalogue, cost, pack, and case information;
- sales history, forecast confidence, and whether uplift is already included;
- stock on hand, reservations, inbound stock, earlier bulk orders, and open top-up amendments;
- supplier lead time, minimum order quantity, order multiples, confirmed allocation, and top-up cutoff;
- supplier funding, projected margin, and approval thresholds;
- pricebook, storefront, and label readiness.
- bounded narrative evidence, such as promotion objectives, buyer notes, forecast commentary, and supplier allocation qualifications.

The 27 lines represent an approved upstream shortlist, not products discovered by Safepoint. This follows a credible merchandising workflow: a promotion-selection agent identifies and ranks candidates, a pricing or replenishment stage prepares the commercial plan, and Safepoint reviews whether that plan is ready for operational release. Duvo publishes a comparable [Promo Product Selection playbook](https://docs.duvo.ai/user-guide/playbooks/merchandising/promo-product-selection) that hands approved stock keeping units (SKUs) to a pricing-agent queue. The fictional evidence pack therefore records the promotion cycle, shortlist source, selection rationale, upstream approval reference, and generation time.

The stable replay contains 17 ready lines, six that require an adjustment or individual attention, two held lines, one excluded line, and one unverifiable line. This yields 23 potentially releasable lines and four that cannot currently be released. A live run may differ slightly in explanation and recommendations, but all 27 lines must remain visible and deterministic blockers produce the same safety outcome.

Bulk promotional orders were placed earlier in the planning cycle. Any quantity proposed during this checkpoint is a final top-up or amendment against those existing orders, not the promotion's first supply order one day before launch. The evidence therefore shows the original order, confirmed allocation, open amendments, expected receipts, and the remaining launch shortfall.

Each candidate uses understandable fields:

- stock keeping unit (SKU);
- product name and category;
- regular and promotional selling price;
- cost price, supplier funding, and projected margin;
- promotion start and end;
- forecast demand and confidence;
- stock on hand, inbound stock, and open orders;
- recommended top-up quantity and supplier constraints;
- channel-readiness checks;
- target systems and evidence freshness.

The user's central decision is not whether to copy 23 price values. It is whether the promotion can be released safely, which lines should be adjusted, and which should be held. Pricebook changes remain one consequence of that decision.

The scenario deliberately contains inspectable exceptions, such as promotional uplift being counted twice, an open order already covering demand, an invalid order multiple, missing supplier funding that breaches the margin floor, a lead time that misses the promotion, conflicting channel dates, and unavailable evidence. These are provisional scenario-design seeds; the generated dataset must make their causes and expected outcomes arithmetically consistent.

The readiness checks are grounded in the publicly documented structure of Duvo's [Auto-ordering skill](https://docs.duvo.ai/user-guide/skills/available-skills/auto-ordering): forecast, inventory, supplier, financial, logistics, business-rule, and external-signal gates. Safepoint does not treat every unavailable gate alike. The process definition derives each line's gate obligation from that line's context:

- **Required:** failure, an omitted check, or unavailable evidence blocks the affected line.
- **Advisory:** failure or unavailable evidence reduces confidence or requires attention but need not block release.
- **Not applicable:** the process deliberately excludes the gate and records why.

This distinction allows useful degradation without presenting an unsupported release as safe.

For example, supplier and logistics evidence is required when a line needs a top-up order but may be not applicable when existing confirmed stock already covers demand. External signals are usually advisory. Financial and business-rule checks remain required for every released line. The model can explain a result but cannot choose which obligation applies.

The agent may discover and explain these conditions, but deterministic application code independently recalculates critical facts. If the model recommends release while a rule fails, Safepoint displays the disagreement and blocks or escalates the line according to policy.

Optional implementation notes may map these terms to documented SAP retail fields, but the interface does not expose unexplained enterprise-system codes. See [SAP's sales-price documentation](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9905622a5c1f49ba84e9076fc83a9c2c/be98c7536e8e2a4be10000000a174cb4.html).

Price consistency matters because a mismatch between an advertised or displayed price and the checkout price creates operational work and can harm customers. The case study may cite the UK's [Competition and Markets Authority review of grocery price marking](https://www.gov.uk/government/publications/review-of-price-marking-in-the-groceries-sector), but must not offer legal advice.

## Value proposition

Safepoint makes agent behaviour:

- legible, by presenting typed effects instead of relying on narrative;
- bounded, by keeping write authority outside the model;
- reviewable, by showing risk, evidence, and omissions;
- accountable, by recording attempted and verified effects;
- recoverable, by treating compensation as a planned workflow.

## Product principles

### Show the full evaluation set

Do not show only what the agent chose. Show proposed, excluded, and unverifiable candidates so that omission risk has a visible surface.

### Put policy outside the model

The model may explain a risk. It does not decide whether the risk is permitted. Thresholds and approval requirements are deterministic and testable.

### Make risky actions deliberate

Use friction in proportion to consequence. A reversible price update and an irreversible external notification should not share the same approval treatment.

Assess risk at the effect level using monetary impact, reversibility, external visibility, regulatory exposure, and system criticality. These dimensions adapt Duvo's [high-risk automation guidance](https://docs.duvo.ai/user-guide/security/high-risk-guardrails), while Safepoint enforces configured limits in deterministic code rather than relying on model instructions alone.

### Fail safely at the deadline

An unanswered approval never becomes permission. If the fictional release deadline passes, Safepoint prevents uncommitted effects and requires a fresh proposal or explicit intervention. It does not assume that a paused agent can time out or escalate itself; Duvo documents that a human request can wait indefinitely without automatic escalation. See [When the Agent Should Ask, Not Act](https://docs.duvo.ai/best-practices/when-to-ask-a-human).

### Never claim stronger guarantees than the system provides

Conflict checks against a shared spreadsheet are best effort. Cross-system reversal is compensation, not a single atomic rollback. Partial outcomes remain visible.

Technical recovery categories must be translated into consequences a reviewer can act on. Prefer “Can be restored automatically until label production begins at 06:00” over showing only “conditional compensation”.

### Use one review grammar without hiding meaning

The same workspace should review many services, but it must not reduce every operation to a raw key-value or JSON diff. A field update, state transition, deletion, command, and external message can share evidence, approval, execution, and audit patterns while showing different consequences and recovery options.

### Degrade into a useful state

If the live model or a dependency fails, the fixed replay remains available and is clearly labelled. A fallback must not pretend to be live.

### Prefer calm density

The interface should feel like a focused operational tool. Hierarchy, typography, alignment, and restrained colour should do more work than decorative cards or heavy shadows.

## Success measures

### Portfolio success

- A reviewer understands the thesis and primary workflow within two minutes.
- All 27 candidates are accounted for.
- A reviewer can find high-risk and omitted items without reading a transcript.
- The commit flow demonstrates preflight checking, verification, and at least one controlled conflict.
- The reversal flow distinguishes automatic compensation from manual follow-up.
- The live path and replay path are visibly different but lead to the same review experience.
- The application meets its documented accessibility and reliability gates.
- The written case study explains product judgement, not only implementation effort.

These are acceptance criteria for the portfolio. They are not claims of measured customer outcomes.

### Measures for a future product

A production product would investigate:

- time to approve a batch;
- unsafe effects caught before execution;
- omission-detection rate;
- conflict and compensation rates;
- manual interventions per batch;
- reviewer confidence and comprehension;
- false-positive risk warnings;
- audit completeness.

These measures require real users and representative workflows before targets can be set.

## Portfolio boundary

The portfolio track includes:

- one fixed grocery promotion-release scenario and versioned fictional evidence pack;
- a complete review interface;
- read-only model tools and structured proposal generation;
- deterministic replay;
- deterministic policy checks;
- isolated Google Sheets data and verified writes;
- a working storefront sandbox with a separate customer-facing result view;
- clearly labelled simulated or preview-only SAP, label-service, and notification effects;
- an effects ledger and compensation demonstration;
- light and dark themes;
- a public application and written case study.

It does not include:

- arbitrary prompts or user-provided integrations;
- production retail data;
- real email delivery;
- enterprise identity or multi-tenant administration;
- collaborative approvals;
- a general workflow builder;
- a case-study video.

## Implementation scope control

The documentation describes both a complete public release and a wider future product. Implementation must follow a strict scope fence even though the project has no artificial calendar deadline.

### Core proof

The first complete cut proves the thesis with the 27-line review, deterministic replay, bounded live generation, independent policy, one visible agent-policy disagreement, granular decisions, Google Sheets preflight and verification, a controlled conflict, compensation, and the effects ledger.

### Public-release completion

Before publishing, add the thin application-owned storefront as the second genuine target, complete session isolation and operational safeguards, meet the documented accessibility criteria, and publish the written case study.

### Stretch work

Advanced streaming recovery, exhaustive visual-regression coverage, extra simulated connectors, and additional operational polish may follow only after the complete core path works. Stretch work cannot block demonstrating the central review-to-ledger story.

### Future product

Duvo integration, additional processes, a general renderer registry, collaborative approval, rehearsal, and organisation-wide controls remain outside the portfolio implementation.

## Future-product track

The broader direction adds capabilities only after the review and execution boundary is proven:

1. Extract the grocery configuration into a versioned process-definition format.
2. Define a closed typed-effect protocol for field changes, record operations, state transitions, commands, messages, and files.
3. Add a connector capability model and reusable operation modules for supported services.
4. Onboard a second process to prove that the review shell generalises without becoming a raw JSON viewer.
5. Rehearse a plan against a model of the environment before approval.
6. Compare alternative plans and expose trade-offs.
7. Configure organisation-level risk and approval policies.
8. Add connector-specific concurrency and reversal strategies.
9. Support multiple reviewers, separation of duties, and enterprise identity.
10. Add optional runtime adapters for agent platforms. A Duvo adapter could ingest run and case provenance, receive run webhooks, and resolve the corresponding human request after Safepoint review without giving the model direct write authority.
11. Extend beyond the grocery scenario without weakening the typed-effect model.

Safepoint may be embedded as a specialised review surface inside a wider agent runtime, or run as a focused application beside one. Its distinctive contribution is effect-level review: typed before-and-after values, explicit omissions, per-target execution state, conflict handling, and compensation. It does not depend on claiming that wider automation platforms lack approvals or audit trails.

## Open assumptions to validate later

- Operations specialists prefer reviewing a change set over approving an agent plan expressed in prose.
- Explicit omissions improve error detection rather than adding distracting noise.
- A per-effect ledger is understandable without exposing implementation detail.
- Reviewers can make useful decisions with compact evidence and request deeper evidence only when needed.
- Bounded ambiguous evidence makes the agent's judgement useful rather than decorative.
- A rehearsal step adds enough confidence to justify its time and complexity.

These assumptions should become research questions if Safepoint moves beyond a portfolio project.
