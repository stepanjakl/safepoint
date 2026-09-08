'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ProcessSummary } from '@/lib/process/placeholder-process';

// The instructions are the other input that can move underneath a result, so
// the version is on the trigger itself rather than only inside the panel.
export function InstructionsDialog({
  instructions,
}: {
  instructions: ProcessSummary['instructions'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>
        Instructions <span className="value">{instructions.version}</span>
      </Button>
      {open ? (
        <Panel instructions={instructions} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function Panel({
  instructions,
  onClose,
}: {
  instructions: ProcessSummary['instructions'];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    const invoker = document.activeElement;
    dialog?.showModal();
    heading.current?.focus();
    return () => {
      if (invoker instanceof HTMLElement && invoker.isConnected)
        invoker.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="instructions-dialog"
      aria-labelledby={id}
      onClose={onClose}
    >
      <header className="instructions-heading">
        <div>
          <h2 id={id} tabIndex={-1} ref={heading}>
            Instructions
          </h2>
          <p className="text-meta text-muted">
            <span className="value">{instructions.version}</span> ·{' '}
            {instructions.updatedAt}
          </p>
        </div>
        <Button
          onPress={() => ref.current?.close()}
          aria-label="Close instructions"
        >
          Close <span aria-hidden="true">×</span>
        </Button>
      </header>
      <div className="instructions-body">
        <ol>
          {instructions.body.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <p className="instructions-note">
          Placeholder text. The engine does not yet publish the instructions it
          ran under.
        </p>
      </div>
    </dialog>
  );
}
