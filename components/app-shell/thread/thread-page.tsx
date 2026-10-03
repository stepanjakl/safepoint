import type { ReactNode } from 'react';

/*
  The column a conversation is read in, with its measure and gutters settled
  once. A run's page has no visible heading -- the rail beside it already says
  which run and when -- so its name is given to a screen reader alone; a
  harness page can still show an eyebrow and a title.
*/
export function ThreadPage({
  label,
  eyebrow,
  title,
  children,
}: {
  // The page's name for a screen reader, where no title is shown.
  label?: string;
  eyebrow?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-[min(100%,760px)] flex-1 px-6 pt-10 pb-8 max-sm:px-4 max-sm:py-7"
    >
      {title ? (
        <div className="mb-8 max-sm:mb-6">
          {eyebrow ? <p className="text-meta text-muted">{eyebrow}</p> : null}
          {/* The editorial line, per the display role in
              docs/EXPERIENCE-SPEC.md. Everything else stays sans. */}
          <h1 className="font-display text-display mt-1.5 [font-weight:550]">
            {title}
          </h1>
        </div>
      ) : label ? (
        <h1 className="sr-only">{label}</h1>
      ) : null}
      {children}
    </main>
  );
}

export { RequestBubble } from './request-bubble';

/** The response: what the run proposes, for review. */
export function ResponseSection({ children }: { children: ReactNode }) {
  return <section aria-label="Safepoint response">{children}</section>;
}
