# Post-change model comparison · 3 October 2026

Continuation of the [expanded evaluation](2026-10-03-model-evaluation.md), using
the unchanged suite 2 and `gemini-3.5-flash-lite`. Extraction input excludes
baseline supplier data and the stage prompt assesses conflicts per field.
This continuation changed no application code, expected answers, or active
rules. No facts were confirmed, cases approved, or external writes performed.

## Three attempts

The existing browser evaluation UI made the calls. All attempts shared the
page's scenario clock, `2026-10-03T16:10:40.731Z`; requests and exports retained
their original timestamps without interception or rewriting. A 70-second wait
after each attempt respected the previously observed request quota. These
attempts reported no quota errors.

| Attempt | Started (UTC) | State     | Passed | Model misses | Provider failures | Not run |
| ------- | ------------- | --------- | ------ | ------------ | ----------------- | ------- |
| 1       | 16:10:44      | Completed | 10     | 2            | 0                 | 0       |
| 2       | 16:12:26      | Stopped   | 1      | 0            | 1                 | 10      |
| 3       | 16:13:49      | Stopped   | 1      | 0            | 1                 | 10      |

The harness requested **Stop after current call** on a provider failure. The
next case was already in flight in attempts 2 and 3, so each retained two
results. Their ten remaining cases are unrun, not passing or failing results.
Both errors reported connection timeouts with attempted IPv6 addresses. This
does not establish the network failure's cause.

The exact reports are local temporary files
`/tmp/safepoint-eval2-post-run1.json` through
`/tmp/safepoint-eval2-post-run3.json`; the combined inspection summary is
`/tmp/safepoint-eval2-post-summary.json`. These files are not a durable archive.
The UI continues to store only the latest report. The run IDs below locate the
corresponding local AI SDK DevTools traces.

## Extraction observations

The unresolved funding conflict returned only the uncontested 60-unit
allocation, with an exact quote and an explanation of the competing funding
amounts. It did not adopt either disputed amount. Run ID:
`b53ae87f-6ebf-4e96-bb16-bfff1e08d0ad`. The earlier omission did not recur in
this complete run, but that is one observation rather than a reliability claim.

Tentative funding returned no unsupported quantities or copied baseline facts
in all three available responses. Run IDs:

- `f89f49a7-f60e-43fa-967d-2b8b799e1687`
- `b821f428-f3f1-4fc5-887f-707f363601d2`
- `f8be1c33-62b2-46d4-83d9-f8621ed81ca1`

Alternate supplier wording still missed a required field. The model correctly
extracted funding of 8 pence per unit and an allocation of 180 units, but omitted
`fundingStatus: confirmed` despite the test's expected interpretation of
commercial sign-off. No uncertainty was supplied. The evaluation retained the
omission rather than weakening its expectation. Run ID:
`889b6116-530a-4f97-b8e9-8facfd1b4c9d`.

## Valid JSON with the wrong policy effect

The 12% margin amendment retained the existing `minimumMarginPercent` fact,
whose trusted value was still 15. Its JSON, existing rule code, and source quote
were valid. The rationale nevertheless claimed to implement the replacement.
Independent boundary checks rejected it at margins of 12% and 13%, both with
and without a top-up. Run ID: `a89f3656-f094-4580-a7ae-4c57f74c9dfd`.

The rule stage was unchanged by the extraction fix. Its new failure shows
response variability rather than evidence that extraction changes caused a
rule regression. Structural validation and citation presence alone cannot
establish that a rule implements an instruction; behavior examples and human
review remain necessary. Nothing activated this suggested rule.

## Verification and limits

There was one complete post-change suite, not three complete suites. It had
ten passing cases and two model misses. The two partial attempts contribute
tentative-extraction observations and operational failures, but cannot establish
stability across the full suite. No claim of overall quality improvement or
calibrated confidence follows from these results.

The prior 148 unit tests, four browser tests, repository checks, and webpack
build remain applicable because application code did not change. Verification
in this continuation exercised the live UI, its stop behavior, persistence, and
model route. This record was checked for formatting and consistency with the
saved outputs. Earlier tooltip visual differences, Turbopack restrictions, and
unverified manual screen-reader delivery remain as recorded in the prior run.
