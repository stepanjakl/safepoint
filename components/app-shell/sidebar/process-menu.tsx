'use client';

import { usePathname } from 'next/navigation';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Brand } from '@/components/ui/brand';
import { useShellPageNavigation } from '@/components/app-shell/shell-page-transition';
import { useReducedMotion } from 'motion/react';
import { cx } from '@/lib/cx';
import {
  DURATION_PANE,
  DURATION_STATE,
  EASE_OUT_EMPHASIZED,
} from '@/lib/motion';
import { Tooltip } from '@/components/ui/tooltip';
import {
  restoreProcessOrder,
  type ProcessNavigationItem,
} from '@/lib/process/navigation';
import {
  readProcessOrder,
  saveProcessOrder,
  subscribeProcessOrder,
} from './process-order-store';
import { useProcessNames } from '@/components/app-shell/process/process-names-store';
import {
  ICON_BUTTON,
  MENU_CHEVRON,
  MENU_CHEVRON_BOX,
  MENU_RAIL,
  MENU_RULE,
  MenuIcon,
} from './menu-parts';
import { ProcessList } from './process-list';
import { ProcessSearch } from './process-search';
import { SidebarAccount } from './sidebar-account';
import { SidebarNotice } from './sidebar-notice';
import { useProcessReorder } from './use-process-reorder';
import { WorkspaceMenu } from './workspace-menu';

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
  The title row that leads with a chevron. Symmetric padding and no edge of its
  own, so its chevron sits the same distance from the left as the workspace
  item's chevron sits from the right -- the two are the same control turned
  around, and a reader moving between the panes should not see the arrow shift.

  The edge matters: while this carried a 1.5px transparent border and the
  workspace item did not, the two chevrons were 1.5px out of step.
*/
const MENU_BACK_BOX = 'rounded-control h-10 px-1.75';

/*
  The sidebar: the brand row and its two toggles, the two levels it travels
  between, and the notice and account at its foot. Each part is its own
  component beside this one; what is here is the state they share -- which
  level is showing, the search query, and the draft order while arranging.
*/
export function ProcessMenu({
  items: scenarioItems,
  initialOrder,
}: {
  items: ProcessNavigationItem[];
  /** The order the server read from the cookie, for SSR and hydration. */
  initialOrder: string | null;
}) {
  // Each row under the name it was last given in this browser.
  const names = useProcessNames();
  const items = scenarioItems.map((item) => ({
    ...item,
    name: names[item.id] ?? item.name,
  }));
  // The shell is a layout that stays mounted across navigation, so the current
  // process is read here rather than handed down by each page.
  const current = usePathname();
  const {
    leaveTo,
    workspaceReveal,
    workspaceAttentionReady,
    finishWorkspaceFade,
  } = useShellPageNavigation();
  const saved = useSyncExternalStore(
    subscribeProcessOrder,
    readProcessOrder,
    () => initialOrder,
  );
  const savedOrder = restoreProcessOrder(
    items.map((item) => item.id),
    saved,
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const order = draft ?? savedOrder;
  const customising = draft !== null;
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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
  const collapse = {
    duration: reduceMotion ? 0 : DURATION_PANE,
    ease: EASE_OUT_EMPHASIZED,
  };
  // The handles are out while the mode is on, and previewed while the button
  // that turns it on is under the pointer.
  const showGrip = customising || previewHandles;
  /*
    The handles' fade runs in sequence with the travel rather than alongside
    it. Coming out, the label moves aside first and the handles fade into the
    space it left; going back, they fade out first and only then does the label
    close the gap. Together, the handles were half drawn while still sliding
    under a label on its way.
  */
  const fade = {
    duration: reduceMotion ? 0 : DURATION_STATE,
    ease: 'easeOut',
  } as const;
  const gripTransition = showGrip
    ? { default: collapse, opacity: { ...fade, delay: collapse.duration } }
    : { default: { ...collapse, delay: fade.duration }, opacity: fade };
  /*
    The search band in the same order, with one difference going in: the field
    and its rule fade in from halfway through the band's travel rather than
    after it. ⌘K puts the caret in the field at once, and a caret blinking in a
    blank band for the whole travel read as the shortcut having missed. The
    two fade as one -- a rule arriving after its field read as a lag.
  */
  const searchTransition = searchOpen
    ? { default: collapse, opacity: { ...fade, delay: collapse.duration / 2 } }
    : { default: { ...collapse, delay: fade.duration }, opacity: fade };

  const [levelChoice, setLevelChoice] = useState<{
    path: string;
    level: 'workspace' | 'processes';
  }>(() => ({
    path: current,
    level: current === '/workspace' ? 'workspace' : 'processes',
  }));
  if (levelChoice.path !== current) {
    setLevelChoice({
      path: current,
      level: current === '/workspace' ? 'workspace' : 'processes',
    });
  }
  const level =
    levelChoice.path === current
      ? levelChoice.level
      : current === '/workspace'
        ? 'workspace'
        : 'processes';
  const setLevel = (next: typeof level) =>
    setLevelChoice({ path: current, level: next });
  // Whether either level has been travelled to yet. The side fades animate on
  // a journey, and the first level is where the menu starts, not a journey.
  const [travelled, setTravelled] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const focusLevel = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
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
  useLayoutEffect(() => {
    if (!focusLevel.current) return;
    (level === 'workspace' ? enterRef : backRef).current?.focus({
      preventScroll: true,
    });
    focusLevel.current = false;
  }, [level]);
  // The field is inert while its band is closed, and its level is inert while
  // the workspace level is showing, so a jump has to land after both lift.
  useLayoutEffect(() => {
    if (!focusSearch.current) return;
    searchRef.current?.focus({ preventScroll: true });
    focusSearch.current = false;
  }, [level, searchOpen]);
  useEffect(() => {
    function jumpToSearch(event: KeyboardEvent) {
      if (
        (workspaceReveal === 'waiting' || workspaceReveal === 'opening') &&
        enterRef.current?.closest('.sidebar-navigation')?.hasAttribute('inert')
      )
        return;
      if (event.key !== 'k' && event.key !== 'K') return;
      if (event.altKey || !(event.metaKey || event.ctrlKey)) return;
      // Arranging keeps the field closed. Leave the key to the browser rather
      // than swallowing it to do nothing.
      if (customising) return;
      event.preventDefault();
      if (level === 'processes' && searchOpen) {
        searchRef.current?.focus({ preventScroll: true });
        return;
      }
      focusSearch.current = true;
      if (level !== 'processes') {
        setTravelled(true);
        setLevelChoice({ path: current, level: 'processes' });
      }
      setSearchOpen(true);
    }
    document.addEventListener('keydown', jumpToSearch);
    return () => document.removeEventListener('keydown', jumpToSearch);
  }, [current, level, customising, searchOpen, workspaceReveal]);
  const reorder = useProcessReorder({ order, customising, draft, setDraft });

  function openSearch() {
    focusSearch.current = true;
    setSearchOpen(true);
  }

  /*
    Closing always clears -- a filter the field is no longer there to show is a
    list with rows missing for no visible reason -- but not until the band has
    finished closing. The query is dropped when the band's animation
    completes, so the text and the list it filters hold still while the field
    fades out rather than emptying under it. A band already closed has nothing
    to wait for.
  */
  function closeSearch() {
    if (!searchOpen) setQuery('');
    setSearchOpen(false);
  }

  function navigate(next: typeof level) {
    focusLevel.current = true;
    setTravelled(true);
    setLevel(next);
    closeSearch();
    setPreviewHandles(false);
    if (next === 'workspace' && current !== '/workspace') {
      leaveTo('/workspace');
    }
  }

  function finishCustomising() {
    reorder.cancelDrag();
    saveProcessOrder(order);
    setDraft(null);
    editRef.current?.focus();
  }

  return (
    // Pulled out over the shell's inset on its outer side. The sidebar already
    // holds --spacing-menu-fade on both sides for its gradients; with the
    // shell's inset added on the left as well, the content sat further from the
    // window than from the sheet and read as off-centre in its column.
    <aside
      className="max-shell:px-2 max-shell:py-2.5 shell:px-menu-fade shell:-ml-shell-inset shell:h-full shell:min-h-0 shell:overflow-hidden relative flex min-w-0 flex-col"
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
        // Both ends use rail cells, so mark sizing never changes their axes.
        className="shell-header-row shell:h-shell-header max-shell:pt-1 max-shell:pb-4 flex flex-none items-center justify-between gap-2 px-0"
      >
        <Brand markCellClassName={MENU_RAIL} />
        <div
          className="ease-out-emphasized flex flex-none items-center gap-0.75 transition-[translate,opacity] duration-(--duration-pane) data-[level=workspace]:pointer-events-none data-[level=workspace]:translate-x-4 data-[level=workspace]:opacity-0"
          data-level={level}
          inert={level !== 'processes'}
          aria-hidden={level !== 'processes'}
        >
          {/*
            A disclosure, not a toggle: it opens a region rather than switching
            a mode, so it says so through aria-expanded -- and lights for as
            long as the field is out, which is also as long as a filter can be
            on. The shortcut lives in its tooltip, where it is read before the
            field opens rather than inside a field that is already open.
          */}
          <Tooltip
            label={
              customising ? 'Finish arranging to search' : 'Search processes'
            }
            description={
              customising
                ? undefined
                : modifier === '⌘'
                  ? '⌘K'
                  : `${modifier}+K`
            }
          >
            <button
              ref={searchButtonRef}
              type="button"
              className={cx(
                ICON_BUTTON,
                'aria-expanded:bg-surface-selected aria-expanded:text-primary aria-expanded:hover:bg-menu-wash-pressed aria-expanded:focus-visible:bg-menu-wash-pressed',
              )}
              aria-label="Search processes"
              aria-expanded={searchOpen}
              aria-controls="process-search"
              aria-keyshortcuts="Meta+K Control+K"
              aria-disabled={customising || undefined}
              // Keeps focus in the field on a click, so the field's blur does
              // not close it a moment before this click would open it again.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (customising) return;
                if (!searchOpen) {
                  openSearch();
                  return;
                }
                // The field held focus through the press; hand it to this
                // button before the field goes inert, not to the page.
                closeSearch();
                searchButtonRef.current?.focus();
              }}
            >
              <MenuIcon name="search" />
            </button>
          </Tooltip>
          <span className={MENU_RAIL}>
            <Tooltip label={customising ? 'Save order' : 'Arrange processes'}>
              <button
                ref={editRef}
                type="button"
                // The one accented control in the sidebar, and only while
                // arranging: it is the way back out of the mode. A flat fill
                // on the quiet wash, as the search toggle beside it, so one
                // background carries every state and nothing trails it.
                className={cx(
                  ICON_BUTTON,
                  'aria-pressed:bg-commit-face aria-pressed:hover:bg-commit-hover aria-pressed:focus-visible:bg-commit-hover aria-pressed:text-white aria-pressed:hover:text-white aria-pressed:focus-visible:text-white',
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
                    closeSearch();
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
        data-travel={travelled ? level : undefined}
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
              <WorkspaceMenu
                count={items.length}
                enterRef={enterRef}
                onEnter={() => navigate('processes')}
                onRevealComplete={finishWorkspaceFade}
                shine={current === '/workspace' && workspaceAttentionReady}
              />
            </div>
            <div
              className="ease-out-emphasized max-shell:px-1 shell:px-menu-fade shell:h-full shell:min-h-0 flex min-w-0 flex-col py-1 opacity-100 transition-opacity duration-(--duration-pane) aria-hidden:opacity-0"
              inert={level !== 'processes'}
              aria-hidden={level !== 'processes'}
            >
              {/* Fixed chrome of this level: the field, its rule, and the
                  title. Only the list under them scrolls. */}
              <ProcessSearch
                open={searchOpen}
                query={query}
                onQueryChange={setQuery}
                transition={searchTransition}
                inputRef={searchRef}
                onClose={closeSearch}
                onDismiss={() => {
                  closeSearch();
                  searchButtonRef.current?.focus();
                }}
              />
              {/*
                The title, and the one action that adds to what it names. Two
                siblings stacked in one grid cell, not a button inside a
                button: the back button still spans the row, so its title
                centres against the spacer that balances the chevron, and the
                add button sits over that spacer in a rail cell of its own, on
                the trailing axis. Later in the cell, so it is on top -- and a
                pointer on it is off the back button, so the two washes never
                stack.
              */}
              <div className="mt-2 grid">
                <button
                  ref={backRef}
                  type="button"
                  className={cx(
                    'process-menu-back',
                    MENU_BACK_BOX,
                    'text-dense col-start-1 row-start-1 flex w-full items-center font-semibold',
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
                  {/* Balances the chevron so the title centres on the row,
                      and is the slot the add button sits over. */}
                  <span className={MENU_CHEVRON} aria-hidden="true" />
                </button>
                {/* The cell passes the pointer through, so the sliver of it
                    either side of the button still belongs to the back
                    button underneath. */}
                <span
                  className={cx(
                    MENU_RAIL,
                    'pointer-events-none col-start-1 row-start-1 self-center justify-self-end',
                  )}
                >
                  <Tooltip label="Add process">
                    <button
                      type="button"
                      className={cx(ICON_BUTTON, 'pointer-events-auto')}
                      aria-label="Add process"
                      aria-disabled="true"
                    >
                      <MenuIcon name="plus" />
                    </button>
                  </Tooltip>
                </span>
              </div>
              <ProcessList
                items={items}
                order={order}
                visibleOrder={visibleOrder}
                current={current}
                customising={customising}
                showGrip={showGrip}
                gripTransition={gripTransition}
                reorder={reorder}
              />
            </div>
          </div>
        </div>
      </nav>
      <div className="max-shell:gap-2.5 max-shell:pt-3 mt-auto grid flex-none gap-3.5 pt-2">
        <SidebarNotice />
        {/* A grid item of its own, so the grid's gap spaces it from both
            neighbours -- the distance the account row's own top padding used
            to hold below it. */}
        <div className={MENU_RULE} aria-hidden="true" />
        <SidebarAccount />
      </div>
    </aside>
  );
}
