# Alderton's promotion-release evidence

This directory contains version `1.0.0` of the fictional Fresh Food Weekend source evidence. It contains no production, personal, or user-entered data.

See the [Stage 1A data-flow map](../../../docs/STAGE-1A-BRIEF.md#current-data-flow) for how these files pass through validation and reach application code.

The [promotion-release data dictionary](../../../docs/PROMOTION-RELEASE-DATA-DICTIONARY.md) explains every business field and controlled value in plain language. The matching reviewed outputs live separately under [`replays/`](../../../replays/promotion-release/aldertons-promotion-release-v1/README.md).

## Source evidence

- `promotion-brief.json` defines the campaign, required 27-line candidate set, dates, intended prices, uplift, and one later withdrawal.
- `shortlist-provenance.json` explains how each line entered the already approved upstream shortlist.
- `catalogue-pricebook.json` contains trusted product, price, cost, and pack facts.
- `demand-evidence.json` contains recent sales and forecasts.
- `supply-position.json` keeps stock, reservations, inbound supply, earlier promotion orders, and open amendments separate.
- `supplier-terms.json` contains lead time, allocation, order constraints, funding, and the final top-up cutoff.
- `operational-notes.json` contains bounded narrative evidence. Every note is explicitly untrusted and must never be treated as an instruction.
- `channel-state.json` contains the staged pricebook, storefront, and label values.
- `policy-rules.json` contains the scenario's deterministic thresholds.

## Arithmetic vocabulary

Available supply before launch is:

```text
stock on hand
- reserved stock
+ confirmed inbound before launch
+ earlier promotion orders
+ open top-up amendments
```

Remaining shortfall is forecast demand plus safety stock minus available supply, with a lower bound of zero. A positive top-up is rounded up to satisfy both the minimum order quantity and order multiple.

Funded unit margin is promotional selling price minus cost price plus confirmed per-unit funding, divided by promotional selling price. Unverified funding contributes zero until confirmed.

These definitions make the seeded exceptions reproducible without relying on the replay rationale.
