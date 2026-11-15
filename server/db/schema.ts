import 'server-only';

import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import type { CrossCheck } from '@/lib/definitions/calculate';
import type { KeptRead } from '@/lib/definitions/records';
import type {
  AppliedDecision,
  CellChange,
  CheckVerdict,
  DataProfile,
  Definition,
  DefinitionSet,
  Proposal,
  ProposalActivity,
} from '@/lib/definitions/types';

/*
  Server-only. What the server keeps, as tables (docs/engineering/DATABASE.md).
  Identity, relations, status and time are columns; a body the engine owns
  (a rulebook, a read, a proposal) is one `json` value, read and written whole
  through its Zod schema. `json`, not `jsonb`: jsonb reorders object keys, and
  fingerprints, exports to fixtures/ and record order all depend on them.

  Nothing here is queried yet; the storage functions move onto it next.
  Triggers and functions the generator cannot write are in drizzle/0001_*.sql.
*/

// A column that repeats a field of its body, so the two cannot disagree.
const mirrors = (column: AnyPgColumn, body: AnyPgColumn, field: string) =>
  sql`${column} is not distinct from (${body} ->> ${sql.raw(`'${field}'`)})`;

// Every instant, with its zone; read back as a Date so toISOString() gives
// the exact string a kept file held (millisecond precision).
const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => instant('created_at').notNull().defaultNow();

// A closed set of values, as a check rather than an enum type: a check is
// changed in one statement, an enum's values cannot be removed.
const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql`, `,
  )})`;

// The 12 hex digits of hashOf, fingerprintOf and profileFingerprint.
const HASH = '^[0-9a-f]{12}$';
// A read id as a request carries one (server/storage/ids.ts, READ_ID).
const READ_ID = '^[A-Za-z0-9_-]{1,80}$';
const matches = (column: AnyPgColumn, pattern: string): SQL =>
  sql`${column} ~ ${sql.raw(`'${pattern}'`)}`;

// The scope of every record: a process. A workspace later is a column here,
// not on every key (DATABASE.md, "Scope").
export const processes = pgTable(
  'processes',
  {
    id: text('id').primaryKey(),
    createdAt: created(),
  },
  (t) => [check('processes_id_shape', matches(t.id, '^[a-z0-9][a-z0-9-]*$'))],
);

const processColumn = () =>
  text('process')
    .notNull()
    .references(() => processes.id, { onDelete: 'restrict' });

export const INSTRUCTION_ORIGINS = ['declared', 'published'] as const;

// Each version of a process's instructions, written once. The hash is the
// text's (hashOf), checked here so a row cannot name another text.
export const instructionVersions = pgTable(
  'instruction_versions',
  {
    process: processColumn(),
    hash: text('hash').notNull(),
    version: text('version').notNull(),
    text: text('text').notNull(),
    note: text('note'),
    // declared: by the process in code; published: by a person in the app.
    origin: text('origin').notNull(),
    publishedBy: text('published_by'),
    publishedAt: instant('published_at').notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.hash] }),
    unique('instruction_versions_version').on(t.process, t.version),
    check('instruction_versions_origin', oneOf(t.origin, INSTRUCTION_ORIGINS)),
    check(
      'instruction_versions_hash_is_text',
      sql`${t.hash} = left(encode(sha256(convert_to(${t.text}, 'UTF8')), 'hex'), 12)`,
    ),
  ],
);

// A run's read of its data, the evidence every later step uses; written once.
export const reads = pgTable(
  'reads',
  {
    process: processColumn(),
    id: text('id').notNull(),
    readAt: instant('read_at').notNull(),
    // How it was read, in words ("Live read through Composio at …").
    source: text('source').notNull(),
    body: json('body').$type<KeptRead>().notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.id] }),
    check('reads_id_shape', matches(t.id, READ_ID)),
    check('reads_body_id', mirrors(t.id, t.body, 'id')),
  ],
);

/*
  A source read from its own page, every resource whole; written once. Scoped
  by its source, not a process: a source knows nothing of the processes that
  read it (lib/sources/model.ts).
*/
export const sourceReads = pgTable(
  'source_reads',
  {
    source: text('source').notNull(),
    readId: text('read_id').notNull(),
    readAt: instant('read_at').notNull(),
    // The kept read (server/storage/source-reads.ts, keptSourceReadSchema).
    body: json('body').notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.readId] }),
    // Serves latestSummary: the latest is the last id by byte order, as the
    // last file name was, whatever collation the server's database has.
    index('source_reads_latest').on(
      t.source,
      sql`${t.readId} collate "C" desc`,
    ),
    check('source_reads_id_shape', matches(t.readId, READ_ID)),
    // The captured copy stays in fixtures/; only live reads are kept here.
    check('source_reads_not_captured', sql`${t.readId} <> 'captured'`),
  ],
);

// Each confirmed data profile, written once: a rulebook reads exactly the one
// it names. Its id is profileFingerprint of the body.
export const dataProfiles = pgTable(
  'data_profiles',
  {
    process: processColumn(),
    id: text('id').notNull(),
    // Not a key into reads: the read a profile came from is run data, and a
    // database seeded from fixtures/ has none.
    readId: text('read_id').notNull(),
    confirmedAt: instant('confirmed_at').notNull(),
    confirmedBy: text('confirmed_by'),
    body: json('body').$type<DataProfile>().notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.id] }),
    check('data_profiles_id_shape', matches(t.id, HASH)),
    check('data_profiles_body_id', mirrors(t.id, t.body, 'id')),
    check('data_profiles_body_read', mirrors(t.readId, t.body, 'readId')),
  ],
);

// The profile under review, or the one last confirmed: one per process.
// `revision` goes up by one on every update (a trigger), for compare-and-set.
export const currentProfiles = pgTable(
  'current_profiles',
  {
    process: processColumn().primaryKey(),
    profileId: text('profile_id').notNull(),
    body: json('body').$type<DataProfile>().notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    check('current_profiles_id_shape', matches(t.profileId, HASH)),
    check('current_profiles_body_id', mirrors(t.profileId, t.body, 'id')),
  ],
);

// The rulebook being drafted and reviewed for one version of the
// instructions. `revision` is its compare-and-set counter, as above.
export const currentRulebooks = pgTable(
  'current_rulebooks',
  {
    process: processColumn(),
    instructionsHash: text('instructions_hash').notNull(),
    body: json('body').$type<DefinitionSet>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.instructionsHash] }),
    check(
      'current_rulebooks_body_hash',
      mirrors(t.instructionsHash, t.body, 'hash'),
    ),
    foreignKey({
      name: 'current_rulebooks_instructions_fk',
      columns: [t.process, t.instructionsHash],
      foreignColumns: [instructionVersions.process, instructionVersions.hash],
    }).onDelete('restrict'),
  ],
);

export const REVISION_REASONS = ['accepted', 'migrated', 'used'] as const;

/*
  Each accepted rulebook, written once (a trigger refuses update and delete).
  Its id is fingerprintOf(body), worked out by code: SQL cannot repeat
  JSON.stringify. `seq` keeps the order revisions.json lists them in.
*/
export const rulebookRevisions = pgTable(
  'rulebook_revisions',
  {
    process: processColumn(),
    instructionsHash: text('instructions_hash').notNull(),
    id: text('id').notNull(),
    seq: bigint('seq', { mode: 'number' })
      .notNull()
      .generatedAlwaysAsIdentity(),
    parent: text('parent'),
    reason: text('reason').notNull(),
    revisedAt: instant('revised_at').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    note: text('note'),
    // The confirmed profile it reads its data through, as its body names it.
    profileId: text('profile_id'),
    actor: text('actor'),
    body: json('body').$type<DefinitionSet>().notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.instructionsHash, t.id] }),
    unique('rulebook_revisions_seq').on(t.seq),
    // Serves listRevisions: in the order kept, per instructions.
    index('rulebook_revisions_by_instructions').on(
      t.process,
      t.instructionsHash,
      t.seq,
    ),
    check('rulebook_revisions_id_shape', matches(t.id, HASH)),
    check(
      'rulebook_revisions_body_hash',
      mirrors(t.instructionsHash, t.body, 'hash'),
    ),
    check(
      'rulebook_revisions_body_profile',
      mirrors(t.profileId, t.body, 'profileId'),
    ),
    check('rulebook_revisions_reason', oneOf(t.reason, REVISION_REASONS)),
    foreignKey({
      name: 'rulebook_revisions_instructions_fk',
      columns: [t.process, t.instructionsHash],
      foreignColumns: [instructionVersions.process, instructionVersions.hash],
    }).onDelete('restrict'),
    foreignKey({
      name: 'rulebook_revisions_parent_fk',
      columns: [t.process, t.instructionsHash, t.parent],
      foreignColumns: [t.process, t.instructionsHash, t.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'rulebook_revisions_profile_fk',
      columns: [t.process, t.profileId],
      foreignColumns: [dataProfiles.process, dataProfiles.id],
    }).onDelete('restrict'),
  ],
);

// The revision in use for one version of the instructions (headOf). Moved in
// the same transaction as the revision it names is inserted.
export const rulebookHeads = pgTable(
  'rulebook_heads',
  {
    process: processColumn(),
    instructionsHash: text('instructions_hash').notNull(),
    revisionId: text('revision_id').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.instructionsHash] }),
    foreignKey({
      name: 'rulebook_heads_revision_fk',
      columns: [t.process, t.instructionsHash, t.revisionId],
      foreignColumns: [
        rulebookRevisions.process,
        rulebookRevisions.instructionsHash,
        rulebookRevisions.id,
      ],
    }).onDelete('restrict'),
  ],
);

// lib/process/model.ts (RunStatus, RunTrigger) and the process's step ids.
export const RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_review',
  'approved',
  'completed',
  'held',
  'failed',
  'superseded',
  'cancelled',
] as const;
export const RUN_TRIGGERS = ['schedule', 'manual', 'rerun'] as const;
export const RUN_STAGES = [
  'instructions',
  'read',
  'rules',
  'calculate',
  'propose',
  'apply',
] as const;

/*
  A run: the instructions it runs under, the read it took and the accepted
  rulebook it pinned, each a key into what it names. What it has done is
  found from the rows that point back at it (decisions, applications), not
  kept on it twice.
*/
export const runs = pgTable(
  'runs',
  {
    process: processColumn(),
    id: text('id').notNull(),
    instructionsHash: text('instructions_hash').notNull(),
    // Null until the run has read its data.
    readId: text('read_id'),
    // Null until it pins one; a process with no rulebook never does.
    rulebookId: text('rulebook_id'),
    // The furthest step it has reached.
    stage: text('stage').notNull(),
    status: text('status').notNull(),
    trigger: text('trigger').notNull(),
    additionalInstructions: text('additional_instructions'),
    startedBy: text('started_by'),
    startedAt: instant('started_at').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.id] }),
    // Serves the runs rail: a process's runs, newest first.
    index('runs_by_start').on(t.process, t.startedAt),
    check('runs_stage', oneOf(t.stage, RUN_STAGES)),
    check('runs_status', oneOf(t.status, RUN_STATUSES)),
    check('runs_trigger', oneOf(t.trigger, RUN_TRIGGERS)),
    foreignKey({
      name: 'runs_instructions_fk',
      columns: [t.process, t.instructionsHash],
      foreignColumns: [instructionVersions.process, instructionVersions.hash],
    }).onDelete('restrict'),
    foreignKey({
      name: 'runs_read_fk',
      columns: [t.process, t.readId],
      foreignColumns: [reads.process, reads.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'runs_rulebook_fk',
      columns: [t.process, t.instructionsHash, t.rulebookId],
      foreignColumns: [
        rulebookRevisions.process,
        rulebookRevisions.instructionsHash,
        rulebookRevisions.id,
      ],
    }).onDelete('restrict'),
  ],
);

/*
  A proposal, whole, by run key (process, read, rulebook fingerprint): one
  row per proposal made, written once, so a decision or a write points at
  exactly the proposal it was made on. The latest is the one shown. The
  fingerprint is not a key into rulebook_revisions: a process with no
  rulebook proposes under the empty rulebook's fingerprint (noRules). Nor is
  the read a key into `reads`: Brunch orders' direct process proposes on
  reads kept under `brunch-orders`, so (process, read_id) names no row there;
  the same holds of cross_checks and answer_parts.
*/
export const proposals = pgTable(
  'proposals',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    process: processColumn(),
    readId: text('read_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // The proposal's own `at`.
    proposedAt: instant('proposed_at').notNull(),
    model: text('model').notNull(),
    body: json('body').$type<Proposal>().notNull(),
    createdAt: created(),
  },
  (t) => [
    // For keys that carry the scope with the id.
    unique('proposals_scoped').on(t.process, t.id),
    // Serves keptProposal: the latest for a run key.
    unique('proposals_by_run_key').on(
      t.process,
      t.readId,
      t.fingerprint,
      t.proposedAt,
    ),
    check('proposals_fingerprint_shape', matches(t.fingerprint, HASH)),
    check(
      'proposals_body_run_key',
      sql`${mirrors(t.fingerprint, t.body, 'fingerprint')} and ${mirrors(t.readId, t.body, 'readId')}`,
    ),
  ],
);

// The model's cross-check of a rulebook's calculations on a read. A cache of
// a model's answer, approved by nobody: checking again replaces it.
export const crossChecks = pgTable(
  'cross_checks',
  {
    process: processColumn(),
    readId: text('read_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    checkedAt: instant('checked_at').notNull(),
    model: text('model').notNull(),
    agreed: integer('agreed').notNull(),
    total: integer('total').notNull(),
    body: json('body').$type<CrossCheck>().notNull(),
  },
  (t) => [
    // Serves keptCrossCheck.
    primaryKey({ columns: [t.process, t.readId, t.fingerprint] }),
    check(
      'cross_checks_counts',
      sql`0 <= ${t.agreed} and ${t.agreed} <= ${t.total}`,
    ),
  ],
);

export const PART_KINDS = ['proposal', 'cross-check'] as const;

// A proposal or cross-check still being answered, batch by batch (the .part
// files): replaced as each batch arrives, deleted once the whole is kept.
export const answerParts = pgTable(
  'answer_parts',
  {
    process: processColumn(),
    kind: text('kind').notNull(),
    readId: text('read_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // proposalPartSchema or crossCheckPartSchema.
    body: json('body').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.kind, t.readId, t.fingerprint] }),
    check('answer_parts_kind', oneOf(t.kind, PART_KINDS)),
  ],
);

export const RECORD_DECISIONS = [
  'approve',
  'change',
  'reject',
  // Takes a decision back: the record is undecided again.
  'withdraw',
] as const;
export const VERDICTS = ['ready', 'decide', 'blocked', 'unchecked'] as const;

/*
  A person's decision on one record of one proposal, appended, never changed
  (a trigger). The current decision is the latest for the run, proposal and
  record; a withdrawal makes it none.
*/
export const recordDecisions = pgTable(
  'record_decisions',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    process: processColumn(),
    runId: text('run_id').notNull(),
    proposalId: bigint('proposal_id', { mode: 'number' }).notNull(),
    recordKey: text('record_key').notNull(),
    kind: text('kind').notNull(),
    // A change's own values; null for every other kind.
    values: json('values').$type<Record<string, number>>(),
    // How the checks found the values when the decision was made.
    verdict: text('verdict'),
    checks: json('checks').$type<CheckVerdict[]>(),
    actor: text('actor'),
    decidedAt: instant('decided_at').notNull().defaultNow(),
  },
  (t) => [
    // Serves the current decisions on a proposal for a run.
    index('record_decisions_by_proposal').on(
      t.process,
      t.runId,
      t.proposalId,
      t.recordKey,
      t.id,
    ),
    check('record_decisions_kind', oneOf(t.kind, RECORD_DECISIONS)),
    check(
      'record_decisions_verdict',
      sql`${t.verdict} is null or ${oneOf(t.verdict, VERDICTS)}`,
    ),
    check(
      'record_decisions_values',
      sql`(${t.kind} = 'change') = (${t.values} is not null)`,
    ),
    foreignKey({
      name: 'record_decisions_run_fk',
      columns: [t.process, t.runId],
      foreignColumns: [runs.process, runs.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'record_decisions_proposal_fk',
      columns: [t.process, t.proposalId],
      foreignColumns: [proposals.process, proposals.id],
    }).onDelete('restrict'),
  ],
);

export const RULE_DECISIONS = [
  'confirm_intent',
  'accept',
  'deny',
  'choose',
  'applies_to',
  'confirm_profile',
] as const;
// The rule decisions made on one definition.
const ON_A_DEFINITION = `('accept', 'deny', 'choose', 'applies_to')`;

/*
  A person's decision on the rules, appended, never changed. One made on a
  definition keeps that definition as it was shown (`definition`) and the
  counter of the rulebook it was read from (`rulebookRevision`), so what was
  accepted stays readable however the rulebook moves on. Code may refuse
  one; why is kept with it.
*/
export const ruleDecisions = pgTable(
  'rule_decisions',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    process: processColumn(),
    // Null only for confirming a profile, which belongs to the process.
    instructionsHash: text('instructions_hash'),
    kind: text('kind').notNull(),
    definitionId: text('definition_id'),
    definition: json('definition').$type<Definition>(),
    rulebookRevision: integer('rulebook_revision'),
    // A denial's note: what the person said was wrong.
    note: text('note'),
    // choose: the version taken, by its place in the agreement.
    versionIndex: integer('version_index'),
    // applies_to: the reading the person gave.
    appliesTo: text('applies_to'),
    // confirm_profile: the confirmed profile.
    profileId: text('profile_id'),
    // Why code did not take it, where it did not.
    refusal: text('refusal'),
    actor: text('actor'),
    decidedAt: instant('decided_at').notNull().defaultNow(),
  },
  (t) => [
    index('rule_decisions_by_instructions').on(
      t.process,
      t.instructionsHash,
      t.id,
    ),
    check('rule_decisions_kind', oneOf(t.kind, RULE_DECISIONS)),
    check(
      'rule_decisions_definition',
      sql`(${t.kind} in ${sql.raw(ON_A_DEFINITION)}) = (${t.definitionId} is not null and ${t.definition} is not null and ${t.rulebookRevision} is not null)`,
    ),
    check(
      'rule_decisions_instructions',
      sql`(${t.kind} = 'confirm_profile') = (${t.instructionsHash} is null)`,
    ),
    check(
      'rule_decisions_profile',
      sql`(${t.kind} = 'confirm_profile') = (${t.profileId} is not null)`,
    ),
    check(
      'rule_decisions_choice',
      sql`(${t.kind} = 'choose') = (${t.versionIndex} is not null)`,
    ),
    check(
      'rule_decisions_applies_to',
      sql`(${t.kind} = 'applies_to') = (${t.appliesTo} is not null) and (${t.appliesTo} is null or ${t.appliesTo} in ('every', 'some'))`,
    ),
    foreignKey({
      name: 'rule_decisions_instructions_fk',
      columns: [t.process, t.instructionsHash],
      foreignColumns: [instructionVersions.process, instructionVersions.hash],
    }).onDelete('restrict'),
    foreignKey({
      name: 'rule_decisions_profile_fk',
      columns: [t.process, t.profileId],
      foreignColumns: [dataProfiles.process, dataProfiles.id],
    }).onDelete('restrict'),
  ],
);

export const APPLICATION_STATUSES = [
  'pending',
  'verified',
  'mismatch',
  'failed',
  'undone',
] as const;
// Pending and written writes stand in the way of another (isStanding, and a
// pending one is unconfirmed): at most one per run key.
const STANDING = `('pending', 'verified', 'mismatch')`;

/*
  A write to the process's output and its undo (server/storage/applications.ts).
  Kept as pending before the write, then settled; what was written never
  changes and the status moves only forward (a trigger). A run key has at most
  one standing write, so two instances cannot both write for one run.
*/
export const applications = pgTable(
  'applications',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    process: processColumn(),
    readId: text('read_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // The exact proposal written (the record's proposedAt).
    proposalId: bigint('proposal_id', { mode: 'number' }).notNull(),
    // The run that wrote it, once runs are kept.
    runId: text('run_id'),
    status: text('status').notNull(),
    // The output's resource (Application.tab) and the block, as the source
    // addresses one.
    resource: text('resource').notNull(),
    range: text('range').notNull(),
    writtenAt: instant('written_at').notNull(),
    error: text('error'),
    undoneAt: instant('undone_at'),
    // Kept before an undo writes: one cut short is settled by reading back.
    undoStartedAt: instant('undo_started_at'),
    addsResource: boolean('adds_resource'),
    before: json('before').$type<unknown[][]>().notNull(),
    after: json('after').$type<unknown[][]>().notNull(),
    changes: json('changes').$type<CellChange[]>().notNull(),
    decisions: json('decisions')
      .$type<Record<string, AppliedDecision>>()
      .notNull(),
    actor: text('actor'),
  },
  (t) => [
    unique('applications_scoped').on(t.process, t.id),
    uniqueIndex('applications_one_standing')
      .on(t.process, t.readId, t.fingerprint)
      .where(sql`${t.status} in ${sql.raw(STANDING)}`),
    // Serves keptApplication: the latest write of a run key.
    index('applications_by_run_key').on(
      t.process,
      t.readId,
      t.fingerprint,
      t.id,
    ),
    // Serves lastWrite: a process's latest write.
    index('applications_by_time').on(t.process, t.writtenAt),
    check('applications_status', oneOf(t.status, APPLICATION_STATUSES)),
    check(
      'applications_undone',
      sql`(${t.status} = 'undone') = (${t.undoneAt} is not null)`,
    ),
    check(
      'applications_undo_started',
      sql`${t.undoStartedAt} is null or ${t.status} in ('verified', 'mismatch', 'undone')`,
    ),
    foreignKey({
      name: 'applications_proposal_fk',
      columns: [t.process, t.proposalId],
      foreignColumns: [proposals.process, proposals.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'applications_read_fk',
      columns: [t.process, t.readId],
      foreignColumns: [reads.process, reads.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'applications_run_fk',
      columns: [t.process, t.runId],
      foreignColumns: [runs.process, runs.id],
    }).onDelete('restrict'),
  ],
);

// server/jobs/draft.ts and proposal.ts name these kinds.
export const JOB_KINDS = ['drafts', 'proposals'] as const;

/*
  A background job's progress (DraftProgress, as columns). A running job is
  held by one server instance (`holder`) on a lease it renews
  (`heartbeatAt`); one whose lease has run out is a job whose process died,
  and another instance may take its key over.
*/
export const jobs = pgTable(
  'jobs',
  {
    process: processColumn(),
    kind: text('kind').notNull(),
    // The kind's own key: the instructions hash, or `<read>:<fingerprint>`.
    key: text('key').notNull(),
    step: text('step').notNull(),
    running: boolean('running').notNull(),
    error: text('error'),
    // The definition being written now, for a draft.
    writing: text('writing'),
    // A proposal's model at work, for a person watching.
    activity: json('activity').$type<ProposalActivity>(),
    holder: text('holder'),
    heartbeatAt: instant('heartbeat_at'),
    startedBy: text('started_by'),
    startedAt: instant('started_at').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.process, t.kind, t.key] }),
    check('jobs_kind', oneOf(t.kind, JOB_KINDS)),
    check(
      'jobs_held',
      sql`not ${t.running} or (${t.holder} is not null and ${t.heartbeatAt} is not null)`,
    ),
    // For finding jobs whose lease has run out.
    index('jobs_running')
      .on(t.heartbeatAt)
      .where(sql`${t.running}`),
  ],
);

/*
  What is learned of a model's limits (server/storage/model-limits.ts), one
  row per model. Not scoped by process: a quota belongs to the API key, which
  every process shares.
*/
export const modelLimits = pgTable(
  'model_limits',
  {
    model: text('model').primaryKey(),
    // The model it shares quota with.
    sharesWith: text('shares_with'),
    perMinute: integer('per_minute'),
    perMinuteLearnedAt: instant('per_minute_learned_at'),
    perDay: integer('per_day'),
    perDayLearnedAt: instant('per_day_learned_at'),
    // Requests sent on a day, as Google's daily limit counts days.
    usedDay: date('used_day', { mode: 'string' }),
    usedCount: integer('used_count').notNull().default(0),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'model_limits_per_minute',
      sql`(${t.perMinute} is null) = (${t.perMinuteLearnedAt} is null) and (${t.perMinute} is null or ${t.perMinute} > 0)`,
    ),
    check(
      'model_limits_per_day',
      sql`(${t.perDay} is null) = (${t.perDayLearnedAt} is null) and (${t.perDay} is null or ${t.perDay} > 0)`,
    ),
    check('model_limits_used', sql`${t.usedCount} >= 0`),
  ],
);

export const ATTEMPT_PURPOSES = [
  'find',
  'write',
  'cross-check',
  'propose',
  'advise',
] as const;
export const ATTEMPT_OUTCOMES = [
  // An answer code accepted.
  'answered',
  // An answer code sent back or the model refused.
  'refused',
  // Out of quota, or busy, so another model or a wait followed.
  'quota',
  'busy',
  // Cut short, or failed for any other reason.
  'failed',
] as const;

/*
  One row per model call: what it was for, on what, which model, how it
  ended, how long and how many tokens. What was asked is a summary; the
  answer is kept for reading a bad draft afterwards.
*/
export const modelAttempts = pgTable(
  'model_attempts',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    process: processColumn(),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    // What it was part of, where it was: a job, a run, the instructions, a
    // read, a rulebook, a definition. None is a key: an attempt outlives
    // nothing it names and blocks the removal of nothing.
    jobKind: text('job_kind'),
    jobKey: text('job_key'),
    runId: text('run_id'),
    instructionsHash: text('instructions_hash'),
    readId: text('read_id'),
    fingerprint: text('fingerprint'),
    definitionId: text('definition_id'),
    // Which try this was, from 1, within what it was part of.
    attempt: integer('attempt').notNull(),
    startedAt: instant('started_at').notNull(),
    durationMs: integer('duration_ms'),
    outcome: text('outcome').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    thinkingTokens: integer('thinking_tokens'),
    asked: json('asked').notNull(),
    answer: json('answer'),
    error: text('error'),
  },
  (t) => [
    index('model_attempts_by_time').on(t.process, t.startedAt),
    index('model_attempts_by_job').on(t.process, t.jobKind, t.jobKey, t.id),
    index('model_attempts_by_run').on(t.process, t.runId, t.id),
    check('model_attempts_purpose', oneOf(t.purpose, ATTEMPT_PURPOSES)),
    check('model_attempts_outcome', oneOf(t.outcome, ATTEMPT_OUTCOMES)),
    check('model_attempts_attempt', sql`${t.attempt} >= 1`),
  ],
);
