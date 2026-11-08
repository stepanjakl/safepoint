import type { ReactNode } from 'react';

/*
  One load shared by every case, so the two sides of each are seen through the
  same wait. It starts held, so both sides can be read at rest.
*/
export type Load = { loading: boolean; at: number };

export const PANE = 'bg-surface-primary ground-raised rounded-lg';
export const DRAWER = 'bg-surface-floating ground-floating rounded-lg';

export function Side({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <figure className="grid min-w-0 content-start gap-2">
      <figcaption className="readout text-muted">{label}</figcaption>
      {children}
    </figure>
  );
}
