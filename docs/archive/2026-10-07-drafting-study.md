# Drafting study, 7 October 2026

> **Status: historical record (archived 9 October 2026).** Original status labels, paths and future-tense plans below describe the work at the time. Use the [documentation index](../README.md) and current code for present behaviour.

The first drafting study of the Brunch weekend rulebook (plan, Phase 3): the
same sheet drafted repeatedly, every draft scored against the owner's checks,
to measure how often drafting succeeds and how right the drafts are, and to
find which failures are systematic.

## Setup

| Item         | Value                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Code         | Commit `5765a07` plus uncommitted changes (diff hash `ffb0b29eb72e`), as of 12:53 UTC                |
| Sheet        | Captured read of 12:38:38 UTC (snapshot hash `2aeec5f7166e`), including the D1 demand definition     |
| Owner checks | 16, in the Checks tab, never sent to the model                                                       |
| Run time     | Each check's own run time (Thursday 08:45 unless the check says otherwise), week of 5 October        |
| Models       | Gemini 3.5 Flash-Lite (its fallback 3.1 Flash-Lite never needed); Gemini 3.8 Flash chain (3.8 → 3.5) |
| Procedure    | Drafts one at a time through `POST /api/dev/brunch/draft`, 45–60 s apart, from the captured read     |

Draft records are in `.rulebook-drafts/avocado-toast/` (not committed), from
12:53 to 14:49 UTC.

## Results

### Gemini 3.5 Flash-Lite (its default thinking)

Eight drafts: five in the main run, three to confirm after a settings change
(see below).

| Measure                       | Result                         |
| ----------------------------- | ------------------------------ |
| Drafts passing every check    | 7 of 8                         |
| Owner checks (passing drafts) | min 8, median 11, max 15 of 16 |
| Time (passing drafts)         | median 109 s (69 s to 978 s)   |
| Input tokens (passing drafts) | median 124,534                 |
| Revision rounds               | 1 draft of 8                   |

| Draft | Result                                         | Time  | Input tokens | Owner checks |
| ----- | ---------------------------------------------- | ----- | ------------ | ------------ |
| 1     | Stopped: data model, attempt limit, 7 problems | 328 s | 263,994      | —            |
| 2     | Passed                                         | 210 s | 126,241      | 15           |
| 3     | Passed                                         | 69 s  | 69,060       | 11           |
| 4     | Passed, after a revision round                 | 136 s | 158,773      | 13           |
| 5     | Passed                                         | 98 s  | 119,140      | 14           |
| 8     | Passed                                         | 81 s  | 84,830       | 9            |
| 9     | Passed                                         | 109 s | 124,534      | 10           |
| 10    | Passed                                         | 978 s | 158,532      | 8            |

Per owner check, over the seven passing drafts:

| Check | Expect                | Passes  | How it failed                               |
| ----- | --------------------- | ------- | ------------------------------------------- |
| C01   | blocked by R3         | 7/7     |                                             |
| C02   | ready                 | 6/7     | blocked by R9 (1)                           |
| C03   | blocked by R2         | 6/7     | ready (1)                                   |
| C04   | ready                 | **1/7** | blocked by R9 (4), needs decision by R8 (2) |
| C05   | needs decision by R8  | **2/7** | blocked by R9 (4), ready (1)                |
| C06   | blocked by R4         | 6/7     | ready (1)                                   |
| C07   | needs decision by R7  | **1/7** | ready (5), blocked by R9 (1)                |
| C08   | needs decision by R10 | 5/7     | blocked by R9 (1), ready (1)                |
| C09   | needs decision by R6  | 7/7     |                                             |
| C10   | ready                 | 7/7     |                                             |
| C11   | needs decision by R10 | 5/7     | blocked by R9 (1), ready (1)                |
| C12   | blocked by R11        | 7/7     |                                             |
| C13   | ready                 | 6/7     | needs decision by R10 (1)                   |
| C14   | blocked by R12        | 4/7     | ready (2), blocked by R9 (1)                |
| C15   | ready                 | 6/7     | blocked by R12 (1)                          |
| C16   | blocked by R13        | 4/7     | ready (3)                                   |

### Gemini 3.8 Flash chain

Not measurable on this key on this day: 0 of 10 drafts produced anything.

- **First five (provider-default thinking):** 3.8 Flash did not answer within
  the 180-second limit; 3.7 and 3.6 Flash were "experiencing high demand";
  3.5 Flash answered, but its tool call was cut off at the output limit
  (`finishReason: length`, the hidden reasoning having used the budget).
- **Second five (thinking set to low, a per-step 240 s limit, a 48,000-token
  output limit):** every model was "experiencing high demand", then Google's
  free-tier limit of **20 requests per model per day** was reached. A draft
  makes 15–25 requests, so the free tier allows about one Flash draft per model
  per day.

### Settings change during the study

Between the runs, drafting was changed to ask every model for low thinking.
Two Flash-Lite drafts with that setting scored 6 and 9. The setting was then
limited to the Flash family and three more Flash-Lite drafts run on its default
(drafts 8 to 10, scoring 9, 10 and 8). Those are lower than the morning's 11 to
15 on the same setting, so the difference is within the model's own variation:
there is no evidence either way about the thinking level for Flash-Lite. The
excluded low-thinking drafts are not counted above.

## Findings

**1. Drafting works on Flash-Lite.** Seven of eight drafts passed every check,
mostly on the first attempt of every stage, in about two minutes. Ten owner
checks pass in at least six of seven drafts.

**2. Quality varies widely.** The same sheet, model and code gave owner-check
scores from 8 to 15. A single draft says little; decisions about prompts,
checks or models need several drafts.

**3. The systematic failures are mostly policy the sheet does not state.**

| Checks   | Rule | What the sheet does not say                                                                                             | What drafts did                                                          |
| -------- | ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C04, C05 | R9   | What the kit's "regular price" is.                                                                                      | Compared with one component's price, or the brief's kit price.           |
| C04, C05 | R8   | What "the scarcest component can supply" means: stock only, or what can still be ordered, less the product's own needs. | Used stock on hand (0 for sourdough), so any kit limit needs a decision. |
| C07      | R7   | Whether "ripe stock" includes the proposed order, and that a weekend's expected sales span two days.                    | Compared stock on hand with the cover days, without the order.           |

The owner's checks assume answers to these questions; a model cannot infer
them. As with expected demand (now defined in Rules!A15), the fix is for the
owner to state them in the sheet.

**4. One more mistake a check could catch.** Three of four drafts in the main
run tested the `ripe` column against a value it never holds (`'ripe'`, or as a
true/false), while the sheet holds `yes` and `no`. A check that every text
value compared with a column is one of that column's values would catch this,
like the key-lookup check.

**5. Time is not fully recorded.** One draft spent 582 s on an inventory stage
of four checks with no service error recorded: slow responses, or the SDK's own
retries, which happen inside a call and are not in the draft record.

## Recommendations

1. **The owner decides three definitions** and adds them to the sheet, as with
   expected demand: the kit's regular price; what a component can supply for
   kits; how ripe-stock cover is counted.
2. **Add a value check**: a text value compared with a column must be one of
   its values.
3. **Record the SDK's retries** in the draft record, so slow drafts can be
   explained.
4. **Measure Flash on a day with quota to spare**, at most one draft per model
   per day on the free tier, or with a paid key.
5. **Repeat this study** after 1 and 2, with the same procedure, and compare
   the per-check table.
