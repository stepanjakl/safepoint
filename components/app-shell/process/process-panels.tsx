'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/ui/working-mark';
import { cx } from '@/lib/ui/cx';
import type { ProcessSummary } from '@/lib/shell/model';
import {
  DrawerAside,
  viewKey,
  type AsideView,
} from '@/components/app-shell/drawer-aside';
import {
  InstructionDetail,
  InstructionsPanel,
} from '@/components/app-shell/instructions/instructions-panel';
import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { ProcessSettings } from './process-settings';
import { useAsidePanel } from '@/components/app-shell/use-aside-panel';
import { SECTION } from './panel-parts';
import { SectionRow } from '@/components/app-shell/runs/section-row';
import { MorphingLabel } from '@/components/ui/morphing-text';
import type { ProcessTab } from './process-tab-store';

/*
  What the process is, in the sheet rather than over it. The header's menu
  chooses which of these is showing; the run itself is the other half of that
  choice and lives in process-sheet.tsx.

  Instructions open as a list beside a detail. The detail is the same panel the
  drawer used, with its swap, its direction and its focus handling unchanged --
  only where it sits has changed. Below the two-column width the detail takes
  the list's place, as it did in the drawer.
*/

// One row the height of the sheet, so each column scrolls on its own rather
// than the row growing to the longer of the two.
const COLUMNS =
  'grid h-full min-h-0 grid-cols-[minmax(0,1fr)] shell:grid-rows-[minmax(0,1fr)]';

// Versions are a short word and a date: the runs rail's width, so the divider
// does not move between the two tabs.
const NARROW_LIST =
  '@sheet-narrow/sheet:grid-cols-[minmax(0,var(--spacing-sheet-rail))_minmax(0,1fr)] @sheet-narrow/sheet:[&>*]:min-w-0';

export function ProcessPanels({
  process,
  tab,
  openView = null,
}: {
  process: ProcessSummary;
  tab: Exclude<ProcessTab, 'runs'>;
  // A detail to open with, asked for from outside the panel -- a version's
  // change log from the runs rail. The panel is keyed on it upstream, so it is
  // read once, at mount.
  openView?: AsideView | null;
}) {
  // Aliased away from `current`: a bare `current` read in render is what a
  // misread ref looks like, both to a reader and to the lint rule that guards
  // against one.
  const {
    versions,
    current: version,
    next,
    draft,
  } = useInstructions(process.id, process.instructions);

  // Versions oldest first, as the pager steps through them.
  const place = (view: AsideView) => {
    if (view.kind === 'version') {
      return versions.findIndex((entry) => entry.version === view.version);
    }
    return -1;
  };
  const {
    aside,
    exiting,
    leaving,
    direction,
    openAside,
    closeAside,
    finishExit,
    onKeyDownCapture,
    settleLeaving,
  } = useAsidePanel({
    // The latest version is open from the first render, so the server sends
    // it with the list. Where the two do not fit side by side, the sheet's
    // width alone hides it and the list keeps its place (`passive` below).
    initial:
      openView ??
      (tab === 'instructions'
        ? {
            kind: 'version',
            version: version.version,
            face: 'text',
            passive: true,
          }
        : null),
    place,
    viewKey,
    sameList: (from, to) => from.kind === to.kind,
    scope: '.process-panels',
  });

  const panel = aside ? asidePanel(aside) : null;
  const leavingPanel =
    leaving && aside && viewKey(leaving) !== viewKey(aside)
      ? asidePanel(leaving)
      : null;
  // What the detail last swapped from, kept through the arrival, so its band
  // knows whether the swap crossed between a version and the draft.
  const [swap, setSwap] = useState({
    key: panel?.key,
    kind: panel?.view.kind,
    from: panel?.view.kind,
  });
  if (swap.key !== panel?.key)
    setSwap({ key: panel?.key, kind: panel?.view.kind, from: swap.kind });
  const crossing = leavingPanel
    ? leavingPanel.view.kind !== panel?.view.kind
    : swap.from !== swap.kind;

  function asidePanel(view: AsideView) {
    if (view.kind === 'version') {
      if (!versions.some((entry) => entry.version === view.version))
        return null;
      const title = `Version ${view.version}`;
      return {
        view,
        key: viewKey(view),
        eyebrow: 'Instructions',
        title,
        announce: title,
        headless: true,
        focusOnOpen: !view.passive,
      };
    }
    if (view.kind === 'edit') {
      const title = `New version ${next}`;
      return {
        view,
        key: viewKey(view),
        eyebrow: 'Instructions',
        title,
        announce: title,
        headless: true,
        focusOnOpen: false,
      };
    }
    return null;
  }

  const opensDetail = tab === 'instructions';
  // The version that opened with the tab, not one a person chose: below the
  // two-column width it gives way to the list instead of replacing it.
  const passive = panel?.view.kind === 'version' && panel.view.passive === true;
  const list =
    tab === 'instructions' ? (
      <InstructionsPanel
        process={process}
        aside={exiting ? null : aside}
        onShowVersion={(shown) =>
          openAside({ kind: 'version', version: shown, face: 'text' })
        }
        onEdit={() => openAside({ kind: 'edit' })}
      />
    ) : tab === 'settings' ? (
      <ProcessSettings process={process} />
    ) : null;

  return (
    <div
      className={cx('process-panels', COLUMNS, opensDetail && NARROW_LIST)}
      data-tab={tab}
      onKeyDownCapture={onKeyDownCapture}
    >
      <div
        // Where the detail is showing and the two do not fit, it takes this
        // column's place rather than squeezing beside it.
        className={cx(
          'process-panel-list sheet-bleed shell:min-h-0 shell:overflow-y-auto shell:overscroll-contain min-w-0',
          // Rows run to the column's edges; prose pads itself back.
          tab !== 'instructions' && 'sheet-bleed-head',
          opensDetail
            ? '@max-sheet-narrow/sheet:sheet-bleed-end'
            : 'sheet-bleed-end sheet-bleed-end-head',
          panel && !passive ? '@max-sheet-narrow/sheet:hidden' : null,
        )}
      >
        {/* Named for assistive technology only: the header's tab says it. */}
        <SectionRow id={SECTION[tab].id} title={SECTION[tab].title}>
          {tab === 'instructions' ? (
            <button
              type="button"
              className="sheet-action-pill text-meta text-primary enabled:hover:bg-surface-hover-strong focus-visible:bg-surface-selected px-2.5 font-medium whitespace-nowrap enabled:cursor-pointer disabled:opacity-50"
              disabled={aside?.kind === 'edit' && !exiting}
              onClick={() => openAside({ kind: 'edit' })}
            >
              <MorphingLabel
                text={draft === null ? 'New version' : `Continue ${next}`}
              />
            </button>
          ) : null}
        </SectionRow>
        {list}
      </div>
      {panel ? (
        <InstructionDetail
          process={process}
          view={(leavingPanel ?? panel).view}
          swapping={leavingPanel !== null}
          crossing={crossing}
          onEdit={() => openAside({ kind: 'edit' })}
          onDone={(version) =>
            version
              ? openAside({ kind: 'version', version, face: 'text' })
              : closeAside()
          }
          renderPanel={(band, body) => (
            <DrawerAside
              current={{ ...panel, body }}
              leaving={leavingPanel ? { ...leavingPanel, body } : null}
              persistentBand={band}
              direction={direction}
              exiting={exiting}
              onExited={finishExit}
              onLeft={settleLeaving}
              flat
              // The detail band covers the column edge's lit line.
              className={cx('z-1', passive && '@max-sheet-narrow/sheet:hidden')}
            />
          )}
        />
      ) : opensDetail ? (
        // Only where a row opens something: a column that can never fill is
        // not an empty state, it is a mistake.
        <div className="@sheet-wide/sheet:flex hidden min-h-0 flex-col overflow-y-auto px-8">
          <EmptyState role="status" title="No version open.">
            Choose a version to read it and see what changed in it.
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
