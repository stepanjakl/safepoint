import 'server-only';

import { z } from 'zod';

import type { DefinitionProcess } from '@/lib/definitions/types';
import type { ProcessSummary } from '@/lib/process/model';
import {
  promotionProcess,
  supportProcess,
} from '@/lib/process/placeholder-process';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS,
  brunchOrdersDirectProcess,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';

/*
  Server-only. The processes the server keeps anything for, by id: each one's
  own declaration (its instructions and their earlier versions, its steps),
  and, for one whose runs are kept on the server, what the definitions engine
  works for. Every process here has its instruction versions kept; only the
  ones with `runs` have runs, decisions and writes. The placeholder processes
  play a recorded run and keep none.
*/

export type KeptProcess = {
  summary: ProcessSummary;
  // Where runs are kept: the engine's own process, which owns proposals and
  // writes, and how a run reaches its result.
  runs?: { definitions: DefinitionProcess; evaluation: 'rules' | 'model' };
};

const KEPT: KeptProcess[] = [
  { summary: promotionProcess },
  { summary: supportProcess },
  {
    summary: brunchOrdersProcess,
    runs: { definitions: BRUNCH_ORDERS_DEFINITIONS, evaluation: 'rules' },
  },
  {
    summary: brunchOrdersDirectProcess,
    runs: {
      definitions: BRUNCH_ORDERS_DIRECT_DEFINITIONS,
      evaluation: 'model',
    },
  },
];

const ids = KEPT.map((kept) => kept.summary.id) as [string, ...string[]];

// A process a request names: only one of these.
export const processIdSchema = z.enum(ids);

export function keptProcess(id: string): KeptProcess {
  const kept = KEPT.find((entry) => entry.summary.id === id);
  if (!kept) throw new Error(`No process ${id} is kept.`);
  return kept;
}

// The processes whose runs are kept: a run named for any other is refused.
export const runProcessIdSchema = z.enum(
  KEPT.filter((kept) => kept.runs).map((kept) => kept.summary.id) as [
    string,
    ...string[],
  ],
);

export type RunProcess = Required<KeptProcess>;

export function runProcess(id: string): RunProcess {
  const kept = keptProcess(id);
  if (!kept.runs) throw new Error(`Runs of ${id} are not kept.`);
  return kept as RunProcess;
}

// Every process whose versions are kept, for a test to hold each declaration.
export const keptProcesses = () => KEPT;

// The process whose definitions a job names by their id (a job's steps are
// handed ids, server/workflows/): what the engine works for, and the kept
// process its instruction versions are under.
export function processOfDefinitions(id: string): RunProcess {
  const kept = KEPT.find((entry) => entry.runs?.definitions.id === id);
  if (!kept?.runs) throw new Error(`No definitions are kept for ${id}.`);
  return kept as RunProcess;
}
