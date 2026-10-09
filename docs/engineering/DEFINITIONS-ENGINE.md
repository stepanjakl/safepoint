# Definitions engine

Status: current code guide for `lib/definitions/`, checked in October 2026. It is used by [Brunch orders](../processes/brunch-orders/PLAN.md). The older [Brunch weekend rulebook engine](../processes/brunch-weekend/RULEBOOK-ENGINE-GUIDE.md) has a different staged draft and stored shape.

## Contract

A process supplies a `DefinitionProcess`: its ID and a `DefinitionSubject` with the records, lookups, typed columns, proposal fields and reader words. Brunch orders declares this in `lib/processes/brunch-orders/process.ts`; the engine does not hard-code products or orders. The current read joins Products, Stock, Sales and Deliveries by product key and looks up Parameters by category.

One definition has a name, the exact instructions text it interprets, a `check` or `number` result, optional check consequence, quoted constants and groups, a formula, and examples. A formula may read the current record, proposal fields and earlier definitions. `lib/definitions/types.ts` validates the saved set.

## From instructions to acceptance

1. The development read route loads a captured or live five-tab read and keeps it under an ID. `records.ts` reports missing tabs, bad keys and invalid typed cells.
2. `find.ts` identifies definitions from one instructions version. `draft.ts` starts a server-side draft and records progress; `write.ts` writes each definition in order.
3. `formulas.ts` type-checks and evaluates CEL. `checks.ts` tests the definition against its read, quoted constants and groups, dependencies and worked examples. The model's check tool uses these checks.
4. The person confirms the intent and accepts or denies each definition. `decide.ts` reruns the full review against the read before acceptance. A denial can carry a note for the next write.
5. `store.ts` reads saved sets through the schema and writes a temporary file before renaming it over the old set. The path is `fixtures/<process>/rules/<instructions-hash>.json`.

`app/api/dev/brunch-orders/rules/route.ts` exposes get, draft, intent, write and decide actions for this development flow. It is not a public process-definition API. The [development log](../processes/brunch-orders/DEVELOPMENT-LOG.md) records why its checks and approval boundary changed.

## Present limit

Accepted definitions prepare later steps; they do not currently execute orders. The Brunch orders plan marks calculation, proposal, checking of proposals, review, sheet write-back and history as later phases. A stored accepted set and a captured read are not a durable production review record.
