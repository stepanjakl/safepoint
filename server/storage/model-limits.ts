import path from 'node:path';
import { z } from 'zod';

import { readKeptSync, writeKept } from './files';

/*
  Server-only. What is learned of a model's limits, kept in
  data/model-limits.json so a restart does not start the learning again. How
  it is learned and used is lib/definitions/limits.ts.
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

// Read when used, so a test can work in a scratch directory.
export const limitsFile = () =>
  path.join(process.cwd(), 'data', 'model-limits.json');

// A convenience: nothing kept, or what cannot be read, is learned afresh.
export const readKeptLimits = (file: string) =>
  readKeptSync(file, keptLimitsSchema, { unreadableIsMissing: true });

export const writeKeptLimits = (file: string, kept: KeptLimits) =>
  writeKept(file, kept);
