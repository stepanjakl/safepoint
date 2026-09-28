import Link from 'next/link';
import { notFound } from 'next/navigation';

import { loadReviewedReplay } from '@/lib/promotion-release';
import { promotionProcess } from '@/lib/process/placeholder-process';
import { presentRunFacts } from '@/lib/process/run-lifecycle';
import { presentPromotionInputs } from '@/lib/process/system-links';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';

import { RunWorkbench } from './run-player';

/*
  Development only: the promotion run at every stage of its lifecycle, one
  column each, and above them a player that steps one thread through the
  stages so the folding and the marker can be watched rather than inferred.
  Drawn as a live run, so the actions replay cannot offer are visible.
*/
export default function RunWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const replay = loadReviewedReplay();
  const plan = { ...presentPromotionPlan(replay), mode: 'live' as const };
  const inputs = presentPromotionInputs(replay);
  const thread = {
    facts: presentRunFacts(
      replay,
      plan,
      inputs,
      promotionProcess.outputs.length,
    ),
    plan,
    inputs,
    outputs: promotionProcess.outputs,
    analysis: promotionProcess.analysis,
    requestLabel: 'Thu 4 Sep · 09:00',
  };

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Run lifecycle</h1>
        <p className="text-meta text-muted max-w-3xl">
          The promotion run at each stage, as a live run. Only the steps that
          have started are drawn, and only the latest, a running or a stopped
          step is open.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <RunWorkbench thread={thread} />
    </main>
  );
}
