# Architecture

Status: current implementation guide, checked against the repository in October 2026. The [original technical design](../archive/TECHNICAL-DESIGN.md) contains a fuller proposed production system; it is a dated design record, not a claim that those services exist.

## Implemented boundaries

The Next.js App Router serves a shared process shell. `lib/process/routes.ts` maps process summaries to their pages. `components/app-shell/` owns navigation, tabs, runs and thread layout; `components/review/` renders the shared review presentation. Development-only process and model routes check for local development before use.

The promotion-release example loads validated fictional evidence and a reviewed replay through `lib/promotion-release/`. `lib/review/` adapts that replay into the shared release-plan presentation. The replay item API loads details on demand. A preview review surface is not evidence of an external write.

Brunch orders is the active development process. `lib/processes/brunch-orders/` declares its subject, five data tabs and versioned instructions; a read is captured or fetched through Composio and kept under an ID. `lib/definitions/` finds definitions, checks formulas and examples, and stores the person's accepted definitions by instructions hash. The current flow is described in the [definitions engine guide](DEFINITIONS-ENGINE.md).

`lib/rulebook/` holds what Brunch orders shares from the earlier Brunch weekend experiment, which was removed on 13 October 2026: the drafting models, typed sheet columns, the CEL object types and the quota parser.

## Trust and state

- The model can propose definitions or changes. Code validates its output; a person accepts a definition. Model tools do not own external write authority.
- Captured snapshots and replay fixtures allow local work without credentials. Live sheet reads require the development Composio configuration.
- What runs produce (reads, cross-checks, drafts, proposals) is kept server-side under `data/<process>/` (gitignored); a run's own state, including a person's decisions on a proposal, is browser-local. Rulebooks are JSON under `fixtures/<process>/rulebooks/<version>-<instructions hash>/`: the one under review (`current.json`), each accepted revision kept unchanged so a run can return to it, and `revisions.json`, each revision's parent and reason and the head. Each revision is re-checked against the read it is used on. This is development storage, not a durable multi-user review database; `lib/definitions/store.ts` is its only door, shaped for the tables that replace it: a revision is a `rulebook_revisions` row (body as JSON, parent, reason, time, shape version), the head a `rulebook_heads` row per instructions version, and each acceptance or denial later an append-only decision event. In that world only the frozen copies the browser tests serve (`e2e/fixtures/`) stay in git.
- The existing review illustrates proposal accounting and inspection. Approval and execution of external effects are not implemented as a production flow.

## Proposed production architecture

The portfolio direction calls for server-authoritative review revisions, durable persistence, bounded model generation, application-owned adapters, preflight checks, verified writes, an effects ledger and compensation where safe. Those are proposed capabilities in the [archived technical design](../archive/TECHNICAL-DESIGN.md) and [delivery plan](../archive/DELIVERY-PLAN.md). The active [Brunch orders plan](../processes/brunch-orders/PLAN.md) gives the present sequence for calculation, proposal, checking, review, application and history; each phase must be checked against code when built.
