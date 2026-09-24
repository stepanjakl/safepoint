'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { PROCESS_NAME_MAX, useProcessName } from './process-names-store';

/*
  The process's name, renamed in place. At rest it is the heading and nothing
  more; it is an input the whole time, only dressed as text, so there is no
  swap between a heading and a field for the name to jump across.

  Pointing at it gives it the look of a field, styled as the sidebar's search
  field is (`.title-field` in process-title.css). Clicking puts the caret at the end of
  the name wherever the click lands, since a rename usually adds to a name or
  replaces it. Keyboard focus selects it whole, as a browser does for a field.

  Enter or leaving the field keeps the change; Escape puts the name back. A
  name emptied of everything but spaces is not a name, so the old one stays.

  The field sizes to its name. An input has no width of its own content, so an
  invisible copy of the text sits in the same grid cell and sets the column;
  the input fills that column and ends in an ellipsis when the row is short.
*/
export function ProcessTitle({
  processId,
  fallback,
}: {
  processId: string;
  // The scenario's name, for a process nobody has renamed.
  fallback: string;
}) {
  const { name, rename } = useProcessName(processId, fallback);
  // What is being typed, while the field has focus.
  const [draft, setDraft] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const field = useRef<HTMLInputElement>(null);
  // Escape leaves the field through the same blur a keep does.
  const discard = useRef(false);
  const value = draft ?? name;

  const finish = () => {
    const next = draft?.trim() ?? '';
    setDraft(null);
    if (discard.current) {
      discard.current = false;
      return;
    }
    if (next && next !== name) {
      rename(next);
      setAnnouncement(`Renamed to ${next.slice(0, PROCESS_NAME_MAX)}`);
    }
  };

  // Focus by pointer lands the caret at the end rather than where the click
  // fell. Once the field has focus, clicks place the caret as usual.
  const onMouseDown = (event: MouseEvent) => {
    const input = field.current;
    if (!input || event.button !== 0 || document.activeElement === input) {
      return;
    }
    event.preventDefault();
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
    input.scrollLeft = input.scrollWidth;
  };

  return (
    <>
      {/* It claims what the row's controls leave: they are sized by their
          content, and the name is what should take the rest and truncate. */}
      <h2 className="text-title flex min-w-0 flex-1 [font-weight:550]">
        <span
          onMouseDown={onMouseDown}
          className="title-field inline-grid min-w-0 cursor-text grid-cols-[minmax(0,max-content)] items-center"
        >
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre"
          >
            {value || ' '}
          </span>
          <input
            ref={field}
            value={value}
            size={1}
            maxLength={PROCESS_NAME_MAX}
            aria-label="Process name"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            onFocus={() => setDraft(name)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                discard.current = true;
                event.currentTarget.blur();
              }
            }}
            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-ellipsis outline-none"
          />
        </span>
      </h2>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
