'use client';

import { useQuery } from '@tanstack/react-query';

import {
  runsTally,
  type RunProcessId,
} from '@/components/app-shell/runs/kept-runs';
import { useTRPC } from '@/components/trpc/provider';
import { Glyph } from '@/components/ui/glyph';
import { MorphingText } from '@/components/ui/morphing-text';
import { WorkingMark } from '@/components/ui/working-mark';

/*
  A process row's tag: how many of its runs wait on a person, from the same
  list its run rail reads (so opening the process asks nothing again). A dot
  and the count when any does; the working mark when none does but a job is
  working on one; nothing when the process is idle, so a tag always means
  something to do or something happening.

  Asked again every 20 seconds while the page is in view, as runs move on
  without this screen. A process the server keeps no runs for answers an
  error, and shows no tag.
*/
const REFRESH_MS = 20_000;

export function ProcessRunsBadge({
  processId,
  name,
  className,
}: {
  processId: string;
  name: string;
  className: string;
}) {
  const trpc = useTRPC();
  const runs = useQuery(
    trpc.runs.list.queryOptions(
      { process: processId as RunProcessId },
      { retry: false, refetchInterval: REFRESH_MS },
    ),
  );
  if (!runs.data) return null;
  const { waiting, working } = runsTally(runs.data);
  if (!waiting && !working) return null;
  const label = waiting
    ? `${name}: ${waiting} ${waiting === 1 ? 'run waits' : 'runs wait'} for you`
    : `${name}: a run is working`;
  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      data-tone={waiting ? 'decision' : undefined}
    >
      {waiting ? (
        <>
          <Glyph name="circle" size={9} />
          <MorphingText text={String(waiting)} />
        </>
      ) : (
        <WorkingMark className="size-3" />
      )}
    </span>
  );
}
