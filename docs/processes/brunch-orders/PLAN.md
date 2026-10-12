# Brunch orders: plan

Status: active implementation hand-off, agreed 8 October 2026. Phases 1, 2,
the Phase 2b definitions-engine work and Phase 3 (Calculate) are built; later
phases remain planned.

Audience: the product owner, and the engineer or agent building each phase.
What building it taught, and what is still open, is logged in
[`DEVELOPMENT-LOG.md`](DEVELOPMENT-LOG.md).

## Why a second process

The Brunch weekend experiment (`docs/archive/SHEET-PROCESS-PLAN.md`) asked a model to
write a whole rulebook from the sheet before any run could happen. It grew
complex for people and for the model alike: drafts varied from 6 to 15 of 16
owner checks on the same sheet, every fix added a check or a question, and the
product's actual purpose (proposing what to order) was never built.

Brunch orders starts again from that purpose and grows one step at a time,
each step working before the next begins. Brunch weekend stays as it is, for
reference; its engine (sheet reading, the CEL evaluator, per-rule working,
what-if values, drift checks) is reused where it fits.

## Direction review, 9 October

The [direction review](DIRECTION-REVIEW.md) records concerns about drafting
becoming the critical path, and the revised assessment after feedback. Its
proposed next step is to correct and independently check the existing
definitions, freeze that set for the experiment, then build Calculate and
Propose before further drafting generalisation. Check, Review and Apply remain
the later phases below; no accepted set or completed phase is implied here.

Keep the evidence separate: a useful run on corrected definitions would test
execution and product value, while the reliability and cost of producing those
definitions remain an authoring question. The review gives the proposed
acceptance evidence and unresolved questions without changing historical phase
descriptions below.

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

Kept per instructions version in
`fixtures/brunch-orders/rulebooks/<version>-<hash>/current.json` (commit it to
keep it), so every run under the same instructions uses the same approved
rules, and a new version starts afresh. Code: the engine in
`lib/definitions/` (see [The engine, as built](#the-engine-as-built)),
`app/api/dev/brunch-orders/rules/`, `components/brunch-orders/rules-step.tsx`.
Tests: `lib/definitions/*.test.ts`, and `e2e/brunch-orders-rules.spec.ts`
(read-only: no model calls; it checks that focus moves into a denial's note
and back).

First results on v2 (Flash): expected sales and all four rules written with
every example agreeing, e.g. sourdough needs 73 expected, 81 with its safety
margin; eggs need 31 and have 38.

## Phase 2b: one kind of definition

Agreed 8 October, after phase 2. Phase 2 drew a value and a rule as two
kinds, each with its own prompt, schema and wording, and its formulas hid what
a person is meant to check. Expected sales came back as
`sku in ["SD-01", "AV-RR", "FT-200"] ? (11 * (…) + 1639) / 40 : …`: the
numbers are the instructions', but folded past reading, and the products on
offer are the model's reading of "eggs, cherry tomatoes and rocket", fixed in
the formula where nobody confirms it and a new product goes wrong in silence.

**One definition.** Everything found in the instructions is a definition: a
name, the instructions' words, a formula over one record, and examples. What
differs is data, not type:

- **Result**: `check` (true when it holds) or `number`. More types are added
  as a value of this field, never as a second kind.
- **Consequence**: checks only; what failing it does, `block` or `decide`.
- **Constants**: every number the formula uses, each with the words of the
  instructions it comes from. The app refuses a constant whose words are not
  in the instructions, and a formula with any other number in it (0, 1 and
  100 aside).
- **Groups**: records the instructions name in plain words, matched to keys
  ("on offer: EG-06, CT-250, RK-60", from "eggs, cherry tomatoes and rocket
  are on offer"), each with its words. The app refuses a key that is not in
  the read.
- **Uses**: the definitions its formula reads (`values.<id>`), worked out
  from the formula. Rewriting one withdraws approval from those that use it,
  and nothing else.
- **Examples**: a record's key, the proposal's fields where the formula reads
  them (named, such as `order`), what should come out, and why.

The formula reads them by name, `constants.<id>` and `groups.<id>`, and has
`ceil`, `floor` and `round`, so it reads as the instructions do:
`ceil(average * (1 + uplift / 100)) + (sku in groups.kit ? constants.kits : 0)`.
They take doubles only: whole-number division has already dropped its
remainder, so `ceil(253 / 10)` would give 25; refused, it fails with a reason
the model is told. The app also refuses a key or category written into the
formula in quotes (`sku == "SD-01"`): records the instructions name are a
group.

**What drafting holds to.** Kept independent of any scenario, and ported
where the Brunch weekend drafter already had it:

- **Finding** is shown the read's columns. Each quantity the instructions
  explain how to work out is its own definition, read by name; a value the
  data holds is read as it is, and one step of a working is not a definition.
- **Writing is one conversation that checks itself.** The model answers only
  through `check_definition`, which runs every check the app holds a draft to
  and returns each problem; `try_formula` runs a formula on one real record.
  It ends on a clean check, when the same problems come back three times, or
  at twelve steps. A disagreeing example comes back as "you worked out X, the
  formula gives Y": the model corrects whichever is wrong.
- **Quotes must support what they claim.** A constant's words must state its
  number (digits, a percentage, a time, a day, a number in words); a group's
  words must name each member, matched to the record's name in the data; and
  examples must try every group the formula reads from inside and outside.
- **A formula is type-checked before it runs**, against exactly what it may
  read: `key`, `record` and each lookup typed from the read's columns, the
  proposal's fields, earlier definitions as int, double or bool (as run on the
  first record), its constants and groups. A misspelt name or field, mixed
  int and double, the wrong kind of result, or a formula past 300 nodes is
  refused with the fix named.
- **A definition that does not work yet** is named as not to be read; a draft
  that reads it anyway stops the write at once, while definitions that do not
  read it are still written.
- **What is kept** is the latest draft that ran, with its own problem; when
  none ran, the version before stays and the problem says so.

Not ported: the stronger-model hand-over (offering to continue a stuck draft
on the strongest family), and the condition-by-condition working, which
belongs to the Check step (phase 5).

**Drafting again.** For testing, the Rules step drafts a new rulebook from
the sheet as the run read it, with a chosen model (falling back within its
family): after a confirmation, the server finds the definitions again,
replacing the kept set and its acceptances, then writes each in order, and
the page asks every two seconds how far it has got, so closing it does not
stop the draft. The browser test
reads a frozen copy (`e2e/fixtures/brunch-orders-rules.json`), so a new draft
does not change what it checks.

**The subject is the process's.** What a record is called and what a
proposal sets are declared in `process.ts` (`SUBJECT`); the prompts, and in
step 3 the screen, use those words, so nothing in the engine or the card says
"product" or "order" itself.

**Steps.** 1, the engine and its stored shape (now `lib/definitions/`, the
kept fixture migrated by script); 2, the subject's words
through the prompts and the card; 3, the card: header with what it gives,
what it says, what it was taken from (constants and groups), how it was tried
(one row per example), how it is worked out (the formula, closed), and the
decision.

**The data shape is the process's too.** How a read becomes records is
declared beside `SUBJECT` (`DataShape` in `lib/process/model.ts`): the tabs
that hold a record's columns and the key that joins them, the column that names
a record, each table a record reaches (here Parameters, through `category`),
and the columns read as a type other than as written. A formula reads `key`,
`record` and each lookup by its declared name, never a scenario's word. A
weekday column is read as 1 (Monday) to 7 and a time of day as minutes after
midnight, so a formula compares plain numbers with constants quoted from the
instructions ("07:00" is 420), and the helper for day names is gone. The kept
rulebook was converted once to these names; its examples still agree.

## The engine, as built

After the review of 8 October the engine moved out of Brunch orders into
`lib/definitions/`, one module per job, each taking the process
(`DefinitionProcess`: its id and `SUBJECT`) rather than assuming it:

| Module                | Does                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`            | The stored shape as a Zod schema, and `acceptable`; safe for the browser                                                         |
| `store.ts`            | Kept sets per instructions hash; a file that does not fit is an error, never "nothing kept"; saves are written whole and renamed |
| `records.ts`          | A read as records, per the declared `DataShape`, built once per read; every mismatch reported by its cell                        |
| `formulas.ts`         | Running a formula, the typed check before it runs, and the guide the model gets                                                  |
| `calls.ts`            | Every model call: the chain within one family, quota remembered, no blind retries                                                |
| `checks.ts`           | One review of a definition, used both by the model's check tool and by Accept                                                    |
| `find.ts`, `write.ts` | Finding the definitions, and the self-checking conversation that writes one                                                      |
| `decide.ts`           | Confirming the intent; accepting (rechecked in full against its read) or denying                                                 |
| `draft.ts`            | A whole draft as a server-side job with its progress                                                                             |
| `calculate.ts`        | Every accepted calculation for every record; the model's independent cross-check, kept by read and rulebook                      |

Brunch orders keeps only what is its own: `process.ts` (the instructions,
steps, `SUBJECT` with its `DataShape`) and `reads.ts` (reading its sheet).
A read that does not fit the declaration is shown in the Read step and is
not drafted on.

## Phase 3, as built

Agreed with the owner on 9 October, after every definition was accepted.

- **The engine is the record.** Calculate runs every accepted calculation
  for every record of the run's read (`calculate` in
  `lib/definitions/calculate.ts`); later steps use these values. Each value
  carries its working, built as the examples' working is. Calculate refuses
  while a calculation is unaccepted.
- **The model cross-checks it.** On request, the model works the same values
  out from the instructions, the raw data and each value's plain words. It
  never sees a formula, so a formula that reads the instructions one way and
  the model another shows as a disagreement. That is the failure determinism
  cannot catch (see the direction review). Its answer must cover every
  record and value exactly once. Values agree when equal to two decimal
  places. Nothing is settled automatically: the step stays in attention until
  every value agrees. The answer is kept in `data/brunch-orders/cross-checks/`
  by read and rulebook, because it costs a call.
- **The rulebook a run used.** A fingerprint of the accepted definitions
  is the rulebook's id. The first time a run calculates on a rulebook it is
  kept beside the current one (`<id>.json`) and never written again; the run
  keeps the id and goes on calculating, and cross-checking, on exactly those
  formulas. When the current rulebook has moved on, the step says so and
  offers to calculate on it instead.
- **Only what is defined is shown.** Stock available before the start is
  still written inline in two checks. It appears in Calculate once the
  instructions define it.
- **Two process tabs.** Rules shows the accepted rulebook for the current
  instructions, read-only; drafting and decisions stay in a run's Rules step.
  Inputs lists the sheet's tabs as the selected run read them and opens each
  in the data drawer. Both are panels the page supplies (`rulesPanel`,
  `inputsPanel` on `ProcessView`); other processes are unchanged.
