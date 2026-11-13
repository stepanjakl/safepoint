import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  crossCheckPartSchema,
  crossCheckSchema,
} from '@/lib/definitions/calculate';
import { keptLimitsSchema } from '@/lib/definitions/limits';
import { keptReadSchema } from '@/lib/definitions/records';
import {
  applicationSchema,
  draftProgressSchema,
  proposalPartSchema,
  proposalSchema,
} from '@/lib/definitions/types';
import { keptSourceReadSchema } from '@/lib/sources/reads';

/*
  What the server has kept in data/ (gitignored) is history: each file must
  still read through the schema its kind is read with, and write back as the
  same bytes, so reading never changes what a file says. Skipped where there
  is no data/. SAFEPOINT_DATA_DIR names another folder to check; nothing here
  writes to it.
*/

const root = process.env.SAFEPOINT_DATA_DIR ?? path.join(process.cwd(), 'data');
const present = existsSync(root);

const apps = z.array(applicationSchema);

// The schema a file of this folder is read with, by what its name ends in.
const schemaOf = (folder: string, name: string): z.ZodType | null => {
  if (folder === 'reads') return keptReadSchema;
  if (folder === 'applied') return apps;
  if (folder === 'drafts') return draftProgressSchema;
  const part = name.endsWith('.part.json');
  if (folder === 'cross-checks')
    return part ? crossCheckPartSchema : crossCheckSchema;
  if (folder === 'proposals')
    return name.endsWith('-progress.json')
      ? draftProgressSchema
      : part
        ? proposalPartSchema
        : proposalSchema;
  return null;
};

const dirs = (at: string) =>
  readdirSync(at, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

// Every kept file, with the kind it is checked as.
function kept(): { kind: string; file: string; schema: z.ZodType }[] {
  const found: { kind: string; file: string; schema: z.ZodType }[] = [];
  const jsonIn = (at: string) =>
    readdirSync(at).filter((name) => name.endsWith('.json'));
  for (const processId of dirs(root).filter((name) => name !== 'sources'))
    for (const folder of dirs(path.join(root, processId)))
      for (const name of jsonIn(path.join(root, processId, folder))) {
        const schema = schemaOf(folder, name);
        if (!schema) continue;
        const kind = `${folder}${name.endsWith('-progress.json') ? ' progress' : name.endsWith('.part.json') ? ' part' : ''}`;
        found.push({
          kind,
          file: path.join(root, processId, folder, name),
          schema,
        });
      }
  const sources = path.join(root, 'sources');
  if (existsSync(sources))
    for (const source of dirs(sources)) {
      const reads = path.join(sources, source, 'reads');
      if (existsSync(reads))
        for (const name of jsonIn(reads))
          found.push({
            kind: 'source reads',
            file: path.join(reads, name),
            schema: keptSourceReadSchema,
          });
    }
  const limits = path.join(root, 'model-limits.json');
  if (existsSync(limits))
    found.push({
      kind: 'model limits',
      file: limits,
      schema: keptLimitsSchema,
    });
  return found;
}

describe.skipIf(!present)('what the server has kept in data/', () => {
  it('reads through its schema and writes back as the same bytes', () => {
    const counts: Record<string, number> = {};
    const failed: string[] = [];
    for (const { kind, file, schema } of kept()) {
      counts[kind] = (counts[kind] ?? 0) + 1;
      const where = path.relative(root, file);
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        failed.push(
          `${where}: ${parsed.error.issues
            .slice(0, 2)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        );
      } else if (JSON.stringify(parsed.data) !== JSON.stringify(raw))
        failed.push(`${where}: does not write back as it was read`);
    }
    console.info(`Kept files checked: ${JSON.stringify(counts)}`);
    expect(failed).toEqual([]);
  });
});
