import 'server-only';

import { z } from 'zod';

import type { DefinitionProcess } from '@/lib/engine/types';
import type { ProcessSummary } from '@/lib/shell/model';
import {
  BRUNCH_ORDERS_DEFINITIONS,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS,
  BRUNCH_ORDERS_READS,
  brunchOrdersDirectProcess,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import type { RunReads } from '@/lib/processes/types';

export type { RunReads };

/*
  Server-only. The one place the server learns of a process: it maps a
  process's id to its declaration, and nothing else under server/ imports
  lib/processes (ESLint holds the line). A process here has its own
  declaration (its instructions and their earlier versions, its steps) and its
  instruction versions kept; one whose runs are kept on the server also has
  what the definitions engine works for, how a run reaches its result and
  where its data is read from, and has runs, decisions and writes.
*/

// How a run reaches its result: from an accepted rulebook, or by asking a model.
export const evaluationSchema = z.enum(['rules', 'model']).default('rules');
export type Evaluation = z.infer<typeof evaluationSchema>;

export type KeptProcess = {
  summary: ProcessSummary;
  // Where runs are kept: the engine's own process, which owns proposals and
  // writes, how a run reaches its result, and where its data is read from.
  runs?: {
    definitions: DefinitionProcess;
    evaluation: Evaluation;
    reads: RunReads;
  };
};

const KEPT: KeptProcess[] = [
  {
    summary: brunchOrdersProcess,
    runs: {
      definitions: BRUNCH_ORDERS_DEFINITIONS,
      evaluation: 'rules',
      reads: BRUNCH_ORDERS_READS,
    },
  },
  {
    summary: brunchOrdersDirectProcess,
    runs: {
      definitions: BRUNCH_ORDERS_DIRECT_DEFINITIONS,
      evaluation: 'model',
      reads: BRUNCH_ORDERS_READS,
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

// The process a request is for when it names how its run reaches its result
// and not the process: the one that does.
export function processOfEvaluation(evaluation: Evaluation): RunProcess {
  const kept = KEPT.find((entry) => entry.runs?.evaluation === evaluation);
  if (!kept?.runs) throw new Error(`No process works by ${evaluation}.`);
  return kept as RunProcess;
}

// The process whose rulebook the rules, calculate and read procedures work on.
// Their inputs name no process, as they never did: it is the one that has a
// rulebook, which a second such process would have to be told apart from.
export const rulebookProcess = () => processOfEvaluation('rules');
