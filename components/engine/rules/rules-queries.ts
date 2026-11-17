'use client';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@/server/api/root';

/*
  What the rules procedures answer, for the screens that show the rulebook of
  one version of the instructions: the Rules step of a run and the rulebook
  panel. Both read `rules.get`, and every answer the step gets (a poll, or a
  decision's reply) is written into each `rules.get` entry for the same text,
  so the panel and its history show what a card has just decided.
*/

export type RulesReply = inferRouterOutputs<AppRouter>['rules']['get'];
// The reply that holds a rulebook, as every action on one answers.
export type RulesKept = Extract<RulesReply, { kind: 'rules' }>;

// How often to ask how far a draft on the server has got.
export const DRAFT_POLL_MS = 2_000;
