'use client';

// Deep import: Blode's barrel is the whole icon library.
import MagicEdit from 'blode-icons-react/icons/magic-edit';
import { Button, type Slant } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useAssistant } from './assistant-state';

export function Assistant({ slant }: { slant?: Slant }) {
  const { opener, open, id, toggle } = useAssistant();
  return (
    // Under the notch rather than above it -- the pane's top edge is at the
    // viewport's -- with its top on the notch's floor and its end on the
    // pane's side, past the gap the notch holds this control in by (see
    // .app-tooltip[data-anchor] in app/components.css). No container padding:
    // react-aria's 12px would hold the box short of a pane inset by less.
    <Tooltip
      label="Assistant"
      description="Explore this process with the assistant preview."
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
        ref={opener}
        aria-expanded={open}
        aria-controls={id}
        onPress={toggle}
        className="group/assistant px-5"
      >
        <MagicEdit
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="flex-none -translate-y-px opacity-75 group-data-[focus-visible]/assistant:opacity-90 group-data-[hovered]/assistant:opacity-90 group-data-[pressed]/assistant:opacity-90 max-sm:opacity-100 max-sm:group-data-[focus-visible]/assistant:opacity-100 max-sm:group-data-[hovered]/assistant:opacity-100 max-sm:group-data-[pressed]/assistant:opacity-100"
        />
        {/* The word goes at phone width, where the row has already given its
            controls up to the name and the notch should stay narrow. */}
        <span className="max-sm:hidden">Assistant</span>
      </Button>
    </Tooltip>
  );
}
