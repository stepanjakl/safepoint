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
    // Two fixed panes wherever there is room for both, so the conversation
    // scrolls without taking the workspace furniture with it. Below that the
    // page scrolls as one document and the sidebar becomes a strip on top.
    <div className="bg-canvas p-shell-inset shell:h-dvh shell:grid-cols-[250px_minmax(0,1fr)] shell:overflow-hidden grid grid-cols-[minmax(0,1fr)] gap-3.5">
      <ProcessMenu current={current} items={items} />
      {/*
        A containing block for its descendants. Absolutely positioned content --
        every sr-only span among it -- otherwise resolves against the initial
        containing block, escapes the clipping here, and drags the document's
        scroll height out with it.
      */}
      <div className="control-face surface-raised rounded-shell shell:overflow-hidden relative min-w-0">
        {children}
      </div>
    </div>
  );
}
