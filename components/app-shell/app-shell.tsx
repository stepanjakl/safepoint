import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { loadReviewedReplay } from '@/lib/promotion-release';
import {
  promotionProcess,
  supportProcess,
} from '@/lib/process/placeholder-process';
import {
  PROCESS_ORDER_KEY,
  processNavigationItem,
} from '@/lib/process/navigation';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';
import { supportPlan } from '@/lib/review/support-fixture';
import { ProcessMenu } from '@/components/app-shell/sidebar/process-menu';
import { ResizableShell } from './resizable-shell';

export async function AppShell({ children }: { children: ReactNode }) {
  // The saved order, so the first paint already has the rows where the reader
  // left them rather than hydration moving them there.
  const savedOrder = (await cookies()).get(PROCESS_ORDER_KEY)?.value ?? null;
  // Only navigation summaries cross the client boundary, not the full plans.
  const items = [
    processNavigationItem({
      id: promotionProcess.id,
      href: '/',
      name: promotionProcess.name,
      plan: presentPromotionPlan(loadReviewedReplay()),
    }),
    processNavigationItem({
      id: supportProcess.id,
      href: '/examples/support',
      name: supportProcess.name,
      plan: supportPlan,
    }),
  ];
  return (
    <ResizableShell
      navigation={<ProcessMenu items={items} initialOrder={savedOrder} />}
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
        <div className="p-pane-inset shell:h-full min-w-0">{children}</div>
      </div>
    </ResizableShell>
  );
}
