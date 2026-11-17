import type { ReactNode } from 'react';

import { ThemeScript } from './theme-script';
import { WorkbenchBar } from './workbench-bar';

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ThemeScript />
      <WorkbenchBar />
      {children}
    </>
  );
}
