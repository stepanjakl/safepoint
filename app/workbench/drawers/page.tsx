import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DrawerWorkbench } from './workbench';

export default function DrawersWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Drawers</h1>
        <p className="text-meta text-muted max-w-3xl">
          The shared drawer components, with configurations side by side and a
          live overlay. Switch theme and neutral family from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
          {' · '}
          <Link
            className="underline underline-offset-4"
            href="/workbench/controls"
          >
            Control states
          </Link>
        </p>
      </header>
      <DrawerWorkbench />
    </main>
  );
}
