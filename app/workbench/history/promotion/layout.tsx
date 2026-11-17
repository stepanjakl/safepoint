import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell/app-shell';
import { QuietQueries } from '@/components/prototype/promotion/quiet-queries';
import { signedInAs } from '@/server/access/current';

/*
  The prototype ran inside the product's shell, so it is drawn in the shell
  as it is now. The sidebar is the current one: its rows open the processes
  that exist today, not this one.
*/
export default async function PromotionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QuietQueries>
      <AppShell signedInAs={await signedInAs()}>{children}</AppShell>
    </QuietQueries>
  );
}
