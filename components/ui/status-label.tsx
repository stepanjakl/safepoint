import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import { Glyph, type GlyphName } from './glyph';

export type Tone =
  | 'neutral'
  | 'advisory'
  | 'verified'
  | 'caution'
  | 'blocked'
  | 'unavailable'
  | 'live'
  | 'simulated'
  | 'preview';

const toneClass: Record<Tone, string> = {
  neutral: 'text-primary',
  advisory: 'text-state-advisory',
  verified: 'text-state-verified',
  caution: 'text-state-caution',
  blocked: 'text-state-blocked',
  unavailable: 'text-state-unavailable',
  live: 'text-mode-live',
  simulated: 'text-mode-simulated',
  preview: 'text-mode-preview',
};

/*
  Non-interactive status text: a glyph and a label, tinted by tone.
  Never carries an optical edge, so it cannot be mistaken for a control.
*/
export function StatusLabel({
  tone,
  glyph,
  children,
  readout = false,
  className,
}: {
  tone: Tone;
  glyph?: GlyphName;
  children: ReactNode;
  readout?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5',
        readout ? 'readout' : 'text-dense font-medium',
        toneClass[tone],
        className,
      )}
    >
      {glyph ? <Glyph name={glyph} /> : null}
      {children}
    </span>
  );
}
