'use client';

import { useContext } from 'react';

import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { Button } from '@/components/ui/button';
import type { ApprovedRulebook } from '@/lib/rulebook/schema';

import { RulebookDrift } from './rulebook-drift';
import { Lede, Outcome, StatusChip, dateTime } from './trial-parts';

/*
  The run's view of the rulebook: which version it uses and whether that
  version still fits the sheet. Drafting, answering, testing and approving
  are not part of a run; they live in the Rulebook tab, one press away.
*/
export function RulebookInForce({
  active,
  drift,
}: {
  active: ApprovedRulebook | null;
  drift: { where: string; message: string }[];
}) {
  const sheet = useContext(ProcessSheetActions);
  return (
    <div className="grid gap-4">
      <Lede>
        A run uses the rulebook in force: the version a person approved. New
        versions are drafted, tested and approved in the Rulebook tab, outside
        any run.
      </Lede>
      <Outcome>
        {active ? (
          <>
            <StatusChip tone={drift.length ? 'decision' : 'ready'}>
              {drift.length ? 'Out of date' : 'Up to date'}
            </StatusChip>
            <span>
              Rulebook v{active.version}, approved{' '}
              {dateTime(active.approved_at)}
            </span>
          </>
        ) : (
          <>
            <StatusChip tone="blocked">None approved</StatusChip>
            <span>
              No rulebook is approved yet, so nothing can be calculated.
            </span>
          </>
        )}
      </Outcome>
      {active ? (
        <RulebookDrift
          name={`Rulebook v${active.version}`}
          consequence="This run's results may be wrong until a new version is drafted and approved in the Rulebook tab."
          issues={drift}
          compact
        />
      ) : null}
      {sheet ? (
        <div>
          <Button onPress={sheet.showInstructions}>
            Open the Rulebook tab
          </Button>
        </div>
      ) : null}
    </div>
  );
}
