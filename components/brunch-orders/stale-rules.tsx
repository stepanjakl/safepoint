'use client';

import { Button } from '@/components/ui/button';
import type { Stale } from '@/lib/definitions/fits';

export type StaleReply = { kind: 'stale' } & Stale;

/*
  A rulebook kept as it was accepted that no longer fits the data the run
  read (lib/definitions/fits.ts): what does not fit, and the current rules
  when the run can move to them. Calculate and Propose say it the same way.
*/
export function StaleRules({
  stale,
  onMove,
}: {
  stale: StaleReply;
  onMove: () => void;
}) {
  return (
    <div role="alert" className="text-dense grid gap-2">
      <p className="text-state-blocked">
        The rules this run uses no longer fit the data it read.
      </p>
      <ul className="grid gap-1">
        {stale.problems.map((problem) => (
          <li key={problem.id}>
            <span className="font-medium">{problem.name}</span>:{' '}
            <span className="text-muted">{problem.problem}</span>
          </li>
        ))}
      </ul>
      {stale.current ? (
        <div>
          <Button onPress={onMove}>Use the current rules</Button>
        </div>
      ) : (
        <p className="text-muted">
          The current rules do not fit it either: draft them again in the Rules
          step.
        </p>
      )}
    </div>
  );
}
