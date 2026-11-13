'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { useTRPC } from '@/components/trpc/provider';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Loader } from '@/components/ui/loader';
import { TabSwap } from '@/components/ui/swap';
import { useLoader } from '@/components/ui/working-mark';

// One row per line, so a table reads as one: the headers, then each row.
const asJson = (values: unknown[][]) =>
  values.length
    ? `[\n${values.map((row) => `  ${JSON.stringify(row)}`).join(',\n')}\n]`
    : '[]';

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
  children: (view: (tab?: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
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
      {children((tab) => {
        if (tab) setChosen(tab);
        setOpen(true);
      })}
      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title="Sheet data"
          closeLabel="Close"
          aside={null}
          width="fixed"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-5">
            {loader.phase ? (
              <Loader
                phase={loader.phase}
                size="panel"
                label="Loading the read…"
              />
            ) : data && selected && selectedTab ? (
              <>
                <FilterTabs
                  tabs={tabs}
                  selected={selected}
                  onChange={setChosen}
                  leadKey={null}
                  ariaLabel="Data tabs"
                  menuLabel="Other data tabs"
                />
                <TabSwap
                  selected={selected}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  {(key) => {
                    // The tab on screen, which trails the chosen one
                    // through the fade.
                    const tab =
                      data.tabs.find((one) => one.name === key) ?? selectedTab;
                    return (
                      <pre
                        tabIndex={0}
                        aria-label={`${tab.name}, as read`}
                        className="bg-surface-inset rounded-control value text-meta min-h-0 min-w-0 flex-1 overflow-auto p-3"
                      >
                        {asJson(tab.values)}
                      </pre>
                    );
                  }}
                </TabSwap>
              </>
            ) : data ? (
              <p className="text-dense text-muted">
                No data tabs in this read.
              </p>
            ) : (
              <p role="status" className="text-dense text-muted">
                {loading.error?.message ?? ''}
              </p>
            )}
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}
