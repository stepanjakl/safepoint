import { readFileSync } from 'node:fs';

import { asc, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from '@/lib/engine/captured.fixture';
import {
  confirmProfile,
  profileOf,
  setColumnBlank,
} from '@/lib/engine/profile';
import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import { definition, keep, keepText, TEXT } from '@/lib/engine/set.fixture';
import { fingerprintOf, hashOf } from '@/lib/engine/fingerprint';
import { ensureProcess } from '@/server/db/scope';
import {
  currentRulebooks,
  dataProfiles,
  ruleDecisions,
} from '@/server/db/schema';
import {
  headOf,
  KEPT_CHANGING,
  listRevisions,
  loadConfirmedProfile,
  loadProfile,
  loadRevision,
  loadSet,
  putProfile,
  putRevision,
  saveProfile,
  saveSet,
  StoredSetError,
  updateProfile,
  updateSet,
} from './rulebooks';
import { definitionSetSchema, type DefinitionSet } from '@/lib/engine/types';
import { runProcess } from '@/server/operations/kept-processes';
import { rulebookAtFor, startRun } from '@/server/storage/runs/runs';

// A kept set is read through its schema, so a broken body is reported rather
// than taken for "nothing kept" and overwritten. An accepted rulebook a run
// used is kept beside the current one, never written again. Each test has an
// empty database and an empty working directory, so nothing is seeded.

const { database: db } = inScratchStorage();
const accepted = definition('two_weekends', {
  formula: 'record.weekend_1 + record.weekend_2',
  approvedAt: '2026-10-09T12:00:00.000Z',
});

describe('a rulebook accepted before keys were kept', () => {
  const kept = JSON.parse(
    readFileSync(
      'fixtures/brunch-orders/rulebooks/v2-91823c6c8281/5b895575e4e7.json',
      'utf8',
    ),
  );

  it('still fits the stored shape, with the id it was kept under', () => {
    const set = definitionSetSchema.parse(kept);
    expect(set.acceptedKeys).toBeUndefined();
    expect(fingerprintOf(set)).toBe('5b895575e4e7');
  });

  it('is another rulebook once it names the records it was accepted on', () => {
    const set = definitionSetSchema.parse(kept);
    const keyed = { ...set, acceptedKeys: ['SD-01'] };
    expect(fingerprintOf(keyed)).not.toBe(fingerprintOf(set));
    expect(fingerprintOf({ ...keyed, acceptedKeys: ['SD-01'] })).toBe(
      fingerprintOf(keyed),
    );
  });
});

describe('updates to one rulebook', () => {
  const approve = (id: string) => (s: DefinitionSet) => ({
    ...s,
    definitions: s.definitions.map((d) =>
      d.id === id ? { ...d, approvedAt: '2026-11-13T00:00:00.000Z' } : d,
    ),
  });
  const approved = async () =>
    (await loadSet(owner, TEXT))?.definitions
      .filter((d) => d.approvedAt)
      .map((d) => d.id);

  it('lands both of two at once: the later is worked out again on the earlier', async () => {
    await keep([definition('first'), definition('second')]);
    let worked = 0;
    const counting = (id: string) => (s: DefinitionSet) => {
      worked += 1;
      return approve(id)(s);
    };
    await Promise.all([
      updateSet(owner, TEXT, counting('first')),
      updateSet(owner, TEXT, counting('second')),
    ]);
    expect(await approved()).toEqual(['first', 'second']);
    // Both read the same revision; one landed and the other read again.
    expect(worked).toBe(3);
    const [row] = await db()
      .select({ revision: currentRulebooks.revision })
      .from(currentRulebooks);
    expect(row!.revision).toBe(3);
  });

  it('lets the next ones through when a change throws', async () => {
    await keep([definition('first'), definition('second')]);
    const failing = updateSet(owner, TEXT, () => {
      throw new Error('No change.');
    });
    const after = Promise.all([
      updateSet(owner, TEXT, approve('first')),
      updateSet(owner, TEXT, approve('second')),
    ]);
    await expect(failing).rejects.toThrow('No change.');
    await after;
    expect(await approved()).toEqual(['first', 'second']);
  });

  it('gives up in words a person can act on when the rulebook keeps moving', async () => {
    await keep([definition('first')]);
    // Every update finds the rulebook moved on since it was read.
    for (const statement of [
      'create function moved_on() returns trigger language plpgsql as $$ begin return null; end $$',
      'create trigger a_moved_on before update on current_rulebooks for each row execute function moved_on()',
    ])
      await db().execute(sql.raw(statement));
    let worked = 0;
    try {
      await expect(
        updateSet(owner, TEXT, (s) => {
          worked += 1;
          return approve('first')(s);
        }),
      ).rejects.toThrow(KEPT_CHANGING);
    } finally {
      await db().execute(
        sql.raw('drop trigger a_moved_on on current_rulebooks'),
      );
      await db().execute(sql.raw('drop function moved_on()'));
    }
    expect(worked).toBe(5);
    expect(await approved()).toEqual([]);
  });

  it('keeps a decision with its change, and neither without the other', async () => {
    await keep([definition('first')]);
    await updateSet(owner, TEXT, approve('first'), {
      actor: 'a.person',
      decision: () => ({ kind: 'accept', definitionId: 'first' }),
    });
    const rows = await db().select().from(ruleDecisions);
    expect(rows).toEqual([
      expect.objectContaining({
        process: owner.id,
        instructionsHash: hashOf(TEXT),
        kind: 'accept',
        definitionId: 'first',
        // As it was shown: before the change.
        definition: expect.objectContaining({ id: 'first', approvedAt: null }),
        rulebookRevision: 1,
        refusal: null,
        actor: 'a.person',
      }),
    ]);
    // A decision the table refuses takes its change back with it.
    await expect(
      updateSet(owner, TEXT, approve('first'), {
        actor: null,
        decision: () => ({ kind: 'choose', definitionId: 'first' }),
      }),
    ).rejects.toThrow();
    const [row] = await db()
      .select({ revision: currentRulebooks.revision })
      .from(currentRulebooks);
    expect(row!.revision).toBe(2);
    expect(await db().select().from(ruleDecisions)).toHaveLength(1);
  });
});

describe('the store', () => {
  it('has nothing for instructions never drafted', async () => {
    expect(await loadSet(owner, TEXT)).toBeNull();
    expect(await listRevisions(owner, TEXT)).toEqual({
      head: null,
      revisions: [],
    });
  });

  it('keeps a set whole, found by its instructions whatever the version is called', async () => {
    const set = await keep([definition('two_weekends')]);
    expect((await loadSet(owner, TEXT))?.definitions[0]?.id).toBe(
      'two_weekends',
    );
    await saveSet(owner, { ...set, version: 'v9' });
    expect((await loadSet(owner, TEXT))?.version).toBe('v9');
    expect(await db().select().from(currentRulebooks)).toHaveLength(1);
  });

  it('refuses a set for instructions that are not kept, saying so', async () => {
    const set = await keep([]);
    await expect(
      saveSet(owner, { ...set, hash: hashOf('Other words.') }),
    ).rejects.toThrow(/not a kept version: publish them/);
  });

  it('keeps an accepted rulebook as it was, whatever the current one becomes', async () => {
    const set = await keep([accepted]);
    const id = await putRevision(owner, set, { reason: 'accepted' });
    expect(id).toBe(fingerprintOf(set));
    await saveSet(owner, { ...set, definitions: [] });
    await putRevision(
      owner,
      { ...set, intent: 'Changed.' },
      { reason: 'used' },
    );
    const pinned = await loadRevision(owner, TEXT, id);
    expect(pinned?.definitions.map((d) => d.id)).toEqual(['two_weekends']);
    expect(pinned?.intent).toBe(set.intent);
    expect((await loadSet(owner, TEXT))?.definitions).toEqual([]);
    expect(await loadRevision(owner, TEXT, '000000000000')).toBeNull();
    expect(await loadRevision(owner, TEXT, '../current')).toBeNull();
    // Under other instructions, it is not this one.
    await keepText('Other words.');
    expect(await loadRevision(owner, 'Other words.', id)).toBeNull();
  });

  it('records each revision once, with the one it came from and why', async () => {
    const set = await keep([accepted]);
    const first = await putRevision(owner, set, { reason: 'accepted' });
    const migrated = {
      ...set,
      definitions: [
        { ...accepted, formula: 'record.weekend_2 + record.weekend_1' },
      ],
    };
    const second = await putRevision(owner, migrated, {
      reason: 'migrated',
      note: 'Read the other way round.',
    });
    expect(await putRevision(owner, migrated, { reason: 'used' })).toBe(second);
    const { head, revisions } = await listRevisions(owner, TEXT);
    expect(head).toBe(second);
    expect(
      revisions.map(({ id, parent, reason, note }) => ({
        id,
        parent,
        reason,
        note,
      })),
    ).toEqual([
      {
        id: second,
        parent: first,
        reason: 'migrated',
        note: 'Read the other way round.',
      },
      { id: first, parent: null, reason: 'accepted', note: null },
    ]);
    // A run going back to the revision it pinned changes nothing.
    await putRevision(owner, set, { reason: 'used' });
    expect(await headOf(owner, TEXT)).toBe(second);
    expect((await listRevisions(owner, TEXT)).revisions).toHaveLength(2);
  });

  it('makes a straight line of two revisions kept at once', async () => {
    const set = await keep([accepted]);
    const bodies = [
      'record.weekend_1',
      'record.weekend_2',
      'record.weekend_3',
    ].map((formula) => ({
      ...set,
      definitions: [{ ...accepted, formula }],
    }));
    const ids = await Promise.all(
      bodies.map((body) => putRevision(owner, body, { reason: 'accepted' })),
    );
    const { head, revisions } = await listRevisions(owner, TEXT);
    const oldestFirst = [...revisions].reverse();
    expect(oldestFirst.map((r) => r.parent)).toEqual([
      null,
      oldestFirst[0]!.id,
      oldestFirst[1]!.id,
    ]);
    expect(head).toBe(oldestFirst[2]!.id);
    expect(new Set(ids)).toEqual(new Set(oldestFirst.map((r) => r.id)));
  });

  it('reports a body of another shape, naming what does not fit', async () => {
    await keep([]);
    await db().execute(
      sql`update current_rulebooks set body = ${JSON.stringify({ hash: hashOf(TEXT), items: [] })}::json`,
    );
    await expect(loadSet(owner, TEXT)).rejects.toThrow(StoredSetError);
    await expect(loadSet(owner, TEXT)).rejects.toThrow(
      /does not fit the stored shape: /,
    );
  });

  it('reports a revision whose body is not its id', async () => {
    const set = await keep([accepted]);
    const id = await putRevision(owner, set, { reason: 'accepted' });
    await db().execute(
      sql`alter table rulebook_revisions disable trigger user`,
    );
    await db().execute(
      sql`update rulebook_revisions set body = ${JSON.stringify({ ...set, definitions: [] })}::json`,
    );
    await db().execute(sql`alter table rulebook_revisions enable trigger user`);
    await expect(loadRevision(owner, TEXT, id)).rejects.toThrow(
      /does not match its id/,
    );
  });
});

describe('the data profile in the store', () => {
  const proposed = profileOf(capturedRead(), owner.subject.data);
  const confirmed = confirmProfile(proposed, '2026-11-10T00:00:00.000Z');
  const confirmedRows = () =>
    db().select().from(dataProfiles).orderBy(asc(dataProfiles.id));

  it('has nothing for a process never profiled', async () => {
    expect(await loadProfile(owner)).toBeNull();
    expect(await loadConfirmedProfile(owner, confirmed.id)).toBeNull();
    expect(await updateProfile(owner, (p) => p)).toBeNull();
  });

  it('keeps one under review as current, and nothing as confirmed', async () => {
    await saveProfile(owner, proposed);
    expect(await loadProfile(owner)).toEqual(proposed);
    expect(await confirmedRows()).toEqual([]);
    expect(await loadConfirmedProfile(owner, proposed.id)).toBeNull();
    await expect(putProfile(owner, proposed)).rejects.toThrow(
      /Only a confirmed/,
    );
  });

  it('keeps a confirmed one by its id, whatever the current one becomes', async () => {
    await saveProfile(owner, confirmed);
    expect((await confirmedRows()).map((row) => row.id)).toEqual([
      confirmed.id,
    ]);
    const edited = setColumnBlank(confirmed, 'max_order_units', 'skip');
    await saveProfile(owner, edited);
    expect((await loadProfile(owner))?.confirmedAt).toBeNull();
    expect(await loadConfirmedProfile(owner, confirmed.id)).toEqual(confirmed);
    expect(await loadConfirmedProfile(owner, '../current')).toBeNull();
  });

  it('never writes a confirmed one again', async () => {
    const id = await putProfile(owner, confirmed);
    expect(await putProfile(owner, confirmed)).toBe(id);
    await saveProfile(owner, confirmed);
    expect(await confirmedRows()).toHaveLength(1);
  });

  it('refuses a profile changed after it was made', async () => {
    await ensureProcess(db(), owner.id);
    await db()
      .insert(dataProfiles)
      .values({
        process: owner.id,
        id: confirmed.id,
        readId: confirmed.readId,
        confirmedAt: new Date(confirmed.confirmedAt!),
        body: { ...confirmed, columns: confirmed.columns.slice(1) },
      });
    await expect(loadConfirmedProfile(owner, confirmed.id)).rejects.toThrow(
      /does not match its id/,
    );
    await expect(
      saveProfile(owner, { ...confirmed, confirmedAt: null }),
    ).rejects.toThrow(StoredSetError);
  });

  it('changes the one under review by compare-and-set, losing neither of two at once', async () => {
    await saveProfile(owner, proposed);
    const [a, b] = proposed.columns;
    await Promise.all([
      updateProfile(owner, (p) => setColumnBlank(p, a!.column, 'skip')),
      updateProfile(owner, (p) => setColumnBlank(p, b!.column, 'fail')),
    ]);
    const kept = (await loadProfile(owner))!;
    expect(kept.columns[0]!.blank).toBe('skip');
    expect(kept.columns[1]!.blank).toBe('fail');
  });

  it('keeps a confirmation as confirmed, with who made it, once', async () => {
    await saveProfile(owner, proposed);
    const confirm = (p: typeof proposed) =>
      p.confirmedAt ? p : confirmProfile(p, '2026-11-10T00:00:00.000Z');
    await updateProfile(owner, confirm, { actor: 'a.person' });
    await updateProfile(owner, confirm, { actor: 'a.person' });
    expect(await loadConfirmedProfile(owner, confirmed.id)).toEqual(confirmed);
    expect(await db().select().from(ruleDecisions)).toEqual([
      expect.objectContaining({
        kind: 'confirm_profile',
        profileId: confirmed.id,
        instructionsHash: null,
        actor: 'a.person',
      }),
    ]);
    const [row] = await confirmedRows();
    expect(row!.confirmedBy).toBe('a.person');
  });

  it('keeps a set with the profile it was drafted on, and one without', async () => {
    const set = await keep([accepted], { profileId: confirmed.id });
    expect((await loadSet(owner, TEXT))?.profileId).toBe(confirmed.id);
    await saveSet(owner, { ...set, profileId: undefined });
    expect((await loadSet(owner, TEXT))?.profileId).toBeUndefined();
    // A revision names a confirmed profile the database keeps.
    await expect(
      putRevision(
        owner,
        { ...set, profileId: confirmed.id },
        {
          reason: 'accepted',
        },
      ),
    ).rejects.toThrow();
    await putProfile(owner, confirmed);
    const id = await putRevision(
      owner,
      { ...set, profileId: confirmed.id },
      { reason: 'accepted' },
    );
    expect((await loadRevision(owner, TEXT, id))?.profileId).toBe(confirmed.id);
  });
});

describe('a run that keeps its own rulebook', () => {
  const ownRun = async () =>
    (
      await startRun(runProcess(owner.id), {
        instructions: hashOf(TEXT),
        trigger: 'manual',
        additionalInstructions: null,
        modelPlan: 'groq',
        ownRulebook: true,
        actor: null,
      })
    ).id;

  it('drafts, decides and accepts apart from the shared one', async () => {
    const shared = await keep([definition('first')]);
    const run = await ownRun();
    const at = await rulebookAtFor(owner.id, run, TEXT);
    expect(at).toEqual({ text: TEXT, run });
    await saveSet(
      owner,
      { ...shared, definitions: [definition('first'), definition('second')] },
      { run },
    );
    expect((await loadSet(owner, TEXT))?.definitions).toHaveLength(1);
    expect((await loadSet(owner, at))?.definitions).toHaveLength(2);

    const decided = await updateSet(
      owner,
      at,
      (s) => ({
        ...s,
        definitions: s.definitions.map((d) => ({ ...d, approvedAt: 'now' })),
      }),
      {
        actor: null,
        decision: () => ({ kind: 'accept', definitionId: 'first' }),
      },
    );
    expect((await loadSet(owner, TEXT))?.definitions[0]?.approvedAt).toBe(null);
    const [decision] = await db().select().from(ruleDecisions);
    expect(decision?.runId).toBe(run);

    const id = await putRevision(owner, decided!, {
      reason: 'accepted',
      run,
    });
    // The shared history neither lists it nor moves its head to it.
    expect(await headOf(owner, TEXT)).toBeNull();
    expect((await listRevisions(owner, TEXT)).revisions).toEqual([]);
    expect(await headOf(owner, at)).toBe(id);
    expect(await loadRevision(owner, TEXT, id)).toEqual(decided);
  });

  it('is not the place for rules of other instructions', async () => {
    await keep([definition('first')]);
    const run = await ownRun();
    await expect(rulebookAtFor(owner.id, run, `${TEXT} again`)).rejects.toThrow(
      'other instructions',
    );
    // Without a run, or for a run sharing its instructions' rules: the shared.
    expect(await rulebookAtFor(owner.id, undefined, TEXT)).toBe(TEXT);
  });
});
