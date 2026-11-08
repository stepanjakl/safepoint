import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LoadingGallery } from './loading-gallery';

export default function LoadingWorkbenchPage() {
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
        <h1 className="text-display font-semibold">Loading states</h1>
        <p className="text-body text-muted max-w-prose">
          Every wait the app still shows as plain words, as it is drawn now and
          as it would be. A panel waiting for its content takes the working mark
          in the room it leaves; a smaller wait takes the same mark at text size
          beside its words. Both go through the loader&rsquo;s timing, so a
          quick reply never flickers.
        </p>
      </header>
      <LoadingGallery />
    </main>
  );
}
