'use client';

import { ROW_BUTTON } from '@/components/app-shell/inputs/inputs-list';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import {
  SystemDisc,
  SystemMeta,
} from '@/components/app-shell/system/system-parts';
import { plural } from '@/components/sheet-process/trial-parts';
import { SHEET_INPUTS } from '@/lib/processes/brunch-orders/process';
import type { SystemLink } from '@/lib/process/system-links';

import { DataDrawer } from './data-drawer';
import type { RunRead } from './orders-run';

const READ_AT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/*
  The sheet's tabs this process reads, as the selected run read them: each
  with its rows and when it was read, opening to the rows themselves. The
  read is kept on the server and every step of the run uses that same copy,
  so this is what the run's values and checks were worked out on.
*/
export function SheetInputs() {
  const selection = useRunSelection();
  const read = selection?.live?.data.read as RunRead | undefined;
  const links = SHEET_INPUTS.map((link): SystemLink => {
    const tab = read?.tabs.find((t) => t.name === link.id);
    return tab && read
      ? {
          ...link,
          records: Math.max(0, tab.rows - 1),
          freshness: {
            state: 'fresh',
            label: `Read ${READ_AT.format(new Date(read.readAt))}`,
          },
        }
      : link;
  });
  return (
    <div className="grid gap-5">
      <p className="text-dense text-muted leading-relaxed">
        The tabs of the sheet this process reads. A run reads them once, and
        every step of it works on that same copy.
      </p>
      {read ? (
        <DataDrawer readId={read.id}>
          {(view) => (
            <ul aria-label="Sheet tabs">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="border-rule-faint border-b last:border-b-0"
                >
                  <button
                    type="button"
                    className={ROW_BUTTON}
                    onClick={() => view(link.id)}
                  >
                    <InputRow link={link} />
                    <span aria-hidden="true" className="text-muted text-dense">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataDrawer>
      ) : (
        <>
          <ul aria-label="Sheet tabs">
            {links.map((link) => (
              <li
                key={link.id}
                className="border-rule-faint flex min-h-11 items-center gap-3 border-b py-2 last:border-b-0"
              >
                <InputRow link={link} />
              </li>
            ))}
          </ul>
          <p className="text-meta text-muted">
            {selection?.live
              ? 'This run has not read the sheet yet.'
              : 'Open a run that has read the sheet to see what each tab gave it.'}
          </p>
        </>
      )}
    </div>
  );
}

function InputRow({ link }: { link: SystemLink }) {
  return (
    <>
      <SystemDisc link={link} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-dense text-primary truncate">
          {link.label}
          {link.records !== undefined ? (
            <span className="text-muted"> · {plural(link.records, 'row')}</span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {link.freshness ? <SystemMeta link={link} /> : null}
          <span className="value text-micro text-muted truncate">
            {link.file}
          </span>
        </span>
      </span>
    </>
  );
}
