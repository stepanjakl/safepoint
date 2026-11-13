import type { Tone } from '@/components/ui/pill';
import type { Verdict } from '@/lib/definitions/types';

export const VERDICT: Record<Verdict, { tone: Tone; label: string }> = {
  ready: { tone: 'ready', label: 'Ready' },
  decide: { tone: 'decision', label: 'Decide' },
  blocked: { tone: 'blocked', label: 'Blocked' },
  // No rule ran: a person reviews it all the same, so it only reads neutral.
  unchecked: { tone: 'neutral', label: 'Not checked' },
};

// A record asks for a person only where a check said so.
export const needsPerson = (verdict: Verdict) =>
  verdict === 'decide' || verdict === 'blocked';
