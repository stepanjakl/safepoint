'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WORKBENCH_HOME, workbenchEntryAt } from './menu';
import { ThemeToggle } from './theme-toggle';

/*
  The way back on every workbench page: Workbench, then the group and the page
  it is on, read from the menu's list. On the menu itself only the theme switch
  shows, since there is nowhere further back to go.
*/
export function WorkbenchBar() {
  const pathname = usePathname();
  const here = workbenchEntryAt(pathname);
  const onMenu = pathname === WORKBENCH_HOME;

  return (
    <div className="bg-canvas text-primary flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pt-4">
      {onMenu ? (
        <span />
      ) : (
        <nav aria-label="Workbench" className="text-meta text-muted">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link
                href={WORKBENCH_HOME}
                className="underline underline-offset-4"
              >
                Workbench
              </Link>
            </li>
            {here ? (
              <>
                <li aria-hidden="true">/</li>
                <li>{here.group.title}</li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-primary">
                  {here.entry.title}
                </li>
              </>
            ) : null}
          </ol>
        </nav>
      )}
      <ThemeToggle />
    </div>
  );
}
