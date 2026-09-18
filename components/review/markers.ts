import type { RunStatus, StepStatus } from '@/lib/process/placeholder-process';
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

/*
  A rung of a tone's scale, for the places a colour is the payload of a custom
  property rather than the colour of text -- a row publishing its state to a
  mark. The number is the rung; see --sp-state-* in tokens/state.css for what each
  one is for.

  Written out per tone rather than built from the tone name, so a tone that
  gains a scale or loses one fails at the type level instead of resolving to
  nothing at paint time. The three adapter modes and `neutral` have no scale of
  their own -- nothing draws a badge in them -- so they fall back to the greys.
*/
type StateStep = 1 | 3 | 4 | 5 | 6 | 7 | 9 | 10 | 11 | 12;

const rung = (n: StateStep) =>
  ({
    neutral: `var(--sp-state-unavailable-${n})`,
    advisory: `var(--sp-state-advisory-${n})`,
    verified: `var(--sp-state-verified-${n})`,
    caution: `var(--sp-state-caution-${n})`,
    decision: `var(--sp-state-decision-${n})`,
    blocked: `var(--sp-state-blocked-${n})`,
    unavailable: `var(--sp-state-unavailable-${n})`,
    live: `var(--sp-state-unavailable-${n})`,
    simulated: `var(--sp-state-unavailable-${n})`,
    preview: `var(--sp-state-unavailable-${n})`,
  }) satisfies Record<Tone, string>;

/** A subtle ground to put a figure on. */
export const toneFace: Record<Tone, string> = rung(3);
/** A shape drawn solid at small size: a status disc, a bar behind a pill. */
export const toneMark: Record<Tone, string> = rung(9);
/** Text that has to carry: a step past the tone's own reading weight. */
export const toneStrong: Record<Tone, string> = rung(12);

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
