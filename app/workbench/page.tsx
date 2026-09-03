import { notFound } from 'next/navigation';

import { ReviewWorkspace } from '@/components/review/review-workspace';
import { Button } from '@/components/ui/button';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam, presentReview } from '@/lib/review-presentation';

/*
  Protected comparison page: the implemented workspace in light and dark at
  wide and narrow widths, plus the optical-rim intensities. Development only
  unless SAFEPOINT_WORKBENCH=enabled.
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
