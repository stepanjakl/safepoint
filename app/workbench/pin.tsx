'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

export type PinnedState = 'hovered' | 'focus-visible' | 'pressed';

/*
  Holds a React Aria state on the real component inside it: the data attribute
  React Aria would set under the pointer, the keyboard or a press, set here and
  put back whenever a re-render takes it away. The styles answer to the
  attribute alone, so the component paints exactly as it would in that state.

  Inert, so a pointer passing over the gallery cannot disturb what it shows.
  `selector` pins every match inside instead of the component's own element.
*/
export function Pin({
  state,
  selector,
  children,
}: {
  state?: PinnedState;
  selector?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = root.current;
    if (!host || !state) return;
    const attribute = `data-${state}`;
    const pin = () => {
      const targets = selector
        ? host.querySelectorAll(selector)
        : host.children;
      for (const target of targets) {
        if (!target.hasAttribute(attribute)) target.setAttribute(attribute, '');
      }
    };
    pin();
    const observer = new MutationObserver(pin);
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [attribute],
    });
    return () => observer.disconnect();
  }, [state, selector]);

  return (
    <div ref={root} inert className="contents">
      {children}
    </div>
  );
}
