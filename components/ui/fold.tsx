'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cx } from '@/lib/cx';

/*
  Content that opens and shuts in place, as a thread step's body does (fold.css):
  its height paces the fold, measured as it resizes, and shut it is inert, so
  neither focus nor a screen reader reaches what cannot be seen.
*/
export function Fold({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  // For the control's aria-controls.
  id?: string;
  // On the content, where its padding belongs, so a shut fold is nil.
  className?: string;
  children: ReactNode;
}) {
  const fold = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outer = fold.current;
    const inner = body.current;
    if (!outer || !inner) return;
    const observer = new ResizeObserver(() =>
      outer.style.setProperty('--fold-height', String(inner.offsetHeight)),
    );
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={fold}
      id={id}
      className="fold"
      data-open={open || undefined}
      inert={!open}
    >
      <div className="fold-clip">
        <div ref={body} className={cx('fold-body', className)}>
          {children}
        </div>
      </div>
    </div>
  );
}
