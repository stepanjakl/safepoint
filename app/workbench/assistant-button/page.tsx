import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AssistantButtonOptions } from './assistant-button';

/*
  Development only: ways for the assistant's notch button to say the panel is
  open, once the panel no longer has a heading and close button of its own.
*/
export default function AssistantButtonWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Assistant button</h1>
        <p className="text-meta text-muted max-w-3xl">
          The notch button closed and open, in each candidate colour. Each
          sample is a real header notch; press one to toggle it, and hover to
          see its pointer state. Cyan is already the accent and iris already
          means awaiting review, so the hues here keep away from both. Switch
          theme from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <AssistantButtonOptions />
    </main>
  );
}
