'use client';

import { useLayoutEffect, useRef } from 'react';

import {
  COMPACT_TABLE_BODY,
  COMPACT_TABLE_CELL,
  COMPACT_TABLE_HEAD,
  DataTable,
} from '@/components/ui/data-table';

export type CitedCell = { top: number; left: number; label: string };

// Paint the sticky header as one band so fractional column widths cannot expose seams.
// The corner repeats its face to cover the headings that scroll under it.
const EDGE = COMPACT_TABLE_CELL;
const CELL = `${EDGE} text-left`;
const ROW_NUMBER = `${EDGE} text-muted bg-surface-inset sticky left-0 z-1 text-right font-normal`;

// A cell as the sheet returned it: unformatted, so a time is its serial number.
const cellText = (cell: unknown) =>
  cell === null || cell === undefined ? '' : String(cell);

export function ResourceTable({
  name,
  values,
  cited,
}: {
  name: string;
  values: unknown[][];
  cited?: CitedCell;
}) {
  const scroller = useRef<HTMLElement>(null);
  const target = useRef<HTMLTableCellElement>(null);
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [name]);

  useLayoutEffect(() => {
    const viewport = scroller.current;
    const cell = target.current;
    if (!viewport || !cell) return;
    const bounds = viewport.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    viewport.scrollBy({
      top: rect.top - bounds.top + (rect.height - viewport.clientHeight) / 2,
      left: rect.left - bounds.left + (rect.width - viewport.clientWidth) / 2,
      behavior: 'instant',
    });
  }, [name, cited, values]);

  const width = Math.max(0, ...values.map((row) => row.length));
  const [header = [], ...rows] = values;
  const cells = (row: unknown[]) =>
    Array.from({ length: width }, (_, index) => cellText(row[index]));
  const citationProps = (row: number, column: number) =>
    cited?.top === row && cited.left === column
      ? { ref: target, title: cited.label, 'data-cited': '' }
      : undefined;

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
        <thead className="compact-table-header bg-surface-control sticky top-0 z-2">
          <tr>
            <th
              scope="col"
              className={`${COMPACT_TABLE_HEAD} bg-surface-control sticky left-0 z-1 w-px`}
            >
              <span className="sr-only">Row</span>
            </th>
            {cells(header).map((cell, index) => (
              <th
                key={index}
                scope="col"
                className={COMPACT_TABLE_HEAD}
                {...citationProps(0, index)}
              >
                {cell}
                {cited?.top === 0 && cited.left === index ? (
                  <span className="sr-only"> Cited cell {cited.label}</span>
                ) : null}
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
                <td
                  key={column}
                  className={CELL}
                  {...citationProps(index + 1, column)}
                >
                  {cell}
                  {cited?.top === index + 1 && cited.left === column ? (
                    <span className="sr-only"> Cited cell {cited.label}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}
