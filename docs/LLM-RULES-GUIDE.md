# Language models and deterministic rules: a learning guide

How a language model, which is inherently non-deterministic, can be used to
produce deterministic rules and tests (for example in CEL), and how those rules
can then make decisions you can verify, explain and eventually trust with real
actions.

The guide builds up in order:

1. [The core idea](#1-the-core-idea): why this is logical at all.
2. [What deterministic rules do not give you](#2-what-deterministic-rules-do-not-give-you):
   correctness.
3. [The acceptance pipeline](#3-the-acceptance-pipeline): how a candidate rule
   earns its place.
4. [Two ways to get rules from a model](#4-two-ways-to-get-rules-from-a-model),
   and [where this is used today](#5-where-this-is-used-today).
5. [Choosing a rule language](#6-choosing-a-rule-language): CEL, OPA/Rego and
   Cedar.
6. [A worked example](#7-a-worked-example-a-weekend-grocery-promotion): a
   weekend grocery promotion, from proposal to ordering.
7. [Calculated evidence instead of model confidence](#8-calculated-evidence-instead-of-model-confidence).
8. [When the model disagrees with the policy](#9-when-the-model-disagrees-with-the-policy).
9. [Practical pitfalls](#10-practical-pitfalls).
10. [What the research says](#11-what-the-research-says), and what is still
    open, then a [glossary](#glossary) and [sources](#sources).

## 1. The core idea

Yes, it is logical. In fact it can be a very sensible architecture,
**provided the model is treated as a rule generator, not as the rule engine**.

```text
Dataset → model discovers/proposes rules → CEL rules → deterministic evaluator → pass/fail
```

The model's non-determinism doesn't contaminate the final system, because the
model is used during a _rule synthesis_ phase. Once a CEL expression has been
generated, validated, reviewed and frozen, evaluating it against the same
inputs is deterministic.

For example, suppose the data contains transactions and you want to flag
suspicious ones. A model might propose:

```cel
transaction.amount > 10000 &&
transaction.country != account.home_country &&
account.age_days < 30
```

Another run might propose a somewhat different rule. But **this particular
expression**, once accepted, has precise semantics and will always produce the
same result for the same input.

The distinction that matters is between **determinism of rule generation** and
**determinism of rule execution**:

| Stage                       |   Deterministic?   | Is that a problem? |
| --------------------------- | :----------------: | ------------------ |
| Analyse data with the model |         No         | Usually not        |
| Propose candidate rules     |         No         | Usually not        |
| Write the rule in CEL       | Potentially varies | Manageable         |
| Check syntax and types      |        Yes         | Good               |
| Run the rule over the data  |        Yes         | Good               |
| Production decision         |        Yes         | Good               |

### Non-determinism can even help

You can treat the model as a **search heuristic over the space of
deterministic programs**: ask for twenty candidate rules, run every one
deterministically, score them, reject those that break constraints and keep the
best.

```text
Model run 1 ──► CEL A ──► score 0.81
Model run 2 ──► CEL B ──► score 0.94  ✓
Model run 3 ──► CEL C ──► score 0.76
Model run 4 ──► invalid CEL ──► rejected
Model run 5 ──► CEL D ──► score 0.91
```

This is conceptually close to stochastic optimisation: **the search can be
random while the resulting artifact, and its evaluation, are deterministic.**
Different generations explore different hypotheses.

## 2. What deterministic rules do not give you

CEL only makes _execution_ deterministic. It doesn't make the model's
reasoning correct. A rule being written in a formal language says nothing
about whether it is the _right_ rule.

Suppose the data shows:

```text
age < 18  → rejected
age >= 18 → accepted
```

and the model infers:

```cel
user.age >= 18
```

That could be an excellent inference, or merely a coincidental pattern in the
sample. CEL will faithfully execute the wrong rule forever.

So the question to design around is not _"Is a model too non-deterministic for
this?"_ but **"What deterministic acceptance criteria do we put around the
model so that a bad hypothesis can never silently become a production rule?"**

## 3. The acceptance pipeline

Avoid this:

```text
model → CEL → production
```

Prefer this:

```text
model
 ↓
candidate CEL
 ↓
parse + type-check
 ↓
evaluate against examples / training data
 ↓
evaluate against held-out data the model never saw
 ↓
check invariants and forbidden predicates
 ↓
human approval
 ↓
version + freeze the rule
 ↓
production CEL evaluator
```

Each gate is cheap, deterministic and explains itself when it fails:

```text
model
 │
 ▼
CEL
 │
 ├── parses? ─────────────── no → reject
 ├── type-checks? ────────── no → reject
 ├── only allowed fields? ── no → reject
 ├── complexity ≤ limit? ─── no → reject
 ├── matches examples? ───── no → reject
 │
 ▼
execute against data
 │
 ▼
score / review
```

### Held-out data

Don't generate and validate rules solely against the same data. A model can
overfit through rule discovery just as a statistical model can. Keep a set of
cases, ideally written by the people who own the policy, that the model never
sees, and measure every rule set against it. A rule set that passes the
model's own examples but fails the held-out cases is telling you something.

### Feed errors back

The gates are most useful when their errors go back to the model. A precise
message ("unknown field `stock.avilable`", "expected bool, got int") lets the
next attempt fix the exact problem. Even better, give the model a **read-only
tool** that type-checks or evaluates a formula during drafting, so it can test
its work before handing it in. After the last attempt, show any remaining
problems to the reviewer; never hide them.

### Trace every rule to its source

When rules are drafted from written policy, require each one to cite where it
came from (a document section, a spreadsheet cell) with an **exact quote**, and
check the quote mechanically. A rule with no traceable source is either an
invention or a suggestion, and should be labelled as such.

### Version and pin

An approved rule set gets a version. Each decision records which version made
it. Changing a rule creates a new version through the same pipeline; nothing
is edited in place. That gives you diffs, rollbacks and an audit trail for
free.

## 4. Two ways to get rules from a model

There are two quite different versions of this idea.

**From written requirements.** A person writes the policy in plain language
("refunds over $500 need a manager"), and the model translates it into a
formal language. The intent already exists; the model is a translator. This is
the mature version, already used in production.

**From historical data.** The model looks at thousands of past decisions and
proposes rules that explain them: _"find a compact set of CEL expressions that
explains these approvals and rejections."_ This is **model-assisted symbolic
rule induction**. It is harder and less mature, but potentially more
differentiated, especially where organisations have messy historical decisions
but need explainable deterministic rules.

```text
              historical data
                     │
                     ▼
              ┌─────────────┐
              │    model    │
              │ hypotheses  │
              └──────┬──────┘
                     │
              candidate CEL
                     │
              ┌──────▼──────┐
              │ CEL runtime │
              └──────┬──────┘
                     │
               predictions
                     │
          ┌──────────▼──────────┐
          │ deterministic scorer│
          │ accuracy     97.4%  │
          │ false +       0.8%  │
          │ coverage     91.2%  │
          └──────────┬──────────┘
                     │
              feedback to model
                     │
                     └──────► iterate
```

Eventually you freeze `ruleset-v37` and the model disappears from the decision
path entirely. You have used a probabilistic model to discover a
**deterministic, human-readable program**, which can explain exactly why
something happened, be regression-tested, diffed, audited and overridden, and
runs cheaply without a model.

In practice, most real systems are a mix: the written policy provides most of
the rules, and the data shows where the written policy is vague, missing or out
of date.

### Prefer many small rules

Instead of one giant expression:

```cel
(a && b && c) || (d && e) || (f && g && !h)
```

have the model produce **small, individually testable rules**:

```text
R001  account_age_days < 30
R002  amount > customer.average_amount * 4
R003  country != customer.home_country
R004  failed_transactions_24h >= 3
```

each with its own record:

```json
{
  "id": "R003",
  "expression": "transaction.country != customer.home_country",
  "description": "Transaction originates outside the customer's home country",
  "precision": 0.91,
  "recall": 0.34,
  "support": 1842,
  "false_positives": 181,
  "dataset_version": "2026-09-15"
}
```

A deterministic layer then decides how rules combine (for example: any
blocking rule blocks; any warning needs a person). That gives you a
**versioned, measurable, explainable rule set**, not just generated code.

### Name the intermediate values

Rules read much better when repeated calculations are pulled out into named,
typed values (often called _facts_ or _derived fields_):

```text
available     = on_hand - reserved + inbound
required      = expected_demand + safety_stock
shortfall     = max(0, required - available)
```

Each rule then reads like the policy it came from (`order >= shortfall`), each
fact can be shown to a reviewer with its value, and an error in one place
doesn't hide in five copies of the same sub-expression.

## 5. Where this is used today

**Amazon Bedrock AgentCore Policy** is probably the clearest production
example. A model translates natural-language requirements into **Cedar**,
AWS's policy language. The generated Cedar is validated against a schema,
analysed symbolically, and then enforced by a deterministic engine outside the
model. AWS describes the motivation almost exactly as above: because the model
is non-deterministic, it is treated as untrusted for enforcement. They call it
a **"neuro-symbolic AI feedback loop"**.

```text
human intent
     │
     ▼
   model
     │
     ▼
candidate Cedar
     │
     ▼
schema validation
     │
     ▼
symbolic / mathematical analysis
     │
     ▼
review / log-only shadow testing
     │
     ▼
accepted policy
     │
     ▼
deterministic enforcement
```

The user benefit is concrete. Someone writes _"Allow the refund agent to issue
refunds only below $500"_ and gets something equivalent to:

```text
permit(...) when { context.input.amount < 500 };
```

An agent can later decide _"I want to refund $800"_, but it **cannot persuade
or hallucinate its way around the $500 policy**, because Cedar, not the model,
makes the decision. AWS also recommends running generated policies in
log-only mode before enforcing them.

Other examples:

- **IBM Smith** (open source) generates OPA/Rego policies from
  natural-language specifications, then generates test cases, including
  attempts to bypass the policy, to test them.
- **Prose2Policy** (research) converts natural-language access policies into
  Rego with schema validation, linting, compilation and generated tests. It
  reports a 95.3% compile rate among accepted policies, and 82.2% positive and
  98.9% negative test pass rates.

What is practically used today is mostly the _written requirements → policy_
version. The _historical data → discovered policy_ version is much less
mature.

## 6. Choosing a rule language

### CEL and OPA are not quite peers

[CEL](https://cel.dev/) (Common Expression Language) is an **expression
language** you embed in your own application. [OPA](https://www.openpolicyagent.org/)
(Open Policy Agent) is a **policy engine and platform**, whose language is
Rego. [Cedar](https://www.cedarpolicy.com/) is a **policy language and engine**
focused on authorisation. Comparing them as targets for model-generated rules
is still the right comparison.

|                             | CEL                                        | OPA / Rego                       | Cedar                         |
| --------------------------- | ------------------------------------------ | -------------------------------- | ----------------------------- |
| Mental model                | Expressions                                | Policy/query language            | Permit/forbid policies        |
| Complexity                  | Low                                        | Medium–high                      | Low–medium                    |
| Expressiveness              | Intentionally constrained                  | Much more expressive             | Constrained to authorisation  |
| Embedding in an app         | Excellent                                  | Possible, heavier                | Good                          |
| Collections and joins       | Limited (`all`, `exists`, `map`, `filter`) | Powerful                         | Limited                       |
| Bundles, decision API, logs | You build them                             | Built in                         | Partly built in               |
| Formal analysis             | Type checking                              | Type checking, testing           | Designed for automated proofs |
| Model generation            | **Very attractive**                        | Attractive, more failure modes   | Attractive for access rules   |
| Best fit                    | Business rules, predicates, calculations   | Organisation-wide policy systems | Who may do what to what       |

The same rule in CEL:

```cel
customer.age >= 18 &&
customer.account_age_days >= 30 &&
transaction.amount <= 5000
```

and in Rego:

```rego
package transactions

default allow := false

allow if {
    input.customer.age >= 18
    input.customer.account_age_days >= 30
    input.transaction.amount <= 5000
}
```

Rego naturally grows beyond a single predicate, and that's where OPA pulls
away:

```rego
allow if {
    is_verified_customer
    transaction_within_limit
    not blocked_country
}

requires_review if {
    input.transaction.amount > 5000
    input.transaction.amount <= 10000
}

deny_reason contains "Account too new" if {
    input.customer.account_age_days < 30
}
```

### Why less power is an advantage for generated rules

CEL is designed to be **non-Turing-complete, memory-safe, free of side effects
and guaranteed to terminate**. That is almost exactly what you want when
executing machine-written code. The model can't generate `while true`, make
network calls, write files or touch a database. It produces a bounded
expression over data you supply.

```text
                 Your application
         ┌──────────────────────────┐
data ───►│ CEL expression           │
         │  no I/O, no network      │
         │  no database, no files   │
         │  bounded computation     │
         └───────────┬──────────────┘
                     │
                   result
```

You can constrain it further:

```text
max expression size:   N nodes
allowed fields:        declared in a typed schema
allowed functions:     a whitelist (ideally only the standard library)
return type:           bool for rules
```

A smaller language is also easier for a model to write correctly and easier
for a person to review. OPA/Rego is also safe to evaluate; the argument is
that CEL gives you a **smaller surface to govern** when the code is written
automatically.

**Standard functions only.** It is tempting to add custom helper functions
(`ceil_div`, `days_between`). Every one is something the model must be taught,
that other CEL implementations don't have, and that is specific to one problem.
Standard CEL already covers integer arithmetic, conditionals (`a ? b : c`),
collection macros, timestamps and durations; prefer it, and add a custom
function only when a rule genuinely can't be written without it.

**Typed environment.** Declare every variable and field with its type before
checking a rule. Then a typo (`stock.avilable`) or a type mistake (comparing
money to a date) is caught when the rule is _checked_, not when it first
meets real data.

### When to choose OPA instead

When the problem becomes a real organisational **policy system**: who can
access resource X, which workloads may run, whether service A may call service
B, which permissions a user inherits, and why a request was denied. Those
benefit from Rego's ability to combine many data sources and policies, and
from OPA's bundles, decision logs and distribution. With CEL you build that
control plane yourself, which may be exactly what you want if the control plane
is your product.

### A typed intermediate format

A stricter option is to have the model produce a **typed intermediate format**
(a small JSON structure describing the rule) and compile that to CEL with
ordinary code:

```text
                  Rule IR
                     │
            ┌────────┴────────┐
            ▼                 ▼
           CEL               Rego
            │                 │
       embedded app           OPA
```

This places even less trust in the model and leaves room for other targets
(CEL, Rego, SQL) later. The trade-off is that the format has to anticipate
every shape of rule, so it tends to be tied to one domain. Letting the model
write standard CEL directly, against a typed environment with a checking tool,
is more general; the intermediate format is more controlled.

## 7. A worked example: a weekend grocery promotion

A service reads a simple grocery data set (products, stock, sales,
deliveries, promotions, offers, suppliers). A model is asked to propose a
simple weekend promotion on a couple of products. There is little history
besides some sales numbers.

This is a **better** fit for the architecture than asking a model to infer a
predictive model from sparse data. The key is to separate **what the model
proposes** from **what the system can prove from the data** and from **what
actions it is permitted to take**.

### Proposal plus testable claims

The model proposes _"15% off strawberries and 10% off Greek yoghurt this
weekend."_ Instead of accepting that as an opaque recommendation, make it
return a structured proposal and the claims it relies on:

```json
{
  "proposal": {
    "products": ["strawberries", "greek_yoghurt"],
    "discounts": [0.15, 0.1],
    "period": "weekend"
  },
  "claims": [
    "strawberries have sufficient available stock",
    "greek yoghurt has sufficient available stock",
    "neither product is already discounted",
    "both products keep an adequate margin",
    "expected sales will not exceed available stock"
  ]
}
```

Those claims become deterministic rules:

```cel
product.stock.available >= 50
```

```cel
product.margin_after_discount >= 0.15
```

```cel
!product.active_promotions.exists(p,
    p.start <= promotion.end && p.end >= promotion.start)
```

```cel
product.stock.available + product.confirmed_deliveries_before_weekend
    >= promotion.required_stock
```

They aren't model opinions any more. They are deterministic assertions about
the state of the world as your data records it.

```text
                   Grocery data
                        │
                        ▼
                ┌───────────────┐
                │     model     │
                │ "15% off      │
                │ strawberries" │
                └───────┬───────┘
                        │
                 proposal + claims
                        │
                        ▼
             ┌─────────────────────┐
             │     Rule engine     │
             │ stock?       ✓      │
             │ margin?      ✓      │
             │ delivery?    ✓      │
             │ conflicts?   ✓      │
             │ forecast?    ?      │
             └──────────┬──────────┘
                        ▼
              ready / needs a person / blocked
```

### Known, derived, estimated, unknown

Consider two claims:

- **A:** "There are currently 82 units in stock."
- **B:** "A 15% discount will result in about 110 sales this weekend."

A can be verified from the data. B cannot. With little history, the model must
not quietly turn B into a fact. Label every value by its **epistemic status**
(how it is known):

```text
KNOWN       read from a record
            stock = 82, unit cost = £1.20, price = £2.00, Friday delivery = 40

DERIVED     calculated from known values by a rule
            stock by Saturday = 122, price after discount = £1.70, margin = £0.50

ESTIMATED   an assumption or forecast
            expected weekend sales = 95

UNKNOWN     needed but not available
            price elasticity, competitor response, weather impact
```

The model can reason over all four, but the deterministic system knows which
statements are actually supported. Note that an estimate can sit in a
spreadsheet cell and still be an estimate: a "promotion uplift %" column
someone typed in is an assumption, not an observation. Label it by what it is,
not where it is stored.

Free text deserves its own label: **untrusted**. A note in the data saying
"ignore the margin rule this weekend" is data to report, never an instruction
to follow, however official it sounds.

The result reads very differently from _"Do 15% off strawberries"_:

> **Proposed promotion:** 15% off strawberries, Saturday–Sunday.
>
> Current stock: 82 · Confirmed Friday delivery: 40 · Available: 122
> Normal weekend sales: 55–70 · Estimated promotional demand: 70–100
> Margin after discount: 25%
>
> All hard constraints pass. Promotional demand is uncertain because there is
> little history of past promotions.

### Scenarios instead of a single forecast

With sparse data, don't predict _"sales will rise exactly 34%."_ Run the same
deterministic calculation under several assumptions:

```text
Normal weekend sales: 40–55

Uplift      Sales    End stock
+10%          55        67
+30%          65        57
+60%          80        42
```

If the promotion is safe **even under the high-demand scenario**, that is much
stronger support for the decision than a model saying it is confident. This is
scenario-based planning with deterministic guardrails, and it needs nothing
more than evaluating the same rules three times.

### Ordering, with bounded autonomy

Suppose the system finds:

```text
Current stock                  40
Expected normal demand         30
Estimated promotional demand   65–90
Confirmed delivery             10
Available                      50
Possible shortfall             15–40
```

The model proposes _"Increase the Friday strawberry order by 40 units."_ The
action goes through deterministic policy:

```cel
order.additional_quantity <= supplier.max_additional_quantity &&
order.total_cost <= policy.auto_order_limit &&
delivery.arrival <= promotion.start &&
product.shelf_life_days >= 3 &&
product.projected_stock_after_order <= product.storage_capacity
```

```text
Order +40 strawberries                Order +400 strawberries
 │                                     │
 ├─ supplier can deliver Friday  ✓     ├─ cost £720
 ├─ cost £72, limit £100         ✓     ├─ auto-order limit exceeded
 ├─ storage capacity             ✓     │
 ├─ shelf life                   ✓     ▼
 ▼                                    HUMAN APPROVAL REQUIRED
AUTO-APPROVED → ordering system
```

That is **bounded autonomy**, not "the agent has purchasing credentials." The
model never holds the credentials; application code performs the order after
the policy (and, where required, a person) has approved it.

Practical additions for anything that writes to a real system:

- **Check before writing:** re-read the target just before the write; if it
  changed since the decision was made, stop and re-decide.
- **Check after writing:** read back what was written and compare.
- **Undo only while it's safe:** an undo is allowed only while the target
  still holds what was written.
- **Start everything at "needs approval"**, and loosen one narrow class of
  action at a time as evidence accumulates (see the next section).

### The model's role shrinks as data grows

Over time you accumulate structured outcomes: product, discount, day, starting
stock, weather, normal sales, promotion sales, margin, waste, stock-outs. Then
quantitative questions can move to components that are better at them:

```text
                    ┌──── model ────┐
                    │   proposes    │
                    │  promotions   │
                    └──────┬────────┘
                           ▼
                   candidate actions
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      CEL policies    forecast model    simulator
           └───────────────┬───────────────┘
                           ▼
                    decision engine
                           │
                     ┌─────┴─────┐
                     ▼           ▼
                  execute      review
```

The model is responsible for **creative and planning reasoning** and for
reading vague text; specialised deterministic and statistical components
answer quantitative questions.

Every decision can leave an auditable record:

```text
Decision #92831

PROPOSAL   15% strawberry promotion
WHY        high stock relative to baseline sales; strong margin; no conflict
KNOWN      stock 82, incoming 40, margin 25%
ASSUMED    promotional uplift 10–60%
TESTS      ✓ stock  ✓ margin  ✓ delivery  ✓ supplier  ✓ worst-case stock-out
ACTION     create promotion (rule set v12)
FOLLOW-UP  measure actual sales and waste
```

## 8. Calculated evidence instead of model confidence

Don't ask the model _"How confident are you?"_ and trust
`{"confidence": 0.93}`. Self-reported confidence isn't what you want. Compute
evidence from measurable properties instead.

### A simple example

For the strawberry promotion, score five pieces of evidence:

| Evidence                    | Result                    | Score |
| --------------------------- | ------------------------- | ----: |
| Current stock known         | 82 units, updated 1 h ago |   1.0 |
| Incoming deliveries known   | 40 confirmed for Friday   |   1.0 |
| Margin after discount       | 25%, well above minimum   |   1.0 |
| Baseline sales evidence     | 6 weekends of data        |   0.7 |
| Promotional uplift evidence | only 1 previous promotion |   0.2 |

Each score comes from a deterministic rule. Demand history:

```text
0 weekends → 0.0     1 → 0.2     2–3 → 0.4     4–7 → 0.7     8+ → 1.0
```

Delivery status:

```text
planned → 0.3   acknowledged → 0.6   confirmed → 0.9   dispatched → 1.0
```

Data freshness:

```text
< 2 h → 1.0     < 12 h → 0.8     < 24 h → 0.5     older → 0.2
```

which can itself be CEL:

```cel
sales.weekends_observed >= 8 ? 1.0 :
sales.weekends_observed >= 4 ? 0.7 :
sales.weekends_observed >= 2 ? 0.4 :
sales.weekends_observed >= 1 ? 0.2 : 0.0
```

With weights (stock 20%, deliveries 15%, margin 20%, baseline 20%, uplift
25%):

```text
1.0×0.20 + 1.0×0.15 + 1.0×0.20 + 0.7×0.20 + 0.2×0.25 = 0.74
```

**The model didn't choose 74%; the software did**, and it can show exactly
what pulled the score down:

```text
PROPOSAL  15% off strawberries this weekend
Evidence score: 74% — HIGH

✓ Stock data          100%
✓ Delivery certainty  100%
✓ Margin evidence     100%
△ Baseline sales       70%
⚠ Promotion response   20%

Main uncertainty: little evidence of how strongly a 15% discount
changes strawberry sales.

Allowed: ✓ create promotion draft   ✗ increase supplier order automatically
```

### Hard gates first, the score second

Keep the separate dimensions, not just one number. Two decisions can both
score 74% with very different risk:

```text
Promotion A: stock 1.0, margin 1.0, demand 0.4
Promotion B: stock 0.4, margin 1.0, demand 1.0
```

Poor demand knowledge risks an ineffective promotion; poor stock knowledge
risks selling something you can't supply. So **critical evidence is a hard
gate**, not part of an average:

```cel
evidence.stock >= 0.8 && evidence.margin >= 0.9 && evidence.delivery >= 0.8
```

```text
              proposed action
                     │
             HARD EVIDENCE GATES
            ┌────────┴────────┐
          FAIL               PASS
            │                 │
         reject        evidence score
                     ┌────────┼────────┐
                    LOW     MEDIUM    HIGH
                     │        │         │
                  suggest   draft    execute*
```

`*` subject to separate action and financial limits.

| Evidence                     | Allowed action        |
| ---------------------------- | --------------------- |
| Low                          | Suggest only          |
| Medium                       | Suggest and simulate  |
| High                         | Create a draft        |
| High, low financial exposure | Execute automatically |
| High, substantial exposure   | Human approval        |

A caution: the weights and bands are themselves policy. They are made up at
first, so treat them like any other rule: written down, versioned, reviewed,
and changed only with evidence. Showing the individual dimensions is often more
honest than showing the single number.

### Evidence grows with use

```text
Before:  promotion-effect evidence 0.2
Run it:  expected 70–100, actual 84, no stock-out, no waste
After 5 similar promotions:  0.6
After 20:                    0.9
```

```text
model proposes → evidence scoring → rules + simulation → controlled action
      ↑                                                        │
more autonomy ← more evidence ← store outcome ← observe result ┘
```

**Autonomy is earned through accumulated evidence, not granted because a
model sounds confident.** Start with everything requiring approval, and let
specific, narrow classes of decision become autonomous as they prove
predictable and low-risk.

## 9. When the model disagrees with the policy

What if the model reaches a conclusion, the policy rejects it, and the model
turns out to be right? That is a **valuable learning signal**, not a failure of
the architecture.

**Don't let the model override the policy because it disagrees.** Record the
disagreement and the outcome:

```text
             Model    Policy    Outcome
Week 1       BUY      REJECT    model right
Week 2       BUY      REJECT    model right
Week 3       BUY      REJECT    policy right
Week 4       BUY      REJECT    model right
```

When the pattern is meaningful, generate a **policy-change proposal**:

> Rule R-17 rejected 12 model recommendations in the last 3 months. In 9 of
> 12 cases the rejected action would have reduced stock-outs.
> Suggested change: raise the ordering threshold from 30 to 45 units.

The change goes through the same pipeline as any rule: backtest it against
history, show which past decisions it would have changed, approve it, and
release it as a new version.

```text
model disagreement → observe outcome → measure who was right
   → find systematically wrong rules → propose a change → backtest
   → human approval → new deterministic policy
```

The same loop works with **people's** decisions. If reviewers keep editing the
same field in the same direction (cutting a perishable order every week), that
pattern is a suggested rule too.

**The model can challenge the policy, but cannot violate it.** The rules don't
have to be static: they can be falsifiable and evolve with evidence.

## 10. Practical pitfalls

**Money and counts in integers.** Floating point is wrong in ways that matter
at a boundary: `50 × 1.1` is `55.00000000000001` in IEEE doubles, so a
"round up" turns a planned 55 into 56. Store money in minor units (pence,
cents) and compare percentages by cross-multiplying:
`(price - cost) * 100 >= floor_pct * price` instead of
`(price - cost) / price >= 0.25`. CEL helps here because `int` and `double`
are separate types that don't mix silently.

**Fail closed.** A rule that can't be evaluated (a missing value, a division
by zero, an overflow) must count as _not passed_, never as passed. "Could not
check" is a reason to stop, shown to the person.

**Time is harder than it looks.** "Order by Thursday 12:00" means a wall-clock
time in a time zone, and a week with a daylight-saving change has 167 or 169
hours. Convert local times to instants once, in one tested place, and make
the run time an input, never the system clock read deep inside a rule, so
every decision can be replayed exactly.

**Data from spreadsheets.** Bind columns by header name, not position;
someone will insert a column. Read raw values, not formatted text. A blank
cell is "unknown", not zero.

**Untrusted text in the data.** Notes, comments and descriptions may contain
instructions, accidentally or deliberately. Mark them as untrusted when they
are shown to the model, never let a rule cite them as authority, and make
sure no text can lower a rule's outcome.

**Keep the tests away from the drafter.** If the model sees the expected
answers, it can write rules that pass them without encoding the policy.

**Human review needs a readable form.** A reviewer approving rules shouldn't
need to read CEL. Show each rule with its source quote, its formula rendered
with plain field labels, its result on current data, and what would change if
it were approved. Clearly separate text written by the model from text
generated by code.

**Limit size and cost.** Cap the size of each expression and the number of
rules, and set timeouts on drafting. Generated code tends to grow when it is
unsure.

**Cross-check the evaluator.** If correctness matters, run the official
conformance tests for your CEL library, or evaluate the same rules in two
independent implementations in your test suite.

## 11. What the research says

This is an active research area. The work so far supports most of this guide,
and adds a few techniques worth knowing.

### Generator–critic loops work

[Autoformalization of Agent Instructions into Policy-as-Code](https://arxiv.org/html/2606.26649v1)
(2026) turns agent instructions, tool descriptions and policy documents into
Cedar with a **generator–critic loop**:

- a **hard critic**, deterministic: syntax, schema, contradictory rules and
  vacuous rules (rules that can never matter), with errors fed back for up to
  three retries;
- a **soft critic**, a model acting as judge of whether each rule means what
  the source text says, as a second opinion.

Every generated rule carries an annotation linking it to its source. On a
medical-records benchmark the generated policies covered far more of an
88-rule policy than hand-written ones. But roughly **a third of the policy
could not be expressed as rules at all** and needed other methods. Expect that:
a good drafter reports what it could not formalise rather than forcing it.

### Most requirements can be simple rules

[Don't Make Models Guess Security and Safety](https://arxiv.org/pdf/2604.15579)
(Carnegie Mellon, 2026) reviewed 80 agent safety benchmarks and three in depth:

- **85%** of benchmarks state no verifiable requirements at all, only
  common-sense expectations;
- of the requirements that are stated, **74%** can be enforced
  symbolically, and **95%** of those need only simple checks, mostly
  validating an action's arguments;
- with symbolic guardrails, violations fell from **20–78%** of tasks to
  **0%**, and task success did not drop; in one benchmark it rose from **36% to
  48%**, because a blocked action tells the agent why and it can retry safely.

The authors argue that simple deterministic checks, the kind ordinary software
has used for decades, are overlooked in favour of model-based guardrails, and
are the practical path for risk-averse business software.

### Let the model answer small questions, not the whole decision

[PolicyGuard](https://arxiv.org/html/2606.32004) (2026) reviews contracts
against organisational policy. Each policy becomes a **rule card** and then a
logical formula over small facts ("atoms"). The model only answers narrow
yes/no questions about each atom, with supporting evidence from the document.
A solver combines the answers deterministically.

- Accuracy **93.4%** against **75.8%** for asking a model directly.
- Across ten repeated runs, results moved by **1.3** points, against
  **6.8–8.9** for direct prompting.
- Experts can fix one question or one formula without touching the rest.

This is the cleanest known way to bring judgement on vague text inside a
deterministic rule: the model reads, the rule decides.

```text
policy text ──► rule card ──► formula:  late_delivery_risk ∧ order_needed → review
                                              ▲                 ▲
                                   model answers, with      calculated
                                   a quoted note as evidence  from data
```

### Rules can create obligations, not just refusals

[AgentGuardUtil](https://arxiv.org/html/2608.23282) (2026) compiles policies
once into typed rules (precondition, prohibition, confirmation, constraint)
and runs an **obligation engine**: given what has been observed and the
proposed actions, which further actions does the policy still require?
For example, "a count older than a day must be recounted before ordering."
Twenty-five deterministic gates check the compiled policy. The cost is real:
about four times the tokens and six times the time per turn.

### Measure consistency, not just a single success

The same paper reports a 27-point gap between **pass@3** (right at least once
in three tries) and **pass^3** (right all three times). A drafter that is
sometimes right is not yet trustworthy. Draft the same rules several times and
compare the results; PolicyGuard's run-to-run variance is the kind of number
to report.

### Counterexamples beat "wrong"

Program synthesis research repurposes **CEGIS** (counterexample-guided
inductive synthesis) for models: a verifier returns a concrete failing input,
which goes into the next prompt ([Counterexample guided learning in the large](https://arxiv.org/pdf/2606.11521)).
A specific case improves the next attempt far more than a bare failure. A
read-only "evaluate this formula on this data" tool gives the model the same
benefit during drafting. Keep the held-out cases out of this loop, or they
stop being held out.

### Rules about the data itself

[Quality Assessment of Tabular Data using LLMs and Code Generation](https://arxiv.org/pdf/2509.10572)
(EMNLP 2025, industry track) has a model propose **data-quality rules** (this
column is never negative, these dates are in order) as structured rule cards,
then generate validators for them. Checking that the data is sane is a useful
first layer before any business rule runs.

### Stated confidence is unreliable

[Can LLMs Express Their Uncertainty?](https://arxiv.org/pdf/2306.13063)
(ICLR 2024) found that when models state their confidence, they are
overconfident: most stated values fall between 80% and 100% regardless of
whether the answer is right. Agreement across several sampled answers is a
better signal, and evidence calculated from the data (section 8) better
still.

### What is still open

Most published work translates written policy into **access rules for an
agent's tool calls**: allowed or not, stateless, with little arithmetic. Less
explored, as far as a short search shows:

- drafting **rules that calculate** as well as decide: derived values, integer
  money, deadlines across a week and clock changes;
- rules gathered from **several sources at once** (tables, parameters, a brief,
  plain-language rules) rather than one policy document;
- evaluation against **checks written by the policy owner** that the drafter
  never sees;
- labelling **how each value is known** (observed, derived, estimated,
  untrusted) alongside the decision;
- turning **people's repeated corrections** into proposed rules.

A small study answers most of the practical questions: draft the same rules
several times with more than one model, and report how often the draft is
valid, how many owner-written checks pass, how stable the result is across
runs, how much of the source policy is covered, and whether editing one
source rule changes exactly one drafted rule.

## Glossary

| Term                   | Meaning                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Deterministic          | The same inputs always give the same output.                                                  |
| Rule synthesis         | Producing rules (here, with a model) as a separate step before they are used.                 |
| Rule induction         | Inferring rules from examples of past decisions.                                              |
| CEL                    | Common Expression Language: a small, typed, side-effect-free expression language from Google. |
| OPA / Rego             | Open Policy Agent, a policy engine, and its policy language.                                  |
| Cedar                  | AWS's authorisation policy language, designed for automated analysis.                         |
| Type checking          | Confirming, before running, that every name exists and every operation fits its types.        |
| Held-out data          | Cases the rule generator never sees, used to measure the rules honestly.                      |
| Fact / derived field   | A named value calculated from data by a formula, shared by rules.                             |
| Epistemic status       | How a value is known: observed, derived, estimated, unknown, or untrusted.                    |
| Fail closed            | Treating an error or missing input as "not allowed" rather than "allowed".                    |
| Bounded autonomy       | Letting a system act on its own only within explicit, checked limits.                         |
| Shadow / log-only mode | Running a new policy alongside the old one and recording what it would have done.             |
| Vacuous rule           | A rule that can never fail or never applies, usually a sign it was written wrongly.           |
| CEGIS                  | Counterexample-guided synthesis: a verifier returns a failing case to guide the next try.     |
| pass@k / pass^k        | Right at least once in k tries / right in all k tries: the second measures consistency.       |
| Backtest               | Running a proposed rule over past data to see which decisions it would have changed.          |

## Sources

- [Why Policy in Amazon Bedrock AgentCore chose Cedar for securing agentic workflows](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/) (AWS Security Blog)
- [AgentCore: policies from natural language](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-natural-language.html) and [`start_policy_generation`](https://docs.aws.amazon.com/botocore/latest/reference/services/bedrock-agentcore-control/client/start_policy_generation.html) (AWS documentation)
- [IBM Smith: automated policy lifecycle management for AI agents](https://github.com/IBM/smith) (GitHub)
- [Prose2Policy: translating natural-language access policies into executable Rego](https://arxiv.org/abs/2603.15799) (arXiv)
- [CEL](https://cel.dev/), [Open Policy Agent](https://www.openpolicyagent.org/docs/latest/), [Cedar](https://www.cedarpolicy.com/)
- [Common expressions for portable policy](https://opensource.googleblog.com/2024/06/common-expressions-for-portable-policy.html) (Google Open Source blog)
- Research: [Autoformalization of agent instructions into policy-as-code](https://arxiv.org/abs/2606.26649), [Don't make models guess security and safety](https://arxiv.org/abs/2604.15579), [PolicyGuard](https://arxiv.org/abs/2606.32004), [AgentGuardUtil: from natural language policies to executable obligations](https://arxiv.org/abs/2608.23282), [Counterexample guided learning in the large](https://arxiv.org/abs/2606.11521), [Quality assessment of tabular data using LLMs and code generation](https://arxiv.org/abs/2509.10572), [Can LLMs express their uncertainty?](https://arxiv.org/abs/2306.13063)
