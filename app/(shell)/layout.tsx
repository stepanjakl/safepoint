import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { currentVisitor, signedInAs } from '@/server/access/current';

/*
  The shell is a layout rather than something each page renders, so it stays
  mounted when the reader moves between processes. Rendered per page, every
  navigation remounted it: the sidebar's measured bounds started empty, the
  track laid out at the default width, and the sheet then eased across to the
  saved one. The menu's own state -- search, level -- was lost the same way.
*/
export default async function ShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppShell signedInAs={await signedInAs()} visitor={await currentVisitor()}>
      {children}
    </AppShell>
  );
}
