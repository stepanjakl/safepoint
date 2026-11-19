'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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

const STORAGE_PREFIX = 'feedback-annotations-';
const AGENTATION_UI_SELECTOR =
  'agentation-toolbar, [data-agentation-portal], [data-feedback-toolbar]';
const MARKER_INDEX_PATTERN = /^(?:Edit|Delete) annotation (\d+): /;
const CLIPPING_OVERFLOWS = new Set(['auto', 'scroll', 'hidden', 'clip']);

type MarkerTarget = {
  element: Element;
  offsetX: number;
  offsetY: number;
};

type PendingClickTarget = MarkerTarget & {
  clickClientY: number;
  clickScrollY: number;
};

function readStoredAnnotations(
  extraById: Map<string, Annotation>,
): Annotation[] {
  let stored: Annotation[] = [];
  try {
    const raw = localStorage.getItem(
      `${STORAGE_PREFIX}${window.location.pathname}`,
    );
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed as Annotation[];
    }
  } catch {
    // Ignore storage read/parse errors; fall back to in-memory annotations.
  }

  if (extraById.size === 0) return stored;
  const seen = new Set(stored.map((a) => a.id));
  const merged = [...stored];
  for (const annotation of extraById.values()) {
    if (!seen.has(annotation.id)) merged.push(annotation);
  }
  return merged;
}

function resolveTargetFromAnnotation(
  annotation: Annotation,
): MarkerTarget | null {
  if (!annotation.elementPath || !annotation.boundingBox) return null;
  let candidates: NodeListOf<Element>;
  try {
    candidates = document.querySelectorAll(annotation.elementPath);
  } catch {
    return null;
  }
  if (candidates.length === 0) return null;

  const bb = annotation.boundingBox;
  const scrollYOffset = annotation.isFixed ? 0 : window.scrollY;
  let best: Element | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (candidate.closest(AGENTATION_UI_SELECTOR)) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const distance =
      Math.abs(rect.left - bb.x) +
      Math.abs(rect.top + scrollYOffset - bb.y) +
      Math.abs(rect.width - bb.width) +
      Math.abs(rect.height - bb.height);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (!best) return null;
  return {
    element: best,
    offsetX: (annotation.x / 100) * window.innerWidth - bb.x,
    offsetY: annotation.y - bb.y,
  };
}

function isClippedByScrollAncestor(
  element: Element,
  x: number,
  y: number,
): boolean {
  let current = element.parentElement;
  while (current && current !== document.documentElement) {
    const style = getComputedStyle(current);
    if (
      CLIPPING_OVERFLOWS.has(style.overflowX) ||
      CLIPPING_OVERFLOWS.has(style.overflowY)
    ) {
      const rect = current.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function findAnnotationForMarker(
  marker: HTMLButtonElement,
  annotations: Annotation[],
): Annotation | undefined {
  const label = marker.getAttribute('aria-label');
  if (label) {
    const match = MARKER_INDEX_PATTERN.exec(label);
    if (match) {
      const byIndex = annotations[Number(match[1]) - 1];
      if (byIndex) return byIndex;
    }
  }
  const left = marker.style.left;
  const top = parseFloat(marker.style.top);
  return annotations.find(
    (a) => `${a.x}%` === left && Math.abs(a.y - top) < 0.5,
  );
}

function positionMarker(
  marker: HTMLButtonElement,
  target: MarkerTarget | null,
  baseX: number,
  baseY: number,
  isFixedLayer: boolean,
) {
  if (target && target.element.isConnected) {
    const rect = target.element.getBoundingClientRect();
    const desiredX = rect.left + target.offsetX;
    const desiredY = rect.top + target.offsetY;
    marker.style.translate = `${desiredX - baseX}px ${desiredY - baseY}px`;
    const clipped = isClippedByScrollAncestor(
      target.element,
      desiredX,
      desiredY,
    );
    marker.style.visibility = clipped ? 'hidden' : '';
    marker.style.pointerEvents = clipped ? 'none' : '';
    return;
  }

  // Portal host is position:fixed, so non-fixed layers still need window scroll compensation.
  marker.style.translate = isFixedLayer
    ? ''
    : `${-window.scrollX}px ${-window.scrollY}px`;
  marker.style.visibility = '';
  marker.style.pointerEvents = '';
}

function AgentationWithTopLayer() {
  const portalContainer = useSyncExternalStore(subscribeNoop, getBody, getNull);
  const targetsByIdRef = useRef<Map<string, MarkerTarget>>(new Map());
  const annotationsByIdRef = useRef<Map<string, Annotation>>(new Map());
  const pendingTargetRef = useRef<PendingClickTarget | null>(null);

  const handleAnnotationAdd = useCallback((annotation: Annotation) => {
    annotationsByIdRef.current.set(annotation.id, annotation);
    const pending = pendingTargetRef.current;
    const expectedY = pending
      ? annotation.isFixed
        ? pending.clickClientY
        : pending.clickClientY + pending.clickScrollY
      : 0;
    if (
      !annotation.isMultiSelect &&
      pending &&
      pending.element.isConnected &&
      Math.abs(annotation.y - expectedY) < 2
    ) {
      targetsByIdRef.current.set(annotation.id, {
        element: pending.element,
        offsetX: pending.offsetX,
        offsetY: pending.offsetY,
      });
    }
    pendingTargetRef.current = null;
  }, []);

  const handleAnnotationDelete = useCallback((annotation: Annotation) => {
    targetsByIdRef.current.delete(annotation.id);
    annotationsByIdRef.current.delete(annotation.id);
  }, []);

  const handleAnnotationsClear = useCallback(() => {
    targetsByIdRef.current.clear();
    annotationsByIdRef.current.clear();
  }, []);

  useEffect(() => {
    function syncPortalSize(portal: HTMLElement) {
      if (portal.style.width !== '100%') portal.style.width = '100%';
      if (portal.style.height !== '100%') portal.style.height = '100%';
    }

    function updateMarkers() {
      const portal = document.querySelector<HTMLElement>(
        '[data-agentation-portal]',
      );
      const shadowRoot =
        portal?.querySelector('agentation-toolbar')?.shadowRoot;
      if (!shadowRoot) return;

      const markers = shadowRoot.querySelectorAll<HTMLButtonElement>(
        'button[data-annotation-marker], button[data-annotation-pending]',
      );
      if (markers.length === 0) return;

      const annotations = readStoredAnnotations(annotationsByIdRef.current);

      for (const marker of markers) {
        const layer = marker.parentElement;
        const isFixedLayer =
          layer !== null && getComputedStyle(layer).position === 'fixed';

        if (marker.hasAttribute('data-annotation-pending')) {
          const baseX =
            (parseFloat(marker.style.left) / 100) * window.innerWidth;
          const baseY = parseFloat(marker.style.top);
          positionMarker(
            marker,
            pendingTargetRef.current,
            baseX,
            baseY,
            isFixedLayer,
          );
          continue;
        }

        const annotation = findAnnotationForMarker(marker, annotations);
        if (!annotation) continue;

        let target = targetsByIdRef.current.get(annotation.id) ?? null;
        if (!target || !target.element.isConnected) {
          target = resolveTargetFromAnnotation(annotation);
          if (target) targetsByIdRef.current.set(annotation.id, target);
        }

        const baseX = (annotation.x / 100) * window.innerWidth;
        const baseY = annotation.y;
        positionMarker(marker, target, baseX, baseY, isFixedLayer);
      }
    }

    let observedPortal: HTMLElement | null = null;
    let observedShadowRoot: ShadowRoot | null = null;
    const styleObserver = new MutationObserver(() => {
      if (observedPortal) syncPortalSize(observedPortal);
    });
    const shadowObserver = new MutationObserver(() => {
      updateMarkers();
    });
    const portalObserver = new MutationObserver(() => {
      if (observedPortal) attachPortal(observedPortal);
    });

    function attachPortal(portal: HTMLElement | null) {
      if (!portal) return;
      if (portal !== observedPortal) {
        observedPortal = portal;
        syncPortalSize(portal);
        styleObserver.observe(portal, {
          attributes: true,
          attributeFilter: ['style'],
        });
        portalObserver.observe(portal, { childList: true });
      }
      const shadowRoot = portal.querySelector('agentation-toolbar')?.shadowRoot;
      if (shadowRoot && shadowRoot !== observedShadowRoot) {
        observedShadowRoot = shadowRoot;
        shadowObserver.observe(shadowRoot, { childList: true, subtree: true });
        updateMarkers();
      }
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

    function captureClickTarget(event: MouseEvent) {
      const hit = event.composedPath()[0];
      if (!(hit instanceof Element)) return;
      if (hit.closest(AGENTATION_UI_SELECTOR)) return;
      const rect = hit.getBoundingClientRect();
      pendingTargetRef.current = {
        element: hit,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        clickClientY: event.clientY,
        clickScrollY: window.scrollY,
      };
    }

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

    window.addEventListener('click', captureClickTarget, true);
    window.addEventListener('scroll', updateMarkers, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', updateMarkers, { passive: true });
    document.addEventListener('toggle', promotePortal, true);
    return () => {
      bodyObserver.disconnect();
      portalObserver.disconnect();
      styleObserver.disconnect();
      shadowObserver.disconnect();
      window.removeEventListener('click', captureClickTarget, true);
      window.removeEventListener('scroll', updateMarkers, true);
      window.removeEventListener('resize', updateMarkers);
      document.removeEventListener('toggle', promotePortal, true);
    };
  }, []);

  return (
    <Agentation
      endpoint={ENDPOINT}
      onSubmit={sendToAgent}
      onAnnotationAdd={handleAnnotationAdd}
      onAnnotationDelete={handleAnnotationDelete}
      onAnnotationsClear={handleAnnotationsClear}
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
