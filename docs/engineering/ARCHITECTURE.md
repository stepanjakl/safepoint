# Architecture

Status: current implementation guide, checked against the repository in October 2026. The [original technical design](../archive/TECHNICAL-DESIGN.md) contains a fuller proposed production system; it is a dated design record, not a claim that those services exist.

## Implemented boundaries

The Next.js App Router serves a shared process shell. `lib/process/routes.ts` maps process summaries to their pages. `components/app-shell/` owns navigation, tabs, runs and thread layout; `components/review/` renders the shared review presentation. Development-only process and model routes check for local development before use.

The promotion-release example loads validated fictional evidence and a reviewed replay through `lib/promotion-release/`. `lib/review/` adapts that replay into the shared release-plan presentation. The replay item API loads details on demand. A preview review surface is not evidence of an external write.

Brunch orders is the active development process. `lib/processes/brunch-orders/` declares its subject, five data tabs and versioned instructions; a read is captured or fetched through Composio and kept under an ID. `lib/definitions/` finds definitions, checks formulas and examples, and stores the person's accepted definitions by instructions hash. The current flow is described in the [definitions engine guide](DEFINITIONS-ENGINE.md).

Brunch weekend is retained separately. `lib/processes/avocado-toast/` reads its sheet; `lib/rulebook/` drafts and evaluates a whole rulebook. Its [guide](../processes/brunch-weekend/RULEBOOK-ENGINE-GUIDE.md) and [walkthroughs](../processes/brunch-weekend/RULEBOOK-ENGINE-WALKTHROUGHS.md) apply to that engine, not to Brunch orders.

## Trust and state

- The model can propose definitions or changes. Code validates its output; a person accepts a definition. Model tools do not own external write authority.
- Captured snapshots and replay fixtures allow local work without credentials. Live sheet reads require the development Composio configuration.
- Brunch orders keeps read copies server-side under `.rulebook-reads/`; its current run state is browser-local. Approved definition sets are JSON under `fixtures/brunch-orders/rules/`. This is development storage, not a durable multi-user review database.
- The existing review illustrates proposal accounting and inspection. Approval and execution of external effects are not implemented as a production flow.

## Proposed production architecture

The portfolio direction calls for server-authoritative review revisions, durable persistence, bounded model generation, application-owned adapters, preflight checks, verified writes, an effects ledger and compensation where safe. Those are proposed capabilities in the [archived technical design](../archive/TECHNICAL-DESIGN.md) and [delivery plan](../archive/DELIVERY-PLAN.md). The active [Brunch orders plan](../processes/brunch-orders/PLAN.md) gives the present sequence for calculation, proposal, checking, review, application and history; each phase must be checked against code when built.
