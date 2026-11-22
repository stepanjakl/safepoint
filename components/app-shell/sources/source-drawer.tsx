'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DrawerOverlay,
  DrawerPanels,
} from '@/components/app-shell/drawer-overlay';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { Loader } from '@/components/ui/loader';
import { useLoader } from '@/components/ui/working-mark';
import type { SourceValues } from '@/lib/sources/model';

import { ResourceTable } from './resource-table';
import { useSourceValues } from './source-queries';

type Loaded =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; values: SourceValues }
  | { kind: 'failed'; message: string };

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
