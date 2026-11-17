import 'server-only';

import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { database, type Database } from '@/server/db/client';
import { instructionVersions, reads, runs } from '@/server/db/schema';
import type { RunProcess } from '@/server/operations/kept-processes';

import { readProcessOf } from './run-reads';
import { ensureDeclared, versionByHash } from './instructions';
import { Refused } from './refused';

/*
  Server-only. A process's runs, in `runs`: one row a run, made by the
  server when a person starts one (the server names it), then moved as it
  goes: the read it took, the rulebook it pinned, the step it is at and how
  it stands. What it decided and wrote is in the rows that point back at it
  (record_decisions, applications), never on it.

  Never removed. Discarding marks it (`discardedAt`) and the list leaves it
  out; its decisions and any write it made stay, and a discarded run moves
  no further (the table's trigger, drizzle/0007_run_guard.sql).
*/

// How a run a person moves can stand. The others the table allows
// (queued, held, failed, superseded, cancelled) belong to runs a schedule
// starts, which nothing does yet.
export const PROGRESS_STATUSES = [
  'running',
  'awaiting_review',
  'approved',
  'completed',
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export type KeptRun = {
  process: string;
  id: string;
  // The version it runs under, by its hash and its label.
  instructions: { hash: string; version: string };
  readId: string | null;
  // The accepted rulebook it calculates on, by its fingerprint.
  rulebook: string | null;
  stage: string;
  status: string;
  trigger: string;
  additionalInstructions: string | null;
  startedBy: string | null;
  startedAt: string;
  updatedAt: string;
  discardedAt: string | null;
};

const RUN_NOT_KEPT = 'This run is not kept on the server.';
export const RUN_DISCARDED = 'This run was discarded. Start a new run.';

// Every column but the bodies, with the version's label: what the list,
// the sidebar and a run's page need, in one query.
const COLUMNS = {
  process: runs.process,
  id: runs.id,
  instructionsHash: runs.instructionsHash,
  version: instructionVersions.version,
  readId: runs.readId,
  rulebookId: runs.rulebookId,
  stage: runs.stage,
  status: runs.status,
  trigger: runs.trigger,
  additionalInstructions: runs.additionalInstructions,
  startedBy: runs.startedBy,
  startedAt: runs.startedAt,
  updatedAt: runs.updatedAt,
  discardedAt: runs.discardedAt,
};

type Row = {
  process: string;
  id: string;
  instructionsHash: string;
  version: string;
  readId: string | null;
  rulebookId: string | null;
  stage: string;
  status: string;
  trigger: string;
  additionalInstructions: string | null;
  startedBy: string | null;
  startedAt: Date;
  updatedAt: Date;
  discardedAt: Date | null;
};

const runOf = (row: Row): KeptRun => ({
  process: row.process,
  id: row.id,
  instructions: { hash: row.instructionsHash, version: row.version },
  readId: row.readId,
  rulebook: row.rulebookId,
  stage: row.stage,
  status: row.status,
  trigger: row.trigger,
  additionalInstructions: row.additionalInstructions,
  startedBy: row.startedBy,
  startedAt: row.startedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  discardedAt: row.discardedAt?.toISOString() ?? null,
});

const selectRuns = (db: Database) =>
  db
    .select(COLUMNS)
    .from(runs)
    .innerJoin(
      instructionVersions,
      and(
        eq(instructionVersions.process, runs.process),
        eq(instructionVersions.hash, runs.instructionsHash),
      ),
    );

const ofRun = (process: string, id: string) =>
  and(eq(runs.process, process), eq(runs.id, id));

async function keptRun(
  process: string,
  id: string,
  db?: Database,
): Promise<KeptRun | null> {
  db ??= await database();
  const [row] = await selectRuns(db).where(ofRun(process, id));
  return row ? runOf(row) : null;
}

// A run that is kept, or the refusal that says it is not.
export async function runOrRefuse(process: string, id: string) {
  const run = await keptRun(process, id);
  if (!run) throw new Refused(RUN_NOT_KEPT, 'NOT_FOUND');
  return run;
}

/*
  Starts a run under a kept version of the process's instructions, at its
  first step after them, and answers it with the id the server gave it. Two
  starts at once are two runs.
*/
export async function startRun(
  kept: RunProcess,
  start: {
    instructions: string;
    trigger: 'manual' | 'rerun';
    additionalInstructions: string | null;
    actor: string | null;
  },
): Promise<KeptRun> {
  const process = kept.summary.id;
  const db = await database();
  await ensureDeclared(db, kept);
  if (!(await versionByHash(kept, start.instructions, db)))
    throw new Refused(
      'These instructions are not kept on the server. Publish them first.',
      'NOT_FOUND',
    );
  const first =
    kept.summary.steps?.find((step) => step.id !== 'instructions')?.id ??
    'instructions';
  const id = `run-${randomUUID()}`;
  await db.insert(runs).values({
    process,
    id,
    instructionsHash: start.instructions,
    readProcess: readProcessOf(kept.runs.definitions),
    stage: first,
    status: 'running',
    trigger: start.trigger,
    additionalInstructions: start.additionalInstructions,
    startedBy: start.actor,
    startedAt: sql`now()`,
  });
  return (await keptRun(process, id, db))!;
}

// A process's runs, newest first, without the discarded ones unless asked.
export async function listRuns(
  process: string,
  { discarded = false }: { discarded?: boolean } = {},
): Promise<KeptRun[]> {
  const rows = await selectRuns(await database())
    .where(
      discarded
        ? eq(runs.process, process)
        : and(eq(runs.process, process), isNull(runs.discardedAt)),
    )
    .orderBy(desc(runs.startedAt), desc(runs.id));
  return rows.map(runOf);
}

export type Progress = {
  readId?: string;
  // Null takes the pin away: the run moves to the current rules.
  rulebook?: string | null;
  stage?: string;
  status?: ProgressStatus;
};

/*
  Records how far a run has got: any of the read it took (a read taken again
  replaces it), the rulebook it pinned, its step and its status. Refused for
  a run not kept, one discarded, a read not kept where the run takes its
  reads, a rulebook on a process that keeps none, and a step the process
  does not have. One statement, so a discard that lands first wins.
*/
export async function recordProgress(
  kept: RunProcess,
  id: string,
  progress: Progress,
): Promise<KeptRun> {
  const process = kept.summary.id;
  const db = await database();
  if (progress.stage !== undefined) {
    const steps = (kept.summary.steps ?? []).map((step) => step.id);
    if (!steps.includes(progress.stage))
      throw new Refused(
        `A ${kept.summary.name} run has no step ${progress.stage}.`,
        'BAD_REQUEST',
      );
  }
  if (
    progress.rulebook !== undefined &&
    progress.rulebook !== null &&
    kept.runs.evaluation === 'model'
  )
    throw new Refused(
      `A ${kept.summary.name} run keeps no rulebook.`,
      'BAD_REQUEST',
    );
  if (progress.readId !== undefined) {
    const [read] = await db
      .select({ id: reads.id })
      .from(reads)
      .where(
        and(
          eq(reads.process, readProcessOf(kept.runs.definitions)),
          eq(reads.id, progress.readId),
        ),
      );
    if (!read)
      throw new Refused('This read is not kept on the server.', 'NOT_FOUND');
  }
  const changed = await db
    .update(runs)
    .set({
      ...(progress.readId === undefined ? {} : { readId: progress.readId }),
      ...(progress.rulebook === undefined
        ? {}
        : { rulebookId: progress.rulebook }),
      ...(progress.stage === undefined ? {} : { stage: progress.stage }),
      ...(progress.status === undefined ? {} : { status: progress.status }),
      updatedAt: sql`now()`,
    })
    .where(and(ofRun(process, id), isNull(runs.discardedAt)))
    .returning({ id: runs.id });
  if (!changed.length) {
    const run = await keptRun(process, id, db);
    throw run
      ? new Refused(RUN_DISCARDED)
      : new Refused(RUN_NOT_KEPT, 'NOT_FOUND');
  }
  return (await keptRun(process, id, db))!;
}

/*
  Discards a run: marks it, and the list leaves it out. Nothing it decided or
  wrote is touched, and what it wrote stays in the output. Discarding one
  already discarded answers it as it is, so a second press changes nothing.
*/
export async function discardRun(
  process: string,
  id: string,
): Promise<KeptRun> {
  const db = await database();
  await db
    .update(runs)
    .set({ discardedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(ofRun(process, id), isNull(runs.discardedAt)));
  const run = await keptRun(process, id, db);
  if (!run) throw new Refused(RUN_NOT_KEPT, 'NOT_FOUND');
  return run;
}
