# Alderton's promotion-release replay

This directory contains version `1.0.0` of the reviewed Fresh Food Weekend replay. A replay represents the output of a previous accepted run; it is not source evidence supplied to the agent.

The matching fictional source evidence lives under [`fixtures/`](../../../fixtures/promotion-release/aldertons-promotion-release-v1/README.md). The [promotion-release data dictionary](../../../docs/PROMOTION-RELEASE-DATA-DICTIONARY.md) explains the fields and controlled values.

## Why this is separate

```text
fixtures/       what the agent may inspect
replays/        what a completed run produced
tests/fixtures/ what automated tests expect
```

Keeping these locations separate prevents a replayed answer from being mistaken for source evidence and prevents the test oracle from becoming a shortcut to a runtime result.

Both replay files retain the same `scenarioId` and `fixtureVersion` as the evidence pack. `loadReviewedReplay()` validates that relationship before returning application data.

## Files

### `promotion-release-plan.json`

This is the reviewed agent proposal. It contains the recommendation, proposed changes, gate assessments, rationale, uncertainties, and evidence references for all 27 products. It deliberately contains no copy of current prices, stock, supply, or channel state.

In Stage 4, a live agent will produce the same `PromotionReleasePlan` shape from four read-only tools. The replay remains the stable development, test, and outage-fallback path.

### `policy-evaluation-replay.json`

This is the reviewed expected policy output used by the static interface. It is neither agent evidence nor the real policy implementation.

Stage 3 will calculate policy from source data and the proposal. At that point this file remains useful as a regression expectation but stops being the runtime source of policy results.

## Test oracle

The separate `tests/fixtures/promotion-release/evaluation-oracle.json` records expected observations and permitted safe alternatives. Runtime and interface code must never import it.
