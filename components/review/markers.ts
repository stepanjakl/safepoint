import type { StepStatus } from '@/lib/process/placeholder-process';
import type { ReviewOutcome } from '@/lib/promotion-release';
import type { AdapterMode, PresentedGate } from '@/lib/review-presentation';
import type { GlyphName } from '@/components/ui/glyph';
import type { Tone } from '@/components/ui/status-label';

/*
  Shape and tone for every state the interface shows. Shape is primary so
  meaning survives without colour; the same pairs are used in rows, identity
  bands, gates and the effects rail.
*/

export const outcomeMarker: Record<
  ReviewOutcome,
  { glyph: GlyphName; tone: Tone }
> = {
  ready: { glyph: 'circle', tone: 'verified' },
  needs_attention: { glyph: 'triangle', tone: 'caution' },
  held: { glyph: 'square', tone: 'blocked' },
  unverifiable: { glyph: 'struck', tone: 'unavailable' },
  excluded: { glyph: 'dash', tone: 'unavailable' },
};

// A thread step's own outcome. `attention` and `held` share the triangle and
// the square with the row states above on purpose: the marks mean the same
// thing one level up, and a step that needs a person is the same news whether
// it is a step or a line.
export const stepMarker: Record<StepStatus, { glyph: GlyphName; tone: Tone }> =
  {
    complete: { glyph: 'check', tone: 'verified' },
    attention: { glyph: 'triangle', tone: 'caution' },
    blocked: { glyph: 'square', tone: 'blocked' },
    running: { glyph: 'dotted', tone: 'advisory' },
    pending: { glyph: 'minus', tone: 'unavailable' },
  };

export const eligibilityMarker: Record<
  'eligible' | 'blocked',
  { glyph: GlyphName; tone: Tone }
> = {
  eligible: { glyph: 'check', tone: 'verified' },
  blocked: { glyph: 'cross', tone: 'blocked' },
};

export const gateMarker: Record<
  PresentedGate['result'],
  { glyph: GlyphName; tone: Tone }
> = {
  passed: { glyph: 'check', tone: 'verified' },
  failed: { glyph: 'cross', tone: 'blocked' },
  not_checked: { glyph: 'minus', tone: 'unavailable' },
  evidence_unavailable: { glyph: 'struck', tone: 'unavailable' },
  not_applicable: { glyph: 'dash', tone: 'unavailable' },
};

export const modeMarker: Record<AdapterMode, { glyph: GlyphName; tone: Tone }> =
  {
    live_sandbox: { glyph: 'circle', tone: 'live' },
    simulated: { glyph: 'diamond', tone: 'simulated' },
    preview_only: { glyph: 'dotted', tone: 'preview' },
  };

export const toneText: Record<Tone, string> = {
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
