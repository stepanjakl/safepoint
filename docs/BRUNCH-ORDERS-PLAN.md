# Brunch orders: plan

Status: agreed 8 October 2026. Phases 1 and 2 are built (8 October); each
later phase starts on its own go-ahead.

Audience: the product owner, and the engineer or agent building each phase.

## Why a second process

The Brunch weekend experiment (`docs/SHEET-PROCESS-PLAN.md`) asked a model to
write a whole rulebook from the sheet before any run could happen. It grew
complex for people and for the model alike: drafts varied from 6 to 15 of 16
owner checks on the same sheet, every fix added a check or a question, and the
product's actual purpose (proposing what to order) was never built.

Brunch orders starts again from that purpose and grows one step at a time,
each step working before the next begins. Brunch weekend stays as it is, for
reference; its engine (sheet reading, the CEL evaluator, per-rule working,
what-if values, drift checks) is reused where it fits.

## The shape

**Intent.** Propose how many units of each product to order for the coming
promotion weekend, so the store has enough for expected demand without waste.
The model proposes; code checks every proposal against the rules; a person
approves; only then is anything written.

**The sheet holds data only**: Products, Stock, Sales, Deliveries and
Parameters. Parameters are numbers the owner changes often (margin floors,
safety stock), so they stay in the sheet as data. An **Orders** tab is added
later as the one place the app writes, after approval. Policy, context and the
promotion's details are not in the sheet.

**The instructions hold everything else**, in the app, versioned like every
process's instructions: the intent, the promotion (when it runs, what it is
for), how expected demand is worked out, and the rules in plain words. The
model confirms the intent at the start of a run and asks if anything is
unclear.

**A run** reads the sheet once and every later step uses that read: one run,
one pinned read, one instructions version.

## Where the data is kept

The read is kept on the server under an id (gitignored), as Calculate already
does for live reads. The browser remembers only the run itself (its id, the
instructions version it started under, the read's id and how far it got) in
`localStorage`, so a reload finds it again.

Not the whole read in `localStorage`: the read is the run's evidence, and
later steps that run on the server (calculating, proposing, checking) need the
same copy. Keeping it there also means one copy, not one per browser, and
nothing lost when a browser's storage is cleared. Runs move to the database
with the history work (phase 8).

## Phases

Each phase ends when it works on the captured read and its page test passes.

| Phase                          | What it adds                                                                                                                                                                                                                                                        | Done when                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Instructions and reading    | The process in the sidebar; the Instructions tab with v1 (below); a run started by hand that shows the instructions it runs under, then waits for a person to read the sheet; a simple JSON viewer for the read, in the drawer.                                     | A run can be started, read the sheet (captured or live), show the data, and survive a reload. |
| 2. Rules from the instructions | The model lists the rules it finds in the instructions, in plain words, and confirms the intent. Each rule is turned into a formula on its own and approved on its own, against two or three worked examples written in the instructions. Four rules to begin with. | Each of the four rules is approved and passes its examples.                                   |
| 3. Calculate                   | The values the instructions define, worked out by code for every product: expected demand, stock available before the start, what is required.                                                                                                                      | Every product's values match a hand calculation.                                              |
| 4. Propose                     | The model proposes an order for every product, given those values: a quantity, the reason in plain words, the cells it relied on and anything it is unsure of. Every product is answered exactly once.                                                              | A proposal covers every product and cites only real cells.                                    |
| 5. Check                       | The approved rules run on the proposal, item by item, with the working shown and what-if values to try others.                                                                                                                                                      | Each rule's outcome on each product can be read and explained.                                |
| 6. Review                      | Approve, change within what the rules allow, or reject each product; a summary of what will be ordered.                                                                                                                                                             | A person can decide every product from the keyboard.                                          |
| 7. Apply                       | Approved orders written to the Orders tab, read back to confirm, and undoable while untouched.                                                                                                                                                                      | An approved run's orders are in the sheet and verified.                                       |
| 8. History and learning        | Runs, reads and decisions kept in the database; repeated edits in the same direction become suggested changes to the instructions, approved like any version.                                                                                                       | A suggestion cites the decisions that prompted it.                                            |
| 9. Wider scope                 | One at a time, each with its own rules and examples: offer prices, the avocado toast kit, ripe-stock cover.                                                                                                                                                         | Each addition passes its examples without breaking the others.                                |

## Phase 1 in detail

**Process.** "Brunch orders" in the sidebar, development only, at
`/examples/brunch-orders`. The spreadsheet was cleaned on 8 October to its
data tabs: Products, Stock, Sales, Deliveries and Parameters (About, Promotion,
Kit, Offers, Rules, Notes and Checks were deleted, and the kit's row of
Parameters cleared; a copy of the sheet before is kept outside the repository).
Its captured read is `fixtures/brunch-orders/sheet-snapshot.json`, saved with
the read route's `capture` action.

**Instructions tab.** The shared instructions panel. v1 was the first
draft; v2 says the same in plain words, with the kit described there now that
its tab is gone:

> **What this is for.** Each week, suggest how many of each product to order
> for the coming Brunch weekend, so we have enough for what we expect to sell
> without overstocking. A person checks and approves every order before it is
> placed.
>
> **The promotion.** Brunch weekend runs every Saturday from 07:00 to Sunday
> 22:00. The idea is to make avocado toast at home easy. We sell an avocado
> toast kit (a sourdough loaf, a pack of ripe avocados and a pack of feta), and
> eggs, cherry tomatoes and rocket are on offer. Ripe avocados don't keep, so
> don't order more than we'll sell.
>
> **How much we expect to sell.** Start from each product's average over the
> last four weekends. Products on offer sell about 40% more, the kit's
> ingredients about 10% more, and everything else about 15% more. We expect to
> sell about 40 kits, and each one uses a loaf, a pack of avocados and a pack
> of feta on top of their own sales. Round up to whole units.
>
> **Rules.**
>
> 1. Order in whole cases.
> 2. Never order more than the supplier can deliver.
> 3. Only order what arrives before Saturday's opening.
> 4. Aim for enough stock to cover expected sales plus the category's safety
>    margin. If that isn't possible, flag it for a person to decide.

**A run, step by step.**

1. **Start.** Started by hand from the runs header. It records the
   instructions version it runs under.
2. **Instructions.** The full text of that version, as the run's request.
3. **Read the sheet.** Waits for a person: the captured read (no network) or
   the live sheet. Shows the data tabs read and their row counts, and a
   **View data** button that opens the drawer.
4. **The data, in the drawer.** One tab at a time, chosen from a list, as
   formatted JSON: headers and rows exactly as read. Nothing more.
5. Later steps (rules, calculate, propose, check, review, apply) are listed as
   not started, each saying which phase brings it.

**Not in phase 1.** No model calls, no rules, no calculation.

**Checks.** A page test: start a run, read the captured sheet, open the data
and close it from the keyboard, reload and find the run where it was; an
accessibility scan of the thread and the drawer.

**Built.** `lib/processes/brunch-orders/` (the process, its v1 instructions and
the kept reads), `components/brunch-orders/` (the run's thread and the data
drawer), `app/api/dev/brunch-orders/read/` and
`app/(shell)/examples/brunch-orders/`. A live run is a shell feature any
process can use: `liveThread` on `ProcessView`, kept by
`components/app-shell/runs/live-runs-store.ts`. Page test:
`e2e/brunch-orders.spec.ts`.

## Phase 2, as built

Two changes from the table above, both to keep the reviewer's work concrete:

- **Examples come from the data, not the instructions.** For each rule or
  value, the model writes the formula and two or three examples on real
  products, worked out by hand ("FT-200, ordering 43: not a whole case of
  12"). Code runs the formula on each; where they disagree the model is told
  and tries again, up to three times. The person then marks each example right
  or wrong and approves. A person checks cases, never formulas.
- **The values the rules need are written here too**, since rule 4 reads
  expected sales. Rewriting a value withdraws approval from every rule.

How it works:

1. **Find** (Flash-Lite): the intent in one sentence, the rules in the
   instructions' own words (each blocking, or for a person to decide), and the
   values they need. The person confirms the intent.
2. **Write** (Flash first, falling back to Flash-Lite): a standard CEL formula
   per item over one product's record (its row from every data tab, joined),
   its category's parameters, the proposed `order` and earlier `values`.
   The prompt forbids conditions, products or numbers the instructions do not
   state; the first Flash-Lite attempt had added two to make its examples
   agree.
3. **Accept or deny**: one decision per item, with its examples as the
   evidence. Accept is available once every example agrees with the formula;
   a denial takes an optional note of what is wrong, which goes to the model
   when it writes again. Marking every example separately (twenty clicks for
   v2) was tried first and dropped as more than five small rules need.

Everything the model wrote (its reading of the intent and of each rule, each
example's claim and reasoning, the formula) carries a blue bar and a ✦ mark;
products (shown as `SD-01 [Sourdough loaf 800g]`) and the app's own checks do
not.

Kept per instructions text in `fixtures/brunch-orders/rules/<hash>.json`
(commit it to keep it), so every run under the same instructions uses the same
approved rules, and a new version starts afresh. Code:
`lib/processes/brunch-orders/formulas.ts` and `rules.ts`,
`app/api/dev/brunch-orders/rules/`, `components/brunch-orders/rules-step.tsx`.
Tests: `lib/processes/brunch-orders/formulas.test.ts`,
`e2e/brunch-orders-rules.spec.ts` (read-only: no model calls; it checks that
focus moves into a denial's note and back).

First results on v2 (Flash): expected sales and all four rules written with
every example agreeing, e.g. sourdough needs 73 expected, 81 with its safety
margin; eggs need 31 and have 38.
