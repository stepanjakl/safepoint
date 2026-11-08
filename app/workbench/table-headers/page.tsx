import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';

import { DATA_TABLE_RULE, DataTable } from '@/components/ui/data-table';
import { cx } from '@/lib/cx';

type Treatment = 'current' | 'quiet' | 'open' | 'fills' | 'folder' | 'rhythm';

const ITEM_RULE_STYLE: CSSProperties & { '--row-rule-inset': string } = {
  '--row-rule-inset': 'calc(var(--spacing) * 5)',
};

const OPTIONS: { id: Treatment; title: string; description: string }[] = [
  {
    id: 'current',
    title: 'Current · equal bands',
    description: 'The column names and tab rows share the same fill and rule.',
  },
  {
    id: 'quiet',
    title: 'Quiet columns, filled tabs',
    description:
      'Column names sit on the table face. The band belongs to the tab.',
  },
  {
    id: 'open',
    title: 'Filled columns, open tabs',
    description:
      'A heading and an extending rule introduce each group of values.',
  },
  {
    id: 'fills',
    title: 'Two strengths of fill',
    description:
      'A quiet column band and a stronger tab band separate the roles.',
  },
  {
    id: 'folder',
    title: 'Folder labels',
    description:
      'Each tab has a small attached label, with its count alongside.',
  },
  {
    id: 'rhythm',
    title: 'Typography and rhythm',
    description:
      'Equal fills, but a larger tab title, more air and a stronger rule.',
  },
];

const GROUPS = [
  {
    name: 'Orders',
    rows: [
      {
        record: 'SD-01',
        name: 'Sourdough loaf 800g',
        cell: 'B4',
        before: '60',
        after: '72',
      },
      {
        record: 'AV-RR',
        name: 'Hass avocados, ripe & ready',
        cell: 'B5',
        before: '40',
        after: '50',
      },
      {
        record: 'FT-200',
        name: 'Greek feta 200g',
        cell: 'B6',
        before: '36',
        after: '48',
      },
    ],
  },
  {
    name: 'Top-ups',
    rows: [
      {
        record: 'CT-250',
        name: 'Cherry tomatoes 250g',
        cell: 'C4',
        before: '6',
        after: '10',
      },
      {
        record: 'CF-40',
        name: 'Chilli flakes 40g',
        cell: 'C5',
        before: '4',
        after: '7',
      },
    ],
  },
];

function TablePreview({ treatment }: { treatment: Treatment }) {
  const filledColumns = treatment !== 'quiet';
  return (
    <div className="ground-raised">
      <DataTable>
        <table className="text-dense w-full border-separate border-spacing-0">
          <caption className="sr-only">
            Proposed writes, grouped by sheet tab
          </caption>
          <thead>
            <tr>
              {['Record', 'Cell', 'Before', 'After'].map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cx(
                    'readout text-muted-strong border-rule-faint border-b px-3 font-semibold first:pl-5 last:pr-5',
                    treatment === 'rhythm' ? 'py-2' : 'py-3',
                    filledColumns && 'ground-band bg-surface-band',
                    index < 2 ? 'text-left' : 'text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((group, groupIndex) => (
            <tbody key={group.name}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={4}
                  className={cx(
                    'text-left',
                    treatment === 'open' ? 'pl-5' : 'px-5',
                    treatment === 'current' || treatment === 'quiet'
                      ? 'ground-band bg-surface-band border-rule-faint border-b py-2.5'
                      : treatment === 'fills'
                        ? 'bg-surface-hover border-rule-faint border-b py-2.5'
                        : treatment === 'rhythm'
                          ? 'ground-band bg-surface-band border-rule-default border-t-2 pt-4 pb-3'
                          : treatment === 'folder'
                            ? 'border-rule-default border-b pt-4'
                            : 'pt-5 pb-2',
                    groupIndex > 0 &&
                      treatment !== 'rhythm' &&
                      treatment !== 'open' &&
                      treatment !== 'folder' &&
                      'border-t',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'shrink-0 font-semibold',
                        treatment === 'rhythm' && 'text-title',
                        treatment === 'folder' &&
                          'ground-band bg-surface-band border-rule-default rounded-t-control border border-b-0 px-3 py-2',
                      )}
                    >
                      {group.name}
                    </span>
                    <span className="thread-step-fact h-4.5">
                      {group.rows.length} values
                    </span>
                    {treatment === 'open' ? (
                      <span
                        aria-hidden
                        className="border-rule-faint min-w-0 flex-1 border-b"
                      />
                    ) : null}
                  </div>
                </th>
              </tr>
              {group.rows.map((row, index) => (
                <tr key={row.record}>
                  <th
                    scope="row"
                    style={treatment === 'open' ? ITEM_RULE_STYLE : undefined}
                    className={cx(
                      'border-rule-faint py-3 pr-3 pl-5 text-left font-normal',
                      index > 0 &&
                        (treatment === 'open' ? DATA_TABLE_RULE : 'border-t'),
                    )}
                  >
                    <span className="font-semibold">{row.record}</span>
                    <span className="text-meta text-muted block">
                      {row.name}
                    </span>
                  </th>
                  {[row.cell, row.before, row.after].map((value, column) => (
                    <td
                      key={column}
                      className={cx(
                        'value text-meta border-rule-faint px-3 py-3 last:pr-5',
                        column === 0 ? 'text-left' : 'text-right tabular-nums',
                        index > 0 && 'border-t',
                      )}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </DataTable>
    </div>
  );
}

export default function TableHeadersWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main id="main" className="bg-canvas text-primary min-h-dvh p-4 sm:p-8">
      <div className="mx-auto grid max-w-3xl gap-10">
        <header className="grid gap-2">
          <Link
            href="/workbench"
            className="text-meta text-muted w-fit underline underline-offset-4"
          >
            Colour reference
          </Link>
          <h1 className="text-display font-semibold">Table headers</h1>
          <p className="text-body text-muted max-w-prose">
            Column names orient you. Tab names group the values. Compare five
            ways to give each its own role, against the current equal bands.
          </p>
          <p className="text-meta text-muted-strong max-w-prose">
            My pick: quiet columns with filled tabs. Typography and rhythm can
            add more separation if the groups still need emphasis.
          </p>
        </header>
        {OPTIONS.map((option) => (
          <section
            key={option.id}
            aria-labelledby={option.id}
            className="grid min-w-0 gap-4"
          >
            <header className="grid gap-1">
              <h2 id={option.id} className="text-title font-semibold">
                {option.title}
              </h2>
              <p className="text-meta text-muted">{option.description}</p>
            </header>
            <TablePreview treatment={option.id} />
          </section>
        ))}
      </div>
    </main>
  );
}
