'use client';

import type { RunSelection } from '@/components/app-shell/runs/run-selection';
import { DiscardRun } from '@/components/engine/run-parts';
import { SectionBand } from '@/components/ui/section-band';

/*
  Parts nothing in the app draws any more, each as it renders, so a person
  can decide whether it goes. Nothing here acts: the run selection is a
  stand-in whose discard does nothing.
*/
const standIn = {
  discarding: false,
  discard: () => Promise.resolve(false),
} as unknown as RunSelection;

export function UnusedParts() {
  return (
    <div className="grid max-w-3xl gap-10">
      <section className="grid gap-3">
        <h2 className="text-dense font-semibold">SectionBand</h2>
        <p className="text-meta text-muted">
          components/ui/section-band.tsx: an inset band with a readout title and
          a count or metadata on the right.
        </p>
        <div className="rounded-shell bg-surface-primary overflow-hidden border">
          <SectionBand title="Products" meta="11 rows" />
          <p className="text-dense px-4 py-3">Content under the band.</p>
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="text-dense font-semibold">DiscardRun</h2>
        <p className="text-meta text-muted">
          components/engine/run-parts.tsx: the button that discarded a run from
          its own screen, waiting for the server before the run left the list.
        </p>
        <div>
          <DiscardRun selection={standIn} id="run-workbench" />
        </div>
      </section>
    </div>
  );
}
