import type { Metadata } from 'next';

import { MenuCard } from './menu-card';
import { WORKBENCH_GROUPS } from './menu';

export const metadata: Metadata = { title: 'Workbench · Safepoint' };

const HEADING = 'text-title font-semibold';
const NOTE = 'text-meta text-muted max-w-3xl';

/*
  The workbench's menu: every page it holds, in groups, each a card that says
  what the page shows. The list is in ./menu.ts.
*/
export default function WorkbenchPage() {
  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Workbench</h1>
        <p className={NOTE}>
          How Safepoint was designed and built. Each page is a study of one
          thing, drawn with the real components on frozen data: nothing here
          calls a model or writes to a sheet.
        </p>
      </header>
      {WORKBENCH_GROUPS.map((group) => (
        <section
          key={group.id}
          className="grid gap-3"
          aria-labelledby={`group-${group.id}`}
        >
          <div className="grid gap-1">
            <h2 id={`group-${group.id}`} className={HEADING}>
              {group.title}
            </h2>
            <p className={NOTE}>{group.summary}</p>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
            {group.entries.map((entry) => (
              <li key={entry.href} className="grid">
                <MenuCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
