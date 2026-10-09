# Experience principles

Status: current cross-process guidance, checked against the shell and replay review in October 2026. The [original experience specification](../archive/EXPERIENCE-SPEC.md) describes a proposed promotion-release screen and later approval and execution states; it is a historical design record.

## Show the decision

- Start with the proposal and its operational consequence. Keep the source facts, model judgement and application checks visibly distinct.
- Account for every candidate, including one omitted, blocked or unverifiable. A summary must be derived from the run, never copied from a demonstration fixture into UI text.
- Put a disagreement beside the item it concerns. Let the reviewer inspect its evidence and the reason for a rule outcome without losing the list.
- Name the status precisely: proposed, reviewed, approved, applied and verified are different events.

## Make review navigable

- A process contains runs. The shell keeps process instructions, inputs, outputs and settings separate from a run's thread and review.
- A compact result in the thread opens a focused review. The queue and selected item remain connected; opening an item does not count as approving it.
- Use native and React Aria keyboard behaviour, a visible focus indicator, and focus restoration when an overlay closes. Status messages must say what happened and what the person can do next.
- At narrow widths, preserve the reading order and reachability of the list, detail, and close control. Reduced-motion preferences must not hide state changes.

## Planned decisions

Approval, editable proposals, external application, verification and compensation require revision-bound server state and explicit execution evidence. Their detailed promotion-release designs in the archived specification are proposals, not descriptions of the current replay.

See [embedded review](../interface/EMBEDDED-REVIEW.md) for the present shell and [Brunch orders](../processes/brunch-orders/PLAN.md) for the active process's phased interaction work.
