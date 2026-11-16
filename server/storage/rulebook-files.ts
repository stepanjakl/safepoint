import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { and, asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';

import {
  fingerprintOf,
  profileFingerprint,
} from '@/lib/definitions/fingerprint';
import {
  dataProfileSchema,
  definitionSetSchema,
  revisionIndexSchema,
  type DataProfile,
  type DefinitionSet,
  type RevisionIndex,
} from '@/lib/definitions/types';
import type { Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import {
  currentProfiles,
  currentRulebooks,
  dataProfiles,
  instructionVersions,
  rulebookHeads,
  rulebookRevisions,
} from '@/server/db/schema';
import { keptProcesses } from '@/server/operations/kept-processes';

import { StoredFileError, writeKept } from './files';
import { ensureDeclared } from './instructions';

/*
  Server-only. The one place rulebook and profile files are read or written:
  fixtures/<process>/ is the copy reviewed in git, the database the one the
  app reads (rulebooks.ts). Seeding reads it into a database that lacks it;
  the export (`pnpm rulebooks:export`) writes the database's state back.

    fixtures/<process>/rulebooks/<version>-<instructions hash>/
      current.json        the rulebook under review
      <rulebook id>.json  each accepted revision, as it was accepted
      revisions.json      each revision's parent and reason, and the head
    fixtures/<process>/profile/
      current.json        the profile under review, or the one last confirmed
      <profile id>.json   each confirmed profile, as it was confirmed

  Every file is written as writeKept writes one, and a file read in must
  already be that text, so what is exported is byte for byte what was seeded.

  Seeding inserts what the database lacks and never overwrites: a current
  rulebook, a head or a current profile the database holds stays, and a
  revision or confirmed profile already kept under its id is left as it is.
  The files the database has moved past are written over by the next export,
  where git shows the difference.
*/

// How every kept file is written (files.ts, writeKept).
const asFile = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const FOLDER = /^(.+)-([0-9a-f]{12})$/;
const FINGERPRINT_FILE = /^[0-9a-f]{12}\.json$/;

class FixtureError extends StoredFileError {}

async function entriesOf(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// A kept file, read through its schema; it must be exactly as an export
// would write it, or the export could not give it back.
async function readExact<T>(
  file: string,
  schema: z.ZodType<T>,
  where: string,
): Promise<T> {
  const text = await readFile(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FixtureError(`${where} is not valid JSON.`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new FixtureError(
      `${where} does not fit the stored shape: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}.`,
    );
  if (asFile(parsed.data) !== text)
    throw new FixtureError(
      `${where} is not written as the export writes it (two-space JSON, keys as the schema lists them, one newline at the end).`,
    );
  return parsed.data;
}

const exactInstant = (at: string, where: string) => {
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== at)
    throw new FixtureError(
      `${where} gives the time ${at}, not written as toISOString writes one.`,
    );
  return date;
};

type Folder = {
  where: string;
  version: string;
  hash: string;
  current: DefinitionSet | null;
  index: RevisionIndex | null;
  bodies: Map<string, DefinitionSet>;
};

type Fixtures = {
  current: DataProfile | null;
  confirmed: DataProfile[];
  folders: Folder[];
};

// Reads and checks everything fixtures/ holds for a process, naming the
// first file that is wrong.
export async function readFixtures(
  root: string,
  process: string,
): Promise<Fixtures> {
  const base = path.join(root, process);
  const name = (...parts: string[]) =>
    path.relative(path.dirname(root), path.join(base, ...parts));

  const confirmed: DataProfile[] = [];
  let current: DataProfile | null = null;
  for (const entry of await entriesOf(path.join(base, 'profile'))) {
    const where = name('profile', entry);
    const file = path.join(base, 'profile', entry);
    if (entry !== 'current.json' && !FINGERPRINT_FILE.test(entry))
      throw new FixtureError(
        `${where} is neither current.json nor <profile id>.json.`,
      );
    const profile = await readExact(file, dataProfileSchema, where);
    if (profileFingerprint(profile) !== profile.id)
      throw new FixtureError(
        `${where} does not match its id: it was changed after it was made.`,
      );
    if (entry === 'current.json') current = profile;
    else {
      if (entry !== `${profile.id}.json` || !profile.confirmedAt)
        throw new FixtureError(
          `${where} is not the confirmed profile its name says.`,
        );
      exactInstant(profile.confirmedAt, where);
      confirmed.push(profile);
    }
  }

  const folders: Folder[] = [];
  for (const entry of await entriesOf(path.join(base, 'rulebooks'))) {
    const where = name('rulebooks', entry);
    const match = FOLDER.exec(entry);
    if (!match)
      throw new FixtureError(
        `${where} is not named <version>-<instructions hash>.`,
      );
    const [, version, hash] = match as unknown as [string, string, string];
    const files = await entriesOf(path.join(base, 'rulebooks', entry));
    const at = (file: string) => path.join(base, 'rulebooks', entry, file);
    const folder: Folder = {
      where,
      version,
      hash,
      current: null,
      index: null,
      bodies: new Map(),
    };
    const ofHash = (set: DefinitionSet, file: string) => {
      if (set.hash !== hash)
        throw new FixtureError(
          `${name('rulebooks', entry, file)} is for instructions ${set.hash}, not ${hash}.`,
        );
      return set;
    };
    for (const file of files) {
      const named = name('rulebooks', entry, file);
      if (file === 'current.json')
        folder.current = ofHash(
          await readExact(at(file), definitionSetSchema, named),
          file,
        );
      else if (file === 'revisions.json')
        folder.index = await readExact(at(file), revisionIndexSchema, named);
      else if (FINGERPRINT_FILE.test(file)) {
        const set = ofHash(
          await readExact(at(file), definitionSetSchema, named),
          file,
        );
        const id = file.slice(0, -'.json'.length);
        if (fingerprintOf(set) !== id)
          throw new FixtureError(
            `${named} does not match its id: it was changed after it was accepted.`,
          );
        folder.bodies.set(id, set);
      } else
        throw new FixtureError(
          `${named} is none of current.json, revisions.json or <rulebook id>.json.`,
        );
    }
    const index = folder.index ?? { head: null, revisions: [] };
    const listed = new Set<string>();
    const indexName = name('rulebooks', entry, 'revisions.json');
    for (const revision of index.revisions) {
      if (listed.has(revision.id))
        throw new FixtureError(`${indexName} lists ${revision.id} twice.`);
      if (!folder.bodies.has(revision.id))
        throw new FixtureError(
          `${indexName} lists ${revision.id}, but ${revision.id}.json is not there.`,
        );
      if (revision.parent !== null && !listed.has(revision.parent))
        throw new FixtureError(
          `${indexName} gives ${revision.id} the parent ${revision.parent}, not listed before it.`,
        );
      exactInstant(revision.at, `${indexName} (${revision.id})`);
      listed.add(revision.id);
    }
    if (index.head !== null && !listed.has(index.head))
      throw new FixtureError(
        `${indexName} names the head ${index.head}, not listed.`,
      );
    for (const id of folder.bodies.keys())
      if (!listed.has(id))
        throw new FixtureError(
          `${name('rulebooks', entry, `${id}.json`)} is not listed in revisions.json.`,
        );
    folders.push(folder);
  }
  return { current, confirmed, folders };
}

export type SeedReport = { inserted: number; present: number };

/*
  Seeds a database from fixtures/ for one process: everything is read and
  checked first, then inserted in one transaction under a lock on the
  process, so two servers seeding at once insert it once. A rulebook folder
  must name a kept version of the instructions, with its label: the
  process's declared versions are kept here first.
*/
export async function seedRulebooks(
  db: Database,
  process: string,
  root = path.join(globalThis.process.cwd(), 'fixtures'),
): Promise<SeedReport> {
  const fixtures = await readFixtures(root, process);
  const report: SeedReport = { inserted: 0, present: 0 };
  const count = (rows: unknown[]) => {
    report.inserted += rows.length;
    report.present += 1 - rows.length;
  };
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`seed-rulebooks:${process}`}, 0))`,
    );
    await ensureProcess(tx, process);
    const kept = keptProcesses().find((entry) => entry.summary.id === process);
    if (kept) await ensureDeclared(tx, kept);

    for (const profile of fixtures.confirmed)
      count(
        await tx
          .insert(dataProfiles)
          .values({
            process,
            id: profile.id,
            readId: profile.readId,
            confirmedAt: new Date(profile.confirmedAt!),
            body: profile,
          })
          .onConflictDoNothing()
          .returning({ id: dataProfiles.id }),
      );
    if (fixtures.current)
      count(
        await tx
          .insert(currentProfiles)
          .values({
            process,
            profileId: fixtures.current.id,
            body: fixtures.current,
          })
          .onConflictDoNothing()
          .returning({ process: currentProfiles.process }),
      );

    for (const folder of fixtures.folders) {
      const [version] = await tx
        .select({ version: instructionVersions.version })
        .from(instructionVersions)
        .where(
          and(
            eq(instructionVersions.process, process),
            eq(instructionVersions.hash, folder.hash),
          ),
        );
      if (version?.version !== folder.version)
        throw new FixtureError(
          version
            ? `${folder.where} names instructions ${folder.version}, kept here as ${version.version}.`
            : `${folder.where} names instructions ${folder.version} (${folder.hash}), which this database does not keep: publish that text, or declare it in the process.`,
        );
      if (folder.current)
        count(
          await tx
            .insert(currentRulebooks)
            .values({
              process,
              instructionsHash: folder.hash,
              body: folder.current,
              schemaVersion: folder.index?.revisions.at(-1)?.schemaVersion ?? 1,
            })
            .onConflictDoNothing()
            .returning({ process: currentRulebooks.process }),
        );
      for (const revision of folder.index?.revisions ?? []) {
        const body = folder.bodies.get(revision.id)!;
        count(
          await tx
            .insert(rulebookRevisions)
            .values({
              process,
              instructionsHash: folder.hash,
              id: revision.id,
              parent: revision.parent,
              reason: revision.reason,
              revisedAt: new Date(revision.at),
              schemaVersion: revision.schemaVersion,
              note: revision.note,
              profileId: body.profileId ?? null,
              body,
            })
            .onConflictDoNothing()
            .returning({ id: rulebookRevisions.id }),
        );
      }
      if (folder.index?.head)
        count(
          await tx
            .insert(rulebookHeads)
            .values({
              process,
              instructionsHash: folder.hash,
              revisionId: folder.index.head,
            })
            .onConflictDoNothing()
            .returning({ id: rulebookHeads.revisionId }),
        );
    }
  });
  return report;
}

/*
  Writes every process's rulebooks and profiles the database holds into
  `root` (the folder that plays fixtures/), each file as writeKept writes
  one; returns the files written, relative to `root`. Files the database
  does not hold are left as they are. A body whose id is not its content is
  refused, as it is when read in.
*/
export async function exportRulebooks(
  db: Database,
  root: string,
): Promise<string[]> {
  const written: string[] = [];
  const write = async (relative: string, value: unknown) => {
    await writeKept(path.join(root, relative), value);
    written.push(relative);
  };
  const versions = await db
    .select({
      process: instructionVersions.process,
      hash: instructionVersions.hash,
      version: instructionVersions.version,
    })
    .from(instructionVersions);
  const labelOf = (process: string, hash: string) =>
    versions.find((v) => v.process === process && v.hash === hash)!.version;
  const folderOf = (process: string, hash: string) =>
    path.join(process, 'rulebooks', `${labelOf(process, hash)}-${hash}`);

  for (const row of await db
    .select()
    .from(currentRulebooks)
    .orderBy(
      asc(currentRulebooks.process),
      asc(currentRulebooks.instructionsHash),
    )) {
    const where = `The rulebook kept for ${row.process} instructions ${row.instructionsHash}`;
    await write(
      path.join(folderOf(row.process, row.instructionsHash), 'current.json'),
      parse(row.body, definitionSetSchema, where),
    );
  }

  const revisions = await db
    .select()
    .from(rulebookRevisions)
    .orderBy(asc(rulebookRevisions.seq));
  const heads = await db.select().from(rulebookHeads);
  const indexes = new Map<string, RevisionIndex>();
  for (const row of revisions) {
    const where = `The kept rulebook ${row.id} of ${row.process}`;
    const body = parse(row.body, definitionSetSchema, where);
    if (fingerprintOf(body) !== row.id)
      throw new FixtureError(`${where} does not match its id.`);
    const folder = folderOf(row.process, row.instructionsHash);
    await write(path.join(folder, `${row.id}.json`), body);
    const head =
      heads.find(
        (h) =>
          h.process === row.process &&
          h.instructionsHash === row.instructionsHash,
      )?.revisionId ?? null;
    const index = indexes.get(folder) ?? { head, revisions: [] };
    index.revisions.push({
      id: row.id,
      parent: row.parent,
      reason: row.reason as RevisionIndex['revisions'][number]['reason'],
      at: row.revisedAt.toISOString(),
      schemaVersion: row.schemaVersion,
      note: row.note,
    });
    indexes.set(folder, index);
  }
  for (const [folder, index] of indexes)
    await write(
      path.join(folder, 'revisions.json'),
      revisionIndexSchema.parse(index),
    );

  for (const row of await db
    .select()
    .from(currentProfiles)
    .orderBy(asc(currentProfiles.process))) {
    const where = `The data profile under review for ${row.process}`;
    const profile = parse(row.body, dataProfileSchema, where);
    if (profileFingerprint(profile) !== profile.id)
      throw new FixtureError(`${where} does not match its id.`);
    await write(path.join(row.process, 'profile', 'current.json'), profile);
  }
  for (const row of await db
    .select()
    .from(dataProfiles)
    .orderBy(asc(dataProfiles.process), asc(dataProfiles.id))) {
    const where = `The confirmed data profile ${row.id} of ${row.process}`;
    const profile = parse(row.body, dataProfileSchema, where);
    if (profileFingerprint(profile) !== row.id)
      throw new FixtureError(`${where} does not match its id.`);
    await write(path.join(row.process, 'profile', `${row.id}.json`), profile);
  }
  return written;
}

function parse<T>(body: unknown, schema: z.ZodType<T>, where: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new FixtureError(`${where} does not fit the stored shape.`);
  return parsed.data;
}
