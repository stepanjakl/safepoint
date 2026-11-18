'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useTRPC } from '@/components/trpc/provider';
import type { DraftingModel } from '@/lib/models';

const POLL_MS = 3000;

const clock = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
const seconds = (until: number) =>
  Math.max(1, Math.ceil((until - Date.now()) / 1000));
const shortName = (id: string) => id.replace(/^gemini-/, '');

// How the chosen model's quota stands, before a step spends it and while it
// does: the waits are otherwise a step that seems to have stopped.
export function ModelLimits({
  model,
  enabled = true,
}: {
  model: DraftingModel;
  enabled?: boolean;
}) {
  const trpc = useTRPC();
  // Polled while shown; a change of model keeps the last answer until its own
  // arrives, and a failed poll hides it until the next one answers. Every
  // answer is a new object, so the wait counts down at each poll.
  const query = useQuery(
    trpc.modelLimits.get.queryOptions(
      { model },
      {
        enabled,
        refetchInterval: enabled ? POLL_MS : false,
        staleTime: 0,
        structuralSharing: false,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const limits = query.isError ? null : query.data;
  if (!limits) return null;
  return (
    <div className="text-meta text-muted grid gap-0.5">
      <p>
        {limits.models.length > 1
          ? `${limits.models.map(shortName).join(' and ')} share a quota: `
          : ''}
        {limits.perDay === null
          ? `${limits.usedToday} requests today`
          : `${limits.usedToday} of ${limits.perDay} requests today`}
        , {limits.perMinute} a minute.
        {limits.restingUntil
          ? ` Out of quota until ${clock(limits.restingUntil)}.`
          : ''}
      </p>
      <p role="status">
        {limits.waitingUntil
          ? `Waiting ${seconds(limits.waitingUntil)} s for a request slot.`
          : ''}
      </p>
    </div>
  );
}
