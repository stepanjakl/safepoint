import type { ReactNode } from 'react';

/*
  The note every History page opens with: what the page was, when it was made
  (from the commit that added it), and that it is kept as it was rather than
  maintained. `children` adds anything particular to the page.
*/
export function HistoryNote({
  made,
  children,
}: {
  made: string;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label="About this page"
      className="enclosure text-meta text-muted grid max-w-3xl gap-1 p-4"
    >
      <p>
        <span className="text-primary font-medium">History.</span> {children}
      </p>
      <p>
        Made {made}. Preserved as it was, not maintained: it may drift from the
        product it came from, and what it calls current is not.
      </p>
    </aside>
  );
}
