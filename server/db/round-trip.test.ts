import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { asc, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  fingerprintOf,
  hashOf,
  profileFingerprint,
} from '@/lib/engine/fingerprint';
import { inScratchDatabase, rowsOf } from '@/lib/engine/scratch.fixture';
import {
  dataProfileSchema,
  definitionSetSchema,
  proposalSchema,
  revisionIndexSchema,
  type DataProfile,
  type DefinitionSet,
  type RevisionIndex,
} from '@/lib/engine/types';
import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

import {
  currentProfiles,
  currentRulebooks,
  dataProfiles,
  instructionVersions,
  processes,
  proposals,
  reads,
  rulebookHeads,
  rulebookRevisions,
} from './schema';

/*
  Whether a body kept in the database comes back as the file it was, to the
  byte: what decides whether fixtures/ can be exported from the database.
  PostgreSQL's documentation says jsonb "does not preserve the order of object
  keys" (8.14, JSON Types) and json "stores an exact copy of the input text";
  this holds both against every file the export would write. Read-only: the
  files are read, never written.
*/

const db = inScratchDatabase();

const ROOTS = [
  'fixtures/brunch-orders/rulebooks',
  'fixtures/brunch-orders/profile',
  'e2e/fixtures',
];
const files = ROOTS.flatMap(function walk(dir: string): string[] {
  return readdirSync(dir)
    .map((name) => path.join(dir, name))
    .flatMap((file) =>
      statSync(file).isDirectory()
        ? walk(file)
        : file.endsWith('.json')
          ? [file]
          : [],
    );
}).sort();

const text = (file: string) => readFileSync(file, 'utf8');
// How every kept file is written (server/storage/files.ts, writeKept).
const asFile = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const read = <T>(file: string, schema: z.ZodType<T>) =>
  schema.parse(JSON.parse(text(file)));

// The schema each body is read through, where the engine has one.
function schemaOf(file: string): z.ZodType | null {
  const name = path.basename(file);
  if (name === 'revisions.json') return revisionIndexSchema;
  if (file.includes('/profile/')) return dataProfileSchema;
  if (file.includes('/rulebooks/')) return definitionSetSchema;
  if (name.endsWith('-accepted.json') || name.endsWith('-rules.json'))
    return definitionSetSchema;
  return null;
}

describe('a body kept as json or jsonb', () => {
  beforeEach(async () => {
    // The scratch database is emptied between tests, not made again.
    await db().execute(sql`drop table if exists bodies`);
    await db().execute(
      sql`create table bodies (file text primary key, as_json json, as_jsonb jsonb)`,
    );
    for (const file of files)
      await db().execute(
        sql`insert into bodies values (${file}, ${text(file)}::json, ${text(file)}::jsonb)`,
      );
  });

  const back = async (file: string) => {
    const rows = await rowsOf<{ as_json: unknown; as_jsonb: unknown }>(
      db(),
      sql`select as_json, as_jsonb from bodies where file = ${file}`,
    );
    return rows[0]!;
  };

  it('reads every file under test', () => {
    expect(files).toHaveLength(14);
    for (const file of files)
      expect(asFile(JSON.parse(text(file)))).toBe(text(file));
  });

  it.each(files)('as json, %s comes back to the byte', async (file) => {
    expect(asFile((await back(file)).as_json)).toBe(text(file));
  });

  it('as jsonb, comes back reordered for every file', async () => {
    const reordered = [];
    for (const file of files)
      if (asFile((await back(file)).as_jsonb) !== text(file))
        reordered.push(file);
    // Every one: each has an object whose keys are not in jsonb's order
    // (shorter keys first, then by byte).
    expect(reordered).toEqual(files);
  });

  /*
    Zod rebuilds an object's keys in the order its schema declares them, which
    is how the files were arranged, so read through its schema every rulebook,
    profile and index kept today comes back exact. That is the data's luck,
    not the design's: a record's keys (z.record) come back in jsonb's order.
  */
  const viaJsonb = async (value: unknown) => {
    const rows = await rowsOf<{ as_jsonb: unknown }>(
      db(),
      sql`select ${JSON.stringify(value)}::jsonb as as_jsonb`,
    );
    return rows[0]!.as_jsonb;
  };

  it('as jsonb, is put back by its schema for every file kept today', async () => {
    const lost: string[] = [];
    for (const file of files) {
      const schema = schemaOf(file);
      if (
        schema &&
        asFile(schema.parse((await back(file)).as_jsonb)) !== text(file)
      )
        lost.push(file);
    }
    expect(lost).toEqual([]);
  });

  it('as jsonb, loses the order of a record even through its schema', async () => {
    // An example setting two fields, as the conformance process's do.
    const accepted = read(
      'e2e/fixtures/brunch-orders-accepted.json',
      definitionSetSchema,
    );
    const [first, ...rest] = accepted.definitions;
    const twoFields: DefinitionSet = {
      ...accepted,
      definitions: [
        {
          ...first!,
          examples: first!.examples.map((example) => ({
            ...example,
            inputs: { order: 4, cover: 2 },
          })),
        },
        ...rest,
      ],
    };
    expect(
      asFile(definitionSetSchema.parse(await viaJsonb(twoFields))),
    ).not.toBe(asFile(twoFields));
    // A proposal's records come back in jsonb's order, not the read's.
    const proposal = proposalSchema.parse(
      JSON.parse(text('e2e/fixtures/brunch-orders-proposal.json')).proposal,
    );
    const keys = Object.keys(proposal.records);
    const reordered = Object.keys(
      proposalSchema.parse(await viaJsonb(proposal)).records,
    );
    expect(reordered).not.toEqual(keys);
    expect(reordered).toEqual(
      [...keys].sort((a, b) => a.length - b.length || (a < b ? -1 : 1)),
    );
  });
});

const PROCESS = brunchOrdersProcess.id;
const versions = [
  brunchOrdersProcess.instructions,
  ...brunchOrdersProcess.instructions.previous,
];

async function seedProcess() {
  await db().insert(processes).values({ id: PROCESS });
  await db()
    .insert(instructionVersions)
    .values(
      versions.map((version) => ({
        process: PROCESS,
        hash: hashOf(version.text),
        version: version.version,
        text: version.text,
        origin: 'declared',
        publishedAt: new Date('2026-10-01T00:00:00.000Z'),
      })),
    );
}

describe('the accepted rulebook and the frozen proposal, in their tables', () => {
  it('come back as they went in, ids and all', async () => {
    await seedProcess();
    const accepted = read(
      'e2e/fixtures/brunch-orders-accepted.json',
      definitionSetSchema,
    );
    const id = fingerprintOf(accepted);
    await db().insert(rulebookRevisions).values({
      process: PROCESS,
      instructionsHash: accepted.hash,
      id,
      reason: 'accepted',
      revisedAt: new Date(),
      schemaVersion: 1,
      body: accepted,
    });
    const [revision] = await db()
      .select({ body: rulebookRevisions.body })
      .from(rulebookRevisions)
      .where(eq(rulebookRevisions.id, id));
    expect(JSON.stringify(revision!.body)).toBe(JSON.stringify(accepted));
    expect(asFile(definitionSetSchema.parse(revision!.body))).toBe(
      text('e2e/fixtures/brunch-orders-accepted.json'),
    );
    expect(fingerprintOf(definitionSetSchema.parse(revision!.body))).toBe(id);

    const frozen = JSON.parse(text('e2e/fixtures/brunch-orders-proposal.json'))
      .proposal as unknown;
    const proposal = proposalSchema.parse(frozen);
    await db()
      .insert(reads)
      .values({
        process: PROCESS,
        id: proposal.readId,
        readAt: new Date(),
        source: 'A stand-in for the read, which is not in git',
        body: { id: proposal.readId } as never,
      });
    await db()
      .insert(proposals)
      .values({
        process: PROCESS,
        readProcess: PROCESS,
        readId: proposal.readId,
        fingerprint: proposal.fingerprint,
        proposedAt: new Date(proposal.at),
        model: proposal.model,
        body: proposal,
      });
    const [kept] = await db()
      .select({ body: proposals.body, at: proposals.proposedAt })
      .from(proposals);
    expect(JSON.stringify(kept!.body)).toBe(JSON.stringify(frozen));
    expect(kept!.at.toISOString()).toBe(proposal.at);
  });
});

/*
  The export the plan depends on: each kept rulebook folder and the profile
  folder, written into their tables as an import would and written back out
  as an export would, file for file, byte for byte.
*/
describe('fixtures/, imported and exported', () => {
  const folder = 'fixtures/brunch-orders';

  async function importAll() {
    await seedProcess();
    for (const name of readdirSync(`${folder}/profile`)) {
      const profile = read(`${folder}/profile/${name}`, dataProfileSchema);
      expect(profileFingerprint(profile)).toBe(profile.id);
      if (name === 'current.json')
        await db().insert(currentProfiles).values({
          process: PROCESS,
          profileId: profile.id,
          body: profile,
        });
      else
        await db()
          .insert(dataProfiles)
          .values({
            process: PROCESS,
            id: profile.id,
            readId: profile.readId,
            confirmedAt: new Date(profile.confirmedAt!),
            body: profile,
          });
    }
    for (const dir of readdirSync(`${folder}/rulebooks`)) {
      const at = `${folder}/rulebooks/${dir}`;
      const current = read(`${at}/current.json`, definitionSetSchema);
      await db().insert(currentRulebooks).values({
        process: PROCESS,
        instructionsHash: current.hash,
        body: current,
        schemaVersion: 1,
      });
      const index = read(`${at}/revisions.json`, revisionIndexSchema);
      await db().transaction(async (tx) => {
        for (const entry of index.revisions) {
          const body = read(`${at}/${entry.id}.json`, definitionSetSchema);
          expect(fingerprintOf(body)).toBe(entry.id);
          await tx.insert(rulebookRevisions).values({
            process: PROCESS,
            instructionsHash: body.hash,
            id: entry.id,
            parent: entry.parent,
            reason: entry.reason,
            revisedAt: new Date(entry.at),
            schemaVersion: entry.schemaVersion,
            note: entry.note,
            profileId: body.profileId ?? null,
            body,
          });
        }
        if (index.head)
          await tx.insert(rulebookHeads).values({
            process: PROCESS,
            instructionsHash: current.hash,
            revisionId: index.head,
          });
      });
    }
  }

  // What an export writes, by the path it writes it to.
  async function exportAll(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const hashes = await db().select().from(instructionVersions);
    for (const row of await db().select().from(currentRulebooks)) {
      const version = hashes.find((h) => h.hash === row.instructionsHash)!;
      const at = `${folder}/rulebooks/${version.version}-${row.instructionsHash}`;
      out[`${at}/current.json`] = asFile(definitionSetSchema.parse(row.body));
      const revisions = await db()
        .select()
        .from(rulebookRevisions)
        .where(eq(rulebookRevisions.instructionsHash, row.instructionsHash))
        .orderBy(asc(rulebookRevisions.seq));
      for (const revision of revisions)
        out[`${at}/${revision.id}.json`] = asFile(
          definitionSetSchema.parse(revision.body),
        );
      const [head] = await db()
        .select()
        .from(rulebookHeads)
        .where(eq(rulebookHeads.instructionsHash, row.instructionsHash));
      const index: RevisionIndex = {
        head: head?.revisionId ?? null,
        revisions: revisions.map((r) => ({
          id: r.id,
          parent: r.parent,
          reason: r.reason as RevisionIndex['revisions'][number]['reason'],
          at: r.revisedAt.toISOString(),
          schemaVersion: r.schemaVersion,
          note: r.note,
        })),
      };
      out[`${at}/revisions.json`] = asFile(revisionIndexSchema.parse(index));
    }
    const [current] = await db().select().from(currentProfiles);
    out[`${folder}/profile/current.json`] = asFile(
      dataProfileSchema.parse(current!.body),
    );
    for (const row of await db().select().from(dataProfiles))
      out[`${folder}/profile/${row.id}.json`] = asFile(
        dataProfileSchema.parse(row.body),
      );
    return out;
  }

  it('gives back every file exactly', async () => {
    await importAll();
    const exported = await exportAll();
    const kept = files.filter((file) => file.startsWith(folder));
    expect(Object.keys(exported).sort()).toEqual(kept);
    for (const file of kept) expect(exported[file], file).toBe(text(file));
  });

  it('keeps each id reproducible from its body', async () => {
    await importAll();
    for (const row of await db().select().from(rulebookRevisions))
      expect(fingerprintOf(row.body as DefinitionSet)).toBe(row.id);
    for (const row of await db().select().from(dataProfiles))
      expect(profileFingerprint(row.body as DataProfile)).toBe(row.id);
  });
});
