# Documentation

Safepoint lets a person inspect and approve proposed changes before application-owned code applies them. This index separates what the repository **does now** from proposals and records of earlier work. Check the code and fixtures when a document and an implementation disagree.

## Start here

| Purpose                        | Document                                                                                                                                | Status                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Active implementation hand-off | [Brunch orders plan](processes/brunch-orders/PLAN.md) and [development log](processes/brunch-orders/DEVELOPMENT-LOG.md)                 | In progress                                                 |
| Product direction              | [Product brief](product/PRODUCT-BRIEF.md)                                                                                               | Direction; implemented and future capabilities are labelled |
| Current architecture           | [Architecture](engineering/ARCHITECTURE.md) and [definitions engine](engineering/DEFINITIONS-ENGINE.md)                                 | Code-verified guide                                         |
| Current interface              | [Embedded review](interface/EMBEDDED-REVIEW.md) and [styling system](interface/STYLING-SYSTEM.md)                                       | Implemented guidance, with future work labelled             |
| Earlier sheet experiment       | [Brunch weekend](processes/brunch-weekend/README.md) and its [rulebook engine guide](processes/brunch-weekend/RULEBOOK-ENGINE-GUIDE.md) | Retained development example                                |
| Earlier replay scenario        | [Promotion-release data dictionary](processes/promotion-release/DATA-DICTIONARY.md)                                                     | Implemented replay contract                                 |

**Brunch orders** is the active hand-off. Its development-only route is `/examples/brunch-orders`. It reads Products, Stock, Sales, Deliveries and Parameters, then uses `lib/definitions/` to find, check and approve definitions from versioned instructions. Its later calculation, proposal, review, application and history phases remain planned.

The [Brunch orders direction review](processes/brunch-orders/DIRECTION-REVIEW.md) records the 9 October assessment of drafting reliability and product direction, including the proposed next experiment with a corrected, frozen definition set. It is a proposal, not evidence that later phases or reliable automatic authoring are complete.

**Brunch weekend** is the earlier sheet and whole-rulebook experiment at `/examples/avocado-toast`. Its separate `lib/rulebook/` engine remains in the repository. **Promotion release** is the earlier 27-line replay at `/examples/promotion`. These three examples must not be read as one implementation or one roadmap.

## By topic

- [Product](product/PRODUCT-BRIEF.md): purpose, terms, principles and future goals. [Experience principles](product/EXPERIENCE-PRINCIPLES.md) contains reusable interaction guidance.
- [Interface](interface/EMBEDDED-REVIEW.md): shell and review direction; [assistant sidebar](interface/ASSISTANT-SIDEBAR.md), [contrast checks](interface/CONTRAST-CHECKER.md), and the [unbuilt review overlay URL plan](interface/REVIEW-OVERLAY-PLAN.md).
- [Engineering](engineering/ARCHITECTURE.md): implemented boundaries and explicitly proposed production architecture. The [definitions engine](engineering/DEFINITIONS-ENGINE.md) is the current Brunch orders engine.
- [Processes](processes/brunch-orders/PLAN.md): each example's own contract and history. The [Brunch weekend walkthroughs](processes/brunch-weekend/RULEBOOK-ENGINE-WALKTHROUGHS.md) describe that experiment's distinct engine.
- [Research](research/PRIOR-ART.md): supporting comparison and the [LLM rules learning guide](research/LLM-RULES-GUIDE.md), with a [short summary](research/RULES-RESEARCH-SUMMARY.md). Research is evidence, not implementation authority.
- [Archive](archive/README.md): completed or superseded plans, decisions and trial records. Dates and historical paths in those records describe the code at the time.

`generated/colour-theme-report.json` is a generated workbench input; its path is part of the colour tooling and is intentionally unchanged.

## Reading rule

For implemented behaviour, use the current guide with its cited code and fixtures. For work that has not landed, use the active Brunch orders plan or an explicitly labelled proposal. Archived documents explain earlier decisions and must not override the current guides or code.
