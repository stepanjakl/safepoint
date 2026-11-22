'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import {
  ResourceTable,
  type CitedCell,
} from '@/components/app-shell/sources/resource-table';
import { useTRPC } from '@/components/trpc/provider';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Loader } from '@/components/ui/loader';
import { TabSwap } from '@/components/ui/swap';
import { Arrival, useLoader } from '@/components/ui/working-mark';

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
  The run's read as it came from the sheet: one data tab at a time,
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
                <TabSwap
                  selected={selected}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                  motionBetween={(from, to) =>
                    tabs.findIndex((tab) => tab.key === to) >
                    tabs.findIndex((tab) => tab.key === from)
                      ? 'left'
                      : 'right'
                  }
                >
                  {(key) => {
                    const tab =
                      data.tabs.find((tab) => tab.name === key) ?? selectedTab;
                    return (
                      <ResourceTable
                        name={tab.name}
                        values={tab.values}
                        cited={key === chosen ? cited : undefined}
                      />
                    );
                  }}
                </TabSwap>
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
