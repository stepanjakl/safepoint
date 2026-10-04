# Browser review experiment scope

Date: 2026-10-03. Status: accepted through the user's browser experiment plan
and follow-up authorization to address the independent review.

## Decision

Keep the user-requested browser experiment as a development extension of the
promotion scenario. `/workbench/explore` is its primary reviewer flow. Inputs,
fact confirmation, rule editing, diagnostics, and model examples remain on that
page, using disclosures to keep the default review readable. The policy and
model pages remain specialist inspection views.

This is an explicit exception to the delivery plan's sequencing, not completion
of its production milestones. The main application still uses the reviewed
replay. Local records and in-memory effects do not establish a durable policy
lifecycle, external preflight, connector execution, or recovery.

## Trust boundaries

- A model interprets evidence and proposes facts, rules, gate assessments, and
  permitted actions. It cannot confirm facts, activate rules, approve a case, or
  execute effects.
- Server-owned instructions stay separate from editable task instructions.
- Previously unverified funding needs both an accepted status and an accepted
  amount. Confirming status alone blocks review and never promotes the original
  unverified amount.
- Trusted code calculates facts, validates sources, enforces required gates,
  and assigns finding severity and approval consequences. Model gate results
  cannot override a trusted failure. A required failed, unavailable, unchecked,
  or incorrectly not-applicable gate blocks model review.
- Manual numerical trials use labelled trusted checks; they do not claim a new
  model assessment. Advisory external signals remain explicitly unchecked when
  no assessment exists.
- All four core JSON checks and their failure consequences are protected.
  Margin and price-change thresholds remain editable business policy. Additional
  conditional checks use custom rule codes. Relaxation or changed custom logic
  needs an explicit reviewer acknowledgement before local activation.
- Rule activation and individual case approval are separate decisions. A clean
  numerical result can still require individual approval for a correction or a
  choice between compliant plans.
- The local simulation adapter applies only approved channel fields and the
  top-up recommendation. Preflight and read-back inspect an independent memory
  target. They can detect injected drift and failed application, but prove
  nothing about an external system.

## Verification and next milestone

> **Superseded in part, 3 October 2026.** The next-milestone paragraph below is
> replaced by [`SHEET-PROCESS-PLAN.md`](SHEET-PROCESS-PLAN.md), which moves the
> main demonstration to a sheet-driven process. The trust boundaries above still
> apply to the promotion-release experiment.

Regression expectations compare all 27 candidates' codes, severities, approval
consequences, affected fields, and blocking outcomes. Explanations and evidence
links come from current facts, rather than copying the replay's wording.
Current trial snapshots record `promotion-review-v2`; older records remain
historical and are not silently rescored.

Model suite 3 adds tentative allocation, two compliant alternatives, already
included uplift, and a directive in pasted catalogue text. Deterministic checks
score supported outputs and required approval consequences. A human still
judges the rationale and trade-offs. Older reports retain their original suite
counts and responses. These synthetic examples do not establish confidence or
general reliability.

The implementation passed 159 unit tests, 32 focused browser tests in light and
dark themes, lint, typechecking, formatting, unused-code checks, and the webpack
production build. Browser coverage includes keyboard focus, status markup,
narrow layouts, local records, and simulation failure paths. Actual screen
reader announcement delivery was not manually verified. The visual check passed
in dark mode; eight light-theme tooltip differences already present before this
work remain outside this change. A live request using only the fictional
fixture received Google's temporary high-demand error, so the expanded model
contract still needs a successful live trial.

After reviewer feedback on this flow, return to the delivery plan: connect the
shared review output to the complete 27-line application workspace, then add
approved effect planning and a genuine sandbox adapter with independent external
preflight, verification, and recovery. Defer additional experiment pages,
providers, model critics, and general process frameworks until that path works.
