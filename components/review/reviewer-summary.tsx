import { Button } from '@/components/ui/button';
import type { BatchPresentation } from '@/lib/review-presentation';

/*
  Reviewer decisions, distinct from proposal outcomes. In-flow, never sticky.
  All counts are static in this build and every action says so visibly.
*/
export function ReviewerSummary({
  reviewer,
  headingId,
}: {
  reviewer: BatchPresentation['reviewer'];
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="border-rule-strong bg-surface-inset border-t"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <h2 id={headingId} className="readout text-muted">
          Review progress
        </h2>
        <dl className="flex flex-wrap gap-x-5 gap-y-1">
          <Count label="Approved" value={reviewer.approved} />
          <Count label="Held" value={reviewer.held} />
          <Count label="Rejected" value={reviewer.rejected} />
          <Count label="Pending" value={reviewer.pending} />
        </dl>
        <div className="flex flex-wrap gap-3 @3xl:ml-auto">
          <Button isDisabled>Review omissions</Button>
          <Button variant="primary" isDisabled>
            Commit approved changes
          </Button>
        </div>
      </div>
      <p className="text-meta text-muted px-4 pb-3">
        This replay is read-only. Review actions arrive in a later build.
      </p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="value text-dense">{value}</dd>
      <dt className="text-meta text-muted">{label}</dt>
    </div>
  );
}
