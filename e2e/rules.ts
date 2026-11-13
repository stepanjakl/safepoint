import type { Page } from '@playwright/test';
import type { inferRouterOutputs } from '@trpc/server';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import { confirmProfile, profileOf } from '@/lib/definitions/profile';
import type { DefinitionSet, ProfileState } from '@/lib/definitions/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import type { AppRouter } from '@/server/api/root';

import { mockProcedure, type Answer } from './trpc';

/*
  The rules procedures in a browser test. Each of these answers with the rules
  as they stand, which is what the screen reads whichever of them it called,
  so a test serves one reply for all of them and mocks the one it cares about
  on top (a route added later is tried first).
*/

export type RulesReply = inferRouterOutputs<AppRouter>['rules']['get'];
export type RulesKept = Extract<RulesReply, { kind: 'rules' }>;

export const REPLYING = [
  'rules.get',
  'rules.profile',
  'rules.profileColumn',
  'rules.confirmProfile',
  'rules.draft',
  'rules.intent',
  'rules.write',
  'rules.choose',
  'rules.appliesTo',
  'rules.decide',
] as const;
export type Replying = (typeof REPLYING)[number];

// Drafting reads the data through a confirmed profile.
const CONFIRMED: ProfileState = {
  state: 'confirmed',
  profile: confirmProfile(profileOf(capturedRead(), SUBJECT.data)),
};

// The rules a person is reviewing, as the server sends them.
export const rulesReply = (
  set: DefinitionSet,
  more: Partial<Omit<RulesKept, 'kind' | 'set'>> = {},
): RulesKept => ({
  kind: 'rules',
  set,
  names: {},
  working: {},
  sentences: {},
  drafting: null,
  profile: CONFIRMED,
  history: { head: null, revisions: [] },
  ...more,
});

// No rules kept yet.
export const noRules = (
  more: Partial<Omit<Extract<RulesReply, { kind: 'none' }>, 'kind'>> = {},
): RulesReply => ({
  kind: 'none',
  drafting: null,
  profile: { state: 'none', proposed: null },
  ...more,
});

// Every procedure that replies with the rules, answered from one function.
export async function mockRules(
  page: Page,
  answer: (
    path: Replying,
    input: Record<string, unknown>,
  ) => Answer<RulesReply> | Promise<Answer<RulesReply>>,
) {
  const inputs: { path: Replying; input: Record<string, unknown> }[] = [];
  for (const path of REPLYING)
    await mockProcedure(page, path, ((input: Record<string, unknown>) => {
      inputs.push({ path, input });
      return answer(path, input);
    }) as never);
  return { inputs };
}
