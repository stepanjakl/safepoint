import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  hashOf,
  fingerprintOf,
  profileFingerprint,
} from '@/lib/engine/fingerprint';
import { withProfile } from '@/lib/engine/profile';
import {
  dataProfileSchema,
  definitionSetSchema,
  RULEBOOK_SCHEMA,
  type AppliesTo,
  type DataProfile,
  type DefinitionProcess,
  type DefinitionSet,
  type Revision,
  type RevisionIndex,
} from '@/lib/engine/types';
import { database, oncePerDatabase, type Database } from '@/server/db/client';
import {
  currentProfiles,
  currentRulebooks,
  dataProfiles,
  instructionVersions,
  ruleDecisions,
  rulebookHeads,
  rulebookRevisions,
  runRulebooks,
} from '@/server/db/schema';

import { StoredFileError } from '@/server/storage/files';
import { Refused } from '@/server/storage/refused';
import { seedRulebooks } from './rulebook-files';
import { parseStored } from '@/server/storage/stored';

/*
  Server-only. A process's rulebooks and data profile, in the database
  (docs/engineering/DATABASE.md): per version of its instructions, by the
  hash of their text, the rulebook under review (`current_rulebooks`), each
  accepted rulebook as a revision written once (`rulebook_revisions`, by its
  fingerprint) and the one in use (`rulebook_heads`); per process, the
  profile under review (`current_profiles`) and each confirmed one, written
  once (`data_profiles`). The rulebook id is a fingerprint of what was
  accepted, so a run that pins one reads exactly those formulas however the
  current rulebook changes after.

  fixtures/<process>/ holds the reviewed copy in git: the first call for a
  process seeds what the database lacks from it (rulebook-files.ts), and
  `pnpm rulebooks:export` writes the database's state back to it.

  A body that does not fit its schema, or whose id is not its content, is
  an error, never "nothing kept". The rulebook and profile under review
  change by compare-and-set on their `revision`, which a trigger moves on
  with every update: a change is worked out on what was read and lands only
  if nothing landed since, else it is worked out again.
*/

/*
  Where a rulebook under review is kept: by its instructions' text, the one
  every run of them shares, or `{ text, run }`, the rulebook of one run that
  keeps its own (runs.own_rulebook). A run's own is reviewed and accepted as
  the shared one is; what it accepts is a revision for that run alone, which
  moves no head and is never exported to fixtures/.
*/
export type RulebookAt = string | { text: string; run: string };
export const textOf = (at: RulebookAt) =>
  typeof at === 'string' ? at : at.text;
export const runOf = (at: RulebookAt) =>
  typeof at === 'string' ? null : at.run;

// Kept under its old name for what catches it.
export const StoredSetError = StoredFileError;

// The database, with this process's declared instructions and anything
// fixtures/ holds for it that the database lacks, once per server process.
async function ready(owner: DefinitionProcess): Promise<Database> {
  const db = await database();
  await oncePerDatabase(`rulebooks:${owner.id}`, () =>
    seedRulebooks(db, owner.id).then(() => undefined),
  );
  return db;
}

const ofRulebook = (process: string, hash: string) =>
  and(
    eq(currentRulebooks.process, process),
    eq(currentRulebooks.instructionsHash, hash),
  );

const ofRunRulebook = (process: string, hash: string, run: string) =>
  and(
    eq(runRulebooks.process, process),
    eq(runRulebooks.runId, run),
    eq(runRulebooks.instructionsHash, hash),
  );

async function currentOf(
  db: Database,
  process: string,
  hash: string,
  run: string | null = null,
) {
  const [row] = run
    ? await db
        .select({ body: runRulebooks.body, revision: runRulebooks.revision })
        .from(runRulebooks)
        .where(ofRunRulebook(process, hash, run))
    : await db
        .select({
          body: currentRulebooks.body,
          revision: currentRulebooks.revision,
        })
        .from(currentRulebooks)
        .where(ofRulebook(process, hash));
  return row
    ? {
        set: parseStored(
          row.body,
          definitionSetSchema,
          run
            ? `The rulebook run ${run} keeps for instructions ${hash}`
            : `The rulebook kept for instructions ${hash}`,
        ),
        revision: row.revision,
      }
    : null;
}

// The rulebook being drafted and reviewed for these instructions.
export async function loadSet(
  owner: DefinitionProcess,
  at: RulebookAt,
): Promise<DefinitionSet | null> {
  const db = await ready(owner);
  return (
    (await currentOf(db, owner.id, hashOf(textOf(at)), runOf(at)))?.set ?? null
  );
}

// A rulebook belongs to a kept version of the instructions: declared ones
// are kept on first need (ready), published ones when they are published.
async function mustKeepInstructions(
  db: Database,
  process: string,
  hash: string,
) {
  const [kept] = await db
    .select({ hash: instructionVersions.hash })
    .from(instructionVersions)
    .where(
      and(
        eq(instructionVersions.process, process),
        eq(instructionVersions.hash, hash),
      ),
    );
  if (!kept)
    throw new Refused(
      'These instructions are not a kept version: publish them before keeping rules for them.',
    );
}

// Keeps a set as the rulebook under review for its instructions, or for
// one run, replacing any there: what drafting found.
export async function saveSet(
  owner: DefinitionProcess,
  set: DefinitionSet,
  { run = null }: { run?: string | null } = {},
): Promise<DefinitionSet> {
  const db = await ready(owner);
  const body = definitionSetSchema.parse(set);
  await mustKeepInstructions(db, owner.id, body.hash);
  if (run) {
    await db
      .insert(runRulebooks)
      .values({
        process: owner.id,
        runId: run,
        instructionsHash: body.hash,
        body,
        schemaVersion: RULEBOOK_SCHEMA,
      })
      .onConflictDoUpdate({
        target: [runRulebooks.process, runRulebooks.runId],
        set: {
          instructionsHash: sql`excluded.instructions_hash`,
          body: sql`excluded.body`,
          schemaVersion: sql`excluded.schema_version`,
          updatedAt: sql`now()`,
          updatedBy: null,
        },
      });
    return body;
  }
  await db
    .insert(currentRulebooks)
    .values({
      process: owner.id,
      instructionsHash: body.hash,
      body,
      schemaVersion: RULEBOOK_SCHEMA,
    })
    .onConflictDoUpdate({
      target: [currentRulebooks.process, currentRulebooks.instructionsHash],
      set: {
        body: sql`excluded.body`,
        schemaVersion: sql`excluded.schema_version`,
        updatedAt: sql`now()`,
        updatedBy: null,
      },
    });
  return body;
}

/*
  A person's act on the rules, kept with the change it makes, in the same
  transaction (`rule_decisions`). Worked out from the rulebook as it was
  read and as it is changed, so a retry records what finally landed.
*/
export type RuleDecision = {
  kind: 'confirm_intent' | 'accept' | 'deny' | 'choose' | 'applies_to';
  // The definition decided on; it is kept as it was before the change.
  definitionId?: string;
  note?: string | null;
  versionIndex?: number;
  appliesTo?: AppliesTo;
  // Why code did not take it, where it did not.
  refusal?: string | null;
};

export type Deciding = {
  actor: string | null;
  decision: (before: DefinitionSet, after: DefinitionSet) => RuleDecision;
};

// How many times a change is worked out again on a rulebook that moved.
const ATTEMPTS = 5;

export const KEPT_CHANGING =
  'These rules kept changing while your change was being kept: look at them again and try once more.';

/*
  Reads the kept set, changes it, and keeps the change only if the set is
  still the one read (its `revision`); otherwise reads it again and changes
  that, a few times. No lock is held while the change is worked out. Null
  when none is kept.
*/
export async function updateSet(
  owner: DefinitionProcess,
  at: RulebookAt,
  change: (set: DefinitionSet) => DefinitionSet,
  deciding?: Deciding,
): Promise<DefinitionSet | null> {
  const db = await ready(owner);
  const hash = hashOf(textOf(at));
  const run = runOf(at);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const kept = await currentOf(db, owner.id, hash, run);
    if (!kept) return null;
    const next = definitionSetSchema.parse(change(kept.set));
    if (next.hash !== hash)
      throw new Error('A change cannot move a rulebook to other instructions.');
    const landed = await db.transaction(async (tx) => {
      const changes = {
        body: next,
        schemaVersion: RULEBOOK_SCHEMA,
        updatedAt: sql`now()`,
        updatedBy: deciding?.actor ?? null,
      };
      const moved = run
        ? await tx
            .update(runRulebooks)
            .set(changes)
            .where(
              and(
                ofRunRulebook(owner.id, hash, run),
                eq(runRulebooks.revision, kept.revision),
              ),
            )
            .returning({ revision: runRulebooks.revision })
        : await tx
            .update(currentRulebooks)
            .set(changes)
            .where(
              and(
                ofRulebook(owner.id, hash),
                eq(currentRulebooks.revision, kept.revision),
              ),
            )
            .returning({ revision: currentRulebooks.revision });
      if (!moved.length) return false;
      if (deciding) {
        const made = deciding.decision(kept.set, next);
        const definition = made.definitionId
          ? (kept.set.definitions.find((d) => d.id === made.definitionId) ??
            null)
          : null;
        if (made.definitionId && !definition)
          throw new Error(`No definition ${made.definitionId} to decide on.`);
        await tx.insert(ruleDecisions).values({
          process: owner.id,
          instructionsHash: hash,
          kind: made.kind,
          definitionId: made.definitionId ?? null,
          definition,
          rulebookRevision: kept.revision,
          note: made.note ?? null,
          versionIndex: made.versionIndex ?? null,
          appliesTo: made.appliesTo ?? null,
          refusal: made.refusal ?? null,
          runId: run,
          actor: deciding.actor,
        });
      }
      return true;
    });
    if (landed) return next;
  }
  throw new Refused(KEPT_CHANGING);
}

const ofHead = (process: string, hash: string) =>
  and(
    eq(rulebookHeads.process, process),
    eq(rulebookHeads.instructionsHash, hash),
  );

/*
  Keeps an accepted rulebook as a revision and makes it the head. A revision
  already kept is left as it is, head included: a run going back to the one
  it pinned does not make it current again. Under a transaction-scoped lock
  on the instructions, so of two at once the second reads the head the first
  made, and the parents make a straight line. Returns its id.
*/
export async function putRevision(
  owner: DefinitionProcess,
  set: DefinitionSet,
  {
    reason,
    parent,
    note = null,
    actor = null,
    run = null,
  }: {
    reason: Revision['reason'];
    parent?: string | null;
    note?: string | null;
    actor?: string | null;
    // Accepted in a run's own rulebook: that run's alone, so no head moves.
    run?: string | null;
  },
): Promise<string> {
  const db = await ready(owner);
  const body = definitionSetSchema.parse(set);
  const id = fingerprintOf(body);
  await mustKeepInstructions(db, owner.id, body.hash);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`rulebook_revisions:${owner.id}:${body.hash}`}, 0))`,
    );
    const [head] = run
      ? await tx
          .select({ id: rulebookRevisions.id })
          .from(rulebookRevisions)
          .where(
            and(
              eq(rulebookRevisions.process, owner.id),
              eq(rulebookRevisions.instructionsHash, body.hash),
              eq(rulebookRevisions.runId, run),
            ),
          )
          .orderBy(desc(rulebookRevisions.seq))
          .limit(1)
      : await tx
          .select({ id: rulebookHeads.revisionId })
          .from(rulebookHeads)
          .where(ofHead(owner.id, body.hash));
    const inserted = await tx
      .insert(rulebookRevisions)
      .values({
        process: owner.id,
        instructionsHash: body.hash,
        id,
        parent: parent === undefined ? (head?.id ?? null) : parent,
        reason,
        revisedAt: new Date(),
        schemaVersion: RULEBOOK_SCHEMA,
        note,
        profileId: body.profileId ?? null,
        actor,
        runId: run,
        body,
      })
      .onConflictDoNothing()
      .returning({ id: rulebookRevisions.id });
    if (inserted.length && !run)
      await tx
        .insert(rulebookHeads)
        .values({
          process: owner.id,
          instructionsHash: body.hash,
          revisionId: id,
        })
        .onConflictDoUpdate({
          target: [rulebookHeads.process, rulebookHeads.instructionsHash],
          set: { revisionId: id, updatedAt: sql`now()` },
        });
    return id;
  });
}

const FINGERPRINT = /^[0-9a-f]{12}$/;

// A revision a run pinned, or null when it is not kept.
export async function loadRevision(
  owner: DefinitionProcess,
  text: string,
  id: string,
): Promise<DefinitionSet | null> {
  if (!FINGERPRINT.test(id)) return null;
  const db = await ready(owner);
  const [row] = await db
    .select({ body: rulebookRevisions.body })
    .from(rulebookRevisions)
    .where(
      and(
        eq(rulebookRevisions.process, owner.id),
        eq(rulebookRevisions.instructionsHash, hashOf(text)),
        eq(rulebookRevisions.id, id),
      ),
    );
  if (!row) return null;
  const set = parseStored(
    row.body,
    definitionSetSchema,
    `The kept rulebook ${id}`,
  );
  if (fingerprintOf(set) !== id)
    throw new StoredSetError(
      `The kept rulebook ${id} does not match its id: it was changed after it was accepted.`,
    );
  return set;
}

/*
  Every revision for these instructions, newest first, and the head. For a
  run's own rulebook, the revisions accepted in that run, the latest its
  head; the shared history leaves every run's own out.
*/
export async function listRevisions(
  owner: DefinitionProcess,
  at: RulebookAt,
): Promise<RevisionIndex> {
  const db = await ready(owner);
  const hash = hashOf(textOf(at));
  const run = runOf(at);
  const rows = await db
    .select({
      id: rulebookRevisions.id,
      parent: rulebookRevisions.parent,
      reason: rulebookRevisions.reason,
      at: rulebookRevisions.revisedAt,
      schemaVersion: rulebookRevisions.schemaVersion,
      note: rulebookRevisions.note,
    })
    .from(rulebookRevisions)
    .where(
      and(
        eq(rulebookRevisions.process, owner.id),
        eq(rulebookRevisions.instructionsHash, hash),
        run
          ? eq(rulebookRevisions.runId, run)
          : isNull(rulebookRevisions.runId),
      ),
    )
    .orderBy(desc(rulebookRevisions.seq));
  const [head] = run
    ? [{ id: rows[0]?.id }]
    : await db
        .select({ id: rulebookHeads.revisionId })
        .from(rulebookHeads)
        .where(ofHead(owner.id, hash));
  return {
    head: head?.id ?? null,
    revisions: rows.map((row) => ({
      ...row,
      reason: row.reason as Revision['reason'],
      at: row.at.toISOString(),
    })),
  };
}

export const headOf = async (owner: DefinitionProcess, at: RulebookAt) =>
  (await listRevisions(owner, at)).head;

// A profile whose id is not its content was changed after it was made.
function sound<T extends DataProfile | null>(profile: T, where: string): T {
  if (profile && profile.id !== profileFingerprint(profile))
    throw new StoredSetError(
      `${where} does not match its id: it was changed after it was made.`,
    );
  return profile;
}

async function currentProfileOf(db: Database, process: string) {
  const [row] = await db
    .select({ body: currentProfiles.body, revision: currentProfiles.revision })
    .from(currentProfiles)
    .where(eq(currentProfiles.process, process));
  if (!row) return null;
  const where = `The data profile under review for ${process}`;
  return {
    profile: sound(parseStored(row.body, dataProfileSchema, where), where),
    revision: row.revision,
  };
}

export async function loadProfile(
  owner: DefinitionProcess,
): Promise<DataProfile | null> {
  const db = await ready(owner);
  return (await currentProfileOf(db, owner.id))?.profile ?? null;
}

// Keeps a confirmed profile under its id, once, inside the caller's work.
async function keepConfirmed(
  db: Database,
  process: string,
  profile: DataProfile,
  actor: string | null,
) {
  await db
    .insert(dataProfiles)
    .values({
      process,
      id: profile.id,
      readId: profile.readId,
      confirmedAt: new Date(profile.confirmedAt!),
      confirmedBy: actor,
      body: profile,
    })
    .onConflictDoNothing();
}

// Keeps a profile as the one under review, replacing any there; a confirmed
// one is kept as confirmed too (`putProfile`).
export async function saveProfile(
  owner: DefinitionProcess,
  profile: DataProfile,
): Promise<DataProfile> {
  const body = sound(dataProfileSchema.parse(profile), 'The profile');
  const db = await ready(owner);
  await db.transaction(async (tx) => {
    if (body.confirmedAt) await keepConfirmed(tx, owner.id, body, null);
    await tx
      .insert(currentProfiles)
      .values({ process: owner.id, profileId: body.id, body })
      .onConflictDoUpdate({
        target: currentProfiles.process,
        set: {
          profileId: sql`excluded.profile_id`,
          body: sql`excluded.body`,
          updatedAt: sql`now()`,
          updatedBy: null,
        },
      });
  });
  return body;
}

/*
  Changes the profile under review by compare-and-set, as updateSet does a
  rulebook; null when none is kept. A change that confirms it keeps it as
  confirmed and records the person's confirmation, in the same transaction.
*/
export async function updateProfile(
  owner: DefinitionProcess,
  change: (profile: DataProfile) => DataProfile,
  { actor = null }: { actor?: string | null } = {},
): Promise<DataProfile | null> {
  const db = await ready(owner);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const kept = await currentProfileOf(db, owner.id);
    if (!kept) return null;
    const next = sound(
      dataProfileSchema.parse(change(kept.profile)),
      'The profile',
    );
    const landed = await db.transaction(async (tx) => {
      const moved = await tx
        .update(currentProfiles)
        .set({
          profileId: next.id,
          body: next,
          updatedAt: sql`now()`,
          updatedBy: actor,
        })
        .where(
          and(
            eq(currentProfiles.process, owner.id),
            eq(currentProfiles.revision, kept.revision),
          ),
        )
        .returning({ revision: currentProfiles.revision });
      if (!moved.length) return false;
      if (next.confirmedAt) {
        await keepConfirmed(tx, owner.id, next, actor);
        if (!kept.profile.confirmedAt)
          await tx.insert(ruleDecisions).values({
            process: owner.id,
            kind: 'confirm_profile',
            profileId: next.id,
            actor,
          });
      }
      return true;
    });
    if (landed) return next;
  }
  throw new Refused(KEPT_CHANGING);
}

// Keeps a confirmed profile under its id, once; returns the id.
export async function putProfile(
  owner: DefinitionProcess,
  profile: DataProfile,
): Promise<string> {
  const body = sound(dataProfileSchema.parse(profile), 'The profile');
  if (!body.confirmedAt)
    throw new Error('Only a confirmed data profile is kept as confirmed.');
  const db = await ready(owner);
  await keepConfirmed(db, owner.id, body, null);
  return body.id;
}

// A confirmed profile a rulebook names, or null when it is not kept.
export async function loadConfirmedProfile(
  owner: DefinitionProcess,
  id: string,
): Promise<DataProfile | null> {
  if (!FINGERPRINT.test(id)) return null;
  const db = await ready(owner);
  const [row] = await db
    .select({ body: dataProfiles.body })
    .from(dataProfiles)
    .where(and(eq(dataProfiles.process, owner.id), eq(dataProfiles.id, id)));
  if (!row) return null;
  const where = `The confirmed data profile ${id}`;
  const profile = sound(parseStored(row.body, dataProfileSchema, where), where);
  if (profile.id !== id || !profile.confirmedAt)
    throw new StoredSetError(`${where} is not the confirmed profile ${id}.`);
  return profile;
}

// The process with the confirmed profile a set names loaded, if it names one.
export async function ownerFor(
  owner: DefinitionProcess,
  set: DefinitionSet,
): Promise<DefinitionProcess> {
  if (!set.profileId) return withProfile(owner, null);
  if (owner.subject.data.profile?.id === set.profileId) return owner;
  const profile = await loadConfirmedProfile(owner, set.profileId);
  if (!profile)
    throw new Error(
      `These rules were drafted on data profile ${set.profileId}, which is not kept.`,
    );
  return withProfile(owner, profile);
}

/*
  The process a new draft is written on: the kept profile when a person has
  confirmed it, none when no profile is kept. A profile under review refuses
  the draft, since rules drafted on it would read types nobody confirmed.
*/
export async function ownerToDraft(
  owner: DefinitionProcess,
): Promise<DefinitionProcess> {
  const profile = await loadProfile(owner);
  if (!profile) return withProfile(owner, null);
  if (!profile.confirmedAt)
    throw new Error(
      'The data profile has changes nobody has confirmed: confirm it before drafting.',
    );
  return withProfile(owner, profile);
}
