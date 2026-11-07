'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton, Dialog } from 'react-aria-components';
import X from 'blode-icons-react/icons/x';

import {
  CLOSE_BUTTON,
  DrawerAside,
  type AsideLayer,
  type SwapDirection,
} from '@/components/app-shell/drawer-aside';
import {
  DRAWER_ASIDE_WIDTH,
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { Button } from '@/components/ui/button';
import { Pin, type PinnedState } from '../pin';

type Header = 'plain' | 'band' | 'headless' | 'leading' | 'meta';
type Content = 'short' | 'empty' | 'overflow';

const HEADERS: { value: Header; label: string }[] = [
  { value: 'plain', label: 'Plain header' },
  { value: 'band', label: 'Recessed header' },
  { value: 'headless', label: 'Headless' },
  { value: 'leading', label: 'Leading content' },
  { value: 'meta', label: 'Metadata and long title' },
];
const CONTENTS: { value: Content; label: string }[] = [
  { value: 'short', label: 'Short body' },
  { value: 'empty', label: 'Empty body' },
  { value: 'overflow', label: 'Scrolling body' },
];
const noop = () => {};

function Body({ content }: { content: Content }) {
  return (
    <div className="grid gap-4 p-5">
      {content === 'empty' ? (
        <p className="text-body text-muted">No items yet.</p>
      ) : (
        Array.from({ length: content === 'overflow' ? 24 : 2 }, (_, i) => (
          <div key={i} className="grid gap-1">
            <h3 className="text-body font-medium">Section {i + 1}</h3>
            <p className="text-body text-muted">
              Review the details here. The header stays in place while the body
              scrolls.
            </p>
          </div>
        ))
      )}
    </div>
  );
}

function makeLayer(header: Header, content: Content, item = 1): AsideLayer {
  const title =
    header === 'meta'
      ? `Item ${item}: a longer title that wraps onto more than one line`
      : `Item ${item}`;
  return {
    key: `item-${item}`,
    eyebrow: 'Details',
    title,
    announce: title,
    focusOnOpen: false,
    band: header === 'band',
    headless: header === 'headless',
    leading:
      header === 'leading' ? (
        <span className="control-face surface-inset rounded-control text-meta grid size-8 shrink-0 place-items-center">
          01
        </span>
      ) : undefined,
    meta: header === 'meta' ? 'Version 3 · Updated today' : undefined,
    body: (
      <>
        {header === 'headless' ? (
          <h3 className="text-title px-5 pt-5 font-semibold">
            Body with its own heading
          </h3>
        ) : null}
        <Body content={content} />
      </>
    ),
  };
}

// Pause the components' own CSS animations; the production motion stays the source.
function Still({
  children,
  progress = 1,
  settledAnimations = [],
}: {
  children: ReactNode;
  progress?: number;
  settledAnimations?: string[];
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    for (const animation of root.current?.getAnimations({ subtree: true }) ??
      []) {
      const timing = animation.effect?.getComputedTiming();
      if (
        !timing ||
        typeof timing.endTime !== 'number' ||
        !Number.isFinite(timing.endTime)
      )
        continue;
      animation.pause();
      const settled =
        animation instanceof CSSAnimation &&
        settledAnimations.includes(animation.animationName);
      animation.currentTime = timing.endTime * (settled ? 1 : progress);
    }
  }, [progress, children, settledAnimations]);
  return (
    <div ref={root} inert className="h-full">
      {children}
    </div>
  );
}

function Sample({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <figure className="grid min-w-0 content-start gap-2">
      <figcaption className="grid gap-1">
        <span className="text-body font-medium">{title}</span>
        {note ? <span className="text-meta text-muted">{note}</span> : null}
      </figcaption>
      <div className="h-96 overflow-auto p-2">{children}</div>
    </figure>
  );
}

function MotionDetail({
  state,
  progress,
}: {
  state: string;
  progress: number;
}) {
  const [swapped, setSwapped] = useState(false);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setSwapped(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Still
      progress={progress}
      settledAnimations={
        state.endsWith('exit')
          ? ['drawer-aside-content-in']
          : state.includes('swap') || state.includes('leave')
            ? ['drawer-aside-in']
            : []
      }
    >
      <div className="drawer-overlay relative h-full">
        <DrawerAside
          current={makeLayer(
            'plain',
            'short',
            state.startsWith('swap') && swapped ? 2 : 1,
          )}
          leaving={
            state.startsWith('leave') ? makeLayer('plain', 'short', 2) : null
          }
          direction={state.endsWith('down') ? 'up' : 'down'}
          exiting={state.endsWith('exit')}
          flat={state.startsWith('flat')}
          onExited={noop}
          onLeft={noop}
        />
      </div>
    </Still>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="text-meta text-muted mb-2">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="text-body flex items-center gap-2">
          <input
            type="radio"
            name={label}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function DrawerWorkbench() {
  const [header, setHeader] = useState<Header>('plain');
  const [content, setContent] = useState<Content>('short');
  const [width, setWidth] = useState<'content' | 'fixed'>('content');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AsideLayer | null>(null);
  const [leaving, setLeaving] = useState<AsideLayer | null>(null);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<SwapDirection>('down');
  const [progress, setProgress] = useState(0.85);
  const [replay, setReplay] = useState(0);
  const itemButtons = useRef(new Map<number, HTMLButtonElement>());
  const chosenItem = useRef(1);

  function choose(item: number) {
    if (detail?.key === `item-${item}` && !exiting) {
      setExiting(true);
      return;
    }
    setDirection(item > chosenItem.current ? 'down' : 'up');
    chosenItem.current = item;
    setLeaving(detail);
    setDetail({ ...makeLayer(header, content, item), focusOnOpen: true });
    setExiting(false);
  }

  function closeDetail() {
    setExiting(true);
    itemButtons.current.get(chosenItem.current)?.focus();
  }

  const liveDetail = detail
    ? {
        ...detail,
        body: (
          <>
            <div className="rule-below flex flex-wrap gap-2 p-5">
              <Button onPress={closeDetail}>Close detail</Button>
              {[1, 2, 3].map((item) => (
                <Button key={item} onPress={() => choose(item)}>
                  Show item {item}
                </Button>
              ))}
            </div>
            {detail.body}
          </>
        ),
      }
    : null;

  return (
    <>
      <section aria-label="Live drawer" className="grid gap-4">
        <h2 className="text-title font-semibold">Live drawer</h2>
        <p className="text-meta text-muted max-w-3xl">
          Open the drawer, choose an item, then choose another to try both swap
          directions. Escape closes the detail first; a second Escape, the close
          button, or the scrim closes the drawer. Below the large breakpoint the
          detail replaces the main panel.
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          <Choice
            label="Main width"
            value={width}
            onChange={setWidth}
            options={[
              { value: 'content', label: 'Fit content' },
              { value: 'fixed', label: 'Fixed · 35rem' },
            ]}
          />
          <Choice
            label="Detail header"
            value={header}
            onChange={setHeader}
            options={HEADERS}
          />
          <Choice
            label="Body"
            value={content}
            onChange={setContent}
            options={CONTENTS}
          />
        </div>
        <div>
          <Button
            onPress={() => {
              setDetail(null);
              setLeaving(null);
              setExiting(false);
              setOpen(true);
            }}
          >
            Open drawer
          </Button>
        </div>
      </section>

      <section aria-label="Main panel widths" className="grid gap-3">
        <h2 className="text-title font-semibold">Main panel widths</h2>
        <div className="grid gap-6 xl:grid-cols-2">
          {(['content', 'fixed'] as const).map((panelWidth) => (
            <Sample
              key={panelWidth}
              title={
                panelWidth === 'content'
                  ? 'Fit content · minimum 420px'
                  : 'Fixed · 35rem'
              }
              note="Both widths are capped by the viewport and shell inset."
            >
              <Still>
                <Dialog aria-label={`${panelWidth} preview`} className="h-full">
                  <DrawerPanels
                    title="Drawer title"
                    closeLabel="Close preview"
                    width={panelWidth}
                    aside={null}
                  >
                    <Body content="short" />
                  </DrawerPanels>
                </Dialog>
              </Still>
            </Sample>
          ))}
        </div>
      </section>

      <section aria-label="Detail configurations" className="grid gap-3">
        <h2 className="text-title font-semibold">Detail configurations</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {HEADERS.map(({ value, label }) => (
            <Sample key={value} title={label}>
              <Still>
                <DrawerAside
                  current={makeLayer(value, 'short')}
                  leaving={null}
                  direction="down"
                  exiting={false}
                  onExited={noop}
                  onLeft={noop}
                />
              </Still>
            </Sample>
          ))}
          <Sample
            title="Flat · sheet column"
            note="No floating face; the surrounding sheet provides the ground."
          >
            <div className="control-face surface-raised ground-raised rounded-shell h-full overflow-clip">
              <Still>
                <DrawerAside
                  flat
                  current={makeLayer('band', 'short')}
                  leaving={null}
                  direction="down"
                  exiting={false}
                  onExited={noop}
                  onLeft={noop}
                />
              </Still>
            </div>
          </Sample>
          {CONTENTS.filter(({ value }) => value !== 'short').map(
            ({ value, label }) => (
              <Sample
                key={value}
                title={label}
                note={
                  value === 'overflow'
                    ? 'Use the live drawer to scroll this body.'
                    : undefined
                }
              >
                <Still>
                  <DrawerAside
                    current={makeLayer('plain', value)}
                    leaving={null}
                    direction="down"
                    exiting={false}
                    onExited={noop}
                    onLeft={noop}
                  />
                </Still>
              </Sample>
            ),
          )}
        </div>
      </section>

      <section aria-label="Drawer motion" className="grid gap-3">
        <h2 className="text-title font-semibold">Drawer motion</h2>
        <label className="text-body grid max-w-sm gap-2">
          Animation position · {Math.round(progress * 100)}%
          <input
            aria-label="Animation position"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(event) => setProgress(Number(event.target.value))}
          />
        </label>
        <p className="text-meta text-muted">
          Pinned on the real animations. Reduced motion follows your system
          preference; use the live drawer to replay full transitions.
        </p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {(['entering', 'open', 'exiting'] as const).map((state) => (
            <Sample
              key={state}
              title={`Overlay · ${state}`}
              note="Scrim and main panel slide together."
            >
              <Still progress={state === 'open' ? 1 : progress}>
                <div
                  className="drawer-overlay relative h-full p-2"
                  data-entering={state === 'entering' || undefined}
                  data-exiting={state === 'exiting' || undefined}
                >
                  <div
                    className="drawer-modal relative h-full"
                    data-entering={state === 'entering' || undefined}
                    data-exiting={state === 'exiting' || undefined}
                  >
                    <Dialog aria-label="Motion preview" className="h-full">
                      <DrawerPanels
                        title="Drawer title"
                        closeLabel="Close preview"
                        width="fixed"
                        aside={null}
                      >
                        <Body content="short" />
                      </DrawerPanels>
                    </Dialog>
                  </div>
                </div>
              </Still>
            </Sample>
          ))}
          {(
            [
              'enter',
              'exit',
              'flat-enter',
              'flat-exit',
              'swap-up',
              'swap-down',
              'leave-up',
              'leave-down',
            ] as const
          ).map((state) => (
            <Sample key={state} title={state}>
              <MotionDetail state={state} progress={progress} />
            </Sample>
          ))}
        </div>
        <div>
          <Button onPress={() => setReplay((value) => value + 1)}>
            Replay detail entrance
          </Button>
        </div>
        <div key={replay} className="h-96 max-w-xl">
          <DrawerAside
            current={makeLayer('plain', 'short')}
            leaving={null}
            direction="down"
            exiting={false}
            onExited={noop}
            onLeft={noop}
          />
        </div>
      </section>

      <section aria-label="Drawer close button" className="grid gap-3">
        <h2 className="text-title font-semibold">Close button</h2>
        <div className="flex flex-wrap gap-8">
          {(
            [
              { label: 'Rest' },
              { label: 'Hovered', state: 'hovered' },
              { label: 'Keyboard focus', state: 'focus-visible' },
              { label: 'Pressed', state: 'pressed' },
            ] satisfies { label: string; state?: PinnedState }[]
          ).map(({ label, state }) => (
            <figure key={label} className="grid justify-items-center gap-2">
              <figcaption className="text-meta text-muted">{label}</figcaption>
              <Pin state={state}>
                <AriaButton aria-label="Close drawer" className={CLOSE_BUTTON}>
                  <X
                    aria-hidden
                    size={18}
                    strokeWidth={2.2}
                    className="size-3.5 flex-none"
                  />
                </AriaButton>
              </Pin>
            </figure>
          ))}
        </div>
      </section>

      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title="Workbench drawer"
          closeLabel="Close drawer"
          width={width}
          onKeyDownCapture={(event) => {
            if (event.key === 'Escape' && detail && !exiting) {
              event.preventDefault();
              event.stopPropagation();
              closeDetail();
            }
          }}
          aside={
            liveDetail ? (
              <DrawerAside
                current={liveDetail}
                leaving={leaving}
                direction={direction}
                exiting={exiting}
                onLeft={() => setLeaving(null)}
                onExited={() => {
                  setDetail(null);
                  setLeaving(null);
                  setExiting(false);
                  itemButtons.current.get(chosenItem.current)?.focus();
                }}
                className={DRAWER_ASIDE_WIDTH}
              />
            ) : null
          }
        >
          <div className="flex flex-wrap gap-2 p-5">
            {[1, 2, 3].map((item) => (
              <Button
                key={item}
                ref={(node) => {
                  if (node) itemButtons.current.set(item, node);
                  else itemButtons.current.delete(item);
                }}
                aria-expanded={detail?.key === `item-${item}` && !exiting}
                onPress={() => choose(item)}
              >
                Item {item}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Body content={content} />
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}
