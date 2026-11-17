'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import {
  type RulesKept,
  type RulesReply,
} from '@/components/engine/rules/rules-queries';
import { saidBy } from '@/components/engine/trial-parts';
import { useTRPC } from '@/components/trpc/provider';
import { Loader } from '@/components/ui/loader';
import type { LoaderPhase } from '@/components/ui/working-mark';
import type { Revision } from '@/lib/engine/types';
import type { ProcessSummary } from '@/lib/shell/model';

// Each revision with what it changed from its parent, where both are kept.
export type RulebookHistory = RulesKept['history'];

// What the panel shows of the rulebook: the reply, or why there is none.
type RulebookBody = RulesReply | { kind: 'error'; message: string };

const RulebookContext = createContext<ProcessSummary | null>(null);

export function RulebookProvider({
  process,
  children,
}: {
  process: ProcessSummary;
  children: ReactNode;
}) {
  return <RulebookContext value={process}>{children}</RulebookContext>;
}

/*
  The rulebook of the current instructions, as a panel shows it. It is the
  query a run's Rules step writes each answer into, kept by the instructions'
  text: revisiting a panel refreshes the reply without replacing known content
  with the loading illustration, a reply for other instructions never appears
  under the new version, and a decision made on a card is here without a
  reload.
*/
export function useRulebook() {
  const process = useContext(RulebookContext);
  if (!process) throw new Error('Rulebook panels need a RulebookProvider.');
  const { current } = useInstructions(process.id, process.instructions);
  const trpc = useTRPC();
  const asked = useQuery(
    trpc.rules.get.queryOptions({ text: current.text }, { staleTime: 0 }),
  );
  // What the server said where it would not give the rules; a request that
  // got no answer leaves what is known as it was.
  const said = asked.isError ? saidBy(asked.error) : null;
  const body: RulebookBody | null =
    said !== null ? { kind: 'error', message: said } : (asked.data ?? null);
  const set = body?.kind === 'rules' ? body.set : null;
  const accepted = set?.definitions.filter((d) => d.approvedAt) ?? [];
  return { current, body, set, accepted };
}

/* The rulebook's first load, on the loader's timing (useLoader). */
export function RulebookLoading({ phase }: { phase: LoaderPhase }) {
  return <Loader phase={phase} size="page" label="Loading the rulebook…" />;
}

export const REASONS: Record<Revision['reason'], string> = {
  accepted: 'Accepted',
  migrated: 'Migrated',
  used: 'Kept by a run',
};
