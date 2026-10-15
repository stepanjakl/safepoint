import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ISOMETRIC_FIGURES,
  IsometricIllustration,
  type IsometricName,
} from '@/components/ui/isometric-illustration';
import {
  STATE_ILLUSTRATIONS,
  StateIllustration,
  type StateIllustrationName,
} from '@/components/ui/state-illustration';
import { EmptyState } from '@/components/ui/working-mark';
import { LoaderTiming } from './loader-timing';
import { ObjectViews } from './object-views';

const NOTES: Record<StateIllustrationName, string> = {
  outline: 'The lockup undone to its outline, a point at its turning centre.',
  isometric:
    'The outline laid on the isometric ground, as thick as its slot is wide.',
  rolled:
    'The isometric solid, turned 30° anticlockwise, centred on where its area balances.',
};

export default function StatesWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-8 p-6"
    >
      <header className="grid gap-2">
        <Link className="text-meta text-muted underline" href="/workbench">
          Colour reference
        </Link>
        <h1 className="text-display font-semibold">State illustrations</h1>
        <p className="text-body text-muted max-w-prose">
          Candidates for the empty run page, drawn at 96px (line) and 128px
          (isometric) on the pane face they sit on.
        </p>
      </header>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        {(Object.keys(STATE_ILLUSTRATIONS) as StateIllustrationName[]).map(
          (name) => (
            <li
              key={name}
              className="bg-surface-primary grid justify-items-center gap-4 rounded-lg p-8 text-center"
            >
              <StateIllustration name={name} className="text-muted" />
              <div className="grid gap-1">
                <h2 className="text-body font-medium">{name}</h2>
                <p className="text-meta text-muted text-balance">
                  {NOTES[name]}
                </p>
              </div>
            </li>
          ),
        )}
      </ul>
      <div className="grid gap-2">
        <h2 className="text-title font-medium">
          The isometric outline, turned
        </h2>
        <p className="text-body text-muted max-w-prose">
          The same solid in any parallel view: curves exact, hidden lines
          removed, checked against ray casting in{' '}
          <span className="value">extrusion.test.ts</span>.
        </p>
      </div>
      <ObjectViews />
      <div className="grid gap-2">
        <h2 className="text-title font-medium">Empty states</h2>
        <p className="text-body text-muted max-w-prose">
          A panel with nothing to show yet, centred in its room: the working
          mark while it loads, the isometric solid once there is nothing, and
          the rolled one beside it for comparison.
        </p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-4">
        <li className="bg-surface-primary flex h-96 flex-col rounded-lg px-6">
          <EmptyState role="status" loading title="Loading the rulebook…" />
        </li>
        <li className="bg-surface-primary flex h-96 flex-col rounded-lg px-6">
          <EmptyState role="status" title="Nothing is accepted yet.">
            A run&rsquo;s Rules step is where the rules for instructions{' '}
            <span className="value">v2</span> are drafted and accepted.
          </EmptyState>
        </li>
        <li className="bg-surface-primary flex h-96 flex-col rounded-lg px-6">
          <EmptyState
            role="status"
            title="Nothing is accepted yet."
            illustration="rolled"
          >
            A run&rsquo;s Rules step is where the rules for instructions{' '}
            <span className="value">v2</span> are drafted and accepted.
          </EmptyState>
        </li>
      </ul>
      <div className="grid gap-2">
        <h2 className="text-title font-medium">Loader timing</h2>
        <p className="text-body text-muted max-w-prose">
          A load replayed at different reply times, so the wait, the minimum and
          the slow message can be felt rather than read.
        </p>
      </div>
      <LoaderTiming />
      <h2 className="text-title font-medium">Isometric</h2>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        {(Object.keys(ISOMETRIC_FIGURES) as IsometricName[]).map((name) => (
          <li
            key={name}
            className="bg-surface-primary grid justify-items-center gap-4 rounded-lg p-8 text-center"
          >
            <IsometricIllustration name={name} className="size-32" />
            <h3 className="text-body font-medium">{name}</h3>
          </li>
        ))}
      </ul>
    </main>
  );
}
