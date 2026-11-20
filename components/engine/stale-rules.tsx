'use client';

import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import type { Stale } from '@/lib/engine/fits';

type StaleReply = { kind: 'stale' } & Stale;

/*
  A rulebook kept as it was accepted that no longer fits the data the run
  read (lib/engine/fits.ts): what does not fit, and the current rules
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
    <AlertBox
      title="The rules this run uses no longer fit the data it read."
      action={
        stale.current ? (
          <Button size="small" onPress={onMove}>
            Use the current rules
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-2">
        <ul className="grid gap-1">
          {stale.problems.map((problem) => (
            <li key={problem.id}>
              <span className="text-severity-strong font-medium">
                {problem.name}
              </span>
              : {problem.problem}
            </li>
          ))}
        </ul>
        {stale.current ? null : (
          <p>
            The current rules do not fit it either: draft them again in the
            Rules step.
          </p>
        )}
      </div>
    </AlertBox>
  );
}
