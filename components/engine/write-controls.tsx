'use client';

import { useIsPresent } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';

import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import type { GlyphName } from '@/components/ui/glyph';
import { HeightSwap } from '@/components/ui/height-swap';
import { Reveal } from '@/components/ui/reveal';
import { StatusLabel, type Tone } from '@/components/ui/status-label';
import { runDay, runTime } from '@/lib/shell/run-time';
import { CHANGED_SINCE_READ } from '@/lib/engine/apply-block';
import type { Application } from '@/lib/engine/types';
import { plural } from './trial-parts';

export type HeldWriteCheck = { id: string; key: string; check: string };

/*
  How a write came out, as one line: the outcome in its state's colour, then
  what it means and when, quieter. Shared by every run that writes, so a
  written run reads the same wherever it is opened.
*/
const OUTCOME: Record<
  Application['status'],
  {
    tone: Tone;
    glyph: GlyphName;
    title: (noun: string) => string;
    detail: (noun: string) => string | null;
  }
> = {
  verified: {
    tone: 'verified',
    glyph: 'circle',
    title: (noun) => `Written to the ${noun}`,
    detail: () => null,
  },
  mismatch: {
    tone: 'caution',
    glyph: 'triangle',
    title: () => 'Written, but it reads back differently',
    detail: () => 'Check the cells above',
  },
  pending: {
    tone: 'unavailable',
    glyph: 'circle',
    title: () => 'Not confirmed yet',
    detail: (noun) => `The write has yet to be read back from the ${noun}`,
  },
  failed: {
    tone: 'blocked',
    glyph: 'square',
    title: () => 'The write failed',
    detail: () => 'Nothing was changed',
  },
  undone: {
    tone: 'neutral',
    glyph: 'dash',
    title: () => 'Undone',
    detail: () => 'The cells are back as they were',
  },
};

type WriteResult = {
  noun: string;
  status: Application['status'];
  at?: string | null;
  error?: string | null;
};

function WriteOutcome({ noun, status, at, error }: WriteResult) {
  const outcome = OUTCOME[status];
  const when = at ? `${runDay(at)} · ${runTime(at)}` : null;
  const verified = status === 'verified';
  const detail = [outcome.detail(noun), verified ? null : when]
    .filter(Boolean)
    .join(' · ');
  return (
    <div role="status">
      <p className="text-dense flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <StatusLabel tone={outcome.tone} glyph={outcome.glyph}>
          {outcome.title(noun)}
        </StatusLabel>
        {detail || error ? (
          <span className="text-muted">
            {[detail, error].filter(Boolean).join('. ')}
          </span>
        ) : null}
        {verified && at && when ? (
          <time dateTime={at} className="metadata-chip">
            {when}
          </time>
        ) : null}
      </p>
    </div>
  );
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
  rows,
  note,
  held = [],
  canWrite,
  canUndo,
  busy,
  outcome,
  progress,
  gap,
  onWrite,
  onUndo,
}: {
  rows: number;
  note?: string;
  held?: HeldWriteCheck[];
  canWrite: boolean;
  canUndo: boolean;
  busy?: boolean;
  outcome?: WriteResult;
  progress?: ReactNode;
  gap?: string;
  onWrite?: (acknowledged: string[]) => void;
  onUndo?: () => void;
}) {
  const [interacted, setInteracted] = useState(false);

  const showUndo = Boolean(canUndo && onUndo);
  const showWrite = Boolean(canWrite && onWrite);
  const action = showUndo
    ? 'undo'
    : showWrite
      ? held.length
        ? 'held'
        : 'write'
      : 'none';
  return (
    <Reveal
      show={Boolean(outcome || progress || showUndo || showWrite)}
      gap={gap}
    >
      <HeightSwap
        contentKey={`${progress ? 'writing' : (outcome?.status ?? 'preview')}:${action}`}
        holdHeight={busy && !progress}
        focusOnEnter={interacted && !busy}
      >
        <div className="grid gap-4">
          {progress ? (
            <div role="status">{progress}</div>
          ) : outcome ? (
            <WriteOutcome {...outcome} />
          ) : null}
          {showUndo ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                isDisabled={busy}
                onPress={() => {
                  setInteracted(true);
                  onUndo?.();
                }}
              >
                Undo the write
              </Button>
              <span className="text-meta text-muted">
                Possible while the cells hold what was written.
              </span>
            </div>
          ) : showWrite ? (
            <WritePrompt
              rows={rows}
              note={note}
              held={held}
              busy={busy}
              onWrite={(acknowledged) => {
                setInteracted(true);
                onWrite?.(acknowledged);
              }}
            />
          ) : null}
        </div>
      </HeightSwap>
    </Reveal>
  );
}

function WritePrompt({
  rows,
  note,
  held,
  busy,
  onWrite,
}: {
  rows: number;
  note?: string;
  held: HeldWriteCheck[];
  busy?: boolean;
  onWrite: (acknowledged: string[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const writeButton = useRef<HTMLButtonElement>(null);
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
      <Button
        key="write"
        ref={writeButton}
        className="overflow-clip"
        variant="primary"
        isDisabled={busy}
        onPress={() => {
          if (confirming) {
            setConfirming(false);
            onWrite([]);
          } else {
            setConfirming(true);
            writeButton.current?.focus({ preventScroll: true });
          }
        }}
      >
        {confirming ? 'Confirm write' : `Write ${plural(rows, 'row')}`}
      </Button>
      <Reveal show={confirming}>
        <WriteConfirmationDetails
          note={note}
          onCancel={() => {
            writeButton.current?.focus({ preventScroll: true });
            setConfirming(false);
          }}
        />
      </Reveal>
    </div>
  );
}

function WriteConfirmationDetails({
  note,
  onCancel,
}: {
  note?: string;
  onCancel: () => void;
}) {
  const present = useIsPresent();
  return (
    <div className="flex flex-wrap items-center gap-3" inert={!present}>
      <Button onPress={onCancel}>Cancel</Button>
      {note ? <span className="text-meta text-muted">{note}</span> : null}
    </div>
  );
}
