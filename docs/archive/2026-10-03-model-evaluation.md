# Expanded model evaluation · 3 October 2026

Suite 2 on `/workbench/explore` adds five examples to the original seven:
alternate supplier wording and quantities, explicitly declined funding,
unresolved conflicting amounts with an uncontested allocation, replacement of
the existing margin threshold, and a conditional margin amendment. Model:
`gemini-3.5-flash-lite`. No model output was activated or applied to an external
system.

## Attempts retained

All attempts used the same seeded rules and scenario clock
`2026-10-03T15:08:00.375Z`. Later browser requests were anchored by the test
harness; the exported request timestamps record the actual transmitted anchor.
All twelve cases were attempted in each run. Provider failures are counted
separately from model misses.

| Attempt | Started (UTC) | Passed | Model misses | Provider failures | Context                                                        |
| ------- | ------------- | ------ | ------------ | ----------------- | -------------------------------------------------------------- |
| 1       | 15:08:01      | 11     | 1            | 0                 | Initial expanded suite                                         |
| 2       | 15:08:26      | 4      | 0            | 8                 | Rapid repeat hit free-tier quota                               |
| 3       | 15:08:34      | 0      | 0            | 12                | Quota had not reset                                            |
| 4       | 15:14:39      | 11     | 1            | 0                 | Repeat after reset                                             |
| 5       | 15:16:06      | 10     | 2            | 0                 | Repeat with a reset wait                                       |
| 6       | 15:20:18      | 4      | 0            | 8                 | Comparison after extraction changes; early connection timeouts |

Exact local exports: `/tmp/safepoint-eval2-run1.json` through
`/tmp/safepoint-eval2-run6.json`. These temporary files are not a durable archive.
AI SDK DevTools retains local traces correlated by the run IDs below. The UI
stores one latest report; a reviewer exports it before replacing it. Suite 1
reports remain readable and exportable without rescoring or inventing results
for the five new cases.

## Findings from three complete provider-successful runs

Attempts 1, 4, and 5 yielded 36 model responses: 32 passed the synthetic checks
and four failed. Every margin amendment passed its format, rule identity,
boundary, severity, and applicability checks. The available/blocked promotion
examples and injected directive also passed in all three runs.

The conflicting evidence example failed in all three. The model correctly
withheld the disputed funding amount but also dropped the uncontested 60-unit
allocation. Example run ID: `ae2e77dc-f86a-40bf-941e-48e647687628`. This is a
completeness failure; a cautious omission should remain visible in evaluation.

In attempt 5, tentative evidence produced copied structured supplier values
with quotes from the baseline JSON instead of the pasted text. The independent
quote validator flagged every claim. Run ID:
`b1bf7e8e-c7a0-463f-87b0-ba5216bdecac`. Quoted text must belong to the declared
source, and even a valid exact quote does not establish its interpretation.

## Changes and comparison

The extraction input now contains only SKU, pasted text, and role. The baseline
supplier record remains in the comparison UI and proposal stage. Extraction
instructions now assess each field separately, omit disputed values, retain
uncontested facts, explain conflicts, and avoid converting unspecified amounts
to zero. The existing source-quote validator and human confirmation requirement
were preserved. A regression assertion checks that baseline supplier data is
absent from extraction input.

Attempt 6 suffered eight initial connection timeouts. Connectivity recovered
for the final four cases, which all passed. The conflict case returned the
60-unit allocation with an exact quote, withheld the disputed amount, and
explained the disagreement. Run ID: `ad53f5d0-e6c4-4313-85e8-05a59021dceb`.
This is one successful comparison for that case, not a complete successful
post-change suite. The combined input/prompt change does not identify which
individual change caused the improvement.

A final complete comparison could not launch: automatic permission approval
review timed out, including the one allowed retry. No additional model results
were produced by those launch attempts.

## Operational and verification limits

Provider quota errors reported a free-tier request limit of 15 and a reset
delay. Rapid repeats produced 20 recorded quota failures; spacing later runs
restored model calls. The UI now reminds reviewers to wait for the provider
reset. There is no new automatic retry, quota scheduler, or fallback model.
Eight later connection timeouts were retained separately; an unauthenticated
IPv4 endpoint reachability check succeeded afterward. This does not establish
the cause of the earlier connection failures.

The three complete baseline runs expose repeatable omissions and one variable
extraction failure. They do not establish calibrated confidence, general
reliability, or authorization for real writes. Further comparison should repeat
the updated extraction cases after connectivity and quota permit it. A second
model critic remains deferred until such examples show a useful role for it.

The expanded browser flow passed in both themes, including keyboard start/stop,
status text, export/reload, suite 1 compatibility, a 390px viewport, and scoped
axe checks. Manual screen-reader delivery was not verified. The separate visual
baseline check passed in dark mode and flagged eight light-mode tooltip boxes;
those match tooltip changes already present at task start and were preserved.

Final repository verification passed lint, typecheck, formatting, unused-code
checks, and all 148 unit tests. Production compilation passed with
`pnpm build --webpack`. The default Turbopack build failed on its internal
port-binding restriction (`Operation not permitted`), including an escalated
attempt; the repository build configuration was not changed.

See the current [technical design](../TECHNICAL-DESIGN.md#local-model-evaluation-examples)
for the implemented experiment.

The [post-change continuation](2026-10-03-post-change-evaluation.md) records a
later complete comparison and two attempts stopped by connection failures.
