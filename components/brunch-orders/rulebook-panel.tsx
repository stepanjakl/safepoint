'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useInstructions } from '@/components/app-shell/instructions/instructions-store';
import { useTrial } from '@/components/brunch-orders/trial-parts';
import { Loader } from '@/components/ui/loader';
import type { LoaderPhase } from '@/components/ui/working-mark';
import type { RevisionChanges } from '@/lib/definitions/revision-changes';
import type {
  DefinitionSet,
  Revision,
  RevisionIndex,
} from '@/lib/definitions/types';
import type { ProcessSummary } from '@/lib/process/model';

// Each revision with what it changed from its parent, where both are kept.
export type RulebookHistory = Omit<RevisionIndex, 'revisions'> & {
  revisions: (Revision & { changes: RevisionChanges | null })[];
};

type RulesResponse =
  | {
      kind: 'rules';
      set: DefinitionSet;
      names: Record<string, string>;
      history: RulebookHistory;
    }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

/*
  Keep the rulebook outside the swapping tabs: revisiting one refreshes its
  reply without replacing known content with the loading illustration.
*/
function useRulebookState(process: ProcessSummary) {
  const { current } = useInstructions(process.id, process.instructions);
  const rules = useTrial<RulesResponse>('/api/dev/brunch-orders/rules');
  const { run } = rules;
  const [reply, setReply] = useState<{
    text: string;
    body: RulesResponse;
  } | null>(null);
  const refresh = useCallback(() => {
    let cancelled = false;
    void run({ action: 'get', text: current.text }).then((body) => {
      if (!cancelled && body) setReply({ text: current.text, body });
    });
    return () => {
      cancelled = true;
    };
  }, [run, current.text]);
  // A reply for different instructions must never appear under the new version.
  const body = reply?.text === current.text ? reply.body : null;
  const set = body?.kind === 'rules' ? body.set : null;
  const accepted = set?.definitions.filter((d) => d.approvedAt) ?? [];
  return { current, body, set, accepted, refresh };
}

const RulebookContext = createContext<ReturnType<
  typeof useRulebookState
> | null>(null);

export function RulebookProvider({
  process,
  children,
}: {
  process: ProcessSummary;
  children: ReactNode;
}) {
  const rulebook = useRulebookState(process);
  return <RulebookContext value={rulebook}>{children}</RulebookContext>;
}

export function useRulebook() {
  const rulebook = useContext(RulebookContext);
  if (!rulebook) throw new Error('Rulebook panels need a RulebookProvider.');
  const { refresh } = rulebook;
  useEffect(() => refresh(), [refresh]);
  return rulebook;
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
