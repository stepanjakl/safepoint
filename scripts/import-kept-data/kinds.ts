/*
  What the import copies, kind by kind. A kind reads the files the server kept
  under data/ before it kept them in the database (the files
  server/storage/kept-data.test.ts walks), through the schema each is read
  with, and puts each into its table if the table lacks it. It never writes,
  moves or deletes a file, never overwrites a row, and reports what it
  refused rather than failing on it.

  The record of each write to a process's output (data/<process>/applied/,
  an array) is a row per entry, in order, pointing at the proposal the entry
  names by its time; an array the table's guards cannot hold as it stands
  (two writes standing at once) is refused whole, with why.

  A proposal, cross-check or part is kept only for a read that is in the
  database, run reads being imported first, under the process that keeps
  reads (readProcessOf); the tables refuse one that is not, and the import
  says so in words first. A job file kept
  as running belongs to a process that no longer exists: it is imported as
  running under a holder whose lease ran out when the file was last written,
  which the app reads as interrupted, in the words of its kind.
*/
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import { keptReadSchema } from '@/lib/engine/records';
import {
  applicationSchema,
  draftProgressSchema,
  proposalPartSchema,
  proposalSchema,
  type Application,
} from '@/lib/engine/types';
import type { Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import {
  answerParts,
  crossChecks,
  jobs,
  modelLimits,
  proposals,
  reads,
  sourceReads,
  type PART_KINDS,
} from '@/server/db/schema';
import { LEASE_MS } from '@/server/jobs/run-job';
import { insertRow, rowsOfKey } from '@/server/storage/writes/application-rows';
import { recordFields, recordOf } from '@/server/storage/writes/applications';
import { readProcessOf } from '@/server/storage/reads/run-reads';
import {
  crossCheckPartSchema,
  crossCheckSchema,
} from '@/server/storage/reads/cross-checks';
import {
  keptLimitsSchema,
  limitsOfRows,
  rowsOfLimits,
} from '@/server/storage/models/model-limits';
import { keptSourceReadSchema } from '@/server/storage/reads/source-reads';

export type Refusal = { what: string; why: string };

export type Tally = {
  // Files found for the kind; a file of limits holds a row per model.
  files: number;
  inserted: number;
  present: number;
  refused: Refusal[];
};

// What kinds tell the ones after them: the reads and proposals there are, or
// would be, so a dry run counts what points at them as the real run will.
export type Shared = { reads: Set<string>; proposals: Set<string> };

const proposalKey = (process: string, readId: string, fp: string, at: string) =>
  `${process}/${readId}.${fp}@${at}`;

export type Kind = {
  name: string;
  run: (
    db: Database,
    dataDir: string,
    dryRun: boolean,
    shared: Shared,
  ) => Promise<Tally>;
};

const tally = (): Tally => ({
  files: 0,
  inserted: 0,
  present: 0,
  refused: [],
});

const PROCESS_ID = /^[a-z0-9][a-z0-9-]*$/;
const READ_ID = /^[A-Za-z0-9_-]{1,80}$/;

// The database's own reason, which Drizzle keeps as the cause of its own.
const reasonOf = (error: unknown) => {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  return cause instanceof Error ? cause.message : String(cause);
};

const subfolders = (at: string) => {
  try {
    return readdirSync(at, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

// The .json files of a folder, by name; a folder that is not there has none.
const jsonFiles = (at: string) => {
  try {
    return readdirSync(at)
      .filter(
        (name) =>
          name.endsWith('.json') && statSync(path.join(at, name)).isFile(),
      )
      .sort();
  } catch {
    return [];
  }
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// A file read through the schema its kind is read with; the reason if it does
// not fit.
function parseFile<T>(
  file: string,
  schema: { safeParse: (value: unknown) => unknown },
): { value: T } | { why: string } {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { why: 'is not valid JSON' };
  }
  const parsed = schema.safeParse(json) as
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
  if (parsed.success) return { value: parsed.data };
  return {
    why: `does not fit the stored shape: ${parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')}`,
  };
}

/*
  Puts one row in unless it is there: `found` is the row the table already has
  for the same key, or null, and `put` writes the new one. A row that is there
  with other content is refused and left.
*/
async function settle(
  into: Tally,
  what: string,
  found: () => Promise<{ same: boolean } | null>,
  put: () => Promise<void>,
  dryRun: boolean,
) {
  try {
    const existing = await found();
    if (existing) {
      if (existing.same) into.present += 1;
      else
        into.refused.push({
          what,
          why: 'the database has a row of this key with other content; left as it is',
        });
      return;
    }
    if (!dryRun) await put();
    into.inserted += 1;
  } catch (error) {
    into.refused.push({ what, why: reasonOf(error) });
  }
}

const runReads: Kind = {
  name: 'run reads',
  async run(db, dataDir, dryRun, shared) {
    const into = tally();
    // data/<process>/reads/<read id>.json; `sources` and `pglite` are not
    // processes, and have no such folder.
    for (const processId of subfolders(dataDir)) {
      const folder = path.join(dataDir, processId, 'reads');
      for (const name of jsonFiles(folder)) {
        into.files += 1;
        const what = path.join(processId, 'reads', name);
        const id = name.slice(0, -'.json'.length);
        const read = parseFile<ReturnType<typeof keptReadSchema.parse>>(
          path.join(folder, name),
          keptReadSchema,
        );
        if ('why' in read) {
          into.refused.push({ what, why: read.why });
        } else if (!PROCESS_ID.test(processId) || !READ_ID.test(id)) {
          into.refused.push({
            what,
            why: 'the process or the read id is not one the table takes',
          });
        } else if (read.value.id !== id) {
          into.refused.push({
            what,
            why: `the file is named ${id} but the read says it is ${read.value.id}`,
          });
        } else {
          const refusedBefore = into.refused.length;
          await settle(
            into,
            what,
            async () => {
              const [row] = await db
                .select({ body: reads.body })
                .from(reads)
                .where(and(eq(reads.process, processId), eq(reads.id, id)));
              return row ? { same: same(row.body, read.value) } : null;
            },
            async () => {
              await ensureProcess(db, processId);
              await db.insert(reads).values({
                process: processId,
                id,
                readAt: new Date(read.value.readAt),
                source: read.value.source,
                body: read.value,
              });
            },
            dryRun,
          );
          if (into.refused.length === refusedBefore)
            shared.reads.add(`${processId}/${id}`);
        }
      }
    }
    return into;
  },
};

const runSourceReads: Kind = {
  name: 'source reads',
  async run(db, dataDir, dryRun) {
    const into = tally();
    // data/sources/<source>/reads/<read id>.json
    for (const source of subfolders(path.join(dataDir, 'sources'))) {
      const folder = path.join(dataDir, 'sources', source, 'reads');
      for (const name of jsonFiles(folder)) {
        into.files += 1;
        const what = path.join('sources', source, 'reads', name);
        const id = name.slice(0, -'.json'.length);
        const read = parseFile<ReturnType<typeof keptSourceReadSchema.parse>>(
          path.join(folder, name),
          keptSourceReadSchema,
        );
        if ('why' in read) {
          into.refused.push({ what, why: read.why });
        } else if (!READ_ID.test(id) || id === 'captured') {
          into.refused.push({
            what,
            why: 'the read id is not one the table takes (the captured copy stays in fixtures/)',
          });
        } else if (read.value.readId !== id) {
          into.refused.push({
            what,
            why: `the file is named ${id} but the read says it is ${read.value.readId}`,
          });
        } else {
          await settle(
            into,
            what,
            async () => {
              const [row] = await db
                .select({ body: sourceReads.body })
                .from(sourceReads)
                .where(
                  and(
                    eq(sourceReads.source, source),
                    eq(sourceReads.readId, id),
                  ),
                );
              return row ? { same: same(row.body, read.value) } : null;
            },
            async () => {
              await db.insert(sourceReads).values({
                source,
                readId: id,
                readAt: new Date(read.value.readAt),
                body: read.value,
              });
            },
            dryRun,
          );
        }
      }
    }
    return into;
  },
};

// data/model-limits.json: one file, a row per model it names.
const runModelLimits: Kind = {
  name: 'model limits',
  async run(db, dataDir, dryRun) {
    const into = tally();
    const file = path.join(dataDir, 'model-limits.json');
    if (!jsonFiles(dataDir).includes('model-limits.json')) return into;
    into.files += 1;
    const kept = parseFile<ReturnType<typeof keptLimitsSchema.parse>>(
      file,
      keptLimitsSchema,
    );
    if ('why' in kept) {
      into.refused.push({ what: 'model-limits.json', why: kept.why });
      return into;
    }
    for (const row of rowsOfLimits(kept.value)) {
      const what = `model-limits.json: ${row.model}`;
      // What the row holds must be what the file says of this model; a limit
      // the columns cannot hold would otherwise be dropped without a word.
      const slice = keptLimitsSchema.parse({
        shares: pick(kept.value.shares, row.model),
        perMinute: pick(kept.value.perMinute, row.model),
        perDay: pick(kept.value.perDay, row.model),
        used: pick(kept.value.used, row.model),
      });
      if (!same(limitsOfRows([row]), slice)) {
        into.refused.push({
          what,
          why: 'a value of it does not fit the table (a limit that is not a whole positive number)',
        });
        continue;
      }
      await settle(
        into,
        what,
        async () => {
          const [existing] = await db
            .select()
            .from(modelLimits)
            .where(eq(modelLimits.model, row.model));
          return existing
            ? { same: same(limitsOfRows([existing]), slice) }
            : null;
        },
        async () => {
          await db.insert(modelLimits).values(row);
        },
        dryRun,
      );
    }
    return into;
  },
};

const pick = <T>(map: Record<string, T>, key: string) =>
  key in map ? { [key]: map[key] } : {};

// What a run keeps under data/<process>/<folder>/, named by its run key:
// <read>.<rulebook>.json, with `.part` or `-progress` before the extension
// for a part still being answered and for a job's progress.
const RUN_FILE =
  /^([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_-]+?)(\.part|-progress)?\.json$/;
type Variant = 'whole' | 'part' | 'progress';
const variantOf = (suffix: string | undefined): Variant =>
  suffix === '.part' ? 'part' : suffix === '-progress' ? 'progress' : 'whole';

type RunFile = {
  processId: string;
  file: string;
  what: string;
  readId: string;
  fingerprint: string;
};

// The files of one variant in every process's folder, and the names that are
// no run key's, which only the whole variant answers for.
function runFiles(dataDir: string, folder: string, variant: Variant) {
  const found: RunFile[] = [];
  const unnamed: string[] = [];
  for (const processId of subfolders(dataDir)) {
    const at = path.join(dataDir, processId, folder);
    for (const name of jsonFiles(at)) {
      const what = path.join(processId, folder, name);
      const match = RUN_FILE.exec(name);
      if (!match) {
        if (variant === 'whole') unnamed.push(what);
      } else if (variantOf(match[3]) === variant)
        found.push({
          processId,
          file: path.join(at, name),
          what,
          readId: match[1]!,
          fingerprint: match[2]!,
        });
    }
  }
  return { found, unnamed };
}

// The read a run's file was made on, under the process that keeps it (the
// same one the app's own writes use).
async function readIsKept(db: Database, shared: Shared, f: RunFile) {
  const process = readProcessOf({ id: f.processId });
  if (shared.reads.has(`${process}/${f.readId}`)) return true;
  const [row] = await db
    .select({ id: reads.id })
    .from(reads)
    .where(and(eq(reads.process, process), eq(reads.id, f.readId)));
  return Boolean(row);
}

/*
  A kind that is a file per run key, whole or a part: read through its
  schema, saying what its name says where it says anything, and kept only for
  a read that is in the database. `get` is the body the table already has for
  the file's key, and `put` writes it.
*/
function runKeyed<T>(
  name: string,
  folder: string,
  variant: Variant,
  schema: z.ZodType<T>,
  table: {
    get: (db: Database, f: RunFile, value: T) => Promise<unknown>;
    put: (db: Database, f: RunFile, value: T) => Promise<void>;
  },
  says?: (value: T) => { readId: string; fingerprint: string },
  // Told of each file kept, or found kept, for the kinds after it.
  kept?: (shared: Shared, f: RunFile, value: T) => void,
): Kind {
  return {
    name,
    async run(db, dataDir, dryRun, shared) {
      const into = tally();
      const { found, unnamed } = runFiles(dataDir, folder, variant);
      for (const what of unnamed) {
        into.files += 1;
        into.refused.push({
          what,
          why: 'the name is not <read>.<rulebook>.json',
        });
      }
      for (const f of found) {
        into.files += 1;
        const parsed = parseFile<T>(f.file, schema);
        if ('why' in parsed) {
          into.refused.push({ what: f.what, why: parsed.why });
          continue;
        }
        const value = parsed.value;
        const said = says?.(value);
        if (!PROCESS_ID.test(f.processId))
          into.refused.push({
            what: f.what,
            why: 'the process is not one the table takes',
          });
        else if (
          said &&
          (said.readId !== f.readId || said.fingerprint !== f.fingerprint)
        )
          into.refused.push({
            what: f.what,
            why: `the file is named ${f.readId}.${f.fingerprint} but says it is ${said.readId}.${said.fingerprint}`,
          });
        else if (!(await readIsKept(db, shared, f)))
          into.refused.push({
            what: f.what,
            why: `its read ${readProcessOf({ id: f.processId })}/${f.readId} is not in the database`,
          });
        else {
          const refusedBefore = into.refused.length;
          await settle(
            into,
            f.what,
            async () => {
              const row = await table.get(db, f, value);
              return row === null ? null : { same: same(row, value) };
            },
            async () => {
              await ensureProcess(db, f.processId);
              await table.put(db, f, value);
            },
            dryRun,
          );
          if (into.refused.length === refusedBefore) kept?.(shared, f, value);
        }
      }
      return into;
    },
  };
}

const runProposals = runKeyed(
  'proposals',
  'proposals',
  'whole',
  proposalSchema,
  {
    async get(db, f, value) {
      const [row] = await db
        .select({ body: proposals.body })
        .from(proposals)
        .where(
          and(
            eq(proposals.process, f.processId),
            eq(proposals.readId, f.readId),
            eq(proposals.fingerprint, f.fingerprint),
            eq(proposals.proposedAt, new Date(value.at)),
          ),
        );
      return row ? row.body : null;
    },
    async put(db, f, value) {
      await db.insert(proposals).values({
        process: f.processId,
        readProcess: readProcessOf({ id: f.processId }),
        readId: f.readId,
        fingerprint: f.fingerprint,
        proposedAt: new Date(value.at),
        model: value.model,
        body: value,
      });
    },
  },
  (value) => value,
  (shared, f, value) =>
    shared.proposals.add(
      proposalKey(f.processId, f.readId, f.fingerprint, value.at),
    ),
);

// A part is one row per kind and run key, replaced as batches arrive.
const partTable = <T>(kind: (typeof PART_KINDS)[number]) => ({
  async get(db: Database, f: RunFile) {
    const [row] = await db
      .select({ body: answerParts.body })
      .from(answerParts)
      .where(
        and(
          eq(answerParts.process, f.processId),
          eq(answerParts.kind, kind),
          eq(answerParts.readId, f.readId),
          eq(answerParts.fingerprint, f.fingerprint),
        ),
      );
    return row ? row.body : null;
  },
  async put(db: Database, f: RunFile, value: T) {
    await db.insert(answerParts).values({
      process: f.processId,
      readProcess: readProcessOf({ id: f.processId }),
      kind,
      readId: f.readId,
      fingerprint: f.fingerprint,
      body: value,
    });
  },
});

const runProposalParts = runKeyed(
  'proposal parts',
  'proposals',
  'part',
  proposalPartSchema,
  partTable('proposal'),
);

const runCrossChecks = runKeyed(
  'cross-checks',
  'cross-checks',
  'whole',
  crossCheckSchema,
  {
    async get(db, f) {
      const [row] = await db
        .select({ body: crossChecks.body })
        .from(crossChecks)
        .where(
          and(
            eq(crossChecks.process, f.processId),
            eq(crossChecks.readId, f.readId),
            eq(crossChecks.fingerprint, f.fingerprint),
          ),
        );
      return row ? row.body : null;
    },
    async put(db, f, value) {
      await db.insert(crossChecks).values({
        process: f.processId,
        readProcess: readProcessOf({ id: f.processId }),
        readId: f.readId,
        fingerprint: f.fingerprint,
        checkedAt: new Date(value.at),
        model: value.model,
        agreed: value.agreed,
        total: value.total,
        body: value,
      });
    },
  },
  (value) => value,
);

const runCrossCheckParts = runKeyed(
  'cross-check parts',
  'cross-checks',
  'part',
  crossCheckPartSchema,
  partTable('cross-check'),
);

/*
  A job's progress file, into `jobs`. One kept as running is from a process
  that is gone: it is imported as running under the holder `import`, its
  lease last renewed when the file was written (and no later than two leases
  ago), so the app reads it as interrupted, and a start takes the key over.
*/
type Progress = ReturnType<typeof draftProgressSchema.parse>;
type JobFile = { processId: string; what: string; file: string; key: string };

function jobRow(
  f: JobFile,
  kind: 'drafts' | 'proposals',
  progress: Progress,
  wrote: Date,
) {
  return {
    process: f.processId,
    kind,
    key: f.key,
    step: progress.step,
    running: progress.running,
    error: progress.error,
    writing: progress.writing ?? null,
    activity: progress.activity ?? null,
    holder: progress.running ? 'import' : null,
    heartbeatAt: progress.running
      ? new Date(Math.min(wrote.getTime(), Date.now() - 2 * LEASE_MS))
      : null,
    startedAt: wrote,
  };
}

// What a row says of the job, as the file said it.
const progressOf = (row: {
  step: string;
  running: boolean;
  error: string | null;
  writing: string | null;
  activity: unknown;
}) => [row.step, row.running, row.error, row.writing, row.activity];

function jobKind(
  name: string,
  kind: 'drafts' | 'proposals',
  filesIn: (dataDir: string) => JobFile[],
): Kind {
  return {
    name,
    async run(db, dataDir, dryRun) {
      const into = tally();
      for (const f of filesIn(dataDir)) {
        into.files += 1;
        const parsed = parseFile<Progress>(f.file, draftProgressSchema);
        if ('why' in parsed) {
          into.refused.push({ what: f.what, why: parsed.why });
          continue;
        }
        if (!PROCESS_ID.test(f.processId)) {
          into.refused.push({
            what: f.what,
            why: 'the process is not one the table takes',
          });
          continue;
        }
        const row = jobRow(f, kind, parsed.value, statSync(f.file).mtime);
        await settle(
          into,
          f.what,
          async () => {
            const [existing] = await db
              .select()
              .from(jobs)
              .where(
                and(
                  eq(jobs.process, f.processId),
                  eq(jobs.kind, kind),
                  eq(jobs.key, f.key),
                ),
              );
            return existing
              ? { same: same(progressOf(existing), progressOf(row)) }
              : null;
          },
          async () => {
            await ensureProcess(db, f.processId);
            await db.insert(jobs).values(row);
          },
          dryRun,
        );
      }
      return into;
    },
  };
}

// data/<process>/proposals/<read>.<rulebook>-progress.json
const runProposalProgress = jobKind('proposal progress', 'proposals', (dir) =>
  runFiles(dir, 'proposals', 'progress').found.map((f) => ({
    processId: f.processId,
    what: f.what,
    file: f.file,
    key: `${f.readId}:${f.fingerprint}`,
  })),
);

// data/<process>/drafts/<instructions hash>.json
const runDraftProgress = jobKind('draft progress', 'drafts', (dir) =>
  subfolders(dir).flatMap((processId) =>
    jsonFiles(path.join(dir, processId, 'drafts')).map((name) => ({
      processId,
      what: path.join(processId, 'drafts', name),
      file: path.join(dir, processId, 'drafts', name),
      key: name.slice(0, -'.json'.length),
    })),
  ),
);

/*
  data/<process>/applied/<read>.<rulebook>.json: the record of each write of
  a run, an array, oldest first. Each entry is a row, in order, so the latest
  is the one in force as the last entry was. An entry already there (the
  same place in the run's rows, the same content) is present; one there with
  other content, which the app may have settled since, is refused with every
  entry after it, since the order is the record. A file with two writes
  standing at once (pending, verified or mismatch), which the table's unique
  index cannot hold, is refused whole. A pending entry is kept pending, its
  lease given back, and the app settles it once it can read the sheet.
*/
const STANDING = new Set(['pending', 'verified', 'mismatch']);
const FIELDS = new Set(Object.keys(applicationSchema.shape));
const canonical = (a: Application) => JSON.stringify(recordFields(a));
// A time as the app writes one, so it reads back as the same string.
const exactTime = (at: string | null | undefined) =>
  at === null || at === undefined || new Date(at).toISOString() === at;

const runApplications: Kind = {
  name: 'applications',
  async run(db, dataDir, dryRun, shared) {
    const into = tally();
    const { found, unnamed } = runFiles(dataDir, 'applied', 'whole');
    for (const what of unnamed) {
      into.files += 1;
      into.refused.push({
        what,
        why: 'the name is not <read>.<rulebook>.json',
      });
    }
    for (const f of found) {
      into.files += 1;
      const parsed = parseFile<Application[]>(
        f.file,
        z.array(applicationSchema),
      );
      if ('why' in parsed) {
        into.refused.push({ what: f.what, why: parsed.why });
        continue;
      }
      const entries = parsed.value;
      const whyNot = (() => {
        if (!PROCESS_ID.test(f.processId))
          return 'the process is not one the table takes';
        const standing = entries.filter((e) => STANDING.has(e.status)).length;
        if (standing > 1)
          return `${standing} of its writes stand at once (pending, verified or mismatch), and a run has at most one: settle or undo them before importing`;
        for (const [i, entry] of entries.entries()) {
          const extra = Object.keys(entry).filter((k) => !FIELDS.has(k));
          if (extra.length)
            return `entry ${i + 1} holds ${extra.join(', ')}, which the table has no column for`;
          if (
            ![entry.at, entry.proposedAt, entry.undoneAt, entry.undoStartedAt]
              .map(exactTime)
              .every(Boolean)
          )
            return `entry ${i + 1} has a time not written as the app writes one`;
        }
        return null;
      })();
      if (whyNot) {
        into.refused.push({ what: f.what, why: whyNot });
        continue;
      }
      if (!(await readIsKept(db, shared, f))) {
        into.refused.push({
          what: f.what,
          why: `its read ${readProcessOf({ id: f.processId })}/${f.readId} is not in the database`,
        });
        continue;
      }
      const key = {
        process: f.processId,
        readId: f.readId,
        fingerprint: f.fingerprint,
      };
      let existing: string[];
      try {
        existing = (await rowsOfKey(db, key)).map((row) =>
          canonical(recordOf(key, row)),
        );
      } catch (error) {
        into.refused.push({ what: f.what, why: reasonOf(error) });
        continue;
      }
      let stopped = false;
      for (const [i, entry] of entries.entries()) {
        const what = `${f.what} entry ${i + 1}`;
        if (stopped) {
          into.refused.push({ what, why: 'an entry before it was refused' });
          continue;
        }
        if (i < existing.length) {
          if (existing[i] === canonical(entry)) into.present += 1;
          else {
            into.refused.push({
              what,
              why: 'the database has a record at this place of the run with other content; left as it is',
            });
            stopped = true;
          }
          continue;
        }
        const [proposal] = await db
          .select({ id: proposals.id })
          .from(proposals)
          .where(
            and(
              eq(proposals.process, f.processId),
              eq(proposals.readId, f.readId),
              eq(proposals.fingerprint, f.fingerprint),
              eq(proposals.proposedAt, new Date(entry.proposedAt)),
            ),
          );
        const wouldBe =
          dryRun &&
          shared.proposals.has(
            proposalKey(f.processId, f.readId, f.fingerprint, entry.proposedAt),
          );
        if (!proposal && !wouldBe) {
          into.refused.push({
            what,
            why: `the proposal it wrote (${f.processId}/${f.readId}.${f.fingerprint} at ${entry.proposedAt}) is not in the database`,
          });
          stopped = true;
          continue;
        }
        try {
          if (!dryRun)
            await insertRow(db, {
              key,
              readProcess: readProcessOf({ id: f.processId }),
              proposalId: proposal!.id,
              // Runs were kept only in a browser: none is imported.
              runId: null,
              application: entry,
              holder: null,
            });
          into.inserted += 1;
        } catch (error) {
          into.refused.push({ what, why: reasonOf(error) });
          stopped = true;
        }
      }
    }
    return into;
  },
};

export const KINDS: Kind[] = [
  runReads,
  runSourceReads,
  runModelLimits,
  runProposals,
  runProposalParts,
  runCrossChecks,
  runCrossCheckParts,
  runProposalProgress,
  runDraftProgress,
  runApplications,
];
