'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import {
  parseSidebarPreferences,
  readSidebarPreferences,
  saveSidebarPreferences,
  serverSidebarPreferences,
  subscribeSidebarPreferences,
} from './sidebar-preferences';
import {
  AssistantContext,
  parseAssistantPreferences,
  readAssistantPreferences,
  saveAssistantPreferences,
  subscribeAssistantPreferences,
} from '@/components/app-shell/assistant/assistant-state';
import { AssistantPanel } from '@/components/app-shell/assistant/assistant-panel';
import { SidebarResizeHandle, SidebarSizeProbes } from './sidebar-resize';
import { useResizableSidebar } from './use-resizable-sidebar';

/** Layout owns the two independent panels; server-rendered children stay opaque. */
export function ResizableShell({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    subscribeSidebarPreferences,
    readSidebarPreferences,
    serverSidebarPreferences,
  );
  const assistantSnapshot = useSyncExternalStore(
    subscribeAssistantPreferences,
    readAssistantPreferences,
    serverSidebarPreferences,
  );
  const preferences = parseSidebarPreferences(snapshot);
  const assistantPreferences = parseAssistantPreferences(assistantSnapshot);
  const left = useResizableSidebar({
    side: 'left',
    label: 'Workspace navigation',
    preferences,
    onChange: saveSidebarPreferences,
  });
  const right = useResizableSidebar({
    side: 'right',
    label: 'Assistant width',
    preferences: assistantPreferences,
    onChange: saveAssistantPreferences,
  });
  const { navigationRef: leftContentRef, handle: leftHandleRef } = left;
  const {
    navigationRef: rightContentRef,
    handle: rightHandleRef,
    cancelDrag: cancelAssistantDrag,
  } = right;
  const [draft, setDraft] = useState('');
  const [docked, setDocked] = useState(false);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);
  const modeProbe = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const restoreFocus = useRef(false);
  const open = !right.collapsed;
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || docked || !viewport) return;
    const measure = () =>
      setViewport({ height: viewport.height, top: viewport.offsetTop });
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, [open, docked]);

  useLayoutEffect(() => {
    const probe = modeProbe.current;
    if (!probe) return;
    const measure = () => {
      cancelAssistantDrag();
      setDocked(probe.getBoundingClientRect().width > 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    measure();
    return () => observer.disconnect();
  }, [cancelAssistantDrag]);

  useLayoutEffect(() => {
    if (
      left.collapsed &&
      leftContentRef.current?.contains(document.activeElement)
    )
      leftHandleRef.current?.focus();
  }, [left.collapsed, leftContentRef, leftHandleRef]);

  useEffect(() => {
    if (!left.collapsed) return;
    const revealForSearch = (event: globalThis.KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'k' ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      flushSync(() =>
        saveSidebarPreferences({
          ...parseSidebarPreferences(readSidebarPreferences()),
          collapsed: false,
        }),
      );
    };
    document.addEventListener('keydown', revealForSearch, true);
    return () => document.removeEventListener('keydown', revealForSearch, true);
  }, [left.collapsed]);

  useLayoutEffect(() => {
    if (open && !wasOpen.current)
      composer.current?.focus({ preventScroll: true });
    if (
      !open &&
      wasOpen.current &&
      (rightContentRef.current?.contains(document.activeElement) ||
        rightHandleRef.current === document.activeElement ||
        document.activeElement === document.body)
    )
      restoreFocus.current = true;
    wasOpen.current = open;
  }, [open, rightContentRef, rightHandleRef]);

  useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    // Run after the modal's focus scope releases its containment and restore.
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = () => {
    restoreFocus.current = true;
    right.cancelDrag();
    saveAssistantPreferences({
      ...parseAssistantPreferences(readAssistantPreferences()),
      collapsed: true,
    });
  };
  const assistantContext = {
    id: right.navigationId,
    open,
    close,
    opener,
    toggle: () => {
      if (open) close();
      else
        saveAssistantPreferences({
          ...parseAssistantPreferences(readAssistantPreferences()),
          collapsed: false,
        });
    },
  };
  const style: CSSProperties &
    Record<`--${string}`, string | number | undefined> = {
    '--sidebar-width': left.bounds ? `${left.width}px` : undefined,
    '--sidebar-drag-track':
      left.preview === null ? undefined : `${left.preview}px`,
    '--sidebar-drag-opacity': left.dragOpacity,
    '--assistant-width': right.bounds ? `${right.width}px` : undefined,
    '--assistant-track':
      right.preview !== null
        ? `${right.preview}px`
        : open
          ? `${right.width}px`
          : '0px',
    '--assistant-opacity': right.dragOpacity,
    '--assistant-viewport-height': viewport
      ? `${viewport.height}px`
      : undefined,
    '--assistant-viewport-top': viewport ? `${viewport.top}px` : undefined,
  };
  const panel = (
    <div
      ref={rightContentRef}
      className="assistant-content h-full min-h-0"
      inert={!open || right.preview !== null}
      aria-hidden={!open || right.preview !== null || undefined}
    >
      <AssistantPanel
        draft={draft}
        onDraftChange={setDraft}
        composer={composer}
      />
    </div>
  );
  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      if (right.preview !== null) right.cancelDrag();
      else if (!right.optionsOpen) close();
      event.stopPropagation();
    }
  };

  return (
    <AssistantContext value={assistantContext}>
      <div
        className="resizable-shell bg-canvas p-shell-inset max-shell:gap-3.5 shell:h-dvh shell:overflow-hidden relative grid"
        style={style}
        data-collapsed={left.collapsed || undefined}
        data-resizing={left.preview !== null || undefined}
        data-dragging={left.isDragging || right.isDragging || undefined}
        data-assistant-open={open || undefined}
        data-assistant-resizing={right.preview !== null || undefined}
      >
        <div className="shell-axis" aria-hidden="true" />
        <div
          ref={modeProbe}
          className="assistant-mode-probe pointer-events-none invisible absolute h-0"
          aria-hidden="true"
        />
        <SidebarSizeProbes controller={left} />
        <SidebarSizeProbes controller={right} />
        <div className="shell:min-h-0 min-w-0">
          <div
            id={left.navigationId}
            ref={leftContentRef}
            className="sidebar-navigation shell:h-full"
            inert={left.collapsed || left.preview !== null}
            aria-hidden={left.collapsed || left.preview !== null || undefined}
          >
            {navigation}
          </div>
        </div>
        <div className="shell:min-h-0 relative min-w-0">
          <SidebarResizeHandle controller={left} />
          <div className="shell:h-full @container/sheet min-w-0">
            {children}
          </div>
        </div>
        {docked ? (
          <aside
            id={right.navigationId}
            aria-label="Assistant"
            className="assistant-dock relative min-h-0 min-w-0"
            data-open={open || undefined}
            onKeyDown={onPanelKeyDown}
          >
            {open ? <SidebarResizeHandle controller={right} /> : null}
            {panel}
          </aside>
        ) : null}
      </div>
      {!docked ? (
        <ModalOverlay
          isOpen={open}
          onOpenChange={(value) => {
            if (!value) close();
          }}
          isDismissable
          isKeyboardDismissDisabled={
            right.preview !== null || right.optionsOpen
          }
          className="assistant-overlay drawer-overlay p-shell-inset fixed inset-0 z-50 flex justify-end"
          style={style}
          data-resizing={right.preview !== null || undefined}
          data-dragging={right.isDragging || undefined}
        >
          <Modal className="assistant-modal bg-canvas rounded-shell relative h-full min-h-0">
            <Dialog
              id={right.navigationId}
              aria-label="Assistant"
              className="h-full outline-none"
            >
              <div className="h-full" onKeyDown={onPanelKeyDown}>
                <SidebarResizeHandle controller={right} />
                {panel}
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      ) : null}
    </AssistantContext>
  );
}
