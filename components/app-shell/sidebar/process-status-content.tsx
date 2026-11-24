import type { ProcessNavigationItem } from '@/lib/shell/navigation';
import { cx } from '@/lib/ui/cx';

/*
  Unused since the process row's tag counts live runs instead: the tooltip
  that summed up a process's latest plan. Kept on /workbench/unused until a
  person decides it goes.

  One tone scale, two shapes: the summary pill and the four count cells read
  the same map, so a tone cannot mean one colour in one and another in the
  other. The 8% wash is what the tone's own text colour is legible on.

*/
const TONE_CHIP: Record<
  ProcessNavigationItem['status']['tone'] | 'neutral',
  string
> = {
  blocked: 'text-state-blocked bg-state-blocked/8',
  caution: 'text-state-caution bg-state-caution/8',
  verified: 'text-state-verified bg-state-verified/8',
  neutral: 'text-muted bg-surface-inset',
};

export function ProcessStatusContent({
  status,
}: {
  status: ProcessNavigationItem['status'];
}) {
  const counts = [
    ['blocked', 'Blocked', status.counts.blocked],
    ['caution', 'Needs a decision', status.counts.needs_decision],
    ['neutral', 'Deferred', status.counts.deferred],
    ['verified', 'Ready for review', status.counts.will_apply],
  ] as const;

  return (
    <div className="grid gap-2.5">
      <div className="text-muted text-micro mt-0.5 flex justify-between gap-2.5">
        <span>Latest available run</span>
        <span>{status.totalLabel}</span>
      </div>
      <span
        className={cx(
          TONE_CHIP[status.tone],
          'text-micro justify-self-start rounded-full px-2 py-0.75 font-semibold',
        )}
      >
        {status.label}
      </span>
      <dl className="grid grid-cols-2 gap-1.25">
        {counts.map(([tone, label, count]) => (
          <div
            key={tone}
            className={cx(
              TONE_CHIP[tone],
              'rounded-section flex items-center justify-between gap-2 px-2 py-1.5',
            )}
          >
            <dt className="text-micro">{label}</dt>
            <dd className="text-meta [font-weight:650] tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-rule-faint flex items-start gap-2 border-t pt-2.25">
        <span className="bg-state-advisory/10 text-state-advisory text-micro rounded-section px-1.25 py-0.5 font-semibold">
          {status.modeLabel}
        </span>
        <p className="text-muted text-micro">{status.modeDescription}</p>
      </div>
    </div>
  );
}
