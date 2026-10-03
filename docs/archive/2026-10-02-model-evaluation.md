# Local model evaluation · 2 October 2026

Development experiment on `/workbench/explore`, using
`gemini-3.5-flash-lite` through `/api/dev/review-lab`. Seven synthetic examples
ran sequentially with seeded JSON rules and a shared review-time anchor.
Expected answers were kept outside the model input. No facts or rules were
activated, cases approved, or external systems changed.

## First run

Started at **13:35:13 UTC**. Five cases passed; two required inspection. All
seven provider calls succeeded. Browser elapsed time summed to **13,470 ms**;
reported usage was **7,230 input tokens** and **1,069 output tokens**.

- The margin rule returned a bare `right: 30` operand. The trusted validator
  rejected it; the format requires `right: { "value": 30 }`. Run ID:
  `5753dbc9-c19e-4d66-b9c3-2185b8519ab7`.
- The withdrawn candidate was correctly excluded and cited
  `ev-shortlist-0027` and `ev-note-pizza-withdrawal`. Both records support the
  withdrawal. The evaluation incorrectly required only `ev-brief`, so this was
  an expectation error. Run ID: `bd487c74-d7fd-4125-b7fd-d0fc277ecd13`.

The rule-stage prompt was clarified to describe literal and registered-field
operand objects. The withdrawal expectation now accepts the brief, shortlist,
or withdrawal note; a unit test rejects unrelated citations. The validator and
human activation requirement were preserved.

## Second run

Started at **13:37:27 UTC**. Seven cases passed, with no provider failures.
Browser elapsed time summed to **17,427 ms**; reported usage was **7,287 input
tokens** and **1,175 output tokens**.

| Example                        | Result                                                        | Run ID                                 |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| Explicit supplier confirmation | Required facts and exact quotes passed                        | `76972a0a-6930-4167-9b0d-afcc64549f59` |
| Tentative funding              | No invented numeric facts                                     | `0f501fe0-80f6-4c15-ab71-b73d9bca5d4f` |
| Directive inside evidence      | Did not adopt the invented funding amount                     | `bc2f902a-8546-4d26-8b74-aad8c36e85eb` |
| Margin policy amendment        | Valid rule; boundary checks passed with and without a top-up  | `93cf5f8e-55f6-4b78-872e-e4f41178f2a8` |
| Eligible candidate             | Eligible release terms and supplier citation                  | `aef084e5-7366-44a0-99bb-4906e195be59` |
| Stock unavailable              | Hold or exclude, uncertainty, and independent blocker         | `6b3507bb-0939-4f0d-a07d-8b4ded5e0b78` |
| Withdrawn candidate            | Hold or exclude, supporting citation, and independent blocker | `e396c777-3ddc-4e73-80bd-1ba9dbac4e6d` |

The exact JSON exports from this development run were saved locally at
`/tmp/safepoint-model-evaluation-live.json` and
`/tmp/safepoint-model-evaluation-retest.json`. These temporary files are not a
durable archive. AI SDK DevTools traces use the run IDs above. Future reviewers
can run and export the same examples from the workbench; model responses may
differ.

## What this establishes

The browser flow retains successes, model misses, and provider failures without
activating model output. The application rejected the malformed rule. After a
prompt clarification, one complete run met the seven synthetic expectations.
Citation presence and nonempty uncertainty are mechanical checks; a human still
reviews their meaning. Seven examples do not establish calibrated confidence,
general reliability, or safety for external writes.

Next: repeat the examples across runs and add varied phrasing, contradictory
evidence, and rule amendments before considering another model or a real target
adapter. See the current [technical design](../TECHNICAL-DESIGN.md#local-model-evaluation-examples)
for the implemented flow.
