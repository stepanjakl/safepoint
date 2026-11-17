'use client';

import { Agentation, type Annotation } from 'agentation';

// The Agentation server `pnpm dev` starts (scripts/dev.ts); agents read it
// through the agentation MCP server and wait on it with `pnpm agentation:wait`.
const ENDPOINT = 'http://localhost:4747';

type Pending = { annotations: { id: string; sessionId: string }[] };
type Delivery = { delivered: { total: number } };

/*
  Send Annotations hands the batch to a waiting agent. The server already holds
  every annotation; this marks the batch ready. It fails, and the toolbar says
  so, when the server is down or no agent is waiting; the annotations stay
  pending for the next agent either way.
*/
async function sendToAgent(output: string, annotations: Annotation[]) {
  const pending = (await (
    await fetch(`${ENDPOINT}/pending`)
  ).json()) as Pending;
  const sent = new Set(annotations.map((annotation) => annotation.id));
  const sessionIds = new Set(
    pending.annotations.filter((a) => sent.has(a.id)).map((a) => a.sessionId),
  );
  if (sessionIds.size === 0)
    throw new Error('None of these annotations is pending on the server.');

  for (const sessionId of sessionIds) {
    const response = await fetch(`${ENDPOINT}/sessions/${sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output }),
    });
    if (!response.ok)
      throw new Error(`Agentation server answered ${response.status}.`);
    const { delivered } = (await response.json()) as Delivery;
    if (delivered.total === 0)
      throw new Error('No agent is waiting (pnpm agentation:wait).');
  }
}

// scripts/dev.ts sets the flag, and sets it off where it starts no annotation
// server (AGENTATION=off): the toolbar then neither renders nor touches storage.
export function AgentationToolbar() {
  if (process.env.NODE_ENV !== 'development') return null;
  if (process.env.NEXT_PUBLIC_AGENTATION !== 'on') return null;
  return <Agentation endpoint={ENDPOINT} onSubmit={sendToAgent} />;
}
