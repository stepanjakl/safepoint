'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { useTrial } from '@/components/sheet-process/trial-parts';
import { FilterTabs } from '@/components/ui/filter-tabs';

type DataResponse =
  | {
      kind: 'read';
      id: string;
      readAt: string;
      tabs: { name: string; values: unknown[][] }[];
    }
  | { kind: 'error'; message: string };

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
export function DataDrawer({
  readId,
  children,
}: {
  readId: string;
  children: (view: (tab?: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const loading = useTrial<DataResponse>('/api/dev/brunch-orders/read');
  const body = loading.state.kind === 'done' ? loading.state.body : null;
  const data = body?.kind === 'read' && body.id === readId ? body : null;
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
        if (!data) void loading.run({ action: 'get', id: readId });
      })}
      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title="Sheet data"
          closeLabel="Close"
          aside={null}
          width="fixed"
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-5">
            {data && selected && selectedTab ? (
              <>
                <FilterTabs
                  tabs={tabs}
                  selected={selected}
                  onChange={setChosen}
                  leadKey={null}
                  ariaLabel="Data tabs"
                  menuLabel="Other data tabs"
                />
                <pre
                  tabIndex={0}
                  aria-label={`${selectedTab.name}, as read`}
                  className="bg-surface-inset rounded-control value text-meta min-h-0 min-w-0 flex-1 overflow-auto p-3"
                >
                  {asJson(selectedTab.values)}
                </pre>
              </>
            ) : data ? (
              <p className="text-dense text-muted">
                No data tabs in this read.
              </p>
            ) : (
              <p role="status" className="text-dense text-muted">
                {loading.state.kind === 'running'
                  ? 'Loading the read…'
                  : body?.kind === 'error'
                    ? body.message
                    : loading.state.kind === 'failed'
                      ? loading.state.message
                      : ''}
              </p>
            )}
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}
