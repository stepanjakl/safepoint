'use client';

// Deep import: Blode's barrel is the whole icon library.
import MagicEdit from 'blode-icons-react/icons/magic-edit';
import { Button, type Slant } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

/*
  Placeholder. What it is for: asking about whatever is on screen -- why a line
  is blocked, what changed in a version, which inputs a run did not use -- and
  being answered with the same evidence records the review cites, so an answer
  can be checked rather than believed. It can also draft: the next instruction
  version from a run's review decisions, each edit traced to the item that
  prompted it. Everything it produces is a proposal that goes through review.

  It cannot approve, publish or write. The pencil says it makes something; the
  stars say a model made it; neither says it acts.

  In the notch rather than in the row, because it belongs to the application
  and everything in the row belongs to the process being read. That also makes
  it the natural home for anything global that follows: it is on every screen,
  whatever the screen is about. Its face is the ordinary control face -- the
  slanted shape is what sets it apart, not a colour of its own.

  Drawn live but aria-disabled, like the sidebar's placeholders, so it can
  still be hovered and focused for its tooltip.
*/
export function Assistant({ slant }: { slant?: Slant }) {
  return (
    // Under the notch rather than above it -- the pane's top edge is at the
    // viewport's -- with its top on the notch's floor and its end on the
    // pane's side, past the gap the notch holds this control in by (see
    // .app-tooltip[data-anchor] in app/components.css). No container padding:
    // react-aria's 12px would hold the box short of a pane inset by less.
    <Tooltip
      label="Assistant"
      description="Ask about this run, its evidence and its instructions. It answers and opens records; it cannot approve or change anything. Coming soon."
      placement="bottom end"
      offset={0}
      containerPadding={0}
      anchor="notch"
    >
      {/* Wider inside than an ordinary button: it is the only control in the
          notch, and the slope on its left eats into the space its icon would
          otherwise have. */}
      <Button
        slant={slant}
        aria-label="Assistant"
        aria-disabled="true"
        className="px-5"
      >
        <MagicEdit
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="flex-none -translate-y-px"
        />
        {/* The word goes at phone width, where the row has already given its
            controls up to the name and the notch should stay narrow. */}
        <span className="max-sm:hidden">Assistant</span>
      </Button>
    </Tooltip>
  );
}
