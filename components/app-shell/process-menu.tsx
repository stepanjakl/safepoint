'use client';

import Link from 'next/link';
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { BrandSquare } from '@/components/ui/brand';
import { GradientAvatar } from '@outpacelabs/avatars';
import { cx } from '@/lib/cx';
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
const MENU_TITLE = 'text-menu-link text-dense leading-4.5 font-semibold';
const MENU_CHEVRON = 'size-5 flex-none [stroke-width:2]';

/*
  Three shapes repeat across the menu often enough to be named once. They are
  string constants rather than components because each is applied to a
  different element -- a button, a link, a span, an anchor from next/link --
  and wrapping those would cost more than it saves.
*/

// Quiet square icon button. Inside a section heading it also answers to the
// heading's hover, which is why that tint is a named group variant: an icon
// button elsewhere in the sidebar must not pick it up.
const ICON_BUTTON_SHAPE =
  'text-muted transition-colors duration-150 motion-reduce:transition-none inline-grid size-7.5 flex-none cursor-pointer place-items-center rounded-[7px] p-0 aria-disabled:cursor-default';
const ICON_BUTTON_QUIET =
  'hover:bg-surface-selected hover:text-primary group-hover/heading:bg-menu-wash-faint group-hover/heading:text-primary group-focus-within/heading:bg-menu-wash-faint group-focus-within/heading:text-primary';
const ICON_BUTTON = `${ICON_BUTTON_SHAPE} ${ICON_BUTTON_QUIET}`;

// A process name, in the row or in the rename field. Truncates rather than
// wraps: the row is a fixed height, and OverflowTooltip supplies the full name.
const MENU_LABEL =
  'text-menu-link group-hover/row:text-primary group-focus-within/row:text-primary transition-colors duration-150 motion-reduce:transition-none group-data-[current]/row:text-primary block min-w-0 truncate rounded-md py-2.75 pr-0 text-dense leading-4.5 font-semibold tracking-[-0.01em] no-underline';

// The reorder handle, and its non-interactive preview.
const GRIP = 'text-muted ml-0.5 grid h-8 w-6 flex-none place-items-center';
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
  const [query, setQuery] = useState('');
  const [previewHandles, setPreviewHandles] = useState(false);
  const search = query.trim().toLocaleLowerCase();
  const visibleOrder = customising
    ? order
    : order.filter((id) =>
        items
          .find((item) => item.id === id)
          ?.name.toLocaleLowerCase()
          .includes(search),
      );

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
    setQuery('');
    setPreviewHandles(false);
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

  function finishCustomising() {
    if (dragRef.current) finishDrag(true);
    saveProcessOrder(order);
    setDraft(null);
    setSelected(null);
    editRef.current?.focus();
  }

  return (
    <aside
      className="max-shell:px-2 max-shell:py-2.5 shell:overflow-y-auto shell:overscroll-contain relative flex min-w-0 flex-col gap-1"
      aria-label="Workspace navigation"
    >
      <div className="flex items-center justify-between gap-2 px-1 pt-1 pb-4">
        <BrandSquare />
        <div
          className="ease-out-emphasized flex flex-none items-center gap-0.75 transition-[translate,opacity] duration-[220ms] data-[level=workspace]:pointer-events-none data-[level=workspace]:translate-x-4 data-[level=workspace]:opacity-0 motion-reduce:transition-none"
          data-level={level}
          inert={level !== 'processes'}
          aria-hidden={level !== 'processes'}
        >
          <Tooltip label="Add process">
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Add process"
              aria-disabled="true"
            >
              <MenuIcon name="plus" />
            </button>
          </Tooltip>
          <Tooltip label={customising ? 'Save order' : 'Arrange processes'}>
            <button
              ref={editRef}
              type="button"
              className={cx(
                ICON_BUTTON_SHAPE,
                // The one accented control in the sidebar, and only while
                // arranging: it is the way back out of the mode. It takes the
                // accent face instead of the quiet hover, not as well as it --
                // the two would fight over the same background.
                customising
                  ? 'control-face control-accent text-white'
                  : ICON_BUTTON_QUIET,
              )}
              aria-label={customising ? 'Save order' : 'Arrange processes'}
              aria-pressed={customising}
              onMouseEnter={() => setPreviewHandles(true)}
              onMouseLeave={() => setPreviewHandles(false)}
              onFocus={() => setPreviewHandles(true)}
              onBlur={() => setPreviewHandles(false)}
              onClick={() => {
                if (customising) finishCustomising();
                else {
                  setQuery('');
                  setLevel('processes');
                  setDraft(savedOrder);
                }
              }}
            >
              <MenuIcon name={customising ? 'check' : 'arrange'} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div
        className="border-rule-faint mx-1 mb-2 border-t"
        aria-hidden="true"
      />
      <nav
        className="min-w-0"
        aria-label={level === 'processes' ? 'Processes' : 'Workspace'}
      >
        <div className="-m-1 overflow-clip p-1">
          <div
            className="ease-out-emphasized grid w-[200%] translate-x-0 grid-cols-2 items-start transition-transform duration-[220ms] data-[level=processes]:-translate-x-1/2 motion-reduce:transition-none"
            data-level={level}
          >
            <div
              className="ease-out-emphasized min-w-0 p-1 opacity-100 transition-opacity duration-[220ms] aria-hidden:opacity-0 motion-reduce:transition-none"
              inert={level !== 'workspace'}
              aria-hidden={level !== 'workspace'}
            >
              <button
                ref={enterRef}
                className={cx(
                  MENU_TITLE,
                  'hover:bg-surface-control hover:text-primary focus-visible:text-primary flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg p-2.5 text-left transition-colors duration-150 motion-reduce:transition-none',
                )}
                type="button"
                onClick={() => navigate('processes')}
              >
                <MenuIcon name="processes" className="text-muted w-4.25" />
                <span>Processes</span>
                <span className="bg-menu-chip text-muted ml-auto inline-grid h-5.5 min-w-5.5 place-items-center rounded-md px-1.25 text-[11px] tabular-nums">
                  {items.length}
                </span>
                <MenuIcon name="right" className={MENU_CHEVRON} />
              </button>
            </div>
            <div
              className="ease-out-emphasized min-w-0 p-1 opacity-100 transition-opacity duration-[220ms] aria-hidden:opacity-0 motion-reduce:transition-none"
              inert={level !== 'processes'}
              aria-hidden={level !== 'processes'}
            >
              <label className="border-rule-faint bg-menu-search text-muted focus-within:outline-focus mx-1 mb-3.5 flex min-h-9 items-center gap-2 rounded-lg border px-2.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 has-[input:disabled]:opacity-65">
                <MenuIcon name="search" className="size-3.75 flex-none" />
                <span className="sr-only">Search processes</span>
                <input
                  type="search"
                  className="text-primary placeholder:text-muted min-h-8.5 w-full min-w-0 border-none bg-transparent text-[12px] outline-none"
                  placeholder={
                    customising
                      ? 'Finish arranging to search'
                      : 'Search processes…'
                  }
                  value={query}
                  disabled={customising}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button
                ref={backRef}
                type="button"
                className={cx(
                  MENU_TITLE,
                  'hover:bg-menu-wash-strong hover:text-primary focus-visible:text-primary mb-2 grid min-h-9.5 w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_40px] items-center rounded-lg p-0.75 transition-colors duration-150 motion-reduce:transition-none',
                )}
                aria-label="Back to workspace menu"
                onClick={() => navigate('workspace')}
              >
                <MenuIcon
                  name="left"
                  className={cx(MENU_CHEVRON, 'justify-self-center')}
                />
                <span className="text-center">Processes</span>
                <span aria-hidden="true" />
              </button>
              {customising ? (
                <span id="process-reorder-instructions" className="sr-only">
                  Use Up and Down arrow keys, Home or End to reorder.
                </span>
              ) : null}
              <ol
                className="relative"
                aria-label={
                  customising
                    ? 'Customise process order'
                    : 'Available processes'
                }
                style={{ height: visibleOrder.length * ROW_HEIGHT }}
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
                {(drag?.original ?? visibleOrder).map((id) => {
                  const index = visibleOrder.indexOf(id);
                  const item = items.find((entry) => entry.id === id);
                  if (!item) return null;
                  const dragging = drag?.id === id;
                  const position = dragging
                    ? drag.index * ROW_HEIGHT + drag.offset
                    : index * ROW_HEIGHT;
                  return (
                    <li
                      key={id}
                      className="process-menu-row group/row"
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
                            className={
                              GRIP +
                              ' hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary cursor-grab touch-none rounded-[5px] group-data-[dragging]/row:cursor-grabbing'
                            }
                            aria-label={`Reorder ${item.name}`}
                            aria-describedby="process-reorder-instructions"
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
                              className={cx(MENU_LABEL, 'flex-1')}
                              tabIndex={0}
                              role="img"
                              aria-label={item.name}
                            >
                              {item.name}
                            </span>
                          </OverflowTooltip>
                        </>
                      ) : (
                        <>
                          {previewHandles ? (
                            <span
                              className={GRIP + ' pointer-events-none'}
                              aria-hidden="true"
                            >
                              <Grip />
                            </span>
                          ) : null}
                          <OverflowTooltip label={item.name}>
                            <Link
                              className={cx(
                                MENU_LABEL,
                                'process-menu-link pl-2.5',
                              )}
                              href={item.href}
                              aria-current={
                                current === item.href ? 'page' : undefined
                              }
                            >
                              {item.name}
                            </Link>
                          </OverflowTooltip>
                        </>
                      )}
                      <Tooltip
                        label={item.name}
                        placement="right"
                        content={<ProcessStatusContent status={item.status} />}
                      >
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={`${item.name}: ${item.status.label}, ${item.status.totalLabel}`}
                          className="text-muted data-[tone=blocked]:text-state-blocked data-[tone=caution]:text-state-caution data-[tone=verified]:text-state-verified relative z-1 inline-flex min-h-7 min-w-8.5 flex-none cursor-help items-center justify-center gap-1 rounded-[5px] px-1.25 text-[11px] leading-4 font-semibold tabular-nums forced-colors:border forced-colors:border-[CanvasText]"
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
                          <span aria-hidden="true">
                            {item.status.tone === 'blocked'
                              ? item.status.counts.blocked
                              : Object.values(item.status.counts).reduce(
                                  (total, count) => total + count,
                                  0,
                                )}
                          </span>
                        </span>
                      </Tooltip>
                    </li>
                  );
                })}
              </ol>
              {visibleOrder.length === 0 ? (
                <p className="text-muted px-2.5 py-3 text-[12px]">
                  No matching processes.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </nav>
      <div className="max-shell:gap-2.5 max-shell:pt-3 mx-1 mt-auto grid gap-3.5 pt-6">
        {/* Icon shares row one with the title; the caption sits under it. */}
        <div className="control-face surface-notice shadow-control-highlight-medium-hairline bg-notice-face text-state-advisory max-shell:px-3 max-shell:py-2.25 grid grid-cols-[auto_1fr] items-center gap-x-2.25 rounded-[9px] border p-3 text-[11px] leading-[1.5] forced-colors:border-[CanvasText]">
          <MenuIcon name="info" />
          <p className="text-[11px] font-semibold">Demo application</p>
          <span className="text-notice-caption col-start-2 mt-0.75 text-[10px] font-medium">
            Fictional data. No live changes.
          </span>
        </div>
        <div className="border-rule-faint max-shell:pt-2.5 flex items-center justify-between gap-2.5 border-t px-0.5 pt-3.5">
          <span
            role="img"
            aria-label="Maya’s demo avatar"
            className="relative inline-flex rounded-full"
          >
            <GradientAvatar
              seed="safepoint-maya"
              size={34}
              colors={AVATAR_COLORS}
            />
          </span>
          <p className="text-primary text-dense mr-auto leading-4.5 font-semibold">
            Maya
          </p>
          <Tooltip label="Settings">
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label="Settings"
              aria-disabled="true"
            >
              <MenuIcon name="more" />
            </button>
          </Tooltip>
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
  const counts = [
    ['blocked', 'Blocked', status.counts.blocked],
    ['caution', 'Needs a decision', status.counts.needs_decision],
    ['neutral', 'Deferred', status.counts.deferred],
    ['verified', 'Ready for review', status.counts.will_apply],
  ] as const;

  return (
    <div className="grid gap-2.5">
      <div className="text-muted mt-0.5 flex justify-between gap-2.5 text-[10px]">
        <span>Latest available run</span>
        <span>{status.totalLabel}</span>
      </div>
      <span
        className={cx(
          TONE_CHIP[status.tone],
          'justify-self-start rounded-full px-2 py-0.75 text-[11px] font-semibold',
        )}
      >
        {status.label}
      </span>
      <dl className="grid grid-cols-2 gap-1.25">
        {counts.map(([tone, label, count]) => (
          <div
            key={tone}
            className={cx(
              TONE_CHIP[tone],
              'flex items-center justify-between gap-2 rounded-[5px] px-2 py-1.5',
            )}
          >
            <dt className="text-[10px]">{label}</dt>
            <dd className="text-[12px] [font-weight:650] tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-rule-faint flex items-start gap-2 border-t pt-2.25">
        <span className="bg-state-advisory/10 text-state-advisory rounded-sm px-1.25 py-0.5 text-[10px] font-semibold">
          {status.modeLabel}
        </span>
        <p className="text-muted text-[10px]">{status.modeDescription}</p>
      </div>
    </div>
  );
}

/*
  One tone scale, two shapes: the summary pill and the four count cells read
  the same map, so a tone cannot mean one colour in one and another in the
  other. The 8% wash is what the tone's own text colour is legible on.
*/
const TONE_CHIP: Record<
  ProcessNavigationItem['status']['tone'] | 'neutral',
  string
> = {
  blocked: 'text-state-blocked bg-state-blocked/8',
  caution: 'text-state-caution bg-state-caution/8',
  verified: 'text-state-verified bg-state-verified/8',
  neutral: 'text-muted bg-surface-inset',
};

const AVATAR_COLORS = ['#0d9488', '#22d3ee', '#0284c7', '#3f3f46', '#5eead4'];
function MenuIcon({
  name,
  className,
}: {
  className?: string;
  name:
    | 'plus'
    | 'check'
    | 'arrange'
    | 'search'
    | 'processes'
    | 'left'
    | 'right'
    | 'more'
    | 'info';
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'plus' ? <path d="M12 5v14M5 12h14" /> : null}
      {name === 'check' ? <path d="m5 12 4 4L19 6" /> : null}
      {name === 'arrange' ? (
        <>
          <path d="M10 6h10M10 12h10M10 18h10" />
          <circle cx="4" cy="6" r=".7" />
          <circle cx="4" cy="12" r=".7" />
          <circle cx="4" cy="18" r=".7" />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </>
      ) : null}
      {name === 'processes' ? (
        <>
          <rect x="3" y="4" width="6" height="6" rx="1.5" />
          <rect x="15" y="14" width="6" height="6" rx="1.5" />
          <path d="M9 7h5a4 4 0 0 1 4 4v3M5 14v6m-3-3h6" />
        </>
      ) : null}
      {name === 'left' ? <path d="m14 5-7 7 7 7" /> : null}
      {name === 'right' ? <path d="m9 5 7 7-7 7" /> : null}
      {name === 'info' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      ) : null}
      {name === 'more' ? (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      ) : null}
    </svg>
  );
}
