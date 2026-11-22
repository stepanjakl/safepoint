import 'server-only';

import { z } from 'zod';

import { advise } from '@/lib/engine/advise';
import { debugDefinition, debugDraft } from '@/lib/engine/debug';
import {
  confirmProfile,
  profileOf,
  setColumnBlank,
  setColumnLabel,
  setColumnType,
} from '@/lib/engine/profile';
import { fitting, namesOf } from '@/lib/engine/records';
import { revisionChanges } from '@/lib/engine/revision-changes';
import { sentencesOf } from '@/lib/engine/shapes';
import {
  complete,
  CONFIRM_FIRST,
  type DataProfile,
  type DefinitionSet,
  type ProfileState,
} from '@/lib/engine/types';
import { workingOf } from '@/lib/engine/working';
import { draftingModelSchema } from '@/lib/models';
import { draftProgress, startDraft, startRewrite } from '@/server/jobs/draft';
import {
  accept,
  choose,
  confirmIntent,
  deny,
  rebaseSet,
  setAppliesTo,
} from '@/server/operations/decide';
import { rulebookProcess } from '@/server/operations/kept-processes';
import {
  keptRead as keptReadOf,
  READ_GONE,
} from '@/server/storage/reads/run-reads';
import { attemptRecorder } from '@/server/storage/models/model-attempts';
import {
  readIdSchema,
  rulebookIdSchema,
  runIdSchema,
} from '@/server/storage/ids';
import {
  listRevisions,
  loadProfile,
  loadRevision,
  loadSet,
  ownerFor,
  saveProfile,
  updateProfile,
} from '@/server/storage/rules/rulebooks';

import { modelForRun } from '@/server/storage/runs/runs';

import { failed, gatedProcedure, router } from '../trpc';

/*
  Server-only. The definitions of one version of the instructions (its text),
  through lib/engine. `get` reads them, with any draft running; `draft`
  finds them again and writes each on the server; `write` gives one a formula
  and examples on the read, on the server too; `intent` confirms what the model
  understood; `decide` accepts one (rechecked in full) or denies it, with what
  is wrong; `appliesTo` says whether a check is meant for every record or only
  some, where finding read it the other way; `choose` takes a version where
  writes disagreed, and `advise` says which the instructions support, for a
  person to weigh. `profile`, `profileColumn` and `confirmProfile` keep the
  data profile the rules are drafted on. Each of those replies with the rules
  as they stand: the records the examples are about, the draft's progress, the
  profile and the rulebook's revisions. `debug` and `debugDraft` say what code
  finds of one definition, or of the draft, on the read: they ask no model.
*/

// The procedures here name no process, as they never did: they are the
// rulebook process's (server/operations/kept-processes.ts).
const { definitions: owner, reads } = rulebookProcess().runs;
const keptRead = (id: string) => keptReadOf(reads, id);

const text = z.string().min(1).max(20_000);
const id = z.string().max(80);
// The model to ask, falling back within its family; the default otherwise.
const model = draftingModelSchema.optional();
const column = z.string().min(1).max(160);

// What the routes answered for anything that went wrong while working: its
// message, as a bad gateway. A thrown error is not an unexpected one here.
const rulesProcedure = <Schema extends z.ZodType>(input: Schema) =>
  gatedProcedure.input(input).use(async ({ next }) => {
    const result = await next();
    if (!result.ok && result.error.code === 'INTERNAL_SERVER_ERROR')
      throw failed(result.error.cause ?? result.error);
    return result;
  });

async function profileState(readId: string | null): Promise<ProfileState> {
  const profile = await loadProfile(owner);
  if (profile)
    return {
      state: profile.confirmedAt ? 'confirmed' : 'review',
      profile,
    };
  const read = readId ? await keptRead(readId) : null;
  let proposed: DataProfile | null = null;
  try {
    if (read) {
      fitting(read, owner.subject.data);
      proposed = profileOf(read, owner.subject.data);
    }
  } catch {
    // A read that does not fit suggests nothing; the Read step says why.
  }
  return { state: 'none', proposed };
}

// The kept profile, changed and kept as under review, by compare-and-set;
// what it comes to.
async function changeProfile(
  change: (profile: DataProfile) => DataProfile,
  actor: string | null,
) {
  const changed = await updateProfile(owner, change, { actor });
  if (!changed) throw new Error('No data profile is kept yet.');
  return changed;
}

// The revisions, each with what it changed from its parent.
async function historyOf(text: string) {
  const history = await listRevisions(owner, text);
  const revisions = await Promise.all(
    history.revisions.map(async (revision) => {
      const set = await loadRevision(owner, text, revision.id);
      const parent = revision.parent
        ? await loadRevision(owner, text, revision.parent)
        : null;
      return {
        ...revision,
        changes: set ? revisionChanges(parent, set) : null,
      };
    }),
  );
  return { ...history, revisions };
}

// The rules as they stand, beside how the draft and the profile do.
async function reply(
  text: string,
  readId: string | null,
  set: DefinitionSet | null,
  drafting: Awaited<ReturnType<typeof draftProgress>>,
) {
  const profile = await profileState(readId);
  if (!set) return { kind: 'none' as const, drafting, profile };
  const read = set.readId ? await keptRead(set.readId) : null;
  // Read on the profile the set was drafted on, if it names one.
  const reading = await ownerFor(owner, set);
  return {
    kind: 'rules' as const,
    set,
    names: read ? namesOf(read, reading.subject.data) : {},
    // The app's own working of each example, by definition.
    working: read
      ? Object.fromEntries(
          set.definitions.map((d) => [d.id, workingOf(reading, set, read, d)]),
        )
      : {},
    // Each check's sentence, and each version's where writes disagreed.
    sentences: read ? sentencesOf(reading.subject, set, read) : {},
    drafting,
    profile,
    // Every accepted revision, newest first, and the one in use.
    history: await historyOf(text),
  };
}

// Progress first: rules read after it are at least as new as it says, so
// "finished" never arrives beside rules from before the end.
async function replyWith(
  text: string,
  readId: string | null,
  load: () => Promise<DefinitionSet | null>,
) {
  const drafting = await draftProgress(owner, text);
  return reply(text, readId, await load(), drafting);
}

const readOf = async (readId: string) => {
  const read = await keptRead(readId);
  if (!read) throw new Error(READ_GONE);
  return read;
};

const NO_RULES = 'No rules are kept for these instructions.';

export const rulesRouter = router({
  get: rulesProcedure(
    z.strictObject({ text, readId: readIdSchema.nullable().optional() }),
  ).query(({ input }) =>
    replyWith(input.text, input.readId ?? null, () =>
      loadSet(owner, input.text),
    ),
  ),

  applied: rulesProcedure(
    z.strictObject({ text, rulebook: rulebookIdSchema.nullable() }),
  ).query(async ({ input }) => {
    if (!input.rulebook) return null;
    const revision = await loadRevision(owner, input.text, input.rulebook);
    return revision?.definitions.map(({ id, text }) => ({ id, text })) ?? null;
  }),

  profile: rulesProcedure(
    z.strictObject({ text, readId: readIdSchema }),
  ).mutation(async ({ input }) => {
    const read = await readOf(input.readId);
    fitting(read, owner.subject.data);
    await saveProfile(owner, profileOf(read, owner.subject.data));
    return replyWith(input.text, input.readId, () =>
      loadSet(owner, input.text),
    );
  }),

  profileColumn: rulesProcedure(
    z.strictObject({
      text,
      column,
      label: z.string().min(1).max(120).optional(),
      type: z.enum(['whole_number', 'decimal', 'yes_no', 'text']).optional(),
      blank: z.enum(['skip', 'fail']).nullable().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const { column, label, type, blank } = input;
    await changeProfile((profile) => {
      let changed = profile;
      if (label !== undefined) changed = setColumnLabel(changed, column, label);
      if (type !== undefined)
        changed = setColumnType(changed, column, { kind: type });
      if (blank !== undefined) changed = setColumnBlank(changed, column, blank);
      return changed;
    }, ctx.actor);
    return replyWith(input.text, null, () => loadSet(owner, input.text));
  }),

  confirmProfile: rulesProcedure(z.strictObject({ text })).mutation(
    async ({ ctx, input }) => {
      const confirmed = await changeProfile(
        (kept) => (kept.confirmedAt ? kept : confirmProfile(kept)),
        ctx.actor,
      );
      // Rules under review move onto it, so an answer takes effect without
      // a redraft; accepted rules keep the profile they were accepted on.
      const set = await loadSet(owner, input.text);
      if (set && !complete(set) && set.readId)
        await rebaseSet(owner, input.text, await readOf(set.readId), confirmed);
      return replyWith(input.text, null, () => loadSet(owner, input.text));
    },
  ),

  draft: rulesProcedure(
    z.strictObject({
      text,
      version: z.string().max(20),
      readId: readIdSchema,
      model,
      runId: runIdSchema.optional(),
    }),
  ).mutation(async ({ input }) => {
    // The engine drafts without a profile too; a person's draft does not.
    const profile = await loadProfile(owner);
    if (!profile?.confirmedAt) throw new Error(CONFIRM_FIRST);
    await startDraft(
      owner,
      input.text,
      input.version,
      await readOf(input.readId),
      {
        model: await modelForRun(owner.id, input.runId, input.model),
      },
    );
    return replyWith(input.text, input.readId, () =>
      loadSet(owner, input.text),
    );
  }),

  intent: rulesProcedure(z.strictObject({ text })).mutation(({ ctx, input }) =>
    replyWith(input.text, null, () =>
      confirmIntent(owner, input.text, keptRead, ctx.actor),
    ),
  ),

  write: rulesProcedure(
    z.strictObject({
      text,
      readId: readIdSchema,
      id,
      model,
      runId: runIdSchema.optional(),
    }),
  ).mutation(async ({ input }) => {
    await startRewrite(
      owner,
      input.text,
      await readOf(input.readId),
      input.id,
      {
        model: await modelForRun(owner.id, input.runId, input.model),
      },
    );
    return replyWith(input.text, input.readId, () =>
      loadSet(owner, input.text),
    );
  }),

  choose: rulesProcedure(
    z.strictObject({ text, id, index: z.number().int().min(0).max(5) }),
  ).mutation(({ ctx, input }) =>
    replyWith(input.text, null, () =>
      choose(owner, input.text, input.id, input.index, ctx.actor),
    ),
  ),

  appliesTo: rulesProcedure(
    z.strictObject({ text, id, value: z.enum(['every', 'some']) }),
  ).mutation(({ ctx, input }) =>
    replyWith(input.text, null, () =>
      setAppliesTo(
        owner,
        input.text,
        input.id,
        input.value,
        keptRead,
        ctx.actor,
      ),
    ),
  ),

  // Asks the model, so a mutation though it keeps nothing.
  advise: rulesProcedure(
    z.strictObject({ text, id, runId: runIdSchema.optional() }),
  ).mutation(async ({ input }) => {
    const set = await loadSet(owner, input.text);
    if (!set) throw new Error(NO_RULES);
    const read = set.readId ? await keptRead(set.readId) : null;
    if (!read) throw new Error(READ_GONE);
    const record = attemptRecorder({
      process: owner.id,
      instructionsHash: set.hash,
      readId: read.id,
    });
    return {
      kind: 'advice' as const,
      advice: await advise(
        await ownerFor(owner, set),
        input.text,
        set,
        read,
        input.id,
        { model: await modelForRun(owner.id, input.runId), record },
      ).finally(record.settled),
    };
  }),

  debug: rulesProcedure(
    z.strictObject({
      text,
      readId: readIdSchema.nullable(),
      id,
      inputs: z.record(z.string().max(80), z.number().int().min(0)),
    }),
  ).query(async ({ input }) => {
    const set = await loadSet(owner, input.text);
    if (!set) throw new Error(NO_RULES);
    const readId = input.readId ?? set.readId;
    const read = readId ? await keptRead(readId) : null;
    if (!read) throw new Error(READ_GONE);
    const debug = debugDefinition(
      await ownerFor(owner, set),
      input.text,
      set,
      read,
      input.id,
      input.inputs,
    );
    if (!debug) throw new Error('No such definition.');
    return { kind: 'debug' as const, debug };
  }),

  debugDraft: rulesProcedure(
    z.strictObject({ text, readId: readIdSchema.nullable() }),
  ).query(async ({ input }) => {
    const set = await loadSet(owner, input.text);
    if (!set) throw new Error(NO_RULES);
    return {
      kind: 'debugDraft' as const,
      debug: debugDraft(
        await ownerFor(owner, set),
        input.text,
        set,
        await keptRead(input.readId ?? set.readId ?? ''),
      ),
    };
  }),

  decide: rulesProcedure(
    z.strictObject({
      text,
      id,
      decision: z.enum(['accept', 'deny']),
      note: z.string().max(500).optional(),
    }),
  ).mutation(({ ctx, input }) =>
    replyWith(input.text, null, () =>
      input.decision === 'accept'
        ? accept(owner, input.text, input.id, keptRead, ctx.actor)
        : deny(owner, input.text, input.id, input.note, ctx.actor),
    ),
  ),
});
