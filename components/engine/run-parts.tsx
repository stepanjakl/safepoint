'use client';

import { useSyncExternalStore } from 'react';

import { readRunDebug, subscribe } from '@/components/dev/design-preferences';
import { Button } from '@/components/ui/button';
import type { RunSelection } from '@/components/app-shell/runs/run-selection';
import { RequestBubble } from '@/components/app-shell/thread/thread-page';

export function useRunDebug(): boolean {
  return useSyncExternalStore(subscribe, readRunDebug, () => false);
}

/*
  Discarding is waited for: the run leaves the list once the server has said
  it is discarded, and a press while it is being said does nothing. The button
  stays where it is (never disabled) so focus is not lost, and its words say
  what it is doing.
*/
export function DiscardRun({
  selection,
  id,
  words,
}: {
  selection: RunSelection;
  id: string;
  words?: string;
}) {
  return (
    <>
      <Button
        aria-disabled={selection.discarding || undefined}
        onPress={() => {
          if (selection.discarding) return;
          // The button goes with the run: focus stays in the runs list, where
          // the next run is a keypress away, as it would on any other row.
          void selection.discard(id).then((done) => {
            // Once the list has dropped the run, two frames on.
            if (done)
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>('.sheet-row, #main')
                    ?.focus({ preventScroll: true }),
                ),
              );
          });
        }}
      >
        {selection.discarding ? 'Discarding…' : 'Discard this run'}
      </Button>
      {words ? <span className="text-meta text-muted">{words}</span> : null}
      {selection.discardError ? (
        <p role="alert" className="text-dense text-state-blocked">
          {selection.discardError}
        </p>
      ) : null}
    </>
  );
}

// A one-off note saved with this run, inside the Instructions step.
export function RunNote({ text }: { text: string }) {
  return (
    <RequestBubble label="Note" peekLines={5}>
      <p className="text-body break-words whitespace-pre-wrap">{text}</p>
    </RequestBubble>
  );
}

// Instructions as a request: each section's first line is its title.
export function InstructionsText({ text }: { text: string }) {
  return (
    <RequestBubble peekLines={10}>
      <div className="grid gap-3">
        {text.split(/\n\s*\n/).map((section, i) => {
          // A section's first line is its title, when it has more.
          const [first, ...rest] = section.split('\n');
          return rest.length ? (
            <div key={i} className="grid gap-1">
              <p className="font-semibold">{first}</p>
              <p className="whitespace-pre-line">{rest.join('\n')}</p>
            </div>
          ) : (
            <p key={i}>{section}</p>
          );
        })}
      </div>
    </RequestBubble>
  );
}
