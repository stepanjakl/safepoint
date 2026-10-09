# Brunch weekend experiment

Status: retained development example, checked against `lib/processes/avocado-toast/` and `lib/rulebook/` in October 2026. Brunch orders is the [active hand-off](../brunch-orders/PLAN.md).

Brunch weekend is the development-only `/examples/avocado-toast` process. It reads a captured or live Google Sheet through Composio, keeps a read for a run, and experiments with drafting a whole rulebook from sheet data and policy. `lib/rulebook/` validates and evaluates that rulebook with CEL. Its setup and evaluation tools live under `app/api/dev/brunch/`.

The [engine guide](RULEBOOK-ENGINE-GUIDE.md) explains its code and the [walkthroughs](RULEBOOK-ENGINE-WALKTHROUGHS.md) explain recorded drafts. The [development log](../../archive/RULEBOOK-DEVELOPMENT-LOG.md) and [drafting study](../../archive/2026-10-07-drafting-study.md) are dated evidence.

The [original sheet process plan](../../archive/SHEET-PROCESS-PLAN.md) is preserved for its decisions and trial design. Its appendix describes the older sheet, including tabs removed from the later Brunch orders data read. Do not use that appendix as the current Brunch orders data contract; its source is `lib/processes/brunch-orders/process.ts` and `fixtures/brunch-orders/sheet-snapshot.json`.
