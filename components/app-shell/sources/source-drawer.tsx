'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useLoader } from '@/components/ui/working-mark';
import type { SourceValues } from '@/lib/sources/model';

import { useSourceValues } from './source-queries';

type Loaded =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; values: SourceValues }
  | { kind: 'failed'; message: string };

// Opaque sticky faces keep scrolling cells under the header and row numbers;
// the corner sits above both.
const EDGE = COMPACT_TABLE_CELL;
const CELL = `${EDGE} text-left`;
const HEAD = `${COMPACT_TABLE_HEAD} sticky top-0 z-2`;
const ROW_NUMBER = `${EDGE} text-muted bg-surface-inset sticky left-0 z-1 text-right font-normal`;

// A cell as the sheet returned it: unformatted, so a time is its serial number.
const cellText = (cell: unknown) =>
  cell === null || cell === undefined ? '' : String(cell);

/*
  One read of a source, a resource at a time, as a table of exactly what was
  read, with data rows numbered below the header. The `view` callback opens
  the requested resource or returns to the one last viewed.
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
  const sourceValues = useSourceValues();
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
  const resource =
    values?.resources.find((one) => one.name === chosen) ??
    values?.resources[0];

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
            ) : resource ? (
              <>
                <div className="shrink-0 overflow-x-auto">
                  <FilterTabs
                    tabs={tabs}
                    selected={resource.name}
                    onChange={setChosen}
                    leadKey={null}
                    ariaLabel="Tabs"
                    collapseToMenu={false}
                  />
                </div>
                <ResourceTable name={resource.name} values={resource.values} />
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
  const scroller = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [name]);

  const width = Math.max(0, ...values.map((row) => row.length));
  const [header = [], ...rows] = values;
  const cells = (row: unknown[]) =>
    Array.from({ length: width }, (_, index) => cellText(row[index]));
  return (
    <DataTable
      ref={scroller}
      variant="compact"
      tabIndex={0}
      role="region"
      aria-label={`${name}, as read`}
      className="min-h-0 flex-1 focus-visible:-outline-offset-2"
    >
      {values.length === 0 && (
        <p className="text-dense text-muted p-3">{name} is empty.</p>
      )}
      <table
        className={`${COMPACT_TABLE_BODY} min-w-full`}
        hidden={values.length === 0}
      >
        <thead>
          <tr>
            <th
              scope="col"
              className={`${COMPACT_TABLE_HEAD} sticky top-0 left-0 z-3 w-px`}
            >
              <span className="sr-only">Row</span>
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
                {index + 1}
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
