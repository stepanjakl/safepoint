'use client';

import { useState } from 'react';

import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { CHANGED_SINCE_READ } from '@/lib/engine/apply-block';
import type { Application } from '@/lib/engine/types';
import { plural } from './trial-parts';

export type HeldWriteCheck = { id: string; key: string; check: string };

export function writeResult(noun: string, status: Application['status']) {
  return {
    pending: `Awaiting confirmation. The write has yet to be read back from the ${noun}.`,
    verified: `Written and read back from the ${noun}.`,
    mismatch: `Written, but the ${noun} reads back differently. Check the cells below.`,
    failed: 'The write failed.',
    undone: 'Undone. The cells are back as they were.',
  }[status];
}

export function writePreviewNote({
  rows,
  tab,
  tabExists,
  resource,
}: {
  rows: number;
  tab?: string;
  tabExists: boolean;
  resource: string;
}) {
  if (!tab) return;
  const count = plural(rows, 'row');
  return tabExists
    ? `Changes ${count} on the ${tab} ${resource}.`
    : `Adds the ${tab} ${resource}, with ${count}.`;
}

export function WriteControls({
  noun,
  rows,
  note,
  held = [],
  canWrite,
  canUndo,
  busy,
  onWrite,
  onUndo,
}: {
  noun: string;
  rows: number;
  note?: string;
  held?: HeldWriteCheck[];
  canWrite: boolean;
  canUndo: boolean;
  busy?: boolean;
  onWrite?: (acknowledged: string[]) => void;
  onUndo?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [interacted, setInteracted] = useState(false);

  if (canUndo && onUndo) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          isDisabled={busy}
          autoFocus={interacted}
          onPress={() => {
            setInteracted(true);
            onUndo();
          }}
        >
          Undo the write
        </Button>
        <span className="text-meta text-muted">
          Possible while the cells hold what was written.
        </span>
      </div>
    );
  }

  if (!canWrite || !onWrite) return null;

  if (held.length) {
    return (
      <AlertBox
        tone="decision"
        title="Check before writing"
        action={
          <div>
            <Button
              size="small"
              isDisabled={busy}
              onPress={() => {
                setInteracted(true);
                onWrite(held.map(({ id }) => id));
              }}
            >
              Write anyway
            </Button>
          </div>
        }
      >
        <ul className="grid gap-1">
          {held.map(({ id, key, check }) => (
            <li key={id}>
              {id === CHANGED_SINCE_READ
                ? `${key} changed after this run read it. The checks were run again on the new data.`
                : `${key}: ${check} now needs your decision.`}
            </li>
          ))}
        </ul>
      </AlertBox>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {confirming ? (
        <>
          <Button
            key="confirm"
            variant="primary"
            autoFocus
            isDisabled={busy}
            onPress={() => {
              setConfirming(false);
              onWrite([]);
            }}
          >
            Write to the {noun}
          </Button>
          <Button onPress={() => setConfirming(false)}>Cancel</Button>
          {note ? <span className="text-meta text-muted">{note}</span> : null}
        </>
      ) : (
        <Button
          key="prepare"
          variant="primary"
          isDisabled={busy}
          autoFocus={interacted}
          onPress={() => {
            setInteracted(true);
            setConfirming(true);
          }}
        >
          Write {plural(rows, 'row')}
        </Button>
      )}
    </div>
  );
}
