'use client';

// Deep import: Blode's barrel is the whole icon library.
import Robot from 'blode-icons-react/icons/cute-robot';
import { cx } from '@/lib/ui/cx';
import { Button, type Slant } from '@/components/ui/button';
import { useAssistant } from './assistant-state';

export function Assistant({
  slant,
  compact = false,
}: {
  slant?: Slant;
  compact?: boolean;
}) {
  const { opener, open, id, toggle } = useAssistant();
  return (
    <Button
      slant={slant}
      aria-label="Assistant"
      data-compact={compact || undefined}
      ref={opener}
      aria-expanded={open}
      aria-controls={id}
      aria-keyshortcuts="Meta+I Control+I"
      onPress={toggle}
      // Open, it wears the assistant's own face (assistant.css), which also
      // inks the icon and label: the button's text utility would outrank it.
      className={cx('assistant-button', compact ? 'shell:px-5' : 'px-5')}
    >
      <Robot
        aria-hidden
        size={16}
        strokeWidth={1.8}
        className={cx(
          'assistant-button-icon flex-none',
          compact ? 'shell:-translate-y-px' : '-translate-y-px',
        )}
      />
      {/* The word goes at phone width, where the row has already given its
            controls up to the name and the notch should stay narrow. */}
      <span
        className={cx(
          'assistant-button-label',
          compact ? 'max-shell:hidden' : 'max-sm:hidden',
        )}
      >
        Assistant
      </span>
    </Button>
  );
}
