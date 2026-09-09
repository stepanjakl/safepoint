import type { ReviewDetail } from '@/lib/review/contracts';
import { DeltaValue } from './delta';

export function ReviewItemDetail({
  detail,
  idPrefix,
}: {
  detail: ReviewDetail;
  idPrefix: string;
}) {
  return (
    <div className="review-item-content">
      <div className="review-conclusion" data-disposition={detail.disposition}>
        <p className="review-conclusion-title">
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
        <p className="review-next-action">
          <strong>Next step</strong> {detail.nextAction}
        </p>
      </div>

      <section
        className="review-changes"
        aria-labelledby={`${idPrefix}-changes`}
      >
        <h3 id={`${idPrefix}-changes`}>
          Proposed changes{' '}
          <span className="text-muted font-normal">{detail.deltas.length}</span>
        </h3>
        {detail.deltas.length ? (
          // The card shows the leading change and says how many it omits; the
          // detail pane is where every change is accounted for.
          <dl>
            {detail.deltas.map((delta) => (
              <div key={delta.label} className="review-change">
                <dt>{delta.label}</dt>
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

      <div className="review-disclosures">
        <details>
          <summary>
            Supporting facts <span>{detail.facts.length}</span>
          </summary>
          <dl className="review-facts">
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
        <details>
          <summary>
            Policy findings <span>{detail.findings.length} recorded</span>
          </summary>
          <div className="review-disclosure-body">
            <p className="text-meta text-muted">
              Recorded policy replay. These findings are separate from the
              agent’s assessments.
            </p>
            {detail.findings.length ? (
              detail.findings.map((finding) => (
                <div key={finding.id} className="review-record">
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
        <details>
          <summary>
            Agent readiness checks <span>{detail.checks.length}</span>
          </summary>
          <div className="review-disclosure-body">
            <p className="text-meta text-muted">
              {detail.checkSummary}. Requirements come from the policy replay.
            </p>
            {detail.checks.map((check) => (
              <div key={check.id} className="review-record">
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
        <details>
          <summary>
            Agent recommendation <span>{detail.agent.recommendation}</span>
          </summary>
          <div className="review-disclosure-body">
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
        <details>
          <summary>
            Affected systems{' '}
            <span>{detail.effects.length} intended · none executed</span>
          </summary>
          <div className="review-disclosure-body">
            <p className="text-meta text-muted">
              Proposed destinations only. Execution order and current target
              values have not been verified.
            </p>
            {detail.effects.length ? (
              <ul>
                {detail.effects.map((effect) => (
                  <li key={effect.id} className="review-record">
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
        <details id={`${idPrefix}-sources`}>
          <summary>
            Evidence and provenance <span>{detail.sources.length} sources</span>
          </summary>
          <div className="review-disclosure-body">
            {detail.narrative ? (
              <div className="review-record">
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
                className="review-record"
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
    <ul className="review-evidence-links">
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
