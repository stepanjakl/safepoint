# Embedded review direction

Status: current product and implementation direction, September 2026. This supersedes the standalone-first composition in the Stage 1B briefs, experience specification and Fable handoff. Their evidence, authority and accessibility requirements still apply.

Safepoint appears as a compact review response in an existing conversation. It expands into a focused review surface and eventually returns a durable result to that same conversation. The conversation provides context; the structured change set defines what a person reviews.

## Two surfaces

The inline response names the process and batch, accounts for every item in three groups, shows the leading blocker, and offers one primary review action. Ready means ready for human review, never approved or applied. Replay mode and the absence of applied changes remain visible.

The expanded surface groups items by disposition, most severe first. It starts on the leading blocker, when one exists. A filter exposes every group and all items. The selected item leads with one operational conclusion, its reason, what would resolve it, and proposed changes. Supporting facts, recorded policy findings, agent checks, provenance and intended destinations are disclosures. Source facts, model interpretation and policy findings remain separate data even when the first view summarises them.

The host may provide a panel or full-screen view using the shared review body. The local demonstration uses a modal dialog, full-screen at narrow widths. Escape and the visible close action return focus to the invoker; closing does not imply a decision. Selection belongs to each component instance, not the host's global URL. Container width controls the list/detail layout. Browser history is a future host-adapter responsibility.

No approval, edits, commitment or execution are implemented in this replay slice. There are no decorative approval buttons. The footer explains the current boundary. Future approval must bind an exact revision and visible scope; changed facts or proposals invalidate affected approval. Approved, applied and verified remain distinct states. Execution must survive closing the review.

## Release plan contract

`lib/review/plan-contract.ts` carries the card: an ordered severity scale (`blocked`, `awaiting a decision`, `deferred`, `will apply`), typed deltas, and a discriminated commit status. `lib/review/plan-derivations.ts` owns every count. Nothing is stored twice, so the verdict line and the pills beneath it cannot disagree; a test asserts they use the same word for the same bucket.

Colour is bound to a bucket's position on the scale, never to its label, so a fifth bucket is a token change. Approval is a property on the row rendered as a chip, not a bucket: a fifth pill would break the ordinal read.

Deltas are built from typed source values, never parsed back out of display text. `before: null` means the prior value was not observed; `create` means no prior value exists. Collapsing those is how invented before-values get in. An unrecognised delta kind degrades to `opaque` so a row never renders as a gap, but a malformed *known* kind still fails validation, because swallowing it would hide an adapter bug behind a plausible-looking row.

Exclusion, when it lands, adjusts `selectedCounts` only. `evaluationCounts` ignores it and drives the bar, the pills, the verdict and the state, so excluding the last blocker can never turn a blocked plan into "all clear".

### `deferred` has no producer

The bucket is on the scale and nothing populates it. The natural producer is `requiresApproval`: an effect awaiting another person's sign-off is intentionally held back this run, which makes approval both a row chip and an input to disposition. That needs the evaluation envelope to carry an approver identity, and the promotion fixtures to mark at least one line as requiring external approval. Until then the promotion replay renders three buckets and the support fixture exercises the fourth.

## Replay boundary

No control names an operation this slice cannot perform. Under `mode: 'replay'` apply, retry, undo and re-run render as receipt text, never buttons; the only live controls are navigation. Applied and partially applied states label themselves simulated receipts. When applying is genuinely impossible the action changes — `Resolve blockers` — rather than being greyed out.

`/examples/states` renders all eight states plus a 2,000-effect plan as an interactive harness with synthetic detail payloads. Above five items in a group the card rolls up by reason. The modal pages lists exceeding 200 matching items in groups of 50, keeping the selected item on its rendered page. Set changes retain exact added and removed values in the detail pane, and execution failures show each item’s failure reason separately from its evaluation findings.

## Reuse boundary

`lib/review/contracts.ts` defines a validated presentation contract: batch identity and revision, complete item summaries, operational groups, changes, facts, checks, findings, evidence and intended effects. This is a UI contract, not a general policy engine or an execution authorisation.

The promotion adapter maps the validated grocery replay into that contract. A small synthetic support-handoff fixture exercises the same card and review components without SKU, currency, margin or grocery gate assumptions. It is a presentation example with recorded checks, not a second production process or connector. Both are explicit direct imports; there is no plugin registry or configuration language.

The next domain slice should standardise the evaluation envelope (versioned input snapshot, evaluation time, policy version, findings and evidence references). Process modules retain typed inputs, normalisation, units, business rules and allowed operations. Normalisation must retain provenance and uncertainty; valid JSON does not make an assertion true. Implement the required deterministic policies before allowing proposal edits.

Only batch summaries reach the initial client. Detail is fetched on selection, validated, checked against the requested identity and revision, and cached within the review instance. The read-only replay route serves fixed synthetic data. It is not a production authorisation boundary. Production host integration needs authentication, scope checks and an adapter for the host's actual display capabilities.

## Visual rules

Keep the Fable grammar: quiet stone surfaces, graphite text, restrained state colour, tabular Geist Mono values and precisely bounded controls. Give the batch and selected decision generous space. Use sentence case for normal labels. Reserve uppercase readouts for small system identifiers. Flat shared edges separate related information; do not enclose every subsection. The effects rail becomes a supporting destination list before execution, reserving sequence and progress for the future deterministic effect plan.

The compact response is the signature object: a complete, accountable summary small enough to belong in a conversation. The larger dialog supplies working room without reproducing a dashboard in miniature.

## Acceptance and next work

- All 27 grocery candidates remain discoverable: 17 ready, six needing attention, four unable to proceed.
- Salmon remains blocked despite the agent's release recommendation. Unavailable evidence is never labelled passed, zero, or merely not applicable.
- Proposed changes are separate from costs, funding and forecasts. Missing current values are labelled as unavailable snapshots, not invented before values.
- The support fixture uses the same components and transport contract.
- Verify dialog entry/exit, focus restoration, filtering, selection, disclosure, failed detail loading and retry, narrow host containers, both themes, and contrast.
- Next: calculate actual policy before editable review; then add revision-bound decisions, exact-scope confirmation, persistence and durable execution. Host-specific MCP or Duvo integration follows verified host capabilities.

Original reference images were not available in this checkout. Visual implementation follows the written Fable synthesis; direct image fidelity remains to be reviewed when those references are available.
