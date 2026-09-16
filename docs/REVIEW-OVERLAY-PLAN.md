# Review overlay

Status: agreed direction, not yet built. Supersedes nothing; it settles how the review surface opens now that the process header owns the process's own tabs.

## Why

The review is a detour from a run, not a place a reviewer lives in. An overlay says that: it toggles on and off, the run stays behind it, and closing it costs nothing. A route would make every glance at a blocked line a trip out of the page and back.

What the overlay lacks is an address. Today its open state and selected line live in React state, so a refresh loses the line, the browser's Back button leaves the page instead of closing the overlay, and a blocked line cannot be linked to in a message. That is the whole of what this change fixes; the feel stays as it is.

Rejected alternatives, for the record: a third column beside the thread (at 1440 the review is itself a list and a detail, so it cannot fit beside one), expanding the card inline (a long page, and the commit bar has to float), and a full screen of its own (the in-and-out this exists to avoid).

## What changes

- **The URL owns two facts**: whether the review is open, and which line is selected. `?review=<batch>` and the existing `?sku=<line>`.
- **Opening** pushes those parameters; **closing** removes them. Escape, the scrim and the close control all close, as now.
- **Back closes the overlay** rather than leaving the process. A refresh reopens it on the same line.
- **The selected line already reads from `?sku=`** on the page — the cited-by chips in an input's records link that way — so half of this exists.

## What it does not change

- The compact release card in the run's thread stays the entry point.
- The line list, line detail, evidence disclosures and commit summary are untouched.
- Replay remains the transport: `ReplayReview` keeps owning `loadDetail`, and the shared review components keep knowing nothing about URLs.

## Shape

| Piece | Job |
| --- | --- |
| `app/(shell)/page.tsx` | Reads `searchParams`, passes `review` and `sku` down. Already reads `sku`. |
| A small client hook | Opens and closes by replacing the query string, `scroll: false`, so the thread does not jump. |
| `components/review/replay-review.tsx` | Takes `isOpen` and `onOpenChange` instead of owning them. |
| `components/review/review-experience.tsx` | Unchanged apart from receiving the controlled pair. |
| `components/app-shell/drawer-aside.tsx` | Reused for evidence beside a line, exactly as the setup drawer uses it. |

Two overlays now exist and must not be mistaken for each other: the setup drawer is narrow, on the right, about configuration; the review is wide, near-full, about decisions. Same geometry family, different weight.

## Accessibility

- Focus moves into the overlay on open and returns to the release card on close — the pattern the setup drawer already uses.
- Escape closes the evidence panel first and the overlay second, as the drawer does with its side panel.
- The overlay is a modal dialog with a heading; the line list keeps its roving focus.
- At phone width it is already full-screen, which is the strongest argument for it having an address.

## Verification

- Headless checks: a pasted link opens the overlay on the named line; Back closes it and leaves the thread in place; a refresh restores both; Escape and the scrim close it; focus returns to the card.
- `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test`.
- Both themes, and 390 px.

## Sequence

1. Commit the work already in the tree: the inputs and outputs restructure, the process header, the assistant, and the docs that go with them.
2. Build this, in one pass.
3. Only then reconsider the wider restructure — tabs as screens with their own routes, described in the discussion that produced this plan. It is not scheduled, and it would need a decision recorded against [`EXPERIENCE-SPEC.md`](EXPERIENCE-SPEC.md) and [`EMBEDDED-REVIEW.md`](EMBEDDED-REVIEW.md) first, as the delivery plan requires for a change that contradicts a canonical document.
