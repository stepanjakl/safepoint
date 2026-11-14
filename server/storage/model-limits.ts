import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { database, type Database } from '@/server/db/client';
import { modelLimits } from '@/server/db/schema';

import { inTurn } from './files';

/*
  Server-only. What is learned of a model's limits, kept in the `model_limits`
  table, one row per model, so a restart does not start the learning again.
  How it is learned and used is lib/definitions/limits.ts.
*/

const learnedSchema = z.object({ limit: z.number(), at: z.number() });
export type Learned = z.infer<typeof learnedSchema>;
export const keptLimitsSchema = z.object({
  // A model and the one it shares quota with.
  shares: z.record(z.string(), z.string()).default({}),
  perMinute: z.record(z.string(), learnedSchema).default({}),
  perDay: z.record(z.string(), learnedSchema).default({}),
  // Requests sent on a day, as Google's daily limit counts days.
  used: z
    .record(z.string(), z.object({ day: z.string(), count: z.number() }))
    .default({}),
});
export type KeptLimits = z.infer<typeof keptLimitsSchema>;

// Where limits are kept, as limits.ts holds it: the same one for the life of
// the process, so it can tell a database it has read from one it has not.
export type LimitsStore = Database;
export const limitsStore = (): Promise<LimitsStore> => database();

// A model's row as the app holds it, without the time it was written.
type LimitsRow = Omit<typeof modelLimits.$inferSelect, 'updatedAt'>;

// Whole and positive, as the column and its check hold: what a column cannot
// hold stays learned in memory only, rather than failing the whole row.
const inColumn = (learned: Learned | undefined) =>
  learned &&
  Number.isInteger(learned.limit) &&
  learned.limit > 0 &&
  learned.limit <= 2_147_483_647
    ? learned
    : undefined;

// One model's row, from what is held of it.
function rowOf(model: string, kept: KeptLimits): LimitsRow {
  const perMinute = inColumn(kept.perMinute[model]);
  const perDay = inColumn(kept.perDay[model]);
  const used = kept.used[model];
  return {
    model,
    sharesWith: kept.shares[model] ?? null,
    perMinute: perMinute?.limit ?? null,
    perMinuteLearnedAt: perMinute ? new Date(perMinute.at) : null,
    perDay: perDay?.limit ?? null,
    perDayLearnedAt: perDay ? new Date(perDay.at) : null,
    usedDay: used?.day ?? null,
    usedCount: used ? Math.max(0, Math.floor(used.count)) : 0,
  };
}

// Every model's row as what is held of limits, read through its schema.
export function limitsOfRows(rows: LimitsRow[]) {
  const kept: z.input<typeof keptLimitsSchema> = {
    shares: {},
    perMinute: {},
    perDay: {},
    used: {},
  };
  for (const row of rows) {
    if (row.sharesWith) kept.shares![row.model] = row.sharesWith;
    if (row.perMinute !== null && row.perMinuteLearnedAt)
      kept.perMinute![row.model] = {
        limit: row.perMinute,
        at: row.perMinuteLearnedAt.getTime(),
      };
    if (row.perDay !== null && row.perDayLearnedAt)
      kept.perDay![row.model] = {
        limit: row.perDay,
        at: row.perDayLearnedAt.getTime(),
      };
    if (row.usedDay)
      kept.used![row.model] = { day: row.usedDay, count: row.usedCount };
  }
  return keptLimitsSchema.parse(kept);
}

// The rows a kept file of limits is, one per model it names.
export function rowsOfLimits(kept: KeptLimits): LimitsRow[] {
  const models = new Set([
    ...Object.keys(kept.shares),
    ...Object.keys(kept.perMinute),
    ...Object.keys(kept.perDay),
    ...Object.keys(kept.used),
  ]);
  return [...models].sort().map((model) => rowOf(model, kept));
}

export async function loadKeptLimits(db: LimitsStore): Promise<KeptLimits> {
  return limitsOfRows(await db.select().from(modelLimits));
}

/*
  Keeps what is held of these models, each as its own row: another instance
  learning of another model at the same time is not undone, as a whole map
  written back would. One at a time in this process, and the rows are made
  when their turn comes, so the last to be written is the latest held.
*/
export function saveKeptLimits(
  db: LimitsStore,
  models: Iterable<string>,
  held: () => KeptLimits,
): Promise<void> {
  const touched = [...new Set(models)];
  return inTurn('model-limits', async () => {
    if (!touched.length) return;
    const kept = held();
    await db
      .insert(modelLimits)
      .values(touched.map((model) => rowOf(model, kept)))
      .onConflictDoUpdate({
        target: modelLimits.model,
        set: {
          sharesWith: sql`excluded.shares_with`,
          perMinute: sql`excluded.per_minute`,
          perMinuteLearnedAt: sql`excluded.per_minute_learned_at`,
          perDay: sql`excluded.per_day`,
          perDayLearnedAt: sql`excluded.per_day_learned_at`,
          usedDay: sql`excluded.used_day`,
          usedCount: sql`excluded.used_count`,
          updatedAt: sql`now()`,
        },
      });
  });
}
