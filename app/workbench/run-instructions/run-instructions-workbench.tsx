'use client';

import { useState } from 'react';

import {
  ThreadLookContext,
  ThreadStep,
} from '@/components/app-shell/thread/thread-step';
import { InstructionsText, RunNote } from '@/components/engine/run-parts';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { ORDER_STEPS } from '@/lib/processes/brunch-orders/steps';
import type { ProcessStep } from '@/lib/shell/model';

type NoteLength = 'short' | 'long';

const NOTES: Record<NoteLength, string> = {
  short:
    'Second run. Hold sourdough loaf steady unless weekend forecast jumps.',
  long: [
    'Second run. Hold sourdough loaf steady unless the weekend forecast jumps, and keep an eye on Hass avocados — two crates arrived bruised this morning so freshness matters more than usual.',
    'Flag any item whose buffer exceeds 40% of expected weekend demand so we can review it before ordering, and double-check the feta case count against Thursday’s delivery.',
  ].join('\n\n'),
};

const READ_STEP: ProcessStep = {
  ...ORDER_STEPS.find((step) => step.id === 'read')!,
  status: 'attention',
};

const INSTRUCTIONS_STEP: ProcessStep = {
  ...ORDER_STEPS.find((step) => step.id === 'instructions')!,
  status: 'complete',
  origin: 'manual',
};

/** Finalised 1a preview of a run note alongside the standing instructions. */
export function RunInstructionsWorkbench({
  version,
  processText,
}: {
  version: string;
  processText: string;
}) {
  const [noteLength, setNoteLength] = useState<NoteLength>('long');
  const note = NOTES[noteLength];
  const noop = () => undefined;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="readout text-muted">Note</span>
        <FilterTabs
          size="small"
          tabs={[
            { key: 'short', short: 'Short', label: 'Short note' },
            { key: 'long', short: 'Long', label: 'Long note' },
          ]}
          selected={noteLength}
          onChange={setNoteLength}
          leadKey={null}
          ariaLabel="Sample note length"
          menuLabel="Note length"
        />
      </div>

      <div className="ground-raised bg-surface-primary rounded-shell max-w-3xl min-w-0 p-6 max-sm:p-4">
        <ThreadLookContext value="proposed">
          <ol className="thread" data-look="proposed">
            <ThreadStep
              step={INSTRUCTIONS_STEP}
              headingAction={{ label: version, onPress: noop }}
            >
              <div className="grid gap-3">
                <RunNote key={note} text={note} />
                <InstructionsText text={processText} />
              </div>
            </ThreadStep>
            <ThreadStep step={READ_STEP} latest>
              <p className="text-dense text-muted">
                Read the Google Sheet to ground the run’s proposals.
              </p>
            </ThreadStep>
          </ol>
        </ThreadLookContext>
      </div>
    </div>
  );
}
