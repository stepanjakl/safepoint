import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DecisionTransitions } from './transitions';

export default function DecisionWorkbenchPage() {
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
        <h1 className="text-display font-semibold">Decision transitions</h1>
        <p className="text-body text-muted max-w-prose">
          Try each action. The pressed control stays in place while its label
          morphs and its face settles into a status pill. Reset to compare them.
        </p>
      </header>
      <DecisionTransitions />
    </main>
  );
}
