import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ButtonRounding } from './button-rounding';

/*
  Development only: the real text buttons at candidate radii, beside the tabs
  and status pills they should read apart from. The option that wins moves into
  Button; slanted buttons and the header's icon circles are not in question.
*/
export default function ButtonRoundingWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Button rounding</h1>
        <p className="text-meta text-muted max-w-3xl">
          Text buttons with corners, so fully round is left to tabs and
          statuses. Each option applies to every text button at its existing
          size; the buttons and tabs are live. Switch theme from the design
          pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <ButtonRounding />
    </main>
  );
}
