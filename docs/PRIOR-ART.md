# Safepoint prior art

Status: research notes, not decisions

Audience: product, design, and engineering contributors

Last reviewed: 28 September 2026

This document records tools that solve a problem close to Safepoint's, what each does well, and which of their ideas are worth borrowing. Nothing here is decided until a canonical document adopts it. Duvo is covered separately in [`PROJECT-REVIEW.md`](PROJECT-REVIEW.md#findings-from-the-official-duvo-documentation).

## Where Safepoint sits

Safepoint's neighbours fall into two groups:

- **Change-review tools without AI**, such as infrastructure plans, database change requests, and pull requests. They have long practised the loop Safepoint applies to agent output: plan, check against policy, review, apply exactly what was reviewed, record the result.
- **Human-in-the-loop layers for agents**, which pause an agent at a tool call and ask a person to approve, edit, or reject it.

The second group reviews one action at a time. Safepoint reviews a complete change set: every candidate accounted for, policy evaluated outside the model, and each effect preflighted, verified, and compensated after approval. The first group is closer in shape and the richer source of ideas.

## Change-review tools

### Terraform plan and apply

Terraform produces a plan, which can be saved and reviewed before `terraform apply` executes it; when a saved plan is applied, no further planning options can change it. HCP Terraform discards a saved plan automatically when the state it was planned against changes before confirmation. See [run modes and options](https://developer.hashicorp.com/terraform/cloud-docs/run/modes-and-options) and the [`apply` command reference](https://developer.hashicorp.com/terraform/cli/commands/apply).

This is the same principle as "approval never silently expands beyond what the reviewer saw". Terraform acts on the whole plan; Safepoint's per-effect preflight is finer, withholding only the conflicting effects so that a partial release can proceed. That difference is deliberate and worth keeping.

### Sentinel enforcement levels

HashiCorp's policy framework gives every policy one of three [enforcement levels](https://developer.hashicorp.com/sentinel/docs/concepts/enforcement-levels):

| Level | On failure |
| --- | --- |
| Advisory | The run continues; the failure is shown. |
| Soft-mandatory | The run stops unless a user with override permission lets it continue. |
| Hard-mandatory | The run stops until the cause is fixed. |

Safepoint's required and advisory gate obligations match hard-mandatory and advisory. It has no equivalent of soft-mandatory.

**Future:** a soft-mandatory obligation would let an authorised reviewer release a line past a failed rule, with the override, its reason, and its author recorded in the audit history. The portfolio deliberately has none; a real deployment will face pressure for one, and a recorded override is safer than the workaround of loosening the rule.

### Bytebase change review

Bytebase checks proposed database changes automatically and computes a risk level of high, moderate, or low from the statement type, environment, and rows affected. That risk level then routes the change to a matching chain of approvers, so dropping a table can need several approvals while creating one needs a single review. See [custom approval flows](https://docs.bytebase.com/tutorials/database-change-management-with-risk-adjusted-approval-flow).

**Future:** when multiple reviewers arrive (item 10 of the [future-product track](PRODUCT-BRIEF.md#future-product-track)), route approval by effect-level risk rather than giving each process one approver. The risk dimensions in the product brief (monetary impact, reversibility, external visibility, regulatory exposure, system criticality) are the natural routing conditions.

### DoltHub data pull requests

Dolt versions tables like code, and DoltHub reviews data changes as pull requests. Its diffs are cell-wise, matching rows across versions by primary key, and can be filtered by added, deleted, or modified rows. Reviewers can comment on a single cell. Each comment stores the row's key and a hash of its content, and becomes outdated when a later push changes that row. See [pull requests](https://docs.dolthub.com/concepts/dolthub/prs) and [pull request diff comments](https://www.dolthub.com/blog/2023-10-16-pull-request-diff-comments/).

**Future:** anchor review notes and rejection reasons to a field of a line, not the line as a whole, and mark a note outdated when that field's proposed value changes. This also feeds the instruction-drafting item of the future track, which needs to know exactly which value a reason was about.

### GitHub pull request review

A reviewer can mark each file as Viewed, which collapses it and advances a progress count. If the file changes afterwards, the mark is removed and a "Changed since last view" badge appears. See [reviewing proposed changes](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request).

Safepoint already clears a line's approval when it is edited ([`EXPERIENCE-SPEC.md`](EXPERIENCE-SPEC.md#edit)). What it lacks is a record of what the reviewer has looked at, separate from what they decided.

**Future:** a per-line seen state, cleared when the line's proposal changes, would make "checks all omitted or unverifiable lines" something the interface can confirm instead of something it hopes happened.

## Human-in-the-loop layers for agents

| Tool | What it does | Relation to Safepoint |
| --- | --- | --- |
| [LangChain Agent Inbox](https://github.com/langchain-ai/agent-inbox) and [LangGraph interrupts](https://docs.langchain.com/oss/python/langchain/frontend/human-in-the-loop) | An inbox of interrupted runs; each pending tool call can be approved, edited, rejected with a message, or answered. | The generic per-call baseline Safepoint is compared against. It has no candidate accounting, independent policy, or effects ledger. |
| [HumanLayer](https://www.humanlayer.dev/) | Launched (Y Combinator, [F24](https://www.ycombinator.com/companies/humanlayer)) as an API and SDK through which agents request approval over Slack or email. By September 2026 its site describes it as "the multiplayer control plane for your software factory". | The repositioning suggests that a horizontal approval API alone is hard to build a business on. |
| [gotoHuman](https://www.gotohuman.com/) | Review forms for agent output, independent of framework and model. | Not examined in detail; the site could not be fetched during this review. |
| [Temporal](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python) and Vercel Workflow | Durable workflows that can wait for a human signal. | Infrastructure Safepoint already uses rather than competes with; see [`TECHNICAL-DESIGN.md`](TECHNICAL-DESIGN.md). |

## Viability notes

These are assumptions drawn from the landscape, not research findings.

- **Assumption:** approval pauses are becoming a built-in feature of agent frameworks and platforms. A generic approval layer is therefore weak on its own; Safepoint's distinct value is the process-specific part: typed effects, complete accounting, independent policy, verification, and compensation.
- **Assumption:** that part is costly to build, because each connector's preflight, verification, and compensation are service- and operation-specific ([`TECHNICAL-DESIGN.md`](TECHNICAL-DESIGN.md#connector-reuse) rules out a universal write connector). A product would probably have to start in one domain, such as retail promotion and replenishment, or live inside an agent platform, as the Duvo adapter proposes.
- **Assumption:** reviewer fatigue decides whether line-level review is used. Practitioner guidance recommends auto-approving high-confidence, low-risk actions and escalating only the exceptions ([StackAI](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)). Safepoint's bulk approval of eligible lines, with high-risk lines excluded, is its answer; the ready lines should read as one group decision, not seventeen separate chores.
- The cheapest test of generality is the second process (item 4 of the future track). If the review shell carries it with only a new process definition, the category-general claim holds; if it needs new screens, it does not yet.
