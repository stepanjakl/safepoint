import type { BatchPresentation } from '@/lib/review-presentation';

export function AppHeader({
  batch,
  headingId,
}: {
  batch: BatchPresentation;
  headingId: string;
}) {
  return (
    <header className="border-rule-strong bg-surface-primary border-b">
      <div className="flex min-h-12 flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
        <span className="text-dense font-semibold tracking-tight">
          Safepoint
        </span>
        <span aria-hidden="true" className="bg-rule-default h-4 w-px" />
        <h1
          id={headingId}
          tabIndex={-1}
          className="text-display focus-visible:outline-focus font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid"
        >
          {batch.title}
        </h1>
        <dl className="readout text-muted ml-auto flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-2">
            <dt>Mode</dt>
            <dd className="text-primary">
              Replay · fixture {batch.fixtureVersion}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt>Review time</dt>
            <dd className="text-primary">{batch.reviewedAtLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Label production</dt>
            <dd className="text-primary">
              {batch.remainingLabel} remaining · {batch.labelDeadlineLabel}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
