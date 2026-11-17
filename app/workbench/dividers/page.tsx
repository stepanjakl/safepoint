import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DATA_TABLE_BODY,
  DATA_TABLE_HEADING,
  DataTable,
} from '@/components/ui/data-table';

const OPTIONS = [
  { width: '1', label: '1px', note: 'Baseline' },
  { width: '1.5', label: '1.5px', note: 'Medium' },
  { width: '2', label: '2px', note: 'Heavy' },
];

const HEADER_RULE =
  'border-rule-faint border-b-(length:--workbench-divider-width)';
const FOOTER_RULE =
  'border-rule-faint border-t-(length:--workbench-divider-width)';

const ROWS = [
  { name: 'Sourdough loaf', before: 60, after: 72 },
  { name: 'Hass avocados', before: 40, after: 50 },
  { name: 'Greek feta', before: 36, after: 48 },
];

function TableSample() {
  return (
    <DataTable>
      <table className={DATA_TABLE_BODY}>
        <caption className="sr-only">Proposed order changes</caption>
        <thead>
          <tr>
            {['Item', 'Before', 'After'].map((label, index) => (
              <th
                key={label}
                scope="col"
                className={`${DATA_TABLE_HEADING} ${HEADER_RULE} px-3 py-3 first:pl-4 last:pr-4 ${index === 0 ? 'text-left' : 'text-right'}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, index) => (
            <tr key={row.name}>
              <th
                scope="row"
                className={`py-3 pr-3 pl-4 text-left font-medium ${index > 0 ? 'border-rule-faint border-t' : ''}`}
              >
                {row.name}
              </th>
              {[row.before, row.after].map((value, column) => (
                <td
                  key={column}
                  className={`value text-meta px-3 py-3 text-right tabular-nums last:pr-4 ${index > 0 ? 'border-rule-faint border-t' : ''}`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              colSpan={3}
              className={`${FOOTER_RULE} text-meta text-muted px-4 py-3`}
            >
              3 proposed changes · Orders
            </td>
          </tr>
        </tfoot>
      </table>
    </DataTable>
  );
}

function PopoverSample() {
  return (
    <div className="control-face surface-popover rounded-shell">
      <div className="rounded-shell overflow-clip">
        <div className={`${HEADER_RULE} px-4 py-3`}>
          <h4 className="text-dense font-semibold">Schedule</h4>
        </div>
        <div className="grid gap-3 p-4">
          <div className="grid gap-1">
            <p className="text-dense font-medium">Every weekday at 07:30</p>
            <p className="text-meta text-muted">Europe/London</p>
          </div>
          <p className="text-meta text-muted leading-normal">
            Prepare the next run and wait for approval before applying changes.
          </p>
        </div>
        <div className={`${FOOTER_RULE} flex justify-end gap-2 px-4 py-3`}>
          <Button size="small">Cancel</Button>
          <Button size="small" variant="primary">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function PanelSample() {
  return (
    <div className="control-face surface-floating rounded-shell overflow-clip">
      <div className={`${HEADER_RULE} grid gap-1 px-4 py-3`}>
        <h4 className="text-dense font-semibold">Review changes</h4>
        <p className="text-meta text-muted">Brunch orders</p>
      </div>
      <div className="grid gap-3 p-4">
        <p className="text-body">Ready for your approval</p>
        <p className="text-meta text-muted leading-normal">
          Three quantities will be updated in the Orders sheet. The remaining
          records are unchanged.
        </p>
      </div>
      <div className={`${FOOTER_RULE} flex justify-end gap-2 px-4 py-3`}>
        <Button size="small">Back</Button>
        <Button size="small" variant="primary">
          Approve
        </Button>
      </div>
    </div>
  );
}

export default function DividersWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main id="main" className="bg-canvas text-primary min-h-dvh p-4 sm:p-8">
      <div className="mx-auto grid max-w-7xl gap-8">
        <header className="grid gap-2">
          <h1 className="text-display font-semibold">
            Header & footer dividers
          </h1>
          <p className="text-body text-muted max-w-3xl">
            Compare 1px, 1.5px and 2px rules on a table, popover and panel. Only
            the header and footer dividers change; body rules and outer borders
            keep their existing weight. These are static previews.
          </p>
          <p className="text-meta text-muted max-w-3xl">
            Switch theme and neutral family in the design pane. At 100% zoom,
            1.5px borders resolve to 1px on a 1× display and 1.5px on a 2×
            display.
          </p>
        </header>
        <div className="grid items-start gap-8 xl:grid-cols-3">
          {OPTIONS.map((option) => (
            <section
              key={option.width}
              data-divider-width={option.width}
              aria-labelledby={`divider-${option.width}`}
              className="grid min-w-0 gap-6"
            >
              <header className="grid gap-1">
                <h2
                  id={`divider-${option.width}`}
                  className="text-title font-semibold"
                >
                  {option.label}
                </h2>
                <p className="text-meta text-muted">{option.note}</p>
              </header>
              <div className="grid gap-2">
                <h3 className="text-meta text-muted font-medium">Table</h3>
                <TableSample />
              </div>
              <div className="grid gap-2">
                <h3 className="text-meta text-muted font-medium">Popover</h3>
                <PopoverSample />
              </div>
              <div className="grid gap-2">
                <h3 className="text-meta text-muted font-medium">Panel</h3>
                <PanelSample />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
