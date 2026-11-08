'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import {
  COMPACT_TABLE_BODY,
  COMPACT_TABLE_CELL,
  COMPACT_TABLE_HEAD,
  DataTable,
} from '@/components/ui/data-table';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Loader } from '@/components/ui/loader';
import { TabSwap } from '@/components/ui/swap';
import { useLoader } from '@/components/ui/working-mark';
import type { SourceValues } from '@/lib/sources/model';

import { sourceValues } from './source-store';

type Loaded =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; values: SourceValues }
  | { kind: 'failed'; message: string };

// Opaque sticky faces keep scrolling cells under the header and row numbers;
// the corner sits above both.
const EDGE = COMPACT_TABLE_CELL;
const CELL = `${EDGE} text-left`;
const HEAD = `${COMPACT_TABLE_HEAD} sticky top-0 z-1`;
const ROW_NUMBER = `${EDGE} text-muted bg-surface-inset sticky left-0 text-right font-normal`;

// A cell as the sheet returned it: unformatted, so a time is its serial number.
const cellText = (cell: unknown) =>
  cell === null || cell === undefined ? '' : String(cell);

/*
  One read of a source, a resource at a time, as a table of exactly what was
  read: the sheet's own row numbers down the side, so a row named here is the
  row to look for in the sheet. Whatever opens it gets `view`, which opens it
  at a resource or where it was left.
*/
export function SourceDrawer({
  source,
  readId,
  title,
  children,
}: {
  source: string;
  readId: string;
  title: string;
  children: (view: (resource?: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'idle' });
  const values =
    loaded.kind === 'ready' && loaded.values.readId === readId
      ? loaded.values
      : null;

  const tabs = useMemo(
    () =>
      values?.resources.map((resource) => ({
        key: resource.name,
        short: resource.name,
        label: resource.name,
        count: Math.max(0, resource.values.length - 1),
      })) ?? [],
    [values],
  );
  const selected = tabs.some((tab) => tab.key === chosen)
    ? chosen
    : tabs[0]?.key;

  const loader = useLoader(loaded.kind === 'loading');

  const view = (resource?: string) => {
    if (resource) setChosen(resource);
    setOpen(true);
    if (values) return;
    setLoaded({ kind: 'loading' });
    sourceValues(source, readId).then(
      (answer) => setLoaded({ kind: 'ready', values: answer }),
      (error: unknown) =>
        setLoaded({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'Could not load.',
        }),
    );
  };

  return (
    <>
      {children(view)}
      <DrawerOverlay isOpen={open} onOpenChange={setOpen}>
        <DrawerPanels
          title={title}
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
            ) : values && selected ? (
              <>
                <FilterTabs
                  tabs={tabs}
                  selected={selected}
                  onChange={setChosen}
                  leadKey={null}
                  ariaLabel="Tabs"
                  menuLabel="Other tabs"
                />
                <TabSwap
                  selected={selected}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  {(key) => {
                    const resource = values.resources.find(
                      (one) => one.name === key,
                    );
                    return resource ? (
                      <ResourceTable
                        name={resource.name}
                        values={resource.values}
                      />
                    ) : null;
                  }}
                </TabSwap>
              </>
            ) : values ? (
              <p className="text-dense text-muted">Nothing in this read.</p>
            ) : (
              <p role="status" className="text-dense text-muted">
                {loaded.kind === 'failed' ? loaded.message : ''}
              </p>
            )}
          </div>
        </DrawerPanels>
      </DrawerOverlay>
    </>
  );
}

function ResourceTable({
  name,
  values,
}: {
  name: string;
  values: unknown[][];
}) {
  const width = Math.max(0, ...values.map((row) => row.length));
  const [header = [], ...rows] = values;
  if (values.length === 0)
    return <p className="text-dense text-muted">{name} is empty.</p>;
  const cells = (row: unknown[]) =>
    Array.from({ length: width }, (_, index) => cellText(row[index]));
  return (
    <DataTable
      variant="compact"
      tabIndex={0}
      role="region"
      aria-label={`${name}, as read`}
      className="min-h-0 flex-1"
    >
      <table className={COMPACT_TABLE_BODY}>
        <thead>
          <tr>
            <th scope="col" className={`${ROW_NUMBER} top-0 z-2`}>
              <span className="sr-only">Row</span>
              <span aria-hidden="true">1</span>
            </th>
            {cells(header).map((cell, index) => (
              <th key={index} scope="col" className={HEAD}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <th scope="row" className={ROW_NUMBER}>
                {index + 2}
              </th>
              {cells(row).map((cell, column) => (
                <td key={column} className={CELL}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}
