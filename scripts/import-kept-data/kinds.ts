/*
  What the import copies, kind by kind. A kind reads the files the server kept
  under data/ before it kept them in the database (the files
  server/storage/kept-data.test.ts walks), through the schema each is read
  with, and puts each into its table if the table lacks it. It never writes,
  moves or deletes a file, never overwrites a row, and reports what it
  refused rather than failing on it.

  A later batch adds a kind to KINDS: proposals, cross-checks, applications,
  jobs.
*/
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { eq, and } from 'drizzle-orm';

import { keptReadSchema } from '@/lib/definitions/records';
import type { Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { modelLimits, reads, sourceReads } from '@/server/db/schema';
import {
  keptLimitsSchema,
  limitsOfRows,
  rowsOfLimits,
} from '@/server/storage/model-limits';
import { keptSourceReadSchema } from '@/server/storage/source-reads';

export type Refusal = { what: string; why: string };

export type Tally = {
  // Files found for the kind; a file of limits holds a row per model.
  files: number;
  inserted: number;
  present: number;
  refused: Refusal[];
};

export type Kind = {
  name: string;
  run: (db: Database, dataDir: string, dryRun: boolean) => Promise<Tally>;
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
  async run(db, dataDir, dryRun) {
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

export const KINDS: Kind[] = [runReads, runSourceReads, runModelLimits];
