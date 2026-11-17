'use client';

import type { LastWrite } from '@/lib/engine/apply';
import {
  sourceById,
  type SourceKind,
  type SourceSummary,
  type SourceUse,
} from '@/lib/sources/model';

import { Moment, SourceView } from './source-card';

/*
  The Inputs and Outputs tabs of a process whose data lives in sources: one
  section per service, the same on both tabs, so each reads as one place the
  process reads from and writes to. A run reads its sources for itself when it
  starts; reading here only shows what they hold now.
*/

type Props = {
  uses: readonly SourceUse[];
  // The latest read of each source as the server had it, by source id.
  initial: Readonly<Record<string, SourceSummary | null>>;
};

// The uses grouped by their service, in the order each service first appears.
function byKind(uses: readonly SourceUse[]) {
  const groups = new Map<SourceKind, SourceUse[]>();
  for (const use of uses) {
    const kind = sourceById(use.source)?.kind;
    if (kind) groups.set(kind, [...(groups.get(kind) ?? []), use]);
  }
  return [...groups];
}

export function SourceInputs({ uses, initial }: Props) {
  return (
    <div className="grid gap-6">
      {byKind(uses).map(([kind, group]) => (
        <SourceView
          key={kind}
          kind={kind}
          uses={group}
          side="inputs"
          initial={initial}
        />
      ))}
    </div>
  );
}

export function SourceOutputs({
  uses,
  initial,
  lastWrite,
}: Props & {
  // The process's latest write to its output, of any run.
  lastWrite: LastWrite | null;
}) {
  return (
    <div className="grid gap-6">
      {byKind(uses).map(([kind, group]) => (
        <SourceView
          key={kind}
          kind={kind}
          uses={group}
          side="outputs"
          initial={initial}
          details={<Moment label="Last write" at={lastWrite?.at ?? null} />}
        />
      ))}
    </div>
  );
}
