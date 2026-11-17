import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { hashOf } from '@/lib/definitions/fingerprint';
import type { InstructionsVersion } from '@/lib/shell/model';
import { normalisedInstructions } from '@/lib/shell/instruction-diff';

import { database, type Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { instructionVersions } from '@/server/db/schema';
import type { KeptProcess } from '@/server/operations/kept-processes';

import { Refused } from './refused';

/*
  Server-only. A process's instruction versions, in `instruction_versions`,
  each written once: the ones its declaration names (`declared`), made sure
  of before anything reads or refers to them, and the ones a person
  publishes (`published`), labelled by the server, v<N> on from the highest
  label the process has. The hash is the text's (hashOf, which the table's
  check repeats in SQL), so a run, a rulebook and a decision name a version
  by it.
*/

export type KeptVersion = {
  hash: string;
  version: string;
  text: string;
  note: string | null;
  origin: 'declared' | 'published';
  // Who published it; for a declared one, its author as declared.
  publishedBy: string | null;
  publishedAt: string;
  // What only a declaration says: when, in its own words ("Written 30 Oct
  // 2026"), what prompted it and its change log. A published version has
  // none of these.
  updatedLabel: string | null;
  promptedBy: string | null;
  changes: string[];
};

// The number in a label: v4 is 4. Every label kept is v<N>.
const numberOf = (version: string) => {
  const number = Number.parseInt(version.replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : 0;
};

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// When a declared version was written, from its label ("Updated 24 Aug
// 2026"): the day, at midnight UTC. A declaration must say its day.
export function declaredAt(label: string): Date {
  const match = /(\d{1,2}) ([A-Z][a-z]{2})[a-z]* (\d{4})/.exec(label);
  const month = match ? MONTHS.indexOf(match[2]!) : -1;
  if (!match || month < 0)
    throw new Error(`A declared version's date cannot be read: "${label}".`);
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

// A process's declared versions, oldest first, as its declaration lists them.
export const declaredOf = (kept: KeptProcess): InstructionsVersion[] => {
  const { instructions } = kept.summary;
  return [...instructions.previous, instructions];
};

/*
  Makes sure every declared version is kept, before anything refers to one.
  Safe when requests arrive together: each insert does nothing for a row
  already there. A declared label kept for another text (a person published
  that label before the declaration named it) is a fault to fix, said
  rather than papered over.
*/
export async function ensureDeclared(db: Database, kept: KeptProcess) {
  const process = kept.summary.id;
  await ensureProcess(db, process);
  const declared = declaredOf(kept);
  await db
    .insert(instructionVersions)
    .values(
      declared.map((version) => ({
        process,
        hash: hashOf(version.text),
        version: version.version,
        text: version.text,
        note: version.note,
        origin: 'declared',
        publishedBy: version.author,
        publishedAt: declaredAt(version.updatedAt),
      })),
    )
    .onConflictDoNothing();
  const rows = await db
    .select({
      hash: instructionVersions.hash,
      version: instructionVersions.version,
    })
    .from(instructionVersions)
    .where(eq(instructionVersions.process, process));
  for (const version of declared) {
    const hash = hashOf(version.text);
    const same = rows.find((row) => row.hash === hash);
    if (same?.version !== version.version)
      throw new Error(
        same
          ? `${process} declares instructions ${version.version}, kept as ${same.version}.`
          : `${process} declares instructions ${version.version}, but ${version.version} is kept with other text.`,
      );
  }
}

type Row = typeof instructionVersions.$inferSelect;

function viewOf(kept: KeptProcess, row: Row): KeptVersion {
  const declared =
    row.origin === 'declared'
      ? declaredOf(kept).find((version) => version.version === row.version)
      : undefined;
  return {
    hash: row.hash,
    version: row.version,
    text: row.text,
    note: row.note,
    origin: row.origin as KeptVersion['origin'],
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
    updatedLabel: declared?.updatedAt ?? null,
    promptedBy: declared?.promptedBy ?? null,
    changes: declared?.changes ?? [],
  };
}

const byNumber = (a: Row, b: Row) => numberOf(a.version) - numberOf(b.version);

/*
  Every version of a process's instructions, oldest first by its number;
  the last is the current one a new run starts under. `next` is the label a
  publish would take now, for a draft to be called by; another publish may
  take it first.
*/
export async function listVersions(
  kept: KeptProcess,
): Promise<{ versions: KeptVersion[]; next: string }> {
  const db = await database();
  await ensureDeclared(db, kept);
  const rows = (
    await db
      .select()
      .from(instructionVersions)
      .where(eq(instructionVersions.process, kept.summary.id))
  ).sort(byNumber);
  return {
    versions: rows.map((row) => viewOf(kept, row)),
    next: `v${numberOf(rows.at(-1)?.version ?? 'v0') + 1}`,
  };
}

export async function versionByHash(
  kept: KeptProcess,
  hash: string,
  db?: Database,
): Promise<KeptVersion | null> {
  db ??= await database();
  await ensureDeclared(db, kept);
  const [row] = await db
    .select()
    .from(instructionVersions)
    .where(
      and(
        eq(instructionVersions.process, kept.summary.id),
        eq(instructionVersions.hash, hash),
      ),
    );
  return row ? viewOf(kept, row) : null;
}

/*
  Publishes text as the process's next version, as normalisedInstructions
  leaves it, and answers it with whether it is new. Text that is already a
  version (of either origin, under any label) answers that version and adds
  nothing. Labels are assigned under a transaction-scoped advisory lock on
  the process, so two publishes at once take one after the other: each reads
  the labels the other committed and they get two labels, one after the
  other, never the same one. The label's unique key holds it besides.
*/
export async function publishVersion(
  kept: KeptProcess,
  text: string,
  note: string | null,
  actor: string | null,
): Promise<{ version: KeptVersion; created: boolean }> {
  const normalised = normalisedInstructions(text);
  if (!normalised)
    throw new Refused('Instructions need some text.', 'BAD_REQUEST');
  const hash = hashOf(normalised);
  const process = kept.summary.id;
  const db = await database();
  await ensureDeclared(db, kept);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`instruction_versions:${process}`}, 0))`,
    );
    const rows = await tx
      .select()
      .from(instructionVersions)
      .where(eq(instructionVersions.process, process));
    const same = rows.find((row) => row.hash === hash);
    if (same) return { version: viewOf(kept, same), created: false };
    const last = rows.sort(byNumber).at(-1);
    const [row] = await tx
      .insert(instructionVersions)
      .values({
        process,
        hash,
        version: `v${numberOf(last?.version ?? 'v0') + 1}`,
        text: normalised,
        note,
        origin: 'published',
        publishedBy: actor,
        publishedAt: sql`now()`,
      })
      .returning();
    return { version: viewOf(kept, row!), created: true };
  });
}
