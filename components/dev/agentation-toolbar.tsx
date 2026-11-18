'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Agentation, type Annotation } from 'agentation';

// The Agentation server `pnpm dev` starts (scripts/runtime/dev.ts); agents read it
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

const subscribeNoop = () => () => {};
const getBody = () => document.body;
const getNull = () => null;

function AgentationWithTopLayer() {
  const portalContainer = useSyncExternalStore(subscribeNoop, getBody, getNull);

  useEffect(() => {
    function syncPortalSize(portal: HTMLElement) {
      if (portal.style.width !== '100%') portal.style.width = '100%';
      if (portal.style.height !== '100%') portal.style.height = '100%';
    }

    let observedPortal: HTMLElement | null = null;
    const styleObserver = new MutationObserver(() => {
      if (observedPortal) syncPortalSize(observedPortal);
    });

    function attachPortal(portal: HTMLElement | null) {
      if (!portal || portal === observedPortal) return;
      observedPortal = portal;
      syncPortalSize(portal);
      styleObserver.observe(portal, {
        attributes: true,
        attributeFilter: ['style'],
      });
    }

    attachPortal(
      document.querySelector<HTMLElement>('[data-agentation-portal]'),
    );

    const bodyObserver = new MutationObserver(() => {
      attachPortal(
        document.querySelector<HTMLElement>('[data-agentation-portal]'),
      );
    });
    bodyObserver.observe(document.body, { childList: true });

    function promotePortal(event: Event) {
      const toggle = event as ToggleEvent;
      if (toggle.newState !== 'open') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.hasAttribute('data-agentation-portal')) {
        attachPortal(target as HTMLElement);
        return;
      }
      const portal = document.querySelector<HTMLElement>(
        '[data-agentation-portal]',
      );
      if (!portal || !portal.matches(':popover-open')) return;
      const active = document.activeElement;
      portal.hidePopover();
      portal.showPopover();
      syncPortalSize(portal);
      if (active instanceof HTMLElement && document.activeElement !== active) {
        active.focus({ preventScroll: true });
      }
    }
    document.addEventListener('toggle', promotePortal, true);
    return () => {
      bodyObserver.disconnect();
      styleObserver.disconnect();
      document.removeEventListener('toggle', promotePortal, true);
    };
  }, []);

  return (
    <Agentation
      endpoint={ENDPOINT}
      onSubmit={sendToAgent}
      portalContainer={portalContainer}
    />
  );
}

// scripts/runtime/dev.ts sets the flag, and sets it off where it starts no annotation
// server (AGENTATION=off): the toolbar then neither renders nor touches storage.
export function AgentationToolbar() {
  if (process.env.NODE_ENV !== 'development') return null;
  if (process.env.NEXT_PUBLIC_AGENTATION !== 'on') return null;
  return <AgentationWithTopLayer />;
}
