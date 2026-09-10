import type { ReviewDetail } from '@/lib/review/contracts';
import { DeltaValue } from './delta';

/*
  The disclosure stack. Each `<details>` is a rule with a mono +/- in the
  gutter, which is a pseudo element on the summary and so stays in CSS; the
  `disclosure` class is that hook. Everything the markup can hold is here.
*/
const DISCLOSURE = 'disclosure border-rule-faint border-b';
const SUMMARY =
  'flex min-h-12 cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 py-3.5 text-[13px] [&>span]:text-muted [&>span]:ml-auto [&>span]:text-[12px]';
const DISCLOSURE_BODY = 'pb-5 pl-[22px] text-[13px] leading-[1.6]';
// Each record inside a disclosure is a jump target for an evidence link, so it
// keeps a scroll margin of its own.
const RECORD = 'mt-5 scroll-mt-6 [&>h4]:mb-1 [&>h4]:[font-weight:550]';

export function ReviewItemDetail({
  detail,
  idPrefix,
}: {
  detail: ReviewDetail;
  idPrefix: string;
}) {
  return (
    <div className="px-8 pb-7 [overflow-wrap:anywhere] @max-3xl/review:px-5 @max-3xl/review:pb-6">
      <div
        className="border-state-advisory data-[disposition=blocked]:border-state-blocked data-[disposition=needs_decision]:border-state-caution group/conclusion border-l-2 pl-4 [&>p:not(:first-child)]:text-[13px] [&>p:not(:first-child)]:leading-[1.6]"
        data-disposition={detail.disposition}
      >
        <p className="group-data-[disposition=blocked]/conclusion:text-state-blocked group-data-[disposition=needs_decision]/conclusion:text-state-caution mb-2 flex items-baseline gap-2 text-[15px] [font-weight:550]">
          <span aria-hidden="true">
            {detail.disposition === 'blocked'
              ? '⊘'
              : detail.disposition === 'needs_decision'
                ? '!'
                : detail.disposition === 'deferred'
                  ? '⏸'
                  : '✓'}
          </span>
          {detail.conclusion}
        </p>
        <p>{detail.explanation}</p>
        <p className="mt-3">
          <strong className="block [font-weight:550]">Next step</strong>{' '}
          {detail.nextAction}
        </p>
      </div>

      <section className="mt-7" aria-labelledby={`${idPrefix}-changes`}>
        <h3
          id={`${idPrefix}-changes`}
          className="border-rule-default border-b pb-3 text-[14px] [font-weight:550] [&>span]:ml-2 [&>span]:font-mono [&>span]:text-[12px]"
        >
          Proposed changes{' '}
          <span className="text-muted font-normal">{detail.deltas.length}</span>
        </h3>
        {detail.deltas.length ? (
          // The card shows the leading change and says how many it omits; the
          // detail pane is where every change is accounted for.
          <dl>
            {detail.deltas.map((delta) => (
              <div
                key={delta.label}
                className="border-rule-faint grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-2 border-b py-3.5 @max-3xl/review:grid-cols-[minmax(0,1fr)]"
              >
                <dt className="text-[13px]">{delta.label}</dt>
                <dd>
                  <DeltaValue delta={delta} expanded />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted">No changes are proposed for this item.</p>
        )}
      </section>

      <div className="mt-6">
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Supporting facts <span>{detail.facts.length}</span>
          </summary>
          <dl className="pb-4 pl-[22px] text-[13px] [&_dt]:mb-1 [&_dt]:[font-weight:550] [&>div]:mb-4">
            {detail.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  <span className="value">{fact.value}</span>
                  {fact.note ? (
                    <p className="text-meta text-muted mt-1">{fact.note}</p>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Policy findings <span>{detail.findings.length} recorded</span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            <p className="text-meta text-muted">
              Recorded policy replay. These findings are separate from the
              agent’s assessments.
            </p>
            {detail.findings.length ? (
              detail.findings.map((finding) => (
                <div key={finding.id} className={RECORD}>
                  <h4>{finding.title}</h4>
                  <p>{finding.explanation}</p>
                  <EvidenceLinks
                    ids={finding.evidenceIds}
                    detail={detail}
                    prefix={idPrefix}
                  />
                </div>
              ))
            ) : (
              <p>No policy findings recorded.</p>
            )}
          </div>
        </details>
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Agent readiness checks <span>{detail.checks.length}</span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            <p className="text-meta text-muted">
              {detail.checkSummary}. Requirements come from the policy replay.
            </p>
            {detail.checks.map((check) => (
              <div key={check.id} className={RECORD}>
                <h4>
                  {check.label}{' '}
                  <span className="text-muted font-normal">
                    · {check.obligation}
                  </span>
                </h4>
                <p
                  className={
                    check.result === 'failed' ||
                    check.result === 'evidence_unavailable'
                      ? 'text-state-blocked'
                      : ''
                  }
                >
                  {check.resultLabel}
                </p>
                <p>{check.explanation}</p>
                <EvidenceLinks
                  ids={check.evidenceIds}
                  detail={detail}
                  prefix={idPrefix}
                />
              </div>
            ))}
          </div>
        </details>
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Agent recommendation <span>{detail.agent.recommendation}</span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            <p>{detail.agent.rationale}</p>
            {detail.agent.uncertainties.length ? (
              <>
                <h4 className="mt-4">Recorded uncertainty</h4>
                <ul className="list-disc pl-5">
                  {detail.agent.uncertainties.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </details>
        <details className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Affected systems{' '}
            <span>{detail.effects.length} intended · none executed</span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            <p className="text-meta text-muted">
              Proposed destinations only. Execution order and current target
              values have not been verified.
            </p>
            {detail.effects.length ? (
              <ul>
                {detail.effects.map((effect) => (
                  <li key={effect.id} className={RECORD}>
                    <h4>{effect.destination}</h4>
                    <p className="text-meta text-muted">
                      {effect.modeLabel} · Not executed
                    </p>
                    <p className="mt-1">
                      Recovery if applied: {effect.recovery}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No effects proposed.</p>
            )}
          </div>
        </details>
        <details id={`${idPrefix}-sources`} className={DISCLOSURE}>
          <summary className={SUMMARY}>
            Evidence and provenance <span>{detail.sources.length} sources</span>
          </summary>
          <div className={DISCLOSURE_BODY}>
            {detail.narrative ? (
              <div className={RECORD}>
                <h4>Narrative note · untrusted evidence</h4>
                <blockquote>“{detail.narrative.text}”</blockquote>
                <p className="text-meta text-muted mt-1">
                  {detail.narrative.source}
                </p>
              </div>
            ) : null}
            {detail.sources.map((source) => (
              <section
                key={source.id}
                id={`${idPrefix}-source-${source.id}`}
                tabIndex={-1}
                className={RECORD}
              >
                <h4>{source.label}</h4>
                <p className="text-meta text-muted">
                  {source.observedAt} ·{' '}
                  <span className="value">{source.id}</span>
                </p>
                <ul className="mt-2 list-disc pl-5">
                  {source.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function EvidenceLinks({
  ids,
  detail,
  prefix,
}: {
  ids: string[];
  detail: ReviewDetail;
  prefix: string;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center [&_a]:underline [&_a]:underline-offset-[3px]">
      {ids.map((id) => {
        const source = detail.sources.find((entry) => entry.id === id);
        return source ? (
          <li key={id}>
            <a
              href={`#${prefix}-source-${id}`}
              onClick={(event) => {
                event.preventDefault();
                const disclosure = document.getElementById(`${prefix}-sources`);
                if (disclosure instanceof HTMLDetailsElement)
                  disclosure.open = true;
                document.getElementById(`${prefix}-source-${id}`)?.focus();
              }}
            >
              {source.label}
              <span aria-hidden="true"> ↗</span>
            </a>
          </li>
        ) : null;
      })}
    </ul>
  );
}
