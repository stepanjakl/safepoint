'use client';

import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { DialogContext } from 'react-aria-components';

export function NonModalPopoverPanel({
  title,
  className,
  children,
}: {
  title: string;
  className: string;
  children: ReactNode;
}) {
  const dialog = useContext(DialogContext);
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }
  }, []);

  return (
    <section
      id={dialog && 'id' in dialog ? dialog.id : undefined}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      className={className + ' outline-none'}
    >
      <h2 id={titleId} className="text-dense font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}
