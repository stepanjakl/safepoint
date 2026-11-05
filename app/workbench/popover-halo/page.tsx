import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PopoverHalo } from './popover-halo';

/*
  Development only: a feathered backdrop blur around the popover in place of a
  cast shadow, at candidate sizes, over text and over an empty surface.
*/
export default function PopoverHaloWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Popover halo</h1>
        <p className="text-meta text-muted max-w-3xl">
          A blur around the popover instead of a shadow. Each sample straddles
          text and an empty surface, because a blur only shows where there is
          something behind it. The live popovers below open the real way. Switch
          theme from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <PopoverHalo />
    </main>
  );
}
