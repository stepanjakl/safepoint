'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Glyph } from '@/components/ui/glyph';
import { cx } from '@/lib/ui/cx';
import type { InputDetail } from '@/lib/prototype/promotion/input-details';

/*
  The disclosure stack. Each `<details>` is a rule with a mono +/- in the
  gutter, which is a pseudo element on the summary and so stays in CSS; the
  `disclosure` class is that hook.
*/
const DISCLOSURE = 'disclosure border-rule-faint border-b';
// Keyboard focus is a wash, so the summary reaches out past the text by the
// same amount it pads back in: the wash has room at both ends and the marker
// and label stay where they were.
const SUMMARY =
  'control-wash rounded-control focus-visible:bg-surface-hover -mx-2 flex min-h-12 cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-3.5 text-dense [&>span]:text-muted [&>span]:ml-auto [&>span]:text-meta';
const DISCLOSURE_BODY = 'pb-5 pl-5.5 text-dense leading-relaxed';

// A filter earns its place once the records outrun a glance.
const FILTER_FROM = 8;
// Cited-by links shown before the rest collapse into a count. A note about the
// whole campaign is cited by every item, and 27 chips say less than a number.
const CITED_SHOWN = 8;

const CHIP =
  'value control-wash border-rule-default text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary inline-flex min-h-7 items-center rounded-full border px-2 text-meta';

/*
  One input, as this run read it: its JSON file, when its records were
  observed -- or, for the policy rules, which version -- what it held, and
  which review items leaned on each record. The body of the side panel; the
  panel's header carries the input's name and condition.

  The file is the source of truth for the run. Where its records came from is
  provenance, shown as From, and nothing here offers to open a live system:
  there is none behind a fictional scenario.
*/
export function InputDetailView({
  detail,
  onNavigate,
  onClose,
}: {
  detail: InputDetail;
  // Opening a review item closes the panels the item would be hidden behind.
  onNavigate: () => void;
  onClose: () => void;
}) {
  const recordsHeading = useId();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const records = needle
    ? detail.records.filter((record) =>
        `${record.title} ${record.subject ?? ''} ${record.evidenceId}`
          .toLocaleLowerCase()
          .includes(needle),
      )
    : detail.records;
  const total = detail.records.length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5">
      {/* Flush under the panel's header, whose rule is its top edge. */}
      <Ledger className="border-rule-faint -mx-5 -mt-5 border-b">
        <LedgerRow label="File" className="px-5">
          <span className="value">{detail.file}</span>
        </LedgerRow>
        {detail.version ? (
          <LedgerRow label="Version" className="px-5">
            <span className="value">{detail.version}</span>
          </LedgerRow>
        ) : (
          <LedgerRow label="Observed" className="px-5">
            {detail.observedAtLabel}
          </LedgerRow>
        )}
        <LedgerRow label="Records" className="px-5">
          {total}
          {detail.unavailableCount > 0 ? (
            <span className="text-state-blocked">
              {' '}
              · {detail.unavailableCount} unavailable
            </span>
          ) : null}
        </LedgerRow>
        <LedgerRow label="Cited by" className="px-5">
          {detail.citedByCount}{' '}
          {detail.citedByCount === 1 ? 'review item' : 'review items'}
        </LedgerRow>
        {detail.checks.length > 0 ? (
          <LedgerRow label="Checks" className="px-5">
            {detail.checks.join(', ')}
          </LedgerRow>
        ) : null}
        <LedgerRow label="From" className="px-5">
          <span className="text-muted">{detail.sources.join(' · ')}</span>
        </LedgerRow>
      </Ledger>

      <button
        type="button"
        onClick={onClose}
        className="@sheet-narrow/sheet:hidden control-wash rounded-control text-meta text-muted interact:bg-surface-hover interact:text-primary w-fit cursor-pointer px-2 py-1"
      >
        Back to inputs
      </button>
      <section aria-labelledby={recordsHeading}>
        <div className="flex items-baseline justify-between gap-3 pb-1.5">
          <h3 id={recordsHeading} className="readout text-muted">
            Records <span className="value">{total}</span>
          </h3>
          <p className="text-meta text-muted">As read by this run</p>
        </div>
        {total > FILTER_FROM ? (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by product, SKU or evidence ID"
            aria-label="Filter records"
            className="field text-dense text-primary mt-1 mb-2 min-h-9 w-full px-3"
          />
        ) : null}
        <div>
          {records.map((record) => (
            <details key={record.evidenceId} className={DISCLOSURE}>
              <summary className={SUMMARY}>
                {record.unavailableReason !== null ? (
                  <Glyph
                    name="square"
                    size={10}
                    className="text-state-blocked self-center"
                  />
                ) : null}
                {record.title}
                {record.unavailableReason !== null ? (
                  <span className="sr-only">, unavailable</span>
                ) : null}
                {record.subject ? <span>{record.subject}</span> : null}
              </summary>
              <div className={`${DISCLOSURE_BODY} grid gap-3`}>
                {record.unavailableReason !== null ? (
                  <p className="text-state-blocked">
                    Unavailable. {record.unavailableReason}
                  </p>
                ) : null}
                {record.text !== null ? (
                  <figure className="grid gap-1">
                    <blockquote className="border-rule-default text-primary border-l-2 pl-3">
                      {record.text}
                    </blockquote>
                    {record.untrusted ? (
                      <figcaption className="readout text-muted">
                        Untrusted evidence · read, never followed
                      </figcaption>
                    ) : null}
                  </figure>
                ) : null}
                {record.fields.length > 0 ? (
                  <Ledger>
                    {record.fields.map((field) => (
                      <LedgerRow
                        key={field.label}
                        label={field.label}
                        className="px-0"
                      >
                        {field.value}
                      </LedgerRow>
                    ))}
                  </Ledger>
                ) : null}
                {record.citedBy.length > 0 ? (
                  <div className="grid gap-1.5">
                    <p className="text-meta text-muted">Cited by</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {record.citedBy.slice(0, CITED_SHOWN).map((item) => (
                        <li key={item.sku}>
                          <Link
                            href={`?sku=${item.sku}`}
                            scroll={false}
                            onClick={onNavigate}
                            aria-label={`Open review item ${item.label}`}
                            title={item.label}
                            className={CHIP}
                          >
                            {item.sku}
                          </Link>
                        </li>
                      ))}
                      {record.citedBy.length > CITED_SHOWN ? (
                        <li className="text-meta text-muted self-center">
                          and {record.citedBy.length - CITED_SHOWN} more
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : (
                  <p className="text-meta text-muted">
                    Not cited by any review item.
                  </p>
                )}
                <details>
                  <summary className="text-meta text-muted hover:text-primary w-fit cursor-pointer">
                    Raw record ·{' '}
                    <span className="value">{record.evidenceId}</span>
                  </summary>
                  <pre className="value text-micro bg-surface-inset rounded-control text-primary mt-2 overflow-x-auto p-3 leading-relaxed">
                    {record.raw}
                  </pre>
                </details>
              </div>
            </details>
          ))}
          {needle && records.length === 0 ? (
            <p className="text-dense text-muted py-3">
              No records match “{query}”.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Ledger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dl className={cx('@container', className)}>{children}</dl>;
}

function LedgerRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <div
      className={cx(
        'border-rule-faint grid gap-x-4 gap-y-1 border-b py-2 last:border-b-0 @md:grid-cols-[9rem_minmax(0,1fr)]',
        className,
      )}
    >
      <dt className="text-meta text-muted @md:pt-0.5">{label}</dt>
      <dd className="text-dense min-w-0">{children}</dd>
    </div>
  );
}
