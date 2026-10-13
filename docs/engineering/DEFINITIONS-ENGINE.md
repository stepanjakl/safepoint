# Definitions engine

Status: current code guide for `lib/definitions/`, checked in October 2026. It is used by [Brunch orders](../processes/brunch-orders/PLAN.md). The earlier Brunch weekend engine it grew out of is [archived](../archive/BRUNCH-WEEKEND-ENGINE-GUIDE.md).

## Contract

A process supplies a `DefinitionProcess`: its ID and a `DefinitionSubject` with the records, lookups, typed columns, proposal fields and reader words. Brunch orders declares this in `lib/processes/brunch-orders/process.ts`; the engine does not hard-code products or orders. The current read joins Products, Stock, Sales and Deliveries by product key and looks up Parameters by category.

One definition has a name, the exact instructions text it interprets, a `check` or `number` result, optional check consequence, quoted constants and groups, a formula, and examples. A formula may read the current record, proposal fields and earlier definitions. `lib/definitions/types.ts` validates the saved set.

## From instructions to acceptance

1. The development read route loads a captured or live five-tab read and keeps it under an ID. `records.ts` reports missing tabs, bad keys and invalid typed cells.
2. `find.ts` identifies definitions from one instructions version. `draft.ts` starts a server-side draft and records progress; `write.ts` writes each definition in order.
3. `formulas.ts` type-checks and evaluates CEL. `checks.ts` tests the definition against its read, quoted constants and groups, dependencies and worked examples. The model's check tool uses these checks.
4. The person confirms the intent and accepts or denies each definition. `decide.ts` reruns the full review against the read before acceptance. A denial can carry a note for the next write.
5. `store.ts` reads saved sets through the schema and writes a temporary file before renaming it over the old set. Each instructions version has a folder, `fixtures/<process>/rulebooks/<version>-<instructions-hash>/`, found by the hash: `current.json` is the rulebook under review, and `<rulebook id>.json` is a revision: an accepted rulebook, written once and never again. The id is a fingerprint of what was accepted (`fingerprintOf`). `revisions.json` records each revision's parent, reason (`accepted` when the decision that completes the rulebook is made, `migrated` when a script rewrites it, `used` when a run first uses one never frozen), time and stored-shape version, and the head. Revisions are reached only through `putRevision`, `loadRevision`, `listRevisions` and `headOf`, so a database can replace the files without the engine changing.
6. `calculate.ts` works every accepted calculation out for every record, and has the model cross-check them; cross-checks are kept in `data/<process>/cross-checks/`.
7. `propose.ts` has the model propose values for every record, trying them against the accepted checks (`try_proposals`) before it submits. Code checks every proposed value again (`checkProposal`), verifies every cited cell, and keeps its own verdicts: ready, decide or blocked. Proposals are kept in `data/<process>/proposals/`; a person's decisions on them belong to the run. A check written "not in scope, or the rule" (its outermost `||` led by a negation that reads no proposal field) does not apply to a record out of scope: it holds, its working stops at the guard, and Propose says "Doesn't apply".
8. `fits.ts` type-checks a revision against the read it is used on, as Accept does, without the examples. A revision is kept as it was accepted, so one written before a column's type changed is refused on use, naming each definition that no longer fits, and the run is offered the current rules when they fit.

`app/api/dev/brunch-orders/rules/route.ts` exposes get, draft, intent, write and decide actions for this development flow; `calculate/route.ts` and `propose/route.ts` beside it do the same for those steps. None is a public process-definition API. The [development log](../processes/brunch-orders/DEVELOPMENT-LOG.md) records why its checks and approval boundary changed.

## Present limit

Nothing is written to a sheet: Apply previews what a decided proposal would write. The Brunch orders plan marks sheet write-back and history as later phases. A check sees one record at a time, and proposal fields are whole numbers. A stored accepted set and a captured read are not a durable production review record.
