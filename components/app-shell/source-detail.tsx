'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button as AriaButton } from 'react-aria-components';
import {
  DISCLOSURE,
  DISCLOSURE_BODY,
  SUMMARY,
} from '@/components/review/review-item-detail';
import { Glyph } from '@/components/ui/glyph';
import { Ledger, LedgerRow } from '@/components/ui/ledger';
import type { SourceDetail } from '@/lib/process/source-details';
import { RemoveSourceDialog } from './source-connections';

// A filter earns its place once the records outrun a glance.
const FILTER_FROM = 8;
// Cited-by links shown before the rest collapse into a count. A note about the
// whole campaign is cited by every item, and 27 chips say less than a number.
const CITED_SHOWN = 8;

const CHIP =
  'value control-wash border-rule-default text-muted hover:bg-surface-inset hover:text-primary focus-visible:bg-surface-inset focus-visible:text-primary inline-flex min-h-7 items-center rounded-full border px-2 text-meta';

/*
  One read system, as this run read it: the file it came from, when, what it
  held, and which review items leaned on each record. The body of the side
  panel; the panel's header carries the source's name and state.

  What this view never offers is a link to the live system. The scenario is
  fictional, and a link that opened nothing -- or opened today's values under
  a heading about the run's -- would be worse than saying so.
*/
export function SourceDetailView({
  detail,
  onNavigate,
  onRemove,
}: {
  detail: SourceDetail;
  // Opening a review item closes the panels the item would be hidden behind.
  onNavigate: () => void;
  // Absent where the process's connections cannot be changed.
  onRemove?: () => void;
}) {
  const [removing, setRemoving] = useState(false);
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
        <LedgerRow label="Observed" className="px-5">
          {detail.observedAtLabel}
        </LedgerRow>
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
        <LedgerRow label="Live system" className="px-5">
          <span className="text-muted">
            None. Fictional scenario data, so there is nothing to open.
          </span>
        </LedgerRow>
      </Ledger>

      {onRemove ? (
        <div className="-mt-2 flex justify-end">
          <AriaButton
            onPress={() => setRemoving(true)}
            className="control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary rounded-control text-meta -mx-1.5 inline-flex min-h-8 cursor-pointer items-center px-1.5"
          >
            Remove from process
          </AriaButton>
          <RemoveSourceDialog
            isOpen={removing}
            onOpenChange={setRemoving}
            detail={detail}
            onRemove={onRemove}
          />
        </div>
      ) : null}

      <section aria-labelledby="source-records">
        <div className="flex items-baseline justify-between gap-3 pb-1.5">
          <h3 id="source-records" className="readout text-muted">
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
            className="text-dense text-primary placeholder:text-muted border-rule-default bg-surface-inset rounded-control mt-1 mb-2 min-h-9 w-full border px-3"
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
