import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShellPageTransitionProvider } from '@/components/app-shell/shell-page-transition';
import { loadReviewedReplay } from '@/lib/promotion-release';
import { promotionProcess } from '@/lib/process/placeholder-process';
import { presentPromotionInputs } from '@/lib/process/system-links';

import { ControlsGallery } from '../controls-gallery';

/*
  Development only: every control in every interaction state at once, pinned
  rather than hovered, so a face can be compared across its states without
  reaching each one by hand. The visual baseline records this page too.
*/
export default function ControlsWorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const inputs = presentPromotionInputs(loadReviewedReplay());

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Control states</h1>
        <p className="text-meta text-muted max-w-3xl">
          The real components, each state pinned. Switch theme and neutral
          family from the design pane.{' '}
          <Link className="underline underline-offset-4" href="/workbench">
            Colour reference
          </Link>
        </p>
      </header>
      <ShellPageTransitionProvider processPaths={[]}>
        <ControlsGallery process={promotionProcess} inputs={inputs} />
      </ShellPageTransitionProvider>
    </main>
  );
}
