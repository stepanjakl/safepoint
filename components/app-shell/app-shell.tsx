import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import {
  PROCESS_ORDER_KEY,
  processNavigationItem,
} from '@/lib/shell/navigation';
import { processHref } from '@/lib/shell/routes';
import {
  brunchOrdersDirectPlan,
  brunchOrdersDirectProcess,
  brunchOrdersPlan,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import { ProcessMenu } from '@/components/app-shell/sidebar/process-menu';
import {
  ShellPageTransition,
  ShellPageTransitionProvider,
} from './shell-page-transition';
import { ResizableShell } from './resizable-shell';
import { WalkthroughProvider } from './walkthrough';

export async function AppShell({
  children,
  signedInAs = null,
  visitor = null,
}: {
  children: ReactNode;
  /** The name on the gate's cookie; null where there is no gate. */
  signedInAs?: string | null;
  /** The anonymous visitor's name and orb, shown when no one is signed in. */
  visitor?: { id: string; name: string; orb: number } | null;
}) {
  // The saved order, so the first paint already has the rows where the reader
  // left them rather than hydration moving them there.
  const savedOrder = (await cookies()).get(PROCESS_ORDER_KEY)?.value ?? null;
  // Only navigation summaries cross the client boundary, not the full plans.
  const items = [
    processNavigationItem({
      id: brunchOrdersDirectProcess.id,
      href: processHref(brunchOrdersDirectProcess.id),
      name: brunchOrdersDirectProcess.name,
      evaluation: brunchOrdersDirectProcess.evaluation,
      plan: brunchOrdersDirectPlan,
    }),
    processNavigationItem({
      id: brunchOrdersProcess.id,
      href: processHref(brunchOrdersProcess.id),
      name: brunchOrdersProcess.name,
      evaluation: brunchOrdersProcess.evaluation,
      plan: brunchOrdersPlan,
    }),
  ];
  return (
    <ShellPageTransitionProvider processPaths={items.map((item) => item.href)}>
      <WalkthroughProvider>
        <ResizableShell
          navigation={
            <ProcessMenu
              items={items}
              initialOrder={savedOrder}
              signedInAs={signedInAs}
              visitor={visitor}
            />
          }
          processes={items}
        >
          {/*
        A containing block for its descendants. Absolutely positioned content --
        every sr-only span among it -- otherwise resolves against the initial
        containing block, escapes the clipping here, and drags the document's
        scroll height out with it.

        The face is a layer behind the content rather than this element's own
        background. Its edge is a border, and a clip never reaches a border, so
        a notch in the content could not cover the edge it bites through. Here
        the clip is the whole box and the content steps in by the edge instead,
        so everything sits where it did and a notch can pull back over it.
        Clipped at every width, not only where the pane scrolls: the notch's
        canvas runs on to the pane's side.

        Square at the top right when a notch is in there: the notch paints
        that corner itself, and a rounded clip over it would leave the face's
        own anti-aliased corner showing through as a ghost.

        The inset is on a wrapper inside, not on this element. `inset-0` on an
        absolutely positioned child resolves against its containing block's
        *padding* box, so padding here moves the face in by exactly as much as
        it moves the content -- the two start on the same edge whatever the
        value, and the face's lit ring is under the content at every setting.
        With the inset one level down, the face keeps the whole box and the
        content alone steps in, past the ring rather than onto it.
      */}
          <div className="ground-raised rounded-shell shell:h-full shell:overflow-hidden relative isolate min-w-0 overflow-clip has-[.notch]:rounded-tr-none">
            <div
              aria-hidden="true"
              className="control-face surface-raised rounded-shell pointer-events-none absolute inset-0 -z-10"
            />
            <ShellPageTransition>{children}</ShellPageTransition>
          </div>
        </ResizableShell>
      </WalkthroughProvider>
    </ShellPageTransitionProvider>
  );
}
