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
    <div className="app-shell">
      <ProcessMenu current={current} items={items} />
      <div className="app-pane">{children}</div>
    </div>
  );
}
