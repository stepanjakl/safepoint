# Brunch orders: development log

Status: ongoing development record. Current behaviour is described in the [plan](PLAN.md) and [definitions engine guide](../../engineering/DEFINITIONS-ENGINE.md).

A record of the larger lessons from building the Brunch orders definitions
engine ([`PLAN.md`](PLAN.md)), 8 October 2026: what
happened, why, what changed, and what is still open. It is the companion to
[`RULEBOOK-DEVELOPMENT-LOG.md`](../../archive/RULEBOOK-DEVELOPMENT-LOG.md), which covers the
Brunch weekend engine this one grew out of.

Add an entry when something non-obvious goes wrong; keep it short, and say
what it taught rather than only what was fixed.

## Results at a glance

| What                                        | Before                                         | After                                              |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Clicks to approve the first rulebook        | 20 (a verdict per example, then approve)       | 6 (the intent, then each definition once)          |
| Expected sales, as written by the model     | `(11 * (…) + 1639) / 40`, products by key      | `ceil(average × multiplier) + kits`, each quoted   |
| Requests sent to a model out of daily quota | 3 per call, every call (up to 48 in one draft) | 1, then skipped until Google's reset time          |
| A misspelt name in a formula                | found when an example ran, an attempt lost     | refused before it runs, with the names it may read |
| A disagreeing example                       | three blind retries                            | the model corrects it in the same conversation     |

## Starting again from the purpose

Brunch weekend drafted a whole rulebook from the sheet in one go: inventory,
data model and rules, seven gates, policy written in sheet tabs. It worked, but
a reviewer could no longer tell what they were approving. Brunch orders started
again from the one thing the product is for, proposing order quantities, and
built a step at a time: the sheet holds data only; the intent, the promotion,
how demand is worked out and the rules are versioned instructions in the app;
each rule is found, written and approved on its own.

**Lesson.** When the reviewer cannot follow the system, add nothing until the
purpose is restated and every part is traced back to it. Each step of the run
is now built only when the one before it is understood.

## Approval: the person judges the definition, code judges the arithmetic

The first version asked for a right or wrong verdict on every example, then an
approval: 20 clicks for five rules on a small sample. But whether an example's
number matches its formula is the app's job, and it already checks that. What
only a person can judge is whether the definition means what the instructions
mean. Approval became one Accept or Deny per definition (with an optional note
that goes back to the model), allowed only once every example agrees.

The cards had to say what they were for: which text is the instructions word
for word, which is the model's reading (marked, so model output is never
mistaken for data), what happens when an order breaks the rule, and why the
same product appears twice (an example either side of the boundary, so an
off-by-one shows).

## No hidden policy in a formula

The first Expected sales formula agreed with all its examples and was
unreviewable: `sku in ["SD-01", "AV-RR", "FT-200"] ? (11 * (…) + 1639) / 40 : …`.
The numbers were the instructions' (10% uplift, 40 kits, four weekends), folded
past recognition; the product lists were the model's unconfirmed reading of
"eggs, cherry tomatoes and rocket", fixed in the formula where a new product
would go wrong in silence.

Now every number is a **constant** and every set of records named in words is a
**group**, each carrying the exact words of the instructions it came from, and
the formula reads them by name. The app refuses a quote that is not in the
instructions, a key that is not in the data, any other number written into the
formula (0, 1 and 100 aside), and a key or lookup key written in quotes.

**Lesson.** "The examples agree" is necessary, not sufficient. A formula that
is right but unreadable cannot be reviewed, so readability has to be enforced
by checks, not requested in a prompt.

## Number traps that run cleanly

- **`ceil(253 / 10)` gave 25.** CEL's whole-number division drops the
  remainder, and our `ceil` also accepted whole numbers (returning them
  unchanged), so rounding up silently rounded down. `ceil`, `floor` and
  `round` now take doubles only; the integer form is a type error the model
  is told how to fix.
- **`100 × 1.1` is 110.00000000000001**, which rounds up to 111. Rounding
  settles the value to nine places first.
- **Whole numbers and decimals never mix in CEL.** A value rounded with `ceil`
  is an int; multiplying it by a percentage as a double failed. The model is
  now told, for every earlier definition, whether it gives an int or a double.

## Universal means settled before the first real draft

A review for scenario specifics found three kinds:

1. **Examples in prompts.** "(such as how much is expected to sell)",
   `values.expected_sales`, `groups.on_offer`: an example in a prompt steers
   the model towards this scenario. Prompts now use placeholders only.
2. **Names stored in model output.** Formulas read `sku`, `product` and
   `category`, names the engine itself assumed. Once a draft is accepted,
   renaming breaks every formula, so they became `key`, `record` and lookups
   named by the process. How a read becomes records (which tabs join on which
   key, which table a record reaches through which column) became a declared
   `DataShape` instead of assumptions about the first tab and a tab called
   Parameters.
3. **Value representations stored in model output.** Delivery times were
   Sheets' fractions of a day (`0.291666` for 07:00) and days were compared
   through an English day-name helper. Typed columns are now converted on
   reading: a weekday to 1 to 7, a time to minutes after midnight, so a
   formula compares plain numbers with constants quoted from "Saturday" and
   "07:00".

**Lesson.** Anything that ends up inside saved model output (variable names,
units, representations) is a contract. Decide it before the first draft that
might be accepted; everything else (screen wording, file locations) can follow.

## Quota: one refusal should cost one request

A draft kept hitting "You exceeded your current quota … retry in 1h49m" on the
same model, over and over. Two causes: the AI SDK retried a 429 twice on the
same model regardless of Google's retry delay, and nothing remembered which
models were spent, so every call (up to 16 per draft) started again at the top
of the chain. Calls now make no automatic retries; a refusal is read for
Google's retry delay: up to 90 s is waited out, longer marks the model out of
quota until then, and later calls skip it. When a whole family is spent, the
draft stops and says until when.

**Lesson.** The Brunch weekend drafter had already solved this. The parser for
Google's refusals is now shared (`lib/rulebook/quota.ts`). Before writing
infrastructure for a second engine, read what the first one learned.

## Two drafts, and why prompts alone oscillate

**First draft (Flash).** It split one working into steps nobody asked for
(eight definitions, including a "category safety margin" that is a column of
the sheet), hit an int-times-double error in one of them, and every definition
after it failed with "No such key". The card showed one attempt's formula with
another attempt's complaint.

**Second draft (Flash-Lite), after a prompt fix.** It swung the other way:
Expected sales disappeared, inlined into a check as one 600-character formula.
It read `group.kit_ingredients.contains(record.sku)` (three mistakes, caught
only when examples ran), and kept an example claiming a 06:00 delivery arrives
after 07:00 through every retry.

What fixed it was structure rather than wording, ported from Brunch weekend:

- **Writing is one conversation that checks itself.** The model answers only
  through a `check_definition` tool that runs every check and returns each
  problem, and can `try_formula` on a real record. A disagreement comes back as
  "you worked out 99, the formula gives 28": the model corrects whichever is
  wrong. It ends on a clean check, on the same problems three times, or at
  twelve steps.
- **Formulas are type-checked before they run**, against exactly what they may
  read, typed from the read's columns; a formula past 300 nodes is refused as
  unreadable.
- **A definition that does not work yet** is named as not to be read, and a
  draft that reads it stops at once, so failures no longer cascade.
- **What is kept is one attempt with its own problem**, or the version before
  with a note saying so.

**Lesson.** Each prompt fix corrected one draft and caused the next draft's
failure. Prompts set intent; checks and a feedback loop the model can act on
are what make the result reliable. A weaker model with a good loop beats a
stronger one with blind retries.

## Testing a page whose data the page rewrites

Drafting replaces the kept rulebook file, which the browser test read. The test
now serves a frozen copy (`e2e/fixtures/brunch-orders-rules.json`) through a
route intercept, so a new draft cannot change what it checks. Model calls are
tested with stand-in models in a scratch directory (`process.cwd()` is read
when used, not at import), so no quota is spent and no real file is touched.

## The engine review (8 to 9 October)

A full review found the design sound and three integrity gaps, all now fixed,
each with tests:

- **Accept did not recheck.** It needed agreeing examples only, so an older or
  hand-edited definition could be accepted against the rules. Accepting now
  reruns the same review writing applies, against the read its examples ran
  on, and refreshes the examples; a version that writes its numbers in, or
  whose examples were marked as agreeing when they do not, is refused with the
  reason.
- **A sheet that did not fit the declared shape failed silently.** A missing
  tab or key column gave no records, a key listed twice kept the last row, an
  unreadable typed cell became null. Every mismatch is now reported by its
  cell (`Deliveries!C2 (delivery_day) reads "Saturdy"`), shown in the Read
  step, and a read with problems is not drafted on.
- **The stored set was unvalidated and written in place.** A corrupt file read
  as "nothing drafted" and the next draft overwrote it. It is now read through
  a schema, a broken file is an error that names what does not fit, and a save
  is written beside the file and renamed over it. The schema caught a bug in a
  test the moment it was added.

The structural debt went with them: the 1,000-line `rules.ts` became
`lib/definitions/`, one module per job, taking the process as a parameter;
records are built once per read, not on every formula run; the parsed-formula
cache is bounded; a whole draft runs on the server, so closing the page no
longer stops it halfway; the write chain no longer drops from Flash to
Flash-Lite, as the models policy forbids.

Brunch weekend's drafter kept its own staged retry logic; the two engines
shared only the quota parser and the CEL object types. That drafter was
removed with the experiment on 13 October 2026.

## Consistent is not correct (third draft, 9 October)

The third draft (Flash-Lite throughout) passed every check: four rules, every
example agreeing, no problems. Two were wrong. The arrival rule multiplied a
time already in minutes by 1440, so every Saturday delivery failed, and its
example reasoned the same wrong way ("06:00 is not before 07:00"), so the two
agreed. The stock rule put ripe avocados in the on-offer group, quoting
"Products on offer sell about 40% more", which names no product; and Expected
sales was again folded into it, its examples all on one product.

The checks proved the draft consistent with itself and the data, not with the
instructions: a quote only had to appear somewhere in them. Three checks now
tie a draft to what the instructions say, without naming any scenario:

- **A constant's words must state its number:** as digits, a percentage (40%
  for 40, 0.4 or 1.4), a time (07:00 for 420), a day (Saturday for 6) or a
  small number in words. 1440 quoted from "Saturday" is refused.
- **A group's words must name each member,** matched against a word of the
  record's own name in the data. Avocados quoted from "Products on offer" are
  refused.
- **Examples must try every group the formula reads from inside and
  outside,** so each branch of a formula is run at least once.

Run over that draft, they flag exactly the two wrong rules and pass the two
right ones. Finding now defaults to Flash, since Flash-Lite dropped a defined
number in both of its drafts.

**Lesson.** Agreement between a formula and the model's own examples catches
slips, not misreadings: a model that misunderstands writes both wrong the
same way. What catches a misreading is a check against an independent source,
here the instructions' words and the data's names, and then the person.

## Where the checks do not look (fourth draft, 9 October)

The fourth draft (Flash-Lite) had the right shape for the first time: one
number and four rules, with the stock rule reading `values.expected_sales`.
Expected sales was correct throughout: a readable formula, every constant's
quote stating its number, both groups named by the instructions' words, and
examples on a kit ingredient, an offer product and another. The new checks
held. Three of the five definitions were right.

What failed sat outside every check:

- **A reversed comparison, shown as clean.** The stock rule tested
  `stock + order <= expected × (1 + safety)`, a check against overstocking
  borrowed from the intent's "without overstocking", the opposite of "enough
  stock to cover". Both examples were on one product and both expected the
  rule to hold, so the direction was never tried. One example's reasoning
  concluded "false is correct" while its result said true; its numbers (72,
  79.2) were not the app's (73, 80.3); and it declared a constant the formula
  never reads. The card said "Waiting for you".
- **A failure the data cannot produce.** The arrival rule's formula was right,
  but every product arrives in time and an example can vary only the proposed
  order, not the data. Asked for a case where the rule fails, the model made
  one up, noticed mid-reason that it was wrong, and left it. The disagreement
  was flagged, as designed.
- **Working notes in the reasons.** "Wait…", "let's pick another…": text a
  person is meant to review.
- **An intent restating the document** ("these instructions explain…")
  rather than its purpose, and dropping the very phrase the stock rule then
  misused.

**Lessons.**

- An example is three claims (an input, a verdict, and a reason with
  numbers), and only the verdict was checked against the formula. A reason
  that contradicts its own verdict, or cites numbers the data does not give,
  passes unseen.
- Examples that all land on one side of a check cannot reveal a reversed
  comparison. Covering both sides matters for outcomes as much as for groups.
- Asking for an example the data cannot produce invites invention. What a
  check can be shown to do depends on the data, not only on the proposal.
- The shape of what finding returns varied from draft to draft on the same
  instructions (8, 4, 4 with a number folded into a rule, then 5). One good
  draft is not evidence the shape is now reliable, and only the first draft
  ran on Flash, so how much of this is the model is still unmeasured.

## Direction review after four drafts (9 October)

A discussion with two models questioned whether rule drafting had displaced
the product's purpose: a useful order proposal. The initial assessment favoured
freezing the generator and directly implementing a small rule set. Feedback
corrected that assessment: scenario independence is a reasonable engine goal;
drafting is setup per instructions version; grounding checks are general
improvements; and neither the intended model configuration's reliability nor
the cost of reviewing drafts versus writing rules has been measured.

The revised recommendation is to correct and independently check the existing
definitions, freeze that set, and build Calculate and Propose on the current
engine. The [direction review](DIRECTION-REVIEW.md) records the reasoning,
proposed sequence and open questions. It is an assessment, not a record of a
new accepted set or completed runtime work.

**Lesson.** Deterministic evaluation can repeat an incorrect interpretation.
Source grounding narrows the error surface, but does not prove all policy was
found or correctly expressed. Generated examples need independent expected
results. A handful of drafts does not establish reliability, and a corrected
set producing useful orders would not, by itself, validate automatic authoring.
The next experiment should distinguish execution correctness, product usefulness
and authoring effort.

## The first cross-check (9 October)

The first real cross-check of Calculate was refused, and nothing was kept.
The model's 22 values were all correct, but it filed each one with the two
identifiers swapped: the value's id (`expected_sales`) where the record's key
belonged, and the key (`SD-01`) where the id belonged. The answer format was a
flat list of `{key, id, value}`, and "id" reads as the record's own id. The
completeness check caught it, as it should, but the cause was the format.

**Lesson.** A structured answer should make a mix-up impossible, not just
detectable. The format is now built from what is asked: one entry per record,
its key restricted to the read's keys, and every value under its own id as a
required field. The same call then agreed on 22 of 22. Field names that two
parts of the answer could both claim, such as `id`, `key` or `name`, are worth
avoiding in any schema a model fills.

## Keeping what a run used (12 October)

The rulebook a run calculated on was named by a fingerprint, but the file
behind it was overwritten whenever a definition was drafted again or
accepted, so "the rules this run used" existed only as that name. Rulebooks
now live one folder per instructions version, with the one under review as
`current.json` and each accepted rulebook a run used kept beside it under its
fingerprint, never rewritten. A run goes on calculating on its own; the step
says when the current rulebook has moved on. Run-time records (reads,
cross-checks, drafts) moved to `data/<process>/`, outside git, so the split
between what a person approves and what runs produce is visible in the path.

## A type change is not a redraft (12 October)

`ripe` was compared as text (`record.ripe == "yes"`). Declaring it a yes/no
column, and asking the model to write that rule again so it would use
`!record.ripe`, gave a formula that passed every check, and also read the
rule differently: the accepted version limits stock on hand plus the order to
expected sales, the new one only the order. Both are defensible readings of
"don't order more than we'll sell". The model's version was not adopted; the
accepted formula was edited by hand to read the column as true or false and
nothing else, and reviewed again on the captured sheet.

**Lesson.** Asking the model to redo a definition re-opens its reading, not
just the part that changed. A mechanical change to an accepted rule (a type,
a name) is made by hand and reviewed; a redraft is a new reading, accepted
again by a person.

## The first real proposal, on an outdated rulebook (12 October)

**What happened.** The first real proposal set ripe avocados (AV-RR) to 60
and marked it ready, though stock plus 60 is 72 against expected sales of
65: the ripe rule should have blocked it. The run had pinned rulebook
`d23a4c56d75b`, accepted before `ripe` became a yes/no column. Its formula
still compared the column to the text `"yes"`. CEL finds `true == "yes"`
false rather than an error, so `!(record.ripe == "yes") || …` held for every
record. The migrated rulebook, `5b895575e4e7`, was right; the run never used
it, because a pinned rulebook is kept exactly as it was.

**Why nothing caught it.** A revision was type-checked once, on acceptance,
against the read of that day. Nothing checked it again when the read's
column types changed, and nothing recorded that `5b895575e4e7` replaced it.

**What changed.** Each revision is type-checked against the read it is used
on (`fits.ts`); one that no longer fits is refused, naming the definition,
and the run is offered the current rules. Revisions record their parent and
reason in `revisions.json`, and the Rules tab lists them.

**A second confusion, in the same run.** Every record listed "Ripe avocados
limit: holds", with the cap worked out on its own numbers, so the rule read
as applied to everything. It was settled by its guard (`!record.ripe`) for
every record not ripe. A check led by such a guard now says it does not
apply, and its working stops at the guard. Only the leading negation counts:
in the arrival check, a delivery in time also holds whatever is ordered, but
that is the rule being met, not its scope.

**Lesson.** An accepted rule is accepted against a shape of data. Keep the
rule fixed, but check it against the data each time it is used.

## Smaller lessons

- **A pseudo-element on a table row is a cell.** Chrome lays a `::before` on a
  `<tr>` out as an extra cell, even absolutely positioned, which pushed every
  following row one column across. The rule between table rows is drawn on a
  cell instead (`row-rule`, `--row-rule-top`).

- **Two sessions editing one tree** works if each re-reads before editing and
  keeps its tests in its own spec file; a shared spec or a deleted import
  breaks the other mid-change.
- **The Playwright "dark" project renders light.** The app's default theme is
  set by a stored preference, not the browser's colour scheme, so both
  projects test the light theme. Screenshots of dark set the stored preference.
- **A dev server reload mid-test** shows up as an element "outside of the
  viewport"; rerun before debugging.
