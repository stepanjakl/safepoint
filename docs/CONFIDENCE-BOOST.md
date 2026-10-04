# Confidence boost: what the research says about our direction

A plain-language summary of how recent research backs the sheet process
([`SHEET-PROCESS-PLAN.md`](SHEET-PROCESS-PLAN.md)): a model drafts the rules,
code checks and runs them, and a person approves. The papers, their numbers
and the ideas we took from them are in
[`LLM-RULES-GUIDE.md`](LLM-RULES-GUIDE.md#11-what-the-research-says).

Written 4 October 2026.

## 1. "Let the model write the rules, but don't let it be the rules" is the accepted way to do this

AWS built a product on exactly this idea, and a 2026 paper did nearly what we
do: a model drafts policy rules, deterministic checks send back errors, the
model tries again (up to three times), and each rule points back to the text it
came from
([AWS](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/),
[arXiv 2606.26649](https://arxiv.org/abs/2606.26649)). We weren't inventing an
odd architecture. We arrived at the same one serious teams use.

```text
model drafts → code checks → model fixes → person approves → code enforces
```

## 2. Most real business rules are simple enough to write as rules

Carnegie Mellon found that about three quarters of written requirements can be
checked by plain code, and nearly all of those need only simple checks like
"is this number under the limit?"
([arXiv 2604.15579](https://arxiv.org/abs/2604.15579)). That's what our sheet's
rules look like: margins, whole cases, cut-off times, supplier maximums. It also
backs our choice of plain, standard CEL with no custom functions. You don't
need a clever language for this.

## 3. Hard rules make the system better, not just safer

The usual worry is that strict rules get in the way. The same study found the
opposite: with rules enforced in code, violations fell to zero and the agent
completed _more_ tasks, because a clear "no, and here's why" helps it find a
better answer. That's our design: the agent proposes, the rules say blocked,
needs a decision or ready, and explain why.

## 4. Don't trust the model's own sense of how sure it is

When models are asked how confident they are, they say 80–100% almost every
time, right or wrong ([ICLR 2024](https://arxiv.org/abs/2306.13063)). So our
approach is right:

- every number comes from a cell or a formula;
- every rule cites its source;
- certainty comes from the data, not from the model saying it feels sure.

## 5. Model judgement belongs inside the rules, in small pieces

Another study let the model answer only small questions like "does this note
say the delivery may be late?", with a quote as evidence. Plain logic then made
the decision ([PolicyGuard](https://arxiv.org/abs/2606.32004)). That was much
more accurate than letting the model decide (93% against 76%), and gave nearly
the same result every run. It confirms our split: the model reads the messy
parts (notes, the brief), and code makes the call.

## Usefulness

The researchers say this kind of simple, checkable rule is overlooked, and is
the practical way to bring AI agents into careful businesses that can't afford
one bad mistake. That's the audience our demo speaks to.

## Where we go a step further

Most of the research is about rules like "is the agent allowed to call this
tool?". Ours also calculate: demand, shortfalls, margins and deadlines across a
week. They're drawn from a whole spreadsheet, and tested against checks the
store wrote and the model never saw. Nobody seems to have done that
combination yet. That's from a short search, not a full literature review. So
the project is feasible, and it also has something new to show.
