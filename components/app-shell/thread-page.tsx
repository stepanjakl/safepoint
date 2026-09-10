import type { ReactNode } from 'react';

/*
  The column a conversation is read in. Three pages open the same way -- an
  eyebrow, a title, then whatever the page is -- so the measure, the gutters
  and the heading treatment are settled once here rather than restated on each.
*/
export function ThreadPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-[min(100%,760px)] flex-1 px-6 pt-12 pb-8 max-sm:px-4 max-sm:py-7"
    >
      <div className="mb-8 max-sm:mb-6">
        <p className="text-meta text-muted">{eyebrow}</p>
        {/* The batch title is the one editorial line here, per the display
            role in docs/EXPERIENCE-SPEC.md. Everything else stays sans. */}
        <h1 className="font-display mt-1.5 text-[22px] leading-[1.3] [font-weight:550]">
          {title}
        </h1>
      </div>
      {children}
    </main>
  );
}

/** What the operator asked for, as the one right-aligned box in the thread. */
export function RequestBubble({ children }: { children: ReactNode }) {
  return (
    <div className="border-rule-faint bg-surface-primary ml-auto max-w-[84%] rounded-[12px_12px_2px_12px] border px-4.5 py-3.5 max-sm:max-w-[94%]">
      {children}
    </div>
  );
}

/** The response, and the line that says what kind of record it is. */
export function ResponseSection({
  caption,
  children,
}: {
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label="Safepoint response" className="mt-7">
      {children}
      <p className="text-muted mt-3 text-[12px]">{caption}</p>
    </section>
  );
}
