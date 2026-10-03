'use client';

import { useSyncExternalStore } from 'react';
import type { z } from 'zod';

import { createLocalStore } from './local-store';

import { savedLabSchema } from '@/lib/promotion-release/review-lab';
import { seedReviewRules } from '@/lib/promotion-release/review-rules';

type SavedLab = z.infer<typeof savedLabSchema>;
export const DEFAULT_LAB_INPUT: SavedLab['input'] = {
  instructions:
    'Review the promotion candidate against source evidence. Explain uncertainty and prefer a hold when a required fact is unverified.',
  text: '',
  role: 'case_evidence',
};
const store = createLocalStore({
  key: 'safepoint.review-lab.v1',
  schema: savedLabSchema,
  initialValue: savedLabSchema.parse({
    schemaVersion: 1,
    input: DEFAULT_LAB_INPUT,
    activeRules: seedReviewRules,
    confirmedSku: null,
    confirmedFacts: {},
    latestTrial: null,
  }),
  invalidMessage:
    'The saved experiment is invalid. Seeded inputs and rules are shown.',
  unavailableMessage:
    'Browser storage is unavailable. Changes last only until this page closes.',
});
function updateLab(change: Partial<SavedLab>) {
  store.update({ ...store.getSnapshot().data, ...change });
}
export function useLocalReviewLab() {
  const current = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...current, updateLab };
}
