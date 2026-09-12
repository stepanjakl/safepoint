'use client';

import Link from 'next/link';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { BrandSquare } from '@/components/ui/brand';
import { GradientAvatar } from '@outpacelabs/avatars';
// Deep imports: Blode's barrel is the whole ~4000-icon library and is not on
// Next's `optimizePackageImports` list, so the subpath export is what keeps the
// sidebar from compiling the entire set.
import ChevronLeft from 'blode-icons-react/icons/chevron-left';
import ChevronRight from 'blode-icons-react/icons/chevron-right';
import CircleInfo from 'blode-icons-react/icons/circle-info';
import CodeTree from 'blode-icons-react/icons/code-tree';
import CodeTreeFilled from 'blode-icons-react/icons/code-tree-filled';
import DotGrid1x3HorizontalFilled from 'blode-icons-react/icons/dot-grid-1x3-horizontal-filled';
import DotGrid2x3Filled from 'blode-icons-react/icons/dot-grid-2x3-filled';
import MagnifyingGlass from 'blode-icons-react/icons/magnifying-glass';
import PlusMedium from 'blode-icons-react/icons/plus-medium';
import SortArrowUpDown from 'blode-icons-react/icons/sort-arrow-up-down';
import { motion, useReducedMotion } from 'motion/react';
import { cx } from '@/lib/cx';
import { Glyph } from '@/components/ui/glyph';
import { ICON_QUIET, ICON_SHAPE } from '@/components/ui/button';
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

/*
  The pitch of the list: a row plus the 2px gap to the next one. The single
  definition -- it drives both the translate maths here and, published to CSS as
  --row-pitch on the list, the height of `.process-menu-row` and of the drop
  slot, so the two cannot drift apart.
*/
const ROW_HEIGHT = 42;

// How close to the edge of the scrolling list a drag has to get before the list
// starts following it, and how fast it then travels per frame.
const AUTOSCROLL_EDGE = 32;
const AUTOSCROLL_STEP = 12;

const MENU_TITLE = 'text-menu-link text-dense font-semibold';
const MENU_CHEVRON = 'size-5 flex-none';
/*
  A chevron needs a wrapper of its own only so the alignment guide has something
  to draw on: an <svg> renders no pseudo-elements, so `rail-mark` on the glyph
  itself would show nothing. The box is the glyph's own size, so it changes no
  layout when the guides are off.
*/
const MENU_CHEVRON_BOX = 'rail-mark inline-grid flex-none place-items-center';

/*
  Three shapes repeat across the menu often enough to be named once. They are
  string constants rather than components because each is applied to a
  different element -- a button, a link, a span, an anchor from next/link --
  and wrapping those would cost more than it saves.
*/

// Quiet square icon button: the shared shape and face, at the sidebar's size.
// Inside a section heading it also answers to the heading's hover, which is
// why that tint is a named group variant -- an icon button elsewhere in the
// sidebar must not pick it up.
const ICON_BUTTON_SHAPE = `${ICON_SHAPE} rail-mark size-7.5`;
const ICON_BUTTON_QUIET = `${ICON_QUIET} group-hover/heading:bg-menu-wash-faint group-hover/heading:text-primary group-focus-within/heading:bg-menu-wash-faint group-focus-within/heading:text-primary`;
const ICON_BUTTON = `${ICON_BUTTON_SHAPE} ${ICON_BUTTON_QUIET}`;

/*
  The platform is fixed for the life of the document, so this store has nothing
  to publish and its subscribe is a no-op that never fires. It exists only to
  give useSyncExternalStore a server snapshot and a client one.
*/
const subscribeNothing = () => () => {};
const serverModifierKey = () => '⌘';
const readModifierKey = () =>
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
      navigator.platform ??
      '',
  )
    ? '⌘'
    : 'Ctrl';

/*
  Every state in which the field paints its own face, which is every state in
  which the key would otherwise vanish into it: the resting keycap face and the
  lit field face are the same value, so the key has to step whenever the field
  does -- not only under the pointer. Focus is the case that exposed it.

  Three variants carrying one value, so nothing depends on the order Tailwind
  emits them in. The utility keeps the house -hover suffix, which already means
  the engaged step rather than the pointer literally (control-quiet-hover is
  spent on data-[pressed] too).
*/
const SEARCH_KEYCAP_LIT =
  'group-hover:surface-keycap-hover group-focus-within:surface-keycap-hover group-has-[input:not(:placeholder-shown)]:surface-keycap-hover';

/*
  The keycap face, shared by the search field's shortcut and every row's status
  badge so the two read as one kind of object and cannot drift apart: the face,
  the pill, the height and the utility type. Only what each lights with, and how
  wide each is, differs.

  A pill rather than a badge-step corner, and the mono family, because both
  hold something the reader matches rather than reads as prose -- a shortcut
  to press, a count to compare. The search key dims with its field, because
  the label's disabled rule covers everything inside it.
*/
const KEYCAP_FACE =
  'control-face surface-keycap rounded-full text-micro font-mono inline-flex h-5 flex-none items-center justify-center [font-weight:var(--sp-mono-weight-strong)] select-none';

const SEARCH_KEYCAP = `${KEYCAP_FACE} ${SEARCH_KEYCAP_LIT} group-focus-within:opacity-0 rail-mark min-w-menu-rail px-1.75 tracking-widest`;

/*
  A row's badge steps with its row for the same reason the search key steps with
  its field: the current row's face and the keycap's resting face are the same
  value, and the hover wash is close to it, so a key that only answered its own
  pointer would vanish into the row exactly when the row lit.
*/
const ROW_BADGE_LIT =
  'group-hover/row:surface-keycap-hover group-focus-within/row:surface-keycap-hover group-data-[current]/row:surface-keycap-hover';

/*
  One fixed box for every badge -- a rail cell wide, the keycap's height -- so a
  two-digit count does not widen its row's badge past its neighbours', and the
  cell stays centred on the trailing axis. The tone colours the glyph and count.
*/
const ROW_BADGE = cx(
  KEYCAP_FACE,
  ROW_BADGE_LIT,
  'process-menu-row-end rail-mark w-menu-rail relative z-1 cursor-help gap-1 px-0 tabular-nums',
  'text-muted data-[tone=blocked]:text-state-blocked data-[tone=caution]:text-state-caution data-[tone=verified]:text-state-verified',
);

/*
  A process name, in the row or in the rename field. Truncates rather than
  wraps: the row is a fixed height, and OverflowTooltip supplies the full name.

  The left pad is carried here rather than on the link, because the link is
  swapped for a plain span the moment the reorder mode opens. With the pad on
  only one of them the name jumped sideways at exactly the point the handles
  finished sliding in.
*/
const MENU_LABEL =
  'text-menu-link group-hover/row:text-primary group-focus-within/row:text-primary control-wash group-data-[current]/row:text-primary block min-w-0 truncate rounded-control py-2.75 pr-0 pl-2.5 text-dense font-semibold no-underline select-none';

/*
  The reorder handle and its non-interactive preview share one box, so the label
  sits in exactly the same place whether the handles are being previewed or
  used, and switching between the two modes moves nothing.

  Only the three colour states live here. The travel -- growing out of the row
  and collapsing back into it -- belongs to the motion wrapper around them,
  because an element that is entering or leaving the DOM cannot animate with a
  class: there is no frame on which the old value was ever applied.
*/
const GRIP_BOX =
  'control-wash rounded-section grid h-8 w-6 flex-none place-items-center border-menu-edge border-transparent';

/*
  Two weights. The preview -- what the Arrange button shows on hover -- is the
  lighter: it is an advertisement, not a target. In the mode itself the handle
  is solid, and pointing at it only lifts the colour.
*/
const GRIP_PREVIEW = `${GRIP_BOX} text-muted pointer-events-none opacity-55`;
/*
  Pointing at a handle changes only its colour -- the cursor already says it can
  be picked up, and an edge around six dots is more furniture than the gesture
  needs. The edge is kept for the drag itself, where it marks which row left the
  list. Keyboard focus is left to the global :focus-visible outline rather than
  restyled, so it stays the same indicator as everywhere else.
*/
const GRIP_HANDLE = `${GRIP_BOX} text-muted hover:text-primary focus-visible:text-primary group-data-[dragging]/row:text-primary group-data-[dragging]/row:cursor-grabbing cursor-grab touch-none`;

/*
  One rail cell, the same leading column the brand mark, a row's icon, the
  notice and the avatar all sit in -- in arrange mode the handle is the row's
  leading icon, so it belongs on that axis rather than in a box of its own
  size. Named here because motion animates the width from JS and cannot read
  --spacing-menu-rail; this is the same JS-to-CSS duplication ROW_HEIGHT makes,
  in the same direction, and the checker is what keeps the two honest.

  GRIP_GAP is the row's own gap, cancelled while the cell has no width at all
  so a row with no handle is no wider than it used to be.
*/
const RAIL_CELL = 34;
const GRIP_WIDTH = RAIL_CELL;
const GRIP_GAP = 4;

/*
  The leading cell of every band. Its icon centres inside it, so the brand mark,
  a menu item's icon, the notice icon and the avatar all land on the rail's
  midpoint no matter how wide each of them actually is -- centring is done by
  the box, not by arithmetic on each glyph.
*/
const MENU_RAIL = 'rail-mark w-menu-rail grid flex-none place-items-center';

/*
  The tile behind the workspace menu's Processes icon, and the two glyphs it
  cross-fades between. At rest the tile is a raised face around the outline;
  while the item is hovered or focused the face fades to bare and the filled
  glyph fades in over the outline.

  Each timing belongs to the element it moves. control-face transitions the
  tile's stops, so the tile carries no transition utility of its own -- one
  here would replace control-face's property list and leave the face to snap.
  The glyphs are plain elements and take control-wash, the same step and curve.

  Both glyphs share one grid cell, so the swap moves nothing. An even box, so
  it centres on the rail's integer axis.
*/
const MENU_TILE =
  'control-face surface-menu-tile group-hover/enter:surface-menu-tile-hover group-focus-visible/enter:surface-menu-tile-hover rounded-control grid size-7 flex-none place-items-center';
const MENU_TILE_GLYPH =
  'control-wash text-menu-tile-glyph col-start-1 row-start-1 size-4.5 flex-none';
const MENU_TILE_GLYPH_AT_REST =
  'group-hover/enter:opacity-0 group-focus-visible/enter:opacity-0';
const MENU_TILE_GLYPH_ENGAGED =
  'opacity-0 group-hover/enter:opacity-100 group-focus-visible/enter:opacity-100';

/*
  The title row that leads with a chevron. Symmetric padding and no edge of its
  own, so its chevron sits the same distance from the left as the workspace
  item's chevron sits from the right -- the two are the same control turned
  around, and a reader moving between the panes should not see the arrow shift.

  The edge matters: while this carried a 1.5px transparent border and the
  workspace item did not, the two chevrons were 1.5px out of step.
*/
const MENU_BACK_BOX = 'rounded-control h-10 px-1.75';

type Drag = {
  id: string;
  startY: number;
  startScrollTop: number;
  index: number;
  original: string[];
  offset: number;
};

function Grip() {
  return <DotGrid2x3Filled aria-hidden size={20} />;
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

  /*
    The reorder handles' travel, on the same duration and curve as the pane
    slide so the two modes of the menu move alike. Reduced motion collapses the
    duration to nothing rather than removing the animation, which keeps the same
    code path and still ends on the same layout.
  */
  const reduceMotion = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;
  const collapse = { duration: reduceMotion ? 0 : 0.22, ease };
  // The handles are out while the mode is on, and previewed while the button
  // that turns it on is under the pointer.
  const showGrip = customising || previewHandles;

  const [level, setLevel] = useState<'workspace' | 'processes'>('processes');
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  // One stable ref object per row, which the row's status tooltip positions
  // against. State rather than a ref so render can read the map; the objects
  // inside it are mutated by the rows' ref callbacks, never replaced.
  const [rowAnchors] = useState(
    () => new Map<string, { current: HTMLLIElement | null }>(),
  );
  const rowAnchor = (id: string) => {
    let anchor = rowAnchors.get(id);
    if (!anchor) {
      anchor = { current: null };
      rowAnchors.set(id, anchor);
    }
    return anchor;
  };
  const focusHandle = useRef<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const focusLevel = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearch = useRef(false);
  /*
    ⌘ on Apple platforms, Ctrl everywhere else. Read through the store rather
    than set from an effect: the platform cannot change while the document is
    open, so there is nothing to subscribe to, and this is the one shape that
    lets the server and the client render different values without either a
    hydration mismatch or a second render.
  */
  const modifier = useSyncExternalStore(
    subscribeNothing,
    readModifierKey,
    serverModifierKey,
  );
  // The scrolling list, and the two values a drag has to keep reading off it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerY = useRef(0);
  const autoScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!focusLevel.current) return;
    (level === 'workspace' ? enterRef : backRef).current?.focus({
      preventScroll: true,
    });
    focusLevel.current = false;
  }, [level]);
  // The field lives in the processes level, which is inert while the workspace
  // level is showing, so a jump from there has to land after the swap.
  useLayoutEffect(() => {
    if (!focusSearch.current) return;
    searchRef.current?.focus({ preventScroll: true });
    focusSearch.current = false;
  }, [level]);
  useEffect(() => {
    function jumpToSearch(event: KeyboardEvent) {
      if (event.key !== 'k' && event.key !== 'K') return;
      if (event.altKey || !(event.metaKey || event.ctrlKey)) return;
      // Arranging disables the field. Leave the key to the browser rather than
      // swallowing it to do nothing.
      if (customising) return;
      event.preventDefault();
      if (level === 'processes') {
        searchRef.current?.focus({ preventScroll: true });
        return;
      }
      focusSearch.current = true;
      setLevel('processes');
    }
    document.addEventListener('keydown', jumpToSearch);
    return () => document.removeEventListener('keydown', jumpToSearch);
  }, [level, customising]);
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

  /*
    Recomputes the drag from wherever the pointer currently is. Called both from
    the pointer handler and from the auto-scroll frame, because scrolling the
    list moves the rows under a pointer that has not itself moved.

    The travel is measured against the list's scroll position as well as the
    pointer, so a drag that scrolls the list still lands on the row the pointer
    is actually over. It reads `original.length` rather than `order` so the
    auto-scroll closure cannot go stale between frames.
  */
  function applyDrag() {
    const active = dragRef.current;
    if (!active) return;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const travel =
      pointerY.current - active.startY + (scrollTop - active.startScrollTop);
    const offset = Math.max(
      -active.index * ROW_HEIGHT,
      Math.min(
        (active.original.length - active.index - 1) * ROW_HEIGHT,
        travel,
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

  /*
    Now that the list scrolls, a drag has to be able to reach rows that are off
    screen. While the pointer is held within AUTOSCROLL_EDGE of either end of
    the list, the list follows it a step at a time -- and only while it actually
    moves, so the loop stops doing work once it hits either end.
  */
  function autoScrollFrame() {
    const box = scrollRef.current;
    const active = dragRef.current;
    if (!box || !active) {
      autoScroll.current = null;
      return;
    }
    const bounds = box.getBoundingClientRect();
    const step =
      pointerY.current < bounds.top + AUTOSCROLL_EDGE
        ? -AUTOSCROLL_STEP
        : pointerY.current > bounds.bottom - AUTOSCROLL_EDGE
          ? AUTOSCROLL_STEP
          : 0;
    if (step !== 0) {
      const before = box.scrollTop;
      box.scrollTop = before + step;
      if (box.scrollTop !== before) applyDrag();
    }
    autoScroll.current = requestAnimationFrame(autoScrollFrame);
  }

  function stopAutoScroll() {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }

  // A drag can outlive the component if the menu unmounts mid-gesture.
  useEffect(() => stopAutoScroll, []);

  function finishDrag(cancel: boolean) {
    const active = dragRef.current;
    stopAutoScroll();
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
    pointerY.current = event.clientY;
    const active = {
      id,
      startY: event.clientY,
      startScrollTop: scrollRef.current?.scrollTop ?? 0,
      index: order.indexOf(id),
      original: [...order],
      offset: 0,
    };
    dragRef.current = active;
    setDrag(active);
    event.currentTarget.setPointerCapture(event.pointerId);
    stopAutoScroll();
    autoScroll.current = requestAnimationFrame(autoScrollFrame);
  }

  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    pointerY.current = event.clientY;
    applyDrag();
  }

  function finishCustomising() {
    if (dragRef.current) finishDrag(true);
    saveProcessOrder(order);
    setDraft(null);
    editRef.current?.focus();
  }

  return (
    <aside
      className="max-shell:px-2 max-shell:py-2.5 shell:px-menu-fade shell:h-full shell:min-h-0 shell:overflow-hidden relative flex min-w-0 flex-col"
      aria-label="Workspace navigation"
    >
      {/* Alignment guides; the design pane's Debug folder switches them on. */}
      <div className="rail-axis" aria-hidden="true" />
      {/*
        Two fixed bands above the list: the brand row, and the search field with
        its rule. The field is its own child rather than part of the header, so
        what it belongs to is what it is next to -- it opens and closes against
        the list it filters, and takes its rule with it.

        Every icon in the sidebar centres on the same axis, the midpoint of
        --spacing-menu-rail: each sits in a cell of that width, so the centring
        is done by the box rather than by arithmetic on each glyph.
      */}
      <div
        // Both ends sit on a rail axis. The trailing one gets a rail cell and
        // so needs nothing from this row; the leading one cannot have a cell of
        // its own, because the lockup glues the mark to its wordmark, so it
        // carries the offset instead -- and that offset is -1px, not a positive
        // inset: (rail - mark) / 2 where the mark is 36px and the rail 34, so
        // it overhangs the content edge rather than clearing it.
        className="flex flex-none items-center justify-between gap-2 pt-1 pr-0 pb-4 pl-0"
      >
        <BrandSquare markClassName="rail-mark -ml-px" />
        <div
          className="ease-out-emphasized flex flex-none items-center gap-0.75 transition-[translate,opacity] duration-(--duration-pane) data-[level=workspace]:pointer-events-none data-[level=workspace]:translate-x-4 data-[level=workspace]:opacity-0"
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
          <span className={MENU_RAIL}>
            <Tooltip label={customising ? 'Save order' : 'Arrange processes'}>
              <button
                ref={editRef}
                type="button"
                className={cx(
                  ICON_BUTTON_SHAPE,
                  // The one accented control in the sidebar, and only while
                  // arranging: it is the way back out of the mode. It takes its
                  // own face instead of the quiet hover, not as well as it --
                  // the two would fight over the same background.
                  // No transition utility on this branch: control-face owns
                  // the timing, and a `transition-colors` alongside it would
                  // win the property list and leave the face and ring to snap.
                  customising
                    ? 'control-face control-commit hover:control-commit-hover text-white'
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
                {/*
                  One glyph in both states. The button is a toggle and says so
                  through aria-pressed and its own label; swapping in a tick
                  would only repeat the brand mark two elements to the left.
                */}
                <MenuIcon name="arrange" />
              </button>
            </Tooltip>
          </span>
        </div>
      </div>
      {/*
        The two levels, and the only thing that moves between them. Each column
        is a full-height flex column of its own rather than a cell in an
        auto-height row: it stacks its own fixed chrome from the top and gives
        the rest to a list that scrolls on its own, so neither column's height
        is the other's problem.

        This is why the field needs no animation of its own. It sits inside the
        processes column, so it leaves on the pane's transform -- the same
        movement, at the same moment, and nothing about its own box changes.
      */}
      {/* The side fades live here rather than on the aside: only the panes
          travel, and the brand row above must not sit under a gradient. */}
      <nav
        className="process-menu-fade shell:-mx-menu-fade shell:min-h-0 shell:flex-1 relative min-w-0"
        aria-label={level === 'processes' ? 'Processes' : 'Workspace'}
        data-level={level}
      >
        <div className="shell:h-full overflow-clip">
          <div
            className="ease-out-emphasized shell:h-full grid w-[200%] translate-x-0 grid-cols-2 items-start transition-transform duration-(--duration-pane) data-[level=processes]:-translate-x-1/2"
            data-level={level}
          >
            <div
              className="ease-out-emphasized max-shell:px-1 shell:px-menu-fade shell:h-full shell:min-h-0 flex min-w-0 flex-col py-1 opacity-100 transition-opacity duration-(--duration-pane) aria-hidden:opacity-0"
              inert={level !== 'workspace'}
              aria-hidden={level !== 'workspace'}
            >
              <button
                ref={enterRef}
                className={cx(
                  MENU_TITLE,
                  // No transparent edge here, unlike a process row: the rail
                  // has to start at the band's own left edge for its midpoint
                  // to be the same axis every other band centres on.
                  'group/enter rounded-control hover:bg-menu-wash hover:text-primary focus-visible:text-primary control-wash mt-2 flex h-10 w-full items-center gap-1.5 pr-1.75 text-left',
                )}
                type="button"
                onClick={() => navigate('processes')}
              >
                <span className={MENU_RAIL}>
                  <span className={MENU_TILE}>
                    <MenuIcon
                      name="processes"
                      className={cx(MENU_TILE_GLYPH, MENU_TILE_GLYPH_AT_REST)}
                    />
                    <MenuIcon
                      name="processesFilled"
                      className={cx(MENU_TILE_GLYPH, MENU_TILE_GLYPH_ENGAGED)}
                    />
                  </span>
                </span>
                <span>Processes</span>
                <span className="bg-menu-chip text-muted text-micro rounded-control ml-auto inline-grid h-5.5 min-w-5.5 place-items-center px-1.25 tabular-nums">
                  {items.length}
                </span>
                <span className={MENU_CHEVRON_BOX}>
                  <MenuIcon
                    name="right"
                    className={MENU_CHEVRON}
                    strokeWidth={2}
                  />
                </span>
              </button>
            </div>
            <div
              className="ease-out-emphasized max-shell:px-1 shell:px-menu-fade shell:h-full shell:min-h-0 flex min-w-0 flex-col py-1 opacity-100 transition-opacity duration-(--duration-pane) aria-hidden:opacity-0"
              inert={level !== 'processes'}
              aria-hidden={level !== 'processes'}
            >
              {/* Fixed chrome of this level: the field, its rule, and the
                  title. Only the list under them scrolls. */}
              <label className="menu-search-field group flex h-9 items-center gap-2 pl-1.75">
                {/*
                    An even-width box, though the glyph in it is 17px. A box of
                    odd width centres on a half pixel wherever it is placed, so
                    it can never sit on an integer axis -- which is the whole
                    reason the rail cells elsewhere carry a width of their own
                    rather than shrink-wrapping their glyph.
                  */}
                <span className="rail-mark inline-grid w-4.5 flex-none place-items-center">
                  <MenuIcon
                    name="search"
                    className="control-wash size-4.25 flex-none"
                    strokeWidth={2}
                  />
                </span>
                <span className="sr-only">Search processes</span>
                <input
                  ref={searchRef}
                  type="search"
                  className="text-primary text-meta min-h-menu-rail w-full min-w-0 border-none bg-transparent font-medium outline-none"
                  placeholder={
                    customising
                      ? 'Finish arranging to search'
                      : 'Search processes…'
                  }
                  value={query}
                  disabled={customising}
                  /* The shortcut belongs on the control it reaches, not in its
                     name: the keycap below is the sighted half of this. */
                  aria-keyshortcuts="Meta+K Control+K"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <kbd className={SEARCH_KEYCAP} aria-hidden="true">
                  {modifier}K
                </kbd>
              </label>
              <div
                className="border-rule-faint mt-3.5 border-t"
                aria-hidden="true"
              />
              <button
                ref={backRef}
                type="button"
                className={cx(
                  MENU_TITLE,
                  MENU_BACK_BOX,
                  'hover:bg-menu-wash-strong hover:text-primary focus-visible:text-primary control-wash mt-2 flex w-full items-center',
                )}
                aria-label="Back to workspace menu"
                onClick={() => navigate('workspace')}
              >
                <span className={MENU_CHEVRON_BOX}>
                  <MenuIcon
                    name="left"
                    className={MENU_CHEVRON}
                    strokeWidth={2}
                  />
                </span>
                <span className="flex-1 text-center">Processes</span>
                {/* Balances the chevron so the title centres on the row. */}
                <span className={MENU_CHEVRON} aria-hidden="true" />
              </button>
              {customising ? (
                <span id="process-reorder-instructions" className="sr-only">
                  Use Up and Down arrow keys, Home or End to reorder.
                </span>
              ) : null}
              {/*
                The one scrolling element in the menu, and the fades at its two
                ends. It keeps the pane's own content width rather than reaching
                out to the aside's edge: at the edge its scrollbar landed under
                the right-hand gradient, and a gradient that is meant to soften
                a boundary should not be painting over a control.

                Its padding is the fades' own height, so at rest the first and
                last rows sit clear of them and only rows actually travelling
                past the ends are dimmed. Without it the top fade sits on the
                first row permanently, which reads as the row being greyed out
                rather than as the list continuing.
              */}
              <div className="process-list-fade shell:min-h-0 shell:flex-1 relative flex flex-col">
                <div
                  ref={scrollRef}
                  className="shell:min-h-0 shell:flex-1 shell:overflow-y-auto shell:overscroll-contain shell:py-menu-fade"
                >
                  <ol
                    className="relative"
                    aria-label={
                      customising
                        ? 'Customise process order'
                        : 'Available processes'
                    }
                    // --row-pitch publishes the constant the translate maths above
                    // uses, so `.process-menu-row` and the drop slot derive their
                    // height from it rather than restating it in CSS.
                    style={
                      {
                        height: visibleOrder.length * ROW_HEIGHT,
                        '--row-pitch': `${ROW_HEIGHT}px`,
                      } as CSSProperties
                    }
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
                          ref={(element) => {
                            rowAnchor(id).current = element;
                          }}
                          className="process-menu-row group/row"
                          data-current={current === item.href || undefined}
                          data-editing={customising || undefined}
                          data-dragging={dragging || undefined}
                          style={{ transform: `translateY(${position}px)` }}
                        >
                          {/*
                        One wrapper for both, and it never unmounts: the handle
                        and its preview are different elements, so letting each
                        mount and unmount on its own gives React nothing to
                        animate between and the label snaps sideways. The
                        wrapper animates the width instead, and swaps what is
                        inside it while it is open.
                      */}
                          <motion.div
                            className="process-menu-row-start rail-mark grid flex-none place-items-center overflow-hidden"
                            initial={false}
                            animate={{
                              width: showGrip ? GRIP_WIDTH : 0,
                              marginRight: showGrip ? 0 : -GRIP_GAP,
                              opacity: showGrip ? 1 : 0,
                            }}
                            transition={collapse}
                          >
                            {customising ? (
                              <button
                                ref={(element) => {
                                  if (element) handles.current.set(id, element);
                                  else handles.current.delete(id);
                                }}
                                type="button"
                                className={GRIP_HANDLE}
                                aria-label={`Reorder ${item.name}`}
                                aria-describedby="process-reorder-instructions"
                                onPointerDown={(event) => startDrag(event, id)}
                                onPointerMove={dragMove}
                                onPointerUp={() => finishDrag(false)}
                                onPointerCancel={() => finishDrag(true)}
                                onLostPointerCapture={() => finishDrag(true)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === 'Escape' &&
                                    dragRef.current
                                  ) {
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
                            ) : (
                              <span className={GRIP_PREVIEW} aria-hidden="true">
                                <Grip />
                              </span>
                            )}
                          </motion.div>
                          {customising ? (
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
                          ) : (
                            <OverflowTooltip label={item.name}>
                              <Link
                                className={cx(MENU_LABEL, 'process-menu-link')}
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
                            // Placed against the row, not the badge: the
                            // default gap is then measured from the row's
                            // edge, with no inset arithmetic to go stale.
                            triggerRef={rowAnchor(id)}
                            content={
                              <ProcessStatusContent status={item.status} />
                            }
                          >
                            <span
                              tabIndex={0}
                              role="img"
                              aria-label={`${item.name}: ${item.status.label}, ${item.status.totalLabel}`}
                              className={ROW_BADGE}
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
                    <p className="text-muted text-meta px-2.5 py-3">
                      No matching processes.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div className="max-shell:gap-2.5 max-shell:pt-3 mt-auto grid flex-none gap-3.5 pt-2">
        <SidebarNotice />
        {/*
          Both ends are rail cells now, so the row states no offsets of its own:
          the avatar fills the leading cell and the settings button centres in
          the trailing one. The 2px that used to sit in `pr-0.5` was (rail -
          button) / 2 worked out by hand; the cell does that arithmetic itself.
        */}
        <div className="border-rule-faint max-shell:pt-2.5 flex items-center justify-between gap-1.5 border-t pt-3.5 pr-0 pl-0">
          <span
            role="img"
            aria-label="Maya’s demo avatar"
            className={cx(MENU_RAIL, 'relative rounded-full')}
          >
            <GradientAvatar
              seed="safepoint-maya"
              size={RAIL_CELL}
              colors={AVATAR_COLORS}
            />
          </span>
          <p className="text-primary text-dense mr-auto font-semibold">Maya</p>
          <span className={MENU_RAIL}>
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
          </span>
        </div>
      </div>
    </aside>
  );
}

/*
  The sidebar's standing advisory, and the block whose whole definition is
  worth reading at once. Its classes are grouped by what each group decides --
  the face it borrows, the box it draws, the type it sets -- rather than left
  in the order a sorter happened to leave them. Each group is a complete string
  literal, so Tailwind's plain-text scanner still reads every class in it, and
  the name is a definition the editor can jump to from the call site.

  Two properties that used to be stated here are gone, because in both cases
  something else already owned them and won.

  `border` was never doing anything: `control-face` declares the whole
  shorthand, and Tailwind emits it after the plain `border` utility, so the
  width, style and colour were always control-face's.

  Neither is there a forced-colors border. The fallback at the foot of
  globals.css sits outside every cascade layer, and unlayered normal
  declarations outrank layered ones whatever their specificity, so
  `.control-face { border-color: currentColor }` beat the variant utility that
  was written here. The edge is globals.css's to set.
*/
const NOTICE_BOX = cx(
  // The face: control-face's geometry, the notice's own stops, its sheen.
  'control-face surface-notice shadow-control-highlight-medium-hairline bg-notice-face',
  // The box: the rail column and the text column, tighter below the shell
  // breakpoint. `max-shell:py-2.25` is the only responsive rule in the block.
  'rounded-shell grid grid-cols-[auto_1fr] items-center gap-x-1.5 py-3 pr-3 pl-0 max-shell:py-2.25',
  // The type. `leading-normal` is the box's own; both text children re-assert
  // `text-micro` and so carry micro's tighter 14px line instead.
  'text-state-advisory text-micro leading-normal',
);

// Icon shares row one with the title; the caption sits under it.
function SidebarNotice() {
  return (
    <div className={NOTICE_BOX}>
      <span className={cx(MENU_RAIL, 'process-menu-notice-rail')}>
        <MenuIcon name="info" />
      </span>
      <p className="text-micro font-semibold">Demo application</p>
      <span className="text-notice-caption text-micro col-start-2 mt-0.75 font-medium">
        Fictional data. No live changes.
      </span>
    </div>
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
      <div className="text-muted text-micro mt-0.5 flex justify-between gap-2.5">
        <span>Latest available run</span>
        <span>{status.totalLabel}</span>
      </div>
      <span
        className={cx(
          TONE_CHIP[status.tone],
          'text-micro justify-self-start rounded-full px-2 py-0.75 font-semibold',
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
              'rounded-section flex items-center justify-between gap-2 px-2 py-1.5',
            )}
          >
            <dt className="text-micro">{label}</dt>
            <dd className="text-meta [font-weight:650] tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-rule-faint flex items-start gap-2 border-t pt-2.25">
        <span className="bg-state-advisory/10 text-state-advisory text-micro rounded-section px-1.25 py-0.5 font-semibold">
          {status.modeLabel}
        </span>
        <p className="text-muted text-micro">{status.modeDescription}</p>
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
type MenuIconName = keyof typeof MENU_ICONS;

/*
  Every glyph in the menu comes from Blode, the same library the system and
  destination icons already use. Nothing here is drawn by hand: a one-off path
  drifts from the set's optical weight the moment the set is updated, and the
  menu sits directly beside those system icons.
*/
const MENU_ICONS = {
  plus: PlusMedium,
  arrange: SortArrowUpDown,
  search: MagnifyingGlass,
  processes: CodeTree,
  processesFilled: CodeTreeFilled,
  left: ChevronLeft,
  right: ChevronRight,
  more: DotGrid1x3HorizontalFilled,
  info: CircleInfo,
} as const;

function MenuIcon({
  name,
  className,
  strokeWidth = 1.8,
}: {
  className?: string;
  name: MenuIconName;
  strokeWidth?: number;
}) {
  const Icon = MENU_ICONS[name];
  return (
    <Icon
      aria-hidden
      className={className}
      size={18}
      strokeWidth={strokeWidth}
    />
  );
}
