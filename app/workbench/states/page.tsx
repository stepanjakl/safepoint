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

const NOTES: Record<StateIllustrationName, string> = {
  outline: 'The lockup undone to its outline, a point at its turning centre.',
  checkpoint: 'Three steps on a ring; the one at 12 o’clock is checked.',
  seal: 'The dashed ring the app already uses for "not yet", lobes inside.',
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
              <StateIllustration name={name} className="text-muted size-24" />
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
