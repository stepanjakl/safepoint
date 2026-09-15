import type { ReactNode } from 'react';
import { loadReviewedReplay } from '@/lib/promotion-release';
import {
  promotionProcess,
  supportProcess,
} from '@/lib/process/placeholder-process';
import { processNavigationItem } from '@/lib/process/navigation';
import { presentPromotionPlan } from '@/lib/review/promotion-adapter';
import { supportPlan } from '@/lib/review/support-fixture';
import { ProcessMenu } from './process-menu';
import { ResizableShell } from './resizable-shell';

export function AppShell({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  // Only navigation summaries cross the client boundary, not the full plans.
  const items = [
    processNavigationItem({
      id: 'promotion-release',
      href: '/',
      name: promotionProcess.name,
      plan: presentPromotionPlan(loadReviewedReplay()),
    }),
    processNavigationItem({
      id: 'support-handoff',
      href: '/examples/support',
      name: supportProcess.name,
      plan: supportPlan,
    }),
  ];
  return (
    <ResizableShell
      navigation={<ProcessMenu current={current} items={items} />}
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
      */}
      <div className="rounded-shell p-control-edge shell:h-full shell:overflow-hidden relative isolate min-w-0 overflow-clip has-[.notch]:rounded-tr-none">
        <div
          aria-hidden="true"
          className="control-face surface-raised rounded-shell pointer-events-none absolute inset-0 -z-10"
        />
        {children}
      </div>
    </ResizableShell>
  );
}
