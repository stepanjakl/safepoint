'use client';

// Deep import: Blode's barrel is the whole icon library.
import MagicEdit from 'blode-icons-react/icons/magic-edit';
import { Button, type Slant } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

/*
  Placeholder. What it is for: every decision a reviewer makes on a run -- an
  item blocked, a change held, a reason written against a rejection -- is
  evidence about where the instructions are wrong. This reads those decisions
  and drafts the next version of the instructions, with each edit traced to
  the review item that prompted it. The draft is itself a proposal: it is
  reviewed and accepted like any other change, and the next run shows
  "Ran under v5".

  Beside the Instructions button because it is the only thing that changes
  them. Drawn live but aria-disabled, like the sidebar's placeholders, so it
  can still be hovered and focused for its tooltip.
*/
export function RefineInstructions({
  version,
  slant,
}: {
  version: string;
  slant?: Slant;
}) {
  return (
    // Under the notch rather than above it -- the pane's top edge is at the
    // viewport's -- with its top on the notch's floor and its end on the
    // pane's side, which this control's end already is. No container padding:
    // react-aria's 12px would hold the box short of a pane inset by less.
    <Tooltip
      label="Draft the next instructions"
      description={`Suggests edits to ${version} from this run's review decisions. Coming soon.`}
      placement="bottom end"
      offset={0}
      containerPadding={0}
      anchor="notch"
    >
      <Button
        slant={slant}
        aria-label="Draft the next instructions"
        aria-disabled="true"
        className="px-3"
      >
        {/* Lifted with the Instructions button's icon, so the two glyphs
            share a line across the seam. */}
        <MagicEdit
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="flex-none -translate-y-px"
        />
      </Button>
    </Tooltip>
  );
}
