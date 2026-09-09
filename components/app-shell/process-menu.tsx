'use client';

import Link from 'next/link';
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { Brand } from '@/components/ui/brand';
import { Glyph } from '@/components/ui/glyph';
import { OverflowTooltip, Tooltip } from '@/components/ui/tooltip';
import {
  moveProcess,
  restoreProcessOrder,
  type ProcessNavigationItem,
} from '@/lib/process/navigation';
import {
  readProcessOrder,
  saveProcessOrder,
  serverProcessOrder,
  subscribeProcessOrder,
} from './process-order-store';

const ROW_HEIGHT = 42;
type Drag = {
  id: string;
  startY: number;
  index: number;
  original: string[];
  offset: number;
};

function Grip() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="18"
      viewBox="0 0 14 18"
      fill="currentColor"
    >
      {[4, 9, 14].flatMap((y) =>
        [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />),
      )}
    </svg>
  );
}

export function ProcessMenu({
  current,
  items,
}: {
  current: string;
  items: ProcessNavigationItem[];
}) {
  const saved = useSyncExternalStore(
    subscribeProcessOrder,
    readProcessOrder,
    serverProcessOrder,
  );
  const savedOrder = restoreProcessOrder(
    items.map((item) => item.id),
    saved,
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const order = draft ?? savedOrder;
  const customising = draft !== null;
  const [level, setLevel] = useState<'workspace' | 'processes'>('processes');
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const focusHandle = useRef<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const focusLevel = useRef(false);
  useLayoutEffect(() => {
    if (!focusLevel.current) return;
    (level === 'workspace' ? enterRef : backRef).current?.focus({
      preventScroll: true,
    });
    focusLevel.current = false;
  }, [level]);
  useLayoutEffect(() => {
    const id = focusHandle.current;
    if (id !== null) {
      handles.current.get(id)?.focus({ preventScroll: true });
      focusHandle.current = null;
    }
  }, [draft, drag]);

  function navigate(next: typeof level) {
    focusLevel.current = true;
    setLevel(next);
  }

  function move(id: string, index: number) {
    if (
      !customising ||
      index === order.indexOf(id) ||
      index < 0 ||
      index >= order.length
    )
      return;
    const next = moveProcess(order, id, index);
    setDraft(next);
  }

  function finishDrag(cancel: boolean) {
    const active = dragRef.current;
    if (!active) return;
    if (cancel) {
      setDraft(active.original);
    } else {
      const index = Math.round(
        (active.index * ROW_HEIGHT + active.offset) / ROW_HEIGHT,
      );
      const next = moveProcess(active.original, active.id, index);
      setDraft(next);
    }
    dragRef.current = null;
    focusHandle.current = active.id;
    setDrag(null);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary || !customising) return;
    setSelected(id);
    const active = {
      id,
      startY: event.clientY,
      index: order.indexOf(id),
      original: [...order],
      offset: 0,
    };
    dragRef.current = active;
    setDrag(active);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const active = dragRef.current;
    if (!active) return;
    const offset = Math.max(
      -active.index * ROW_HEIGHT,
      Math.min(
        (order.length - active.index - 1) * ROW_HEIGHT,
        event.clientY - active.startY,
      ),
    );
    const nextDrag = { ...active, offset };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
    setDraft(
      moveProcess(
        active.original,
        active.id,
        Math.round((active.index * ROW_HEIGHT + offset) / ROW_HEIGHT),
      ),
    );
  }

  function finishCustomising(save: boolean) {
    if (dragRef.current) finishDrag(true);
    if (save) saveProcessOrder(order);
    setDraft(null);
    setSelected(null);
    editRef.current?.focus();
  }

  const selectedIndex = selected === null ? -1 : order.indexOf(selected);
  const selectedName = items.find((item) => item.id === selected)?.name;

  return (
    <aside className="app-sidebar" aria-label="Workspace navigation">
      <div className="app-sidebar-brand">
        <Brand />
      </div>
      <nav
        className="process-menu"
        aria-label={level === 'processes' ? 'Processes' : 'Workspace'}
      >
        <div className="menu-viewport">
          <div className="menu-track" data-level={level}>
            <div
              className="menu-level"
              inert={level !== 'workspace'}
              aria-hidden={level !== 'workspace'}
            >
              <p className="menu-context">Workspace</p>
              <button
                ref={enterRef}
                className="menu-root-item"
                type="button"
                onClick={() => navigate('processes')}
              >
                <span>Processes</span>
                <span className="menu-count">{items.length}</span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <div
              className="menu-level"
              inert={level !== 'processes'}
              aria-hidden={level !== 'processes'}
            >
              <button
                ref={backRef}
                type="button"
                className="menu-back"
                onClick={() => navigate('workspace')}
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m10 5-7 7 7 7M3 12h18" />
                </svg>{' '}
                Back to workspace
              </button>
              <div className="menu-heading">
                <h2>Processes</h2>
                <div className="menu-edit-actions">
                  {customising ? (
                    <button
                      type="button"
                      className="menu-text-button"
                      onClick={() => finishCustomising(false)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <Tooltip
                    label={customising ? 'Save menu order' : 'Customise menu'}
                    isDisabled={customising}
                  >
                    <button
                      ref={editRef}
                      type="button"
                      className="menu-text-button menu-customise"
                      aria-label={customising ? 'Done' : 'Customise'}
                      aria-pressed={customising}
                      onClick={() => {
                        if (customising) finishCustomising(true);
                        else {
                          setDraft(savedOrder);
                        }
                      }}
                    >
                      {customising ? (
                        'Done'
                      ) : (
                        <svg
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <rect x="4" y="4" width="6" height="6" rx="1.5" />
                          <rect x="14" y="4" width="6" height="6" rx="1.5" />
                          <rect x="4" y="14" width="6" height="6" rx="1.5" />
                          <path d="m14 19 5-5m-5 0h5v5" />
                        </svg>
                      )}
                    </button>
                  </Tooltip>
                </div>
              </div>
              <ol
                className="process-menu-list"
                aria-label={
                  customising
                    ? 'Customise process order'
                    : 'Available processes'
                }
                style={{ height: order.length * ROW_HEIGHT }}
              >
                {drag ? (
                  <li
                    aria-hidden="true"
                    className="process-drop-slot"
                    style={{
                      transform: `translateY(${order.indexOf(drag.id) * ROW_HEIGHT}px)`,
                    }}
                  />
                ) : null}
                {(drag?.original ?? order).map((id) => {
                  const index = order.indexOf(id);
                  const item = items.find((entry) => entry.id === id);
                  if (!item) return null;
                  const dragging = drag?.id === id;
                  const position = dragging
                    ? drag.index * ROW_HEIGHT + drag.offset
                    : index * ROW_HEIGHT;
                  return (
                    <li
                      key={id}
                      className="process-menu-row"
                      data-current={current === item.href || undefined}
                      data-editing={customising || undefined}
                      data-dragging={dragging || undefined}
                      data-moving={selected === id || undefined}
                      style={{ transform: `translateY(${position}px)` }}
                    >
                      {customising ? (
                        <>
                          <button
                            ref={(element) => {
                              if (element) handles.current.set(id, element);
                              else handles.current.delete(id);
                            }}
                            type="button"
                            className="process-grip"
                            aria-label={`Reorder ${item.name}`}
                            aria-describedby="process-order-help"
                            aria-pressed={selected === id}
                            onFocus={() => setSelected(id)}
                            onClick={() => setSelected(id)}
                            onPointerDown={(event) => startDrag(event, id)}
                            onPointerMove={dragMove}
                            onPointerUp={() => finishDrag(false)}
                            onPointerCancel={() => finishDrag(true)}
                            onLostPointerCapture={() => finishDrag(true)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape' && dragRef.current) {
                                event.preventDefault();
                                finishDrag(true);
                              }
                              if (
                                event.key === 'ArrowUp' ||
                                event.key === 'ArrowDown' ||
                                event.key === 'Home' ||
                                event.key === 'End'
                              ) {
                                event.preventDefault();
                                focusHandle.current = id;
                                move(
                                  id,
                                  event.key === 'Home'
                                    ? 0
                                    : event.key === 'End'
                                      ? order.length - 1
                                      : index +
                                        (event.key === 'ArrowUp' ? -1 : 1),
                                );
                              }
                            }}
                          >
                            <Grip />
                          </button>
                          <OverflowTooltip label={item.name}>
                            <span
                              className="process-edit-name"
                              tabIndex={0}
                              role="img"
                              aria-label={item.name}
                            >
                              {item.name}
                            </span>
                          </OverflowTooltip>
                        </>
                      ) : (
                        <OverflowTooltip label={item.name}>
                          <Link
                            className="process-menu-link"
                            href={item.href}
                            aria-current={
                              current === item.href ? 'page' : undefined
                            }
                          >
                            {item.name}
                          </Link>
                        </OverflowTooltip>
                      )}
                      <Tooltip
                        label={item.name}
                        placement="right"
                        content={<ProcessStatusContent status={item.status} />}
                      >
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={`${item.name}: ${item.status.label}`}
                          className="process-menu-status"
                          data-tone={item.status.tone}
                        >
                          <Glyph
                            name={
                              item.status.tone === 'blocked'
                                ? 'square'
                                : item.status.tone === 'caution'
                                  ? 'triangle'
                                  : item.status.tone === 'verified'
                                    ? 'check'
                                    : 'circle'
                            }
                            size={9}
                          />
                        </span>
                      </Tooltip>
                    </li>
                  );
                })}
              </ol>
              <Tooltip
                label="New process"
                description="Process creation will be available here. This is a preview placeholder."
              >
                <button
                  type="button"
                  className="menu-new-process"
                  aria-disabled="true"
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New process
                </button>
              </Tooltip>
              {customising ? (
                <div className="process-order-tools">
                  <p id="process-order-help">
                    Drag a handle, or focus it and use ↑ / ↓. Select a handle
                    for move buttons.
                  </p>
                  {selected !== null ? (
                    <div className="process-move-tools">
                      <p>{selectedName}</p>
                      <div>
                        <button
                          type="button"
                          className="menu-move-button"
                          aria-disabled={selectedIndex <= 0}
                          onClick={() => move(selected, selectedIndex - 1)}
                        >
                          ↑ Move up
                        </button>
                        <button
                          type="button"
                          className="menu-move-button"
                          aria-disabled={selectedIndex === order.length - 1}
                          onClick={() => move(selected, selectedIndex + 1)}
                        >
                          ↓ Move down
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </nav>
      <div className="menu-footer">
        <div className="app-sidebar-foot">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7h.01" />
          </svg>
          <div>
            <p>Replay workspace</p>
            <span>Fictional data. No live changes.</span>
          </div>
        </div>
        <div className="menu-account" aria-label="Fictional signed-in user">
          <span className="menu-avatar" aria-hidden="true">
            M
          </span>
          <div>
            <p>Maya</p>
            <span>Release coordinator</span>
          </div>
          <span className="menu-account-demo">Demo</span>
        </div>
      </div>
    </aside>
  );
}

function ProcessStatusContent({
  status,
}: {
  status: ProcessNavigationItem['status'];
}) {
  return (
    <div className="process-status-detail">
      <div className="process-status-caption">
        <span>Latest available run</span>
        <span>{status.totalLabel}</span>
      </div>
      <span className="process-status-pill" data-tone={status.tone}>
        {status.label}
      </span>
      <dl className="process-status-counts">
        <div data-tone="blocked">
          <dt>Blocked</dt>
          <dd>{status.counts.blocked}</dd>
        </div>
        <div data-tone="caution">
          <dt>Needs a decision</dt>
          <dd>{status.counts.needs_decision}</dd>
        </div>
        <div data-tone="neutral">
          <dt>Deferred</dt>
          <dd>{status.counts.deferred}</dd>
        </div>
        <div data-tone="verified">
          <dt>Ready for review</dt>
          <dd>{status.counts.will_apply}</dd>
        </div>
      </dl>
      <div className="process-status-foot">
        <span>{status.modeLabel}</span>
        <p>{status.modeDescription}</p>
      </div>
    </div>
  );
}
