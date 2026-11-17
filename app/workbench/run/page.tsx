import { notFound } from 'next/navigation';

import { sampleDraft } from '../draft-progress/sample';
import { brunchDirectScript } from './brunch-direct';
import { RunWorkbench } from './run-player';

/*
  Development only: a Brunch orders run with no rulebook at every stage of its
  lifecycle, from frozen fixtures, with a player that steps one thread through
  the stages so the folding and the marker can be watched rather than inferred,
  and the loading marks and a draft on a step beside it.
*/
export default function RunWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Run lifecycle</h1>
        <p className="text-meta text-muted max-w-3xl">
          A Brunch orders run at each stage. Only the steps that have started
          are drawn, and only the latest, a running or a stopped step is open.{' '}
          <a className="underline underline-offset-4" href="#thread-progress">
            A draft on the step
          </a>{' '}
          ·{' '}
          <a className="underline underline-offset-4" href="#player">
            Player
          </a>
        </p>
      </header>
      <RunWorkbench draft={sampleDraft()} brunch={brunchDirectScript()} />
    </main>
  );
}
