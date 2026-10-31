import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DraftProgress } from './draft-progress';
import { sampleDraft } from './sample';

/*
  Development only: ways to show a rulebook being drafted, each drawn with the
  real card on the frozen rulebook the browser tests use, and all moved through
  one scripted draft. Everything is simulated here: no model, no route, no file.
*/
export default function DraftProgressWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const { set, names } = sampleDraft();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh grid-cols-1 content-start gap-6 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Draft progress</h1>
        <p className="text-meta text-muted max-w-3xl">
          Ways for the Rules step to say how a draft is going, on one scripted
          draft of five rules. The cards, pills and dots are the real ones, and
          their buttons do nothing here. The dots already count only rules a
          person can act on. The intent card above the rules and the draft setup
          are left out, as no option changes them.{' '}
          <Link className="underline underline-offset-4" href="/workbench/run">
            On the thread step
          </Link>
          {' · '}
          Switch theme from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <DraftProgress set={set} names={names} />
    </main>
  );
}
