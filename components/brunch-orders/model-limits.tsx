'use client';

import { useEffect, useState } from 'react';

import type { ModelLimits as Limits } from '@/lib/definitions/limits';
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
export function ModelLimits({ model }: { model: DraftingModel }) {
  const [limits, setLimits] = useState<Limits | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      fetch(`/api/dev/model-limits?model=${model}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: Limits | null) => {
          if (live) setLimits(body);
        })
        .catch(() => undefined);
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [model]);
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
