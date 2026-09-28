import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DeltaRow } from '@/components/review/delta';
import { ReviewWorkspace } from '@/components/review/review-workspace';
import { StatusLabel, type Tone } from '@/components/ui/status-label';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { parseSkuParam, presentReview } from '@/lib/review-presentation';
import { presentPromotionDetail } from '@/lib/review/promotion-adapter';

const TONES: Tone[] = [
  'neutral',
  'advisory',
  'verified',
  'caution',
  'decision',
  'blocked',
  'unavailable',
  'live',
  'simulated',
  'preview',
];

/*
  Development only: the Stage 1B static review workspace, which no route of the
  app renders since the shell's review surface replaced it, and two primitives
  nothing else renders. Kept here, on the
  replay it was built for, so it can be judged by eye before it is kept or
  removed. Switch theme and neutral family from the design pane.
*/
export default async function ReviewWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const replay = loadReviewedReplay();
  const presentation = presentReview(replay);
  const sku = parseSkuParam((await searchParams).sku) ?? 'ALD-0025';
  const line = replay.lines.find((candidate) => candidate.sku === sku);
  const deltas = line
    ? presentPromotionDetail(
        line,
        presentation.details[sku],
        presentation.batch.fixtureVersion,
      ).deltas
    : [];

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-6 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">
          Stage 1B review workspace
        </h1>
        <p className="text-meta text-muted max-w-3xl">
          Unused since the shell&rsquo;s review surface replaced it: the
          candidate list, line detail, evidence, readiness, verdict and effects
          rail, on the recorded replay, with two primitives nothing else
          renders.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <h2 className="readout text-muted">Wide</h2>
      <div className="border-rule-default border">
        <ReviewWorkspace presentation={presentation} initialSku={sku} />
      </div>
      <h2 className="readout text-muted">390px</h2>
      <div className="border-rule-default w-97.5 border">
        <ReviewWorkspace presentation={presentation} initialSku={sku} />
      </div>
      <h2 className="readout text-muted">
        Also unused: StatusLabel, in every tone
      </h2>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TONES.map((tone) => (
          <StatusLabel key={tone} tone={tone}>
            {tone}
          </StatusLabel>
        ))}
      </div>
      <h2 className="readout text-muted">
        Also unused: DeltaRow, on this line&rsquo;s deltas
      </h2>
      <div className="grid max-w-xl gap-2">
        {deltas.map((delta) => (
          <DeltaRow key={delta.label} delta={delta} />
        ))}
      </div>
    </main>
  );
}
