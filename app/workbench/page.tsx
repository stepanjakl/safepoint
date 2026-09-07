import { notFound } from 'next/navigation';

import { ReviewWorkspace } from '@/components/review/review-workspace';
import { Button } from '@/components/ui/button';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam, presentReview } from '@/lib/review-presentation';
import {
  MONO_CHOICE_LABELS,
  MONO_CHOICES,
  TYPEFACE_SET_LABELS,
  TYPEFACE_SETS,
} from '@/lib/typography';

/*
  Protected comparison page: the implemented workspace in light and dark at
  wide and narrow widths, plus the optical-rim intensities and the candidate
  typeface sets. Development only unless SAFEPOINT_WORKBENCH=enabled.
*/
export default async function WorkbenchPage({
  searchParams,
}: PageProps<'/workbench'>) {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.SAFEPOINT_WORKBENCH !== 'enabled'
  ) {
    notFound();
  }

  const presentation = presentReview(loadReviewedReplay());
  const sku = parseSkuParam((await searchParams).sku) ?? 'ALD-0025';
  const themes = ['light', 'dark'] as const;

  return (
    <div className="space-y-10 p-6">
      <div>
        <h1 className="text-display font-semibold">Workbench</h1>
        <p className="text-dense text-muted mt-1">
          The review workspace in both themes at wide and 390px widths. Add
          ?sku= to select a different line in every frame. Forced colours and
          reduced motion are checked with browser rendering emulation.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="readout text-muted">typeface sets</h2>
        <p className="text-dense text-muted">
          The three semantic roles under each candidate. data-typeface resolves
          per subtree, so these are the real families, not a mock-up. The
          floating control switches the whole page; ?font= links one choice.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {TYPEFACE_SETS.map((set) => (
            <div
              key={set}
              data-typeface={set}
              className="border-rule-default bg-surface-primary space-y-3 border p-4"
            >
              <p className="readout text-muted">{TYPEFACE_SET_LABELS[set]}</p>
              <p className="text-display font-display font-semibold">
                Fresh Food Weekend
              </p>
              <p className="text-body">
                Salmon fillets hold at £6.50 — supplier funding covers the
                shortfall, so the margin floor is not breached.
              </p>
              <p className="value text-dense">£6.50 · −12.5% · 1,408 units</p>
              <p className="readout text-muted">held · simulated · ALD-0025</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="readout text-muted">utility role</h2>
        <p className="text-dense text-muted">
          Every candidate for the tabular role, all against Inter so only the
          utility family changes. The readout line is what the role mostly
          carries: short English labels in tracked uppercase, not code.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONO_CHOICES.filter((choice) => choice !== 'match').map((choice) => (
            <div
              key={choice}
              data-typeface="inter"
              data-mono={choice}
              className="border-rule-default bg-surface-primary space-y-2 border p-4"
            >
              <p className="text-meta text-muted">
                {choice} — {MONO_CHOICE_LABELS[choice]}
              </p>
              <p className="readout text-muted">
                policy result · held · simulated
              </p>
              <p className="value text-dense">
                £6.50 · −12.5% · 1,408 · ALD-0025
              </p>
              <p
                className="value text-dense"
                style={{ fontWeight: 'var(--sp-mono-weight-strong)' }}
              >
                0123456789 · 09:41 UTC
              </p>
            </div>
          ))}
        </div>
      </section>

      {themes.map((theme) => (
        <section key={theme} data-theme={theme} className="space-y-6">
          <h2 className="readout text-muted">{theme} · wide</h2>
          <div className="border-rule-strong bg-canvas text-primary border">
            <ReviewWorkspace presentation={presentation} initialSku={sku} />
          </div>
          <h2 className="readout text-muted">{theme} · 390px</h2>
          <div className="border-rule-strong bg-canvas text-primary w-[390px] border">
            <ReviewWorkspace presentation={presentation} initialSku={sku} />
          </div>
          <h2 className="readout text-muted">
            {theme} · optical rim intensity
          </h2>
          <div className="border-rule-strong bg-canvas text-primary flex flex-wrap items-center gap-6 border p-6">
            {[0.4, 0.7, 1].map((strength) => (
              <div key={strength} className="space-y-2">
                <Button
                  variant="primary"
                  style={{ '--edge-strength': strength } as React.CSSProperties}
                >
                  Commit approved changes
                </Button>
                <p className="readout text-muted">strength {strength}</p>
              </div>
            ))}
            <div className="space-y-2">
              <Button>Review omissions</Button>
              <p className="readout text-muted">secondary · level 1</p>
            </div>
            <div className="space-y-2">
              <Button variant="primary" isDisabled>
                Commit approved changes
              </Button>
              <p className="readout text-muted">disabled · flat</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
