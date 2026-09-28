import type { RunStatus, StepStatus } from '@/lib/process/model';
import type { Disposition } from '@/lib/review/plan-contract';
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
  needs_attention: { glyph: 'triangle', tone: 'decision' },
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
    attention: { glyph: 'triangle', tone: 'decision' },
    blocked: { glyph: 'square', tone: 'blocked' },
    running: { glyph: 'dotted', tone: 'advisory' },
    pending: { glyph: 'minus', tone: 'unavailable' },
  };

// A line's place in the plan, as the release card's rows draw it: the review's
// outcome shapes again, so a blocked row and a held line are the same mark.
// Colour comes from the row's own severity, which the bar and tabs share.
export const dispositionGlyph: Record<Disposition, GlyphName> = {
  blocked: 'square',
  needs_decision: 'triangle',
  deferred: 'dash',
  will_apply: 'circle',
};

/*
  A run's state, as a tone only. The shape is not here: a run is a lifecycle
  rather than an outcome, and it is drawn by `RunStatusIcon` as one circle
  whose interior changes through the stages. See that file for why the two
  vocabularies are kept apart.
*/
export const runTone: Record<RunStatus, Tone> = {
  queued: 'unavailable',
  running: 'advisory',
  awaiting_review: 'decision',
  approved: 'verified',
  completed: 'verified',
  held: 'blocked',
  failed: 'blocked',
  superseded: 'unavailable',
  cancelled: 'unavailable',
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

/*
  The same tones as colours rather than classes, for the places a tone is the
  payload of a custom property instead of the colour of text -- a row that
  publishes its state to a rail and a pill, say. Named one by one rather than
  built from the tone string, so a tone that gains a token or loses one fails
  at the type level instead of resolving to nothing at paint time.
*/
export const toneVar: Record<Tone, string> = {
  neutral: 'var(--sp-rule-strong)',
  advisory: 'var(--sp-state-advisory)',
  verified: 'var(--sp-state-verified)',
  decision: 'var(--sp-state-decision)',
  caution: 'var(--sp-state-caution)',
  blocked: 'var(--sp-state-blocked)',
  unavailable: 'var(--sp-state-unavailable)',
  live: 'var(--sp-mode-live)',
  simulated: 'var(--sp-mode-simulated)',
  preview: 'var(--sp-mode-preview)',
};

export const toneText: Record<Tone, string> = {
  neutral: 'text-primary',
  advisory: 'text-state-advisory',
  verified: 'text-state-verified',
  decision: 'text-state-decision',
  caution: 'text-state-caution',
  blocked: 'text-state-blocked',
  unavailable: 'text-state-unavailable',
  live: 'text-mode-live',
  simulated: 'text-mode-simulated',
  preview: 'text-mode-preview',
};
