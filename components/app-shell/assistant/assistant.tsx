'use client';

// Deep import: Blode's barrel is the whole icon library.
import MagicEdit from 'blode-icons-react/icons/magic-edit';
import { Button, type Slant } from '@/components/ui/button';
import { useAssistant } from './assistant-state';

export function Assistant({ slant }: { slant?: Slant }) {
  const { opener, open, id, toggle } = useAssistant();
  return (
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
        className="text-muted group-interact/assistant:text-primary max-sm:text-primary flex-none -translate-y-px transition-colors duration-(--duration-state) ease-out"
      />
      {/* The word goes at phone width, where the row has already given its
            controls up to the name and the notch should stay narrow. */}
      <span className="max-sm:hidden">Assistant</span>
    </Button>
  );
}
