'use client';

import { useQuery } from '@tanstack/react-query';
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { useTRPC } from '@/components/trpc/provider';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Loader } from '@/components/ui/loader';
import { TabSwap } from '@/components/ui/swap';
import { Arrival, useLoader } from '@/components/ui/working-mark';

// One row per line, so a table reads as one: the headers, then each row.
const asJson = (values: unknown[][]) =>
  values.length
    ? `[\n${values.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]`
    : '[]';

type CitedCell = { top: number; left: number; label: string };

function CitedValue({ label, children }: { label: string; children: string }) {
  const mark = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      mark.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [label]);
  return (
    <mark ref={mark} className="data-cited-value" title={label}>
      {children}
    </mark>
  );
}

function ReadJson({ values, cell }: { values: unknown[][]; cell?: CitedCell }) {
  const row = cell && values[cell.top];
  if (!cell || !row || cell.left < 0 || cell.left >= row.length)
    return asJson(values);

  const encode = (value: unknown) => JSON.stringify(value) ?? 'null';
  const before = row.slice(0, cell.left).map(encode);
  const after = row.slice(cell.left + 1).map(encode);
  return (
    <>
      {'[\n'}
      {values.map((entry, index) => (
        <Fragment key={index}>
          {index ? ',\n' : ''}
          {'  '}
          {index === cell.top ? (
            <>
              {'['}
              {before.length ? before.join(',') + ',' : ''}
              <CitedValue label={cell.label}>
                {encode(entry[cell.left])}
              </CitedValue>
              {after.length ? ',' + after.join(',') : ''}
              {']'}
            </>
          ) : (
            JSON.stringify(entry)
          )}
        </Fragment>
      ))}
      {'\n]'}
    </>
  );
}

const WIDTH_KEY = 'safepoint.drawer-data.v1';

function readDrawerWidth() {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    const rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    return Number.isFinite(stored) && stored > 0 && rem > 0
      ? stored * rem
      : null;
  } catch {
    return null;
  }
}

/*
  The run's read as it came from the sheet: one data tab at a time, as JSON,
  headers and rows exactly as read. Fetched by the read's id when opened, so
  it is always the run's own read. Whatever opens it -- the card's button, a
  tab's row -- gets `view`, which opens it at a tab or where it was left.
*/
// A read's tabs as the drawer shows them.
export type DataTabs = { name: string; values: unknown[][] }[];

export function DataDrawer({
  readId,
  preloaded,
  children,
}: {
  readId: string;
  // The tabs, where they are at hand: nothing is fetched.
  preloaded?: DataTabs;
  children: (view: (tab?: string, cell?: CitedCell) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [cited, setCited] = useState<CitedCell>();
  const [drawerWidth, setDrawerWidth] = useState<number | null>(null);
  const trpc = useTRPC();
  // Asked for once the drawer first opens, and again on opening it after a
  // failure. A kept read never changes, so what came is kept.
  const loading = useQuery(
    trpc.read.get.queryOptions(
      { id: readId },
      { enabled: open && !preloaded, staleTime: Infinity },
    ),
  );
  const loader = useLoader(loading.isFetching && !loading.data);
  const data = useMemo(
    () =>
      preloaded ? { id: readId, tabs: preloaded } : (loading.data ?? null),
    [preloaded, loading.data, readId],
  );
  const tabs = useMemo(
    () =>
      data?.tabs.map((tab) => ({
        key: tab.name,
        short: tab.name,
        label: tab.name,
        count: Math.max(0, tab.values.length - 1),
      })) ?? [],
    [data],
  );
  const selected = tabs.some((tab) => tab.key === chosen)
    ? chosen
    : tabs[0]?.key;
  const selectedTab = data?.tabs.find((tab) => tab.name === selected);
  return (
    <>
      {children((tab, cell) => {
        if (tab) setChosen(tab);
        setCited(cell);
        setDrawerWidth(readDrawerWidth());
        setOpen(true);
      })}
      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title="Sheet data"
          closeLabel="Close"
          aside={null}
          width="fixed"
          resizable
          mainWidth={drawerWidth}
          onMainWidthChange={(width, commit) => {
            setDrawerWidth(width);
            if (!commit) return;
            try {
              const rem = Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
              );
              if (rem > 0)
                window.localStorage.setItem(WIDTH_KEY, String(width / rem));
            } catch {
              // The current tab still keeps the new width in React state.
            }
          }}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-5">
            {loader.phase ? (
              <Loader
                phase={loader.phase}
                size="panel"
                label="Loading the read…"
              />
            ) : data && selected && selectedTab ? (
              <Arrival
                fadeIn={loader.fadeIn}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
              >
                <FilterTabs
                  tabs={tabs}
                  selected={selected}
                  onChange={(tab) => {
                    setChosen(tab);
                    setCited(undefined);
                  }}
                  leadKey={null}
                  ariaLabel="Data tabs"
                  menuLabel="Other data tabs"
                />
                {cited && selected === chosen ? (
                  <p className="sr-only">Cited cell {cited.label}</p>
                ) : null}
                <pre
                  tabIndex={0}
                  aria-label={`${selectedTab.name}, as read`}
                  className="bg-surface-inset rounded-control value text-meta min-h-0 min-w-0 flex-1 overflow-auto p-3 leading-relaxed"
                >
                  <TabSwap
                    selected={selected}
                    motionBetween={(from, to) =>
                      tabs.findIndex((tab) => tab.key === to) >
                      tabs.findIndex((tab) => tab.key === from)
                        ? 'left'
                        : 'right'
                    }
                  >
                    {(key) => (
                      <ReadJson
                        values={
                          (
                            data.tabs.find((tab) => tab.name === key) ??
                            selectedTab
                          ).values
                        }
                        cell={key === chosen ? cited : undefined}
                      />
                    )}
                  </TabSwap>
                </pre>
              </Arrival>
            ) : data ? (
              <Arrival
                fadeIn={loader.fadeIn}
                className="flex min-h-0 min-w-0 flex-1 flex-col"
              >
                <p className="text-dense text-muted">
                  No data tabs in this read.
                </p>
              </Arrival>
            ) : (
              <Arrival
                fadeIn={loader.fadeIn}
                className="flex min-h-0 min-w-0 flex-1 flex-col"
              >
                <p role="status" className="text-dense text-muted">
                  {loading.error?.message ?? ''}
                </p>
              </Arrival>
            )}
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}
