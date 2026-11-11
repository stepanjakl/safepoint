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
Google's refusals was shared (now `lib/definitions/quota.ts`). Before writing
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

## Ready on a Friday night (30 October)

**What happened.** A live run on Friday evening proposed sensible orders and
every number was right, yet all of them were marked ready. Every supplier's
cutoff had passed on Thursday, so none could have arrived. Ripen-at-home
avocados were ready to order nothing on a Tuesday count, against a 24-hour limit
for produce. The read was also identical, cell for cell, to the one from 8
October.

**Why nothing caught it.** The instructions never mentioned cutoffs or count
age, so no rule did, though the sheet has had both columns all along. The
checks can only say a proposal fits the rules, and a formula had no way to know
when it was being run.

**What changed.** Instructions v3 states both rules, and a read gives formulas
the hours since a count and until a cutoff, from `readAt`. Writing runs the
checks again at that moment. The identical read is not solved: a weekday cannot
say which week, so the sheet needs a date to tell.

**Lesson.** A correct calculation on the wrong day is still wrong. Passing every
check means the rules were met, not that nothing else matters: compare the
columns a process reads with the ones its rules use.

## Half the draft was spent asking models that would not answer (31 October)

**What happened.** The first v3 draft took 50 attempts and stopped on the ninth
definition. 3.8 and 3.7 Flash took 26 of them and wrote one definition, nearly
all refused as busy, and one definition lost four minutes to them. A per-minute
refusal also restarted a tool loop, throwing away six finished requests, because
retries wrapped the whole loop.

**What the refusals say.** Flash allows 5 requests a minute and 20 a day; 3.5
Flash-Lite 15 and 500. A request to 3.7 was refused citing 3.8's limit, and one
to 3.5 citing 3.6's, and the attempts fit two pools of about 20, so models share
quota whatever the limit is called. It is not exact: a request to 3.6 succeeded
nine minutes after a daily refusal.

**What changed.** 3.6 is the default, with the newer models a last resort.
`limits.ts` paces each request, waits out a per-minute refusal in place, and
learns the limits and the sharing from refusals, since Google publishes neither
through the API. Setting them by hand would have been wrong for the shared pools.

**Lesson.** A draft's limit is the day's budget, not its speed: a fresh draft
and a proposal can use it all. Pacing makes that visible; it does not raise it.

## A formula of `false` (31 October)

**What happened.** A draft entirely on Flash-Lite answered every request and
wrote a rule whose formula was `false`, with five constants it never read and two
examples expecting false, so every check agreed. It would have sent every record
to a person. It also found no calculations at all, working expected sales out
inside one check. That one read only the order, because the instructions said
"don't order more than we expect to sell", which is what it was told.

**What changed.** A formula must read the data, and every constant and group it
declares. A check's examples must show it holding and failing, as far as the read
lets them: the formula is tried on every record first, because nothing an order
sets can break the arrival rule when every delivery is on time. A check reading
two or more numbers its words do not state, and a rulebook with no calculations,
are warnings to the person: reasonable instructions can do both. With no model
chosen a draft finds on Flash and writes on Flash-Lite. Rule 7 now says stock plus
the order.

**Lesson.** Examples written by the model that wrote the formula can agree with
it by being wrong the same way. They show a person the reading; they do not prove
it. Ask what they fail to exercise.

## Accounting for every sentence (31 October)

**What happened.** Flash-Lite kept folding calculations into checks when finding:
3 of its 4 drafts listed none, against none of 4 on Flash. With Flash spent for
the day, four ways of finding were tried on Flash-Lite, find step only, on Brunch
and on two unrelated instructions written for the test, one with no calculations:

| Way of finding                      | Brunch: calculation found | Invoices: found | Rota: none, correctly |
| ----------------------------------- | ------------------------- | --------------- | --------------------- |
| One list (what it did)              | 0 of 3                    | 3 of 3          | 3 of 3                |
| Two lists, quantities before checks | 0 of 5                    | 3 of 3          | 3 of 3                |
| Two calls, quantities then checks   | 4 of 5                    | 3 of 3          | 3 of 3                |
| Accounting for every sentence       | 5 of 5                    | 3 of 3          | 3 of 3                |

Two lists was the expected winner and changed nothing: an empty list is an easy
answer. Two calls added a junk check once. Accounting costs one call.

**What changed.** Code splits the instructions into sentences, and the model says
of each whether it works a quantity out, states a check or is only context, and
which definitions it belongs to (`accountingProblems` in `find.ts`). Every
sentence must be accounted for once, and each kind must point at a listed
definition of that kind, so a quantity with no calculation is refused rather than
warned about, and so is a definition no sentence states. A refused answer is asked
for once more with what was wrong; a second refusal stops the draft and replaces
nothing. The sentences read as context are shown to the person.

**What it does not do.** It proves a sentence was accounted for, not that it was
read rightly: a rule marked as context passes, which is why those are shown. The
test was 11 runs a way, on simple instructions, and the refusals never had to
fire. Whether Flash-Lite can now write a whole rulebook well is a separate
question, answered by comparing a draft with the accepted rules.

**Lesson.** Asking a model to do less at once helped less than asking it to show
its working somewhere code can check. Test the idea before believing it: the one
that sounded right was the one that did nothing.

## Passing every check is not being right (31 October)

The first thing the debug drawer showed, on a Flash-Lite draft: "All 6 pass" on the
enough-stock rule, and rocket holding at an order of 8, where the accepted rules
fail it because expected sales round up. It reads 12.6 where the instructions say 13. Code's checks ask whether a formula is well made and agrees with its own
examples, and the examples made the same mistake. Trying it on every record, at
a value a person picks, is what shows it, so the drawer does that rather than
repeating the examples. A comparison with a trusted rulebook still finds what no
one thought to try.

## One word, two readings (31 October)

**What happened.** The instructions said "stock plus the order" and "enough stock"
without saying what stock is. Each rule worked it out for itself, so from the same
words the ripe rule counted inbound stock on one attempt and not on the next. No
check could see it, and neither could a comparison with the accepted rules: the
one product it affects has nothing inbound, so both give the same answers.

**What changed.** Instructions v3 defines stock available in a sentence of its
own, for a calculation both rules can read by name.

**Lesson.** Where a model gives different answers to the same words, look at the
words first. A term two rules share should be defined once. This holds for any
process, but only for terms someone thought to define; nothing yet notices the
rest.

## Examples that agree with a misreading (31 October)

**What happened.** With stock available defined, three rules still failed: all
three read a calculation, and every rule that did not read one passed. The model
was told what a calculation means and not what it comes to, so it worked expected
sales out again by hand, got 28 for 65, and spent up to 12 requests arguing with a
right formula, encouraged by a message telling it to work it out by hand again.
Rule 5, split into sentences, became two rules, one of them wrongly blocking.

Given the numbers, that went away, and requests halved. What was left was worse:
drafts that passed everything and were wrong. One reversed the cutoff. One applied
the ripe limit to every product. One's supplier rule could not run on a blank cell.
The examples came from the same reading as the formula, so they agreed with it.

**What changed.** The model is given what earlier definitions come to, on every
record, and a failing example says what it read. A list item stays one sentence.
A formula must run on every record. A check no proposed value can change is flagged.
Each definition is written twice from the same input, neither seeing the other,
and code compares how they behave, not how they are worded.

A third write to break ties was tried first and dropped. Over three real drafts of
27 rules:

| Settled by                 | Rules | Wrong |
| -------------------------- | ----- | ----- |
| The first two agreed       | 20    | 0     |
| Two of three agreed        | 6     | 2     |
| Only one passed the checks | 1     | 0     |

The same misreading can come up twice, so a vote picked the reversed cutoff. But
every wrong rule was one the writes had disagreed on. So a disagreement goes to a
person, with the record and value where the versions differ.

**What it does not do.** Two writes making the same mistake agree. Three drafts is
few, and comparing at a range of values can miss a value that tells them apart.

**Lesson.** Give a model the numbers code already has. Then ask what disagreeing
tells you before asking what to do about it: here it was the most useful signal
we had, and the vote threw it away.

## How to find out whether a draft is right (31 October)

Reading a rulebook missed things that these found, and none of them needs a person
to redraft first. All but the last two cost no quota. A throwaway test file beside
the engine is enough; delete it afterwards.

- **Compare with a rulebook you trust, through the engine.** Run both on every
  record at every whole-unit value, rule by rule (`checkProposal`). This found the
  rounding error and every wrong guard. It only covers rules both have, and only
  what the data can show.
- **Replay a real proposal at different read times.** Copy a read, change `readAt`,
  and run the same values. A Thursday morning and a Friday evening showed at once
  whether the cutoff rule was reversed, and a mostly blocked table is hard to miss.
- **Change the data so zeros cannot hide a column.** Ripe avocados have nothing
  inbound, so a rule that forgets inbound stock agrees with the right one everywhere.
  Give them some on a copy of the read, and the two part.
- **Tally the recorded calls before forming a view.** `.devtools/generations.json`
  holds every model call, with its outcome. It settled which models were unreliable,
  how much a refusal threw away, and what each refusal says about its limit.
- **Compare outcomes with what you suspect is a signal.** Setting where writes
  disagreed against which rules were wrong is what showed the vote was the mistake.
- **Try an idea on the real model before building it.** A script running only the
  step in question, on instructions unrelated to any process and including one with
  nothing to find, costs a few requests. The idea that sounded right did nothing.
- **Run whole drafts in a scratch directory before asking for a redraft.** Use
  `inScratchDirectory()`, read the key from `.env.local` in the test, and leave
  `fixtures/` alone. Each redraft asked of a person also spends their day's quota.
  Scratch runs are not in the app's own count of requests today, or in `.devtools/`.

## Checks as shapes (5 November)

The v3 draft got every calculation right and two checks wrong, both agreed by
neither write or by both: the cutoff check compared signed hours the wrong way
round, and the cover check never read the order. A version chooser, even showing
the cases where versions differ, was hard to judge. So a check is no longer a
formula the model writes: it fills one of five shapes, and code writes the
formula and the sentence a person approves (`shapes.ts`).

Tried on the real model, on an invented staff rota rather than Brunch orders,
Flash-Lite, formula writing against shape filling:

| Run                                          | Shapes                                       | Formulas                                    |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| 1: nested schema, refusal free, single write | 5 right, 0 wrong, 5 wrongly refused of 10    | 12 of 12 right                              |
| 2: flat schema, reasoned refusal, two writes | 5 of 6 right, 0 wrong, the "or" rule refused | 6 of 7 right; 1 wrong, both writes agreeing |
| 3: the deadline rule again                   | inverted through `hours_since`, unconfirmed  | not run                                     |

What each run changed:

- **A nested schema is too much for Flash-Lite.** Refusing cost one request and
  needed no reason, so it refused rules it could have written, some with no
  reason at all. A flat form with short text references (`column:<column>`), and
  a refusal that must name one of three reasons and is never compared, brought
  wrong refusals from five to one.
- **The one left was the signed column.** Every write of the deadline rule reached
  for `hours_until_deadline`, one inventing a constant "zero" to compare it with.
  Shapes no longer see the signed hours worked out for formulas.
- **Then the sign came back through `hours_since`.** Hours since a deadline still
  to come are negative, and the write compared them the wrong way. `hours_since`
  now reads only an observed moment; anything else is put before or after.
- **The formula writer's silent mistake** was the decided target: both writes read
  "reach contract hours" as `==`, agreed, and would have been shown as agreed.

Accepted v2 rulebooks were not migrated. Three of five checks have no shape that
says the same, and the other two match only on the data as read: a blank cell
would come out differently. An approved rule rewritten into one that only looks
the same is not what was approved, so accepted checks keep their formulas.

**Lessons.** A wrong refusal is visible and a wrong formula is not, so trade
towards refusals, then drive them down with code. Every way a model got time
wrong was a sign it could see; take the sign away rather than explain it. The
second run made 86 model calls against an estimate of 45 to 60, because a
refusal asks for further writes; the three runs together counted 96 requests
against the day's quota.

**The real brunch draft, three times (5–6 November).** Shaped checks out of 7,
each correct: 3, then 5 after the materials named every moment and earlier value,
then 6 after a first refusal was answered with what shapes can do for its reason
(`REMINDERS`). Every check came out shaped in at least one draft, and none was
wrong. What remains is Flash-Lite refusing at random: delivery before opening
was shaped in the second draft and refused in the third. So after two refusals
the rest of a rule's writes go to Flash (`writeAgreed`), which costs a few of
its 20 daily requests only where Flash-Lite fails. The one split, supplier
maximum, differed only on blank cells, and read as two sentences it was an easy
choice. The third draft took about 89 requests.

The fourth draft, with that handover, shaped all 7 checks, and each split was
one write misreading the instructions. Flash wrote the three rules Flash-Lite
refused, both writes agreeing each time, but two Flash writes per rule left 3 of
its 20 for the day. So the handover is now one Flash write, compared with an
earlier Flash-Lite shape where there is one and otherwise unconfirmed: a person
reads a lone write's sentence rather than a comparison vouching for it.

## A second process finds what one process hid (10 November)

The engine claimed to hold for any process, but only Brunch orders had run
through it. A test-only process of bike-share docks
(`lib/definitions/conformance.fixture.ts`), with two proposal fields, two
lookups, percentages, money and dates, was run end to end against answers
worked out by hand. Four things came out wrong, each invisible on Brunch:

- **A margin read from a percentage column was divided by 100 twice.** The
  target shape wrote `margin / 100`, right for Brunch's `safety_pct`, which
  holds 10 for 10%. A column typed as a percentage holds 0.1, so the cover
  rule asked for 0.1% more and let short proposals through. The shape now asks
  the column's type, never its name.
- **A record left was checked with a field nobody proposed at 0.** Brunch's one
  field declares `none: 0`; a fare declares none, so leaving a dock read its
  fare as 0 and the fare floor blocked it. A check reading a field nothing set
  now does not apply.
- **Two versions putting one limit on different fields agreed.** Every field
  was tried at the same value, so "at most 8 bikes" and "at most 8 cents" gave
  the same answer everywhere. Each field read is now also tried alone.
- **The debug drawer called moment columns unread**, though a shape reads them
  through its moments.

**Lesson.** One process is one point: an assumption true of it reads as a
property of the engine. A second process built to differ on every axis found
on its first run what a month of the first never showed.

## The idea that sounded right lost again (10 November)

**What was tried.** For a check, code writes the formula and the sentence, and
the model's own examples have agreed with a misreading before. So: let the model
give only the shape, in one answer with no tools, and let code write the
examples. Tried on the real models against an answer key written by hand first,
on 16 rules (the seven of Brunch v3 and the nine of the conformance process),
three writes each, scored by behaviour on every record:

| Model, way of writing            | Right | Wrong | Wrongly refused | No valid answer | Requests |
| -------------------------------- | ----- | ----- | --------------- | --------------- | -------- |
| 3.5 Flash-Lite, tool loop        | 36    | 1     | 6               | 0               | 121      |
| 3.5 Flash-Lite, shape only       | 34    | 11    | 0               | 3               | 62       |
| 3.1 Flash-Lite, tool loop        | 31    | 4     | 7               | 0               | 101      |
| 3.1 Flash-Lite, shape only       | 33    | 2     | 2               | 9               | 69       |
| 3.6 Flash, shape only, once each | 11    | 0     | 0               | 0               | 15       |

Out of 48 writes a row, 12 for Flash; the rest were refused by the service.

**What it showed.** Shape only costs about half the requests and almost never
refuses wrongly, but on the default writer it was wrong 11 times to the tool
loop's once, and its mistakes repeat: the same wrong shape came back three times
of three, which is exactly what comparing two writes cannot see. Working an
example out by hand is what makes Flash-Lite notice it has written another rule.
The tool loop stays.

Six of the wrong answers were one defect in code, not a misreading: a limit
written with its condition in `when` had the condition dropped without a word,
so a rule for some records came out as a rule for all of them, in a fluent
sentence. Such conditions are now read as the rule's scope, or refused where a
scope is given as well (`scopeOf` in `shapes.ts`).

**What it does not show.** Three writes of a rule are few and not independent.
Flash was right on all 11 it answered, one write each. A rule that cannot fail
on the read cannot be scored by behaviour at all.

**Lesson.** A step that looks like waste can be the check. Measure what it
catches before removing it, and when a model's answer is "cleaned up" by code,
ask what the cleaning throws away.

## A real draft on the finished engine (11 November)

One whole draft of v3 with nothing chosen, in a scratch directory, on a
confirmed data profile: 66 requests (15 of them refused by the service) and 5.7
minutes, against about 89 requests for the third v3 draft. It found the two
calculations and the seven checks, every check came out shaped, and nothing
split. Both calculations and six checks were right against an answer key
written by hand.

One was wrong and shown as agreed: the ripe rule came out with no scope, "The
stock available plus the proposed order must not exceed the expected sales", so
it blocked ten products it is not about. Both writes dropped "the ripe avocados"
the same way, and only the sentence would show a person. Nothing checks that a
rule whose words name some records is limited to them.

A field written `proposed:<field>` (10 answers) or left out (13) cost no
request, and blank handling and misplaced conditions did not come up. What
still costs requests is the model's own examples: 17 of the 33 answers sent
back. The arrival rule took 13 requests and came out unconfirmed, because the
model wanted a failing example the read cannot produce.

## Two readings of a rule's scope, compared by code (11 November)

**What changed.** The draft above wrote a rule for some records as a rule for
all of them, twice. Finding now says of each check whether the instructions
state it for every record or only for some, and code holds the written shape to
that (`scopeProblems` in `checks.ts`): no word of the instructions is matched,
so it knows no scenario and no language.

**Tried on the real models,** against a key written by hand first, on Brunch
and the conformance process: 18 finds, 117 of 118 labels right, every find
accepted first time and no extra requests. Flash, the default finder, read the
ripe rule as for some in 4 of 4; Flash-Lite in 4 of 5. Then one whole draft of
v3: 66 requests, 4.5 minutes, both calculations and all seven checks right,
the ripe rule limited to the ripe column and behaving as the correct rule on
every record at every order from 0 to 120.

**What it does not show.** The check never had to fire in that draft: every
write of the ripe rule gave a scope. Four finds a process is few. A rule for
some records read as for every record passes finding in silence and is then
held to having no scope, which is why the card says how each rule was read
and lets a person say the opposite.

**Lesson.** Where two writes can make the same mistake, ask a different
question whose answer code can compare with theirs.

## Still open (31 October)

- **Names.** A rule's name is often the first words of its sentence, cut off, which
  makes a rulebook harder to review. A check could refuse them, at the cost of a
  redraft.
- **The intent** tends to describe the document ("These instructions explain how…")
  rather than the goal.
- **No calculations found.** A find can read every quantity as context, in about 1
  run in 10, and then writes every rule before anyone can tell. It could stop there
  and ask again.
- **Terms nobody defined.** Stock available is fixed by defining it, but nothing
  notices the next such term. Rules that read most of the same columns but not all
  could raise a warning.
- **A mistake made twice** passes the comparison of two writes. A cross-check of
  checks, or a second model for the second write, would make that less likely.
- **What the model did on each attempt** is not recorded for the debug drawer.
- **Stock counts have no date,** so an old count reads as this week's.
- **The first real write to the sheet** has not happened: it has only run on a sheet
  held in memory.

## Smaller lessons

- **A live object in a reply can say something that was not true when the rest was
  read.** The rules route read the set and then attached the draft's progress, which
  the draft kept changing, so a reply could say finished beside rules from before the
  end, and polling stopped there. Copy progress when reading it, and read it first.
- **A poll that stops on a failed request never resumes.** One 500 while the server
  recompiles left a page waiting for ever. A failed request says nothing about the job.
- **Work done inside a request is gone from the page on a reload.** Write again ran in
  the browser's request, so a reload showed the old rule with no sign of the new one.
  Anything a person may wait for belongs in a job with its progress kept on the server.
- **A background save that nothing waits for** collides with the next one and with a
  test's clean-up. Wait for it, and give each temporary file its own name. Under a
  fake clock, real file work then means a timer may start after the clock has moved,
  so advance the clock until the promise settles, not by a fixed amount.
- **A limit that is never hit is never learned.** Learning limits from refusals left
  Flash-Lite at the first guess of 5 a minute, when it allows 15, because pacing kept
  it from being refused. Start from what refusals have already said.
- **Count requests, do not estimate them.** Estimates here were out by more than
  double, because a tool loop is many requests and a check sending a model back adds
  more.
- **Focus can land first.** Focusing a button just as a read finishes can lose to
  React Aria moving focus on from the button that went. Wait until it stays.
- **`ERR_CONNECTION_REFUSED` in many tests at once** is a server that has stopped.
  Check that before reading the failures.

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
