import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProcessIcons } from './process-icons';

/*
  Development only: candidate icon pairs for a process's evaluation in the
  sidebar -- checked by rules (deterministic) or the model's judgement
  (non-deterministic). The pair chosen moves into the sidebar's MENU_ICONS.
*/
export default function ProcessIconsWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Process icons</h1>
        <p className="text-meta text-muted max-w-3xl">
          One pair per option, in the row&rsquo;s leading rail cell at the
          menu&rsquo;s icon size: the first row is checked by rules, the second
          the model&rsquo;s judgement, both named alike. Outline at rest, filled
          as the current row. Switch theme from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <ProcessIcons />
    </main>
  );
}
