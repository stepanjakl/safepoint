import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PopoverEdge } from './popover-edge';

/*
  Development only: the popover and tooltip as they ship, beside each with an
  outer line just outside the border.
*/
export default function PopoverEdgeWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Popover edge</h1>
        <p className="text-meta text-muted max-w-3xl">
          The popover and tooltip as they ship, beside an outer line with and
          without the inner highlight, and the chosen pair of those by theme.
          The popover sits on the plain surface, the tooltip over text. Switch
          theme from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <PopoverEdge />
    </main>
  );
}
