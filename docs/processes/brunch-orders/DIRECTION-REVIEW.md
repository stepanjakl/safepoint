# Brunch orders: direction review

Status: assessment and proposed next steps, 9 October 2026. Records the owner's
discussion with two models, including corrections to the initial assessment.
This is not a claim that a corrected definition set has been accepted, that
later phases are built, or that the product has been validated with users.

The [plan](PLAN.md) owns implementation phases. The
[development log](DEVELOPMENT-LOG.md) owns draft observations. This note owns
the interpretation of those observations and the questions still to test.

## Product purpose and the sequencing concern

The [product brief](../../product/PRODUCT-BRIEF.md) describes a person
inspecting, correcting and approving proposed changes, followed by
application-owned execution and verification. Brunch orders should establish
whether that experience helps someone make a better, faster, more informed
weekend ordering decision.

The current process can read data and draft and accept definitions. Calculate,
Propose, Check, Review and Apply remain planned. Repeated improvements to
drafting have placed a substantial research problem on the path to the first
useful order proposal. The strongest criticism concerns this sequence; the
observations do not establish that assisted rule authoring is unworkable.

Keep the useful foundations: captured reads, explicit data mappings, typed
formulas, source references, visible problems and versioned acceptance. The
recommendation is to use them to reach an operational result before expanding
the engine's generality.

## What determinism does and does not establish

Given the same data, accepted definitions and evaluator behavior, code can
reproduce a calculation or rule verdict. That does not establish that a
definition expresses the owner's intended policy. A wrong comparison can be
executed consistently on every run.

The third draft passed the available checks with an incorrect time conversion
and product grouping. The model had written both formulas and examples using
the same misunderstanding. The fourth draft exposed a reversed stock
comparison and reasoning that contradicted its verdict. These are observed
failures, not hypothetical objections.

Checks tying constants to quoted numbers and groups to named records are
general improvements grounded in independent source evidence. They are more
than patches for individual examples. Their coverage is nevertheless limited:
they do not establish correct operators, precedence, exceptions, dependencies
or complete extraction of policy. No evidence yet establishes that the
remaining semantic failure categories have been exhausted.

Examples also need scrutiny independent of the generated formula. A reviewer
must distinguish an input, an expected verdict and the explanation supporting
it. Agreement between formula and verdict does not validate the explanation.
Trying products inside and outside a group does not cover every formula
branch or both outcomes of every check. If the captured data cannot produce
a failing arrival, use a clearly labelled synthetic test case; do not present
invented evidence as a real sheet row.

## Corrections to the initial assessment

- **Universal means independent of a scenario.** The engine takes a declared
  process shape rather than assuming products or orders. That is compatible
  with explicit onboarding; it is not a promise of universal correctness when
  interpreting arbitrary prose and unknown data.
- **Drafting is setup per instructions version.** A corrected, reviewed set
  can be reused. Visible drafting mistakes are therefore more tolerable than
  fresh mistakes on every run. An overlooked setup mistake is also reused,
  so downstream correctness still needs independent checks.
- **The evidence is small and model-dependent.** The log records one Flash
  draft followed by three Flash-Lite drafts. Fewer discovered silent errors
  across changed prompts, checks and models do not establish a reliability
  trend, nor do they settle performance on the intended model configuration.
- **The alternative also costs effort.** Someone must encode and maintain
  policy. Whether reviewing and correcting a draft is cheaper than writing
  definitions directly remains unmeasured.
- **A mostly correct draft is not a reliability estimate.** Three correct
  definitions out of five support investigating and correcting that draft.
  They do not show how close the drafting system is to dependable performance.

The revised conclusion is that the approach is plausible and worth a bounded
experiment. The case for changing the order of work is stronger than the case
for abandoning the engine.

## Proposed next sequence

1. Correct the existing definitions with the owner, resolving or explicitly
   recording policy ambiguity. Check definition coverage against the
   instructions, including quantities that other definitions depend on.
2. Establish expected results independently of the model's worked examples.
   Include numerical boundaries, both check outcomes where meaningful,
   relevant product groups and conflicts. Record manual corrections and the
   evidence supporting acceptance.
3. Freeze the corrected set for the next experiment and identify the exact
   definitions, instructions and input snapshot used. Acceptance alone should
   not be described as an immutable runtime version; that binding must be
   preserved when Calculate and Propose are implemented.
4. Build Calculate and Propose using that set. Show every product, reproducible
   quantities, supporting evidence and unresolved exceptions. Keep independent
   proposal checking as the next gate before approval or application.
5. Continue through Check, Review and controlled Apply, with verification, as
   specified in the plan. Resume broader drafting work when the operational
   experience provides evidence about what setup assistance is needed.

This is a recommendation to stop making further drafting generalisation a
prerequisite for the next phases. Correctness problems affecting the frozen
set still need resolution. It does not require replacing the evaluator with
a second implementation of every business rule.

## A useful Brunch demonstration

Rounding a request for 50 additional loaves to seven cases of eight demonstrates
deterministic arithmetic once the rule and field mapping are explicit. It is
a useful small check, but a spreadsheet can already do it; it is weak evidence
for Safepoint's broader value.

A stronger demonstration is a complete weekend proposal with an exception a
person must understand. The instructions discourage ordering more ripe
avocados than will sell while also asking for category safety stock and whole
cases. Those requirements may conflict. The system should expose the
trade-off and obtain a decision about the intended policy, rather than
silently choosing an interpretation. This note does not settle that policy.

The model can propose alternatives and explain uncertainty. Code calculates
the consequences and checks the explicit constraints; explanations must be
grounded in those results.

## What the next experiments should establish

Assess three questions separately:

- **Execution:** does the frozen set produce the independently expected
  quantities and verdicts, and do edits update them correctly?
- **Product usefulness:** can an owner understand the proposal, spot and
  resolve exceptions, and complete the decision with less effort than their
  existing method?
- **Authoring:** how much time, correction and domain knowledge are needed to
  produce an acceptable set, compared with writing it directly? Record model
  configuration, detected and missed errors, unresolved cases and failures
  requiring help. Use independently specified cases beyond the examples used
  to repair a particular draft.

A useful run with manually corrected definitions supports the execution and
product questions. It does not establish automatic authoring reliability.
Likewise, a clean draft is not evidence that the resulting review experience
is useful. Both remain questions to test.
