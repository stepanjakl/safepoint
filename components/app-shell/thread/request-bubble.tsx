'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/*
  What the operator asked for, as the one right-aligned box in the thread.
  The request never folds, so a long one shows its first lines and offers the
  rest, rather than pushing the run down the page.
*/
export function RequestBubble({ children }: { children: ReactNode }) {
  const text = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [all, setAll] = useState(false);
  // Measured once laid out: whether the clamp is hiding anything.
  useLayoutEffect(() => {
    const box = text.current;
    if (!box) return;
    const measure = () => setLong(box.scrollHeight > box.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="border-rule-faint bg-surface-primary rounded-shell rounded-br-region ml-auto grid max-w-[84%] justify-items-start gap-1.5 border px-4.5 py-3.5 max-sm:max-w-[94%]">
      <div ref={text} className={all ? undefined : 'line-clamp-4'}>
        {children}
      </div>
      {long || all ? (
        <button
          type="button"
          className="text-meta text-muted hover:text-primary focus-visible:text-primary"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}
