# Rulebook engine: development log

> **Status: historical record (archived 9 October 2026).** Original status labels, paths and future-tense plans below describe the work at the time. Use the [documentation index](../README.md) and current code for present behaviour.

A record of the technical challenges and major issues met while building the
model-drafted rulebook engine for the Brunch weekend process
([`SHEET-PROCESS-PLAN.md`](SHEET-PROCESS-PLAN.md)), 3 to 7 October 2026: what
happened, why, what changed and what it bought. Numbers come from live drafts
against the real sheet, saved in `.rulebook-drafts/` and AI SDK DevTools.

How the code works now is in
[`RULEBOOK-ENGINE-GUIDE.md`](../processes/brunch-weekend/RULEBOOK-ENGINE-GUIDE.md). Add an entry here when
something non-obvious goes wrong; keep it short and measured.

## Results at a glance

| What                                  | Before                                  | After                                      |
| ------------------------------------- | --------------------------------------- | ------------------------------------------ |
| First drafts on a light model         | None usable: stuck in stage 1, or empty | Every stage passing on its first attempt   |
| Policy statements made into rules     | 0 of 13 (all filed "not ruled")         | 13 of 13, the kit included                 |
| Inventory stage, input tokens         | 117,111 for 8 checks                    | 48,454 for 7 checks (−59%)                 |
| Rules stage, request resent each step | 33,600 characters                       | 15,100 characters (−55%)                   |
| Rules stage, input tokens per check   | ~14,500                                 | ~10,500 (−28%)                             |
| Spent on one unmet need               | ~355,000 tokens (30 checks)             | ends after 3 checks with the same problems |
| Attempts lost to a busy model service | 3 of 3 in 27 s                          | none: retried, then the next model         |
| Typical successful draft (Flash-Lite) | —                                       | 1 m 49 s, ~223,000 input tokens            |

## Connecting to the sheet

**The obvious connectors were not available.** The Google Sheets connector was a developer preview not enabled for the account, and the account's direct Google API access was restricted. The sheet was created by uploading a file to Drive, and everything since goes through Composio's Google Sheets toolkit, pinned to version `20261001_00` so a release cannot change a
response's shape underneath the code.

**Composio needs the developer key.** A consumer key (`ck_…`) was rejected; the
developer key (`ak_…`) works. Worth stating in setup notes, because the error
does not say so.

**A tab called "Kit" was read as a cell reference.** `Kit!A1` style ranges with
a bare tab name were rejected because "Kit" looks like a column reference. Every
range is now quoted: `'Kit'!A1:…`.

**A fixed range dropped data silently.** Tabs were read as `A1:Z500`: column AA
or row 501 would simply vanish. The reader now asks Google for each tab's real
grid (`gridProperties`) and requests exactly that, such as `'Changes'!A1:J100`.

**Long tabs and the model.** Sending every row of every tab does not scale; the first version cut tabs at 80 rows and said only how many it left out. A tab over 150
rows now goes as its first 40 rows plus a profile of every column over all rows
(filled and blank counts, whole numbers or not, smallest, largest, examples),
which is what the model needs to choose a type and decide `required`.

## Choosing and using CEL

**Library.** Two JavaScript CEL implementations were trialled on a subset of the
official conformance suite and on the sheet's rules: `@marcbachmann/cel-js`
(chosen: typed environment, `check()` before running, zero dependencies) and
`@bufbuild/cel` (kept as a cross-check during the trial). Record:
[`archive/2026-10-03-cel-spike.md`](2026-10-03-cel-spike.md).

**Library quirks that mattered.**

- Integers come back as `BigInt`; money and counts are passed in as `BigInt`
  too, and the UI has to print them (`jsonWithBigInts`).
- `has()` works on a field of a variable (`has(row.fee)`, `has(change.fee)`) but not after a lookup (`has(offers[key].price)` is "has() invalid argument"), which is the form models write. Our first explanation, and the hint sent to the model, said it only worked on facts and change; testing each form while writing the guide showed otherwise, and the hint now says exactly where it works and what to write instead (`offers[key].?price.hasValue()`).
- A blank cell must be **absent**, not null: CEL rejects `int != null`. Models
  write `!= null` constantly, so the error now comes with the standard fix
  (`HINTS` in `engine.ts`).

**Floating point is a correctness issue, not a detail.** In doubles
`50 × 1.1 = 55.00000000000001`, so "round up to cover demand" orders 56 instead
of 55. Money and counts are whole numbers (minor units), and percentage limits
are compared by cross-multiplying. An earlier version of the plan used a wrong
example (20 × 1.4); it was checked and corrected everywhere.

**Standard CEL cannot total a list.** There is no `sum`, `fold` or `reduce`, so
"the kit's cost is the sum of its components" could not be written for a kit of
any size, and the model kept inventing `.fold(...)`. Writing our own function
was ruled out; no JavaScript package provides Kubernetes' list library, so its
`sum()` was adopted exactly as Kubernetes defines it, pinned to a source commit
and tested against the examples in that source (`kubernetes-lists.ts`).
`min()` and `max()` were left out because standard CEL can already express them.

## Time

**Wall-clock times across clock changes.** "Thursday 12:00, Europe/London" is a
different UTC instant in summer and winter, and a week with a clock change has
167 or 169 hours. `zonedInstant` resolves a wall-clock time with two passes of
the zone offset, and both change dates are pinned in `cycle.test.ts`.

**Two kinds of time.** A stock count already happened (resolve to its latest
occurrence before the run); an order cut-off is planned (resolve inside the
week being planned). Mixing them up gives answers that are right on some days
and wrong on others, which is why run times are chosen on the page.

**Timing belongs to the rulebook, not the code.** The first engine had the
weekly promotion cycle written in code (`planCycles`). It was scenario-specific,
so it became data the model drafts (`timing` in the rulebook) and the code was
deleted.

## Drafting: from nothing working to every stage passing first time

This is the longest story, in order.

### 1. A busy service used up every attempt

The first real draft with Gemini 3.7 Flash ended in 27 seconds: three attempts,
three "This model is currently experiencing high demand" replies. Retries were
off (`maxRetries: 0`) and a service failure counted as a failed attempt.
**Fix:** the SDK retries with backoff; a service failure never costs an attempt;
and if it persists, the draft stops and says so.

### 2. The model repeated itself because the feedback did not help

On Flash-Lite, attempts 2 and 3 were the same 5,374-token answer. Two problems,
`Parameters!E6: Required, but the cell is blank.` and `Must name one of the
deadline times.`, said what was wrong but not what to do. **Fix:** every
validator message now names the cell, the field and the exact change
("Set required: false if a blank is valid here (a short row means its last
cells are blank)…"), and retries continue the conversation: the model's answer
as its own turn, then the problems. The next draft passed stage 1 on its second
attempt by doing exactly what the message said.

### 3. An empty rulebook passed every check

The first draft to "pass" had 0 rules, 0 editable values and 0 facts: all 13
policy statements were filed as "not ruled", for reasons like "requires
calculations". The checks only tested what was present. **Fix:** coverage
checks (every data tab bound, every weekday column made a time, at least one
rule and one editable value) and an instruction that needing a calculation is
never a reason. The next draft had 11 rules.

### 4. Passing the checks is not being right

Scored against the owner's checks (expected outcomes the model never sees),
that 11-rule draft passed 7 of 16; the next, 10 of 16. The kit was missing
entirely: never declared as a kind of item, so its rules were "not ruled".
**Fix:** a first **inventory** stage that lists every policy statement, kind of item and changeable value before anything is built, and checks that the later stages cover it. The model then wrote kit rules, which failed only because CEL cannot total a list; with Kubernetes' `sum()` added, the next draft had the kit, all 13 statements as rules and 10 of 16 owner checks, in 74 seconds. Draft quality still varies (4 to
10 of 16 across later drafts), which is why the owner's checks are shown with
every draft.

### 5. One field name cost three attempts

A data model was valid except `items[0].table: "Products"` (the tab) instead of
`"products"` (the table). The SDK reported only "response did not match
schema", the model was told "your answer could not be read", and it sent the
same 14,460-character answer three times. **Fix:** the answer is checked against
the schema by our code, and each broken field goes back with what was found
("must be a lower_snake_case name. Found "Products"."). The field's
description now says "the name you gave the table, never the tab".

### 6. The model would not use its checking tool

The check tools let a model test a draft before submitting, but Flash-Lite
almost never called them, so every mistake cost a whole attempt. **Fix:** each
stage's first step is forced to call its check tool, and the model must keep
fixing and checking until a check is clean.

**Then Gemini refused it.** A forced tool call combined with a JSON response
format is rejected with HTTP 400 ("Forced function calling (ANY mode) with a
response mime type: 'application/json' is unsupported"). Mock tests could not
have found this. **Fix:** no JSON response format at all; the check tool is the
way an answer is submitted, and its input schema already enforces the shape.
Result: every stage passed on its first attempt, with 2, 3 and 10 checks.

### 7. Costs grew faster than the number of checks

A draft that checked more failed on Google's free-tier per-minute limit:
~228,000 input tokens in 4½ minutes, the inventory alone 117,111 tokens for 8
checks, because every step resent every earlier draft. **Fixes:**

- each step sends only the request and the latest check onwards
  (`latestCheckOnly`); between attempts, only the latest answer and its
  problems: inventory 117,111 → 48,454 tokens;
- the rules stage sends each fact once (one field list instead of the full data
  model plus a copy per kind; policy tabs only): request 33,600 → 15,100
  characters, ~14,500 → ~10,500 tokens per check;
- a per-minute limit with a retry delay is waited out on the same model, from
  the last checked draft; the limit is named in the message.

### 8. Two checks contradicted each other

The inventory may say a statement needs `order_units` from the Changes tab,
where it is a **row** (a value in the first column), and the inventory check
accepted that. The data-model check only accepted column headers, so the model
was asked for something impossible: 30 checks across three attempts on the same unmet need, ~355,000 input tokens. **Fixes:** a row of a keyed table counts (formulas read it
as `changes['order_units']`), and an attempt ends after three checks in a row
with the same problems. Lesson: when two validators judge the same thing, test
them against each other.

### 9. A percentage that was not

The model typed `margin_floor_pct` (holding `30`) as `percent`, which reads a
percentage cell's fraction: 30 would mean 3,000%. **Fix:** a percent column of
whole numbers above 1 is flagged as percentage points, in any sheet.

### 10. Well formed, and wrong

A Flash-Lite draft passed every drafting check and scored 4 of 16 owner checks.
Reading the record showed every kit check blocked by the margin rule, whatever
the price: it looked up `parameters['Kit']`, while the sheet's category is
`kit`. The lookup type-checks and is simply always false. Neither the type
checker, the validators nor the model's own `try_formula` calls caught it; the
owner's checks did, which is why they are run on every draft before approval.
A deterministic check that literal keys used on keyed tables exist in the data
would catch this class of mistake; it is listed under the guide's known limits.

### 11. Approved, and mostly blocked

Rulebook v1 was approved, and 8 of its 12 items came out blocked, none of them
by policy. Its offer price started from `offers[key].brief_offer_price`, which
is blank for 8 products; reading a blank cell fails, the offer-price rules for
those products could not be evaluated, and an error blocks. Every formula
type-checked: whether a cell is blank only shows on the data. **Fix:** a dry run
inside the rules check evaluates the whole draft on the snapshot and reports
the cause once, with the items affected (the 24 rule errors that only followed
from it are left out), and a literal-key check catches lookups such as
`parameters['Kit']`.

The first fix the model chose, following our hint, was `orValue(0)`: an offer
price of 0 for products without an offer, which the margin rule then blocked.
It ran cleanly and meant the wrong thing. The hint now gives the fix that fits
where the error is: narrow `applies_when` for a value that does not exist, give
a rule reading it `when: has(change.x)`, and never use a placeholder default.
The next drafts did exactly that.

### 12. The engine offered what did not exist

A draft listed its kinds as kit, then product, so the kit is evaluated first,
yet the environment offered the kit `product_facts`. The model, finding them
unusable, asked for a data-model change that could not help, and the revision
(by another model after a fallback) dropped times the first data model had.
**Fixes:** a kind is offered only the facts of kinds listed before it, with a
hint to reorder when it needs a later one; and a revised data model must keep
every table, column and time the requests did not ask to change.

### 13. Mistakes that run cleanly, and a sheet that did not say

v2 had no errors and passed 8 of 16 owner checks. The failures had four causes:
cut-off rules compared deadlines with the sheet's _scheduled_ run time instead of
`run_at`; a stock count's age was taken backwards (`counted_at - run_at`, never
positive); the kit's price rule named one product (`products['AV-LS']`); and
expected demand summed four weekends instead of averaging them. The last was
the sheet's fault: nothing in it defined expected demand, while the owner's
checks assumed a definition. **Fixes:** instructions on `run_at`, ages and
definitions; two checks that read the formulas (a backwards age, a named
item); facts may now implement a policy statement, so a definition is covered
by a fact; and the owner added the definition to the sheet (Rules!A15). The
next draft fixed all four and passed 10 of 16. Lesson: owner checks can encode
knowledge the sheet does not state; when a check fails in every draft, ask
whether the sheet says what the check assumes.

### 14. The first drafting study

Eight Flash-Lite drafts of the same sheet: 7 passed every check, scoring 8 to 15
of 16 owner checks (median 11). The checks that fail in most drafts trace to
three things the sheet never defines (the kit's regular price, what a component
can supply, how ripe-stock cover is counted), plus a column compared with a
value it never holds. The Flash family could not be measured: overloaded,
slow, cut off at the output limit by its own hidden reasoning, and then limited
to 20 requests per model per day, about one draft. Record:
[`archive/2026-10-07-drafting-study.md`](2026-10-07-drafting-study.md).

### 15. Gaps in the policy: surface them, do not fill them

The study's systematic failures came from policy the sheet does not state, and
adding definitions until drafts matched the owner's checks would only teach to
the test. Instead the model now says where it filled a gap: every rule or fact
may carry `assumes`, and the inventory may list open questions. The owner
confirms or corrects them on the page, and each answer is kept as an owner
decision in the app, not written to the sheet (an input the app only reads),
given to later drafts as policy, and marked stale if its statement's text
changes. In the first live draft the model asked no questions but stated an
assumption on every rule, and those showed exactly the known gaps, among them
"count age is measured against the scheduled run time", which a reviewer can
now see and correct.

### 16. Which rules need an assumption

Left to itself, the model put an assumption on every rule, many of them
restating the rule. An assumption belongs only where a formula makes a choice
its statement's text does not, and three such choices can be found in code: an
input the statement does not point to, a number the text does not give, and a
default for a blank cell. Measured on v3 and a later draft, the first trigger
was mostly noise (it judged formulas against the model's own, sparse list of
what each statement needs: 7 false issues on v3) and missed the case it was
meant for, so it was dropped; the Check step shows what each rule read
instead. The other two flag exactly the known gaps: R7's "2" (a weekend as two
days, which the sheet never says), a "7" in another draft's R7, and margin
floors defaulted for blank cells. A product of numbers the text gives (four
weekends times 100) counts as arithmetic, not a choice.

### 17. Answering assumptions without writing

Answering each assumption in the owner's own words was work, and a plain
reject told the next draft only what the policy is not. Asking the model for
"the correct answer" was rejected: an assumption exists because the sheet does
not say, so a second call can only guess again, and saving that guess as a
decision would make a model guess into policy with no person choosing it.
Instead each assumption carries one to three alternative readings, given in
the same draft at no extra cost; the owner confirms, picks one, or says none
fits (optionally writing the right one). Open questions, which no draft ever
used, were removed. A check now also requires a rule's `sheet_rule` to be the
id of the statement it implements: one draft scored 3 of 16 partly because
rules carried each other's ids, so owner checks were judged against the wrong
rules.

### 18. What may change is the app's to decide

To spare the model guessing which values a proposal may change, a Changes tab
had been added to the sheet. But that list is the agent's write authority, the
product's core safety boundary, and the sheet is an input anyone with access
can edit: one added row would quietly widen what the agent may propose. The
list moved into the process definition in the app (`BRUNCH_MAY_CHANGE`), the
model is given it as `may_change` and maps each value onto the sheet, a
rulebook that adds or leaves out a value is refused, and the tab was removed.
The first draft afterwards copied starting values as fixed numbers from single
cells (every product's order starting at 72, the bakery's supplier maximum;
every offer at the eggs' price); a check now refuses a fixed start other than
0, and the next draft read each item's own value.

### 19. Assumptions the owner can read

Assumptions came back in the formula's terms ("Assumes product_facts uses
.?order_units.orValue(0)"), because a check required the sentence to name the
number or field it explains: that is how the check knows which choice the
sentence covers. A store owner cannot answer that. Each assumption now has two
parts: `assumption` and `alternatives` in everyday words, which the owner
reads and answers, and `technical`, the field, number or formula part, which
the check reads and the page shows muted beneath. Asking for plain words was
not left to the prompt: a check refuses owner-facing text holding names joined
by underscores, dotted paths, brackets, code operators or `orValue`, naming
what it found. The first plain draft then offered rewordings as alternatives
("Missing stock counts as zero" against "Treat missing stock as zero"), which
exact-text comparison missed; an alternative whose words all appear in its
assumption, filler words aside, is now refused as no real choice. A draft on
the fallback model then failed for another reason: its rules stage asked for
`expected_kits` and `safety_pct`, both already bound, so the revision round
rightly changed nothing and the requests stayed open. A request naming a
column the data model already has is now sent back within the attempt, with
how to read it.

### 20. Rules that pass because nothing is asked of them

The Check step showed R5 ("anything we order must arrive before the promotion
starts") passing for every product, settled by `change.order_units == 0`:
before any proposal every order is its starting value, 0, so the delivery time
was never read. A what-if field per item now reruns the rules with a typed
value, and an order of 12 shows R5 comparing the delivery with the start.

The same rule hid a real gap. It applies only `if key in deliveries`, so a
product with no row in Deliveries passes silently. That, and a rule testing
whether an optional cell is blank, is a decision the sheet does not make, so
both now need an assumption. Asked per rule, the missing-row question flagged 9
of v3's 11 rules with the same few questions; it is now asked once per table,
of the first rule relying on it, which left 6 rules and 8 questions on v3.

### 21. An approved rulebook drifts

Rulebook v3 was approved on 7 October and scored 6 of 16 owner checks a day
later, without a line of it changing. Re-validated against the current sheet
and checks, it:

- cites the Changes tab, since deleted (as the source of its four changeable
  values);
- cites the demand definition D1 at Rules!B15, no longer in the sheet;
- labels rules R10 to R13 with the next statement's id (R11 to R14), so the
  Check step showed the wrong ids and four owner checks were judged against
  the wrong rule;
- models the kit as one item per component (keyed by component_sku), so there
  is no KIT-01 item and the three kit checks cannot run.

Approval records what a person accepted at the time; it does not keep a
rulebook true. The sheet moves under it, and checks added since would refuse
it. A run should say so, rather than evaluate a rulebook its own checks
no longer pass: the page now runs every draft check on the active rulebook on
each load and each Calculate, and shows what it fails above its results.

### 22. A check the draft could not satisfy

The first drafts for v4 (8 October) failed in three new ways. On the fallback
model, the rules stage asked the data model for fields the sheet does not
hold ("a boolean 'demand_satisfied'"): results, which belong in facts. A
request naming only things the sheet holds nowhere is now sent back as a fact
or a rule to write, unless it quotes a header the sheet does hold. On Flash-Lite, one
rule already carried five assumptions, the schema's limit, when the blank-cell
check asked for a sixth: the model could not comply and repeated itself until
drafting stopped. One assumption now covers every value treated the same way
(blank stock, reserved and inbound counts taken as zero), naming each field in
`technical`, and the limit is eight. And alternatives such as "as 0 stock"
against "as zero units" slipped past the rewording check; number words now
count as their digits.

A later draft scored 13 of 16, but the score was wrong. It read offers as a
second kind of item, so CT-250 was both a product and an offer, and the
check runner judged an owner's check on the first item with that key: the
product, which has no offer rules. A check names a key, so it now counts every
item sharing it, the worst outcome standing. The honest score was 11, and the
fix uncovered a rule that contradicted itself (R13 applied when a price was
proposed and required that none was), blocking every offer.

## Models and the service

- **Models listed are not models available.** Google's model list and pricing
  page show Gemini 2.5 Flash and Flash-Lite as free, but both answer "no longer
  available to new users" (HTTP 404). They were removed from the chain. Check a
  model with a real request before adding it.
- **Fallback.** On one draft, 3.8, 3.7 and 3.6 Flash were all "experiencing
  high demand"; 3.5 Flash took over and passed two stages before its quota ran
  out. The chain steps down within a family only, never from Flash to
  Flash-Lite, and records which model answered each step.
- **Not every error should switch model.** A 400 means our request is wrong; it
  fails on every model, and switching only hid the cause. Only busy, out of
  quota, unavailable and timeouts move on.
- **Error messages hide the useful part.** Google's 429 says "You exceeded your
  current quota"; which quota, and when to retry, are in the response body
  (`quotaId`, `retryDelay`). The drafter now reads and shows them.

## Observability

**DevTools showed nothing for drafts.** AI SDK DevTools records only calls that
opt in with `telemetry: { integrations: [DevToolsTelemetry(...)] }`; the
workbench did, the drafter did not. Once added, DevTools filed a whole draft
under one run named after its first call. Each step is now its own run,
prefixed with the draft id and numbered.

**Rejected tool input was invisible.** Input that broke a tool's schema never
reached our code, so it was missing from the record. The SDK's `tool-error`
parts are now logged in order, through `onStepEnd`.

**Every draft is kept.** A failed draft used to disappear with the page. Each
draft's full record is saved (uncommitted) in `.rulebook-drafts/`, listed under
"Past drafts" with its owner-check score.

## Smaller lessons

- **Mock models cannot find provider rules.** The forced-tool 400 and the
  retired 2.5 models only appeared live. Keep one live draft in the loop when
  changing how the model is called.
- **TypeScript and state changed by a callback.** TypeScript narrowed
  `spec.checked.last` to `null` after it was reset, not knowing a tool sets it
  during the call. Reading it through a function fixed the types.
- **The AI SDK keeps a skipped tool call's reply.** When a model answers in text
  despite a forced tool call, `ToolChoiceViolationError.content` still holds the
  reply, so it can be checked as an answer rather than lost.
- **Shell gotcha while probing models.** In zsh, `"$m:generateContent"` applies
  a `:g` modifier to the variable and every URL was wrong (all 404). Write
  `${m}:generateContent`.
- **Do not overwrite work in progress.** The visual baseline was not re-recorded
  while someone else's sidebar changes were uncommitted in the tree.
