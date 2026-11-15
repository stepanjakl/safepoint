import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { draftProgressSchema, proposalSchema } from '@/lib/definitions/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS as direct,
} from '@/lib/processes/brunch-orders/process';
import {
  answerParts,
  crossChecks,
  jobs,
  modelLimits,
  proposals,
  reads,
  sourceReads,
} from '@/server/db/schema';
import { jobProgress } from '@/server/jobs/run-job';
import { INTERRUPTED as PROPOSAL_INTERRUPTED } from '@/server/jobs/proposal';
import { keptRead } from '@/server/storage/brunch-orders-reads';
import { keptCrossCheck } from '@/server/storage/cross-checks';
import { loadKeptLimits } from '@/server/storage/model-limits';
import { keptProposal } from '@/server/storage/proposals';
import { sourceValues } from '@/server/storage/source-reads';

import { importKeptData, refusals, describe as say } from './report';

// The import on a made-up data folder and a scratch database: what it copies,
// that running it twice changes nothing, what it refuses, and that it leaves
// every file as it found it.

const write = (dir: string, name: string, value: unknown) => {
  mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  writeFileSync(
    path.join(dir, name),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
};

const sourceRead = (readId: string) => ({
  readId,
  readAt: '2026-11-13T09:00:00.000Z',
  origin: 'live',
  title: 'Kept',
  url: null,
  resources: [{ name: 'Stock', values: [['Item'], [readId, 1.5]] }],
});

// A proposal as a run kept it, and the parts of an answer being given.
const fixture = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
) as { proposal: unknown };
const frozen = proposalSchema.parse(fixture.proposal);
const proposalOf = (readId: string, fingerprint: string, at: string) => ({
  ...frozen,
  readId,
  fingerprint,
  at,
  records: {
    'ZZ-9': frozen.records['SD-01']!,
    'AV-RR': frozen.records['SD-01']!,
  },
});
const FP = '5b895575e4e7';
const CHECK_FP = 'd23a4c56d75b';
const cells = {
  'ZZ-9': { sales: { model: 3, working: 'Three.', agrees: true } },
};

// Every file under the folder, with its content and its time of change.
function snapshot(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory()
        ? snapshot(file)
        : [
            `${file} ${statSync(file).mtimeMs} ${createHash('sha256').update(readFileSync(file)).digest('hex')}`,
          ];
    })
    .sort();
}

describe('the import of what is kept on disk', () => {
  const db = inScratchDatabase();
  let folder = '';
  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'kept-data-'));
    write(folder, 'brunch-orders/reads/first.json', {
      ...capturedRead(),
      id: 'first',
    });
    write(folder, 'brunch-orders/reads/second.json', {
      ...capturedRead(),
      id: 'second',
    });
    write(folder, 'other-process/reads/third.json', {
      ...capturedRead(),
      id: 'third',
    });
    write(
      folder,
      'sources/brunch-store-sheet/reads/2026-11-13T09-00-00-000Z-aaaaaaaa.json',
      sourceRead('2026-11-13T09-00-00-000Z-aaaaaaaa'),
    );
    write(
      folder,
      'sources/brunch-store-sheet/reads/2026-11-14T09-00-00-000Z-bbbbbbbb.json',
      sourceRead('2026-11-14T09-00-00-000Z-bbbbbbbb'),
    );
    write(folder, 'model-limits.json', {
      shares: { 'model-a': 'model-b' },
      perMinute: { 'model-b': { limit: 15, at: 1_760_000_000_000 } },
      perDay: { 'model-b': { limit: 20, at: 1_760_000_000_001 } },
      used: { 'model-b': { day: '2026-11-13', count: 7 } },
    });
    // What a run kept under a read and a rulebook, and a job's progress. The
    // direct process proposes on a read kept under `brunch-orders`.
    write(
      folder,
      `brunch-orders/proposals/first.${FP}.json`,
      proposalOf('first', FP, '2026-11-01T09:00:00.000Z'),
    );
    write(
      folder,
      `brunch-orders-direct/proposals/first.${CHECK_FP}.json`,
      proposalOf('first', CHECK_FP, '2026-11-02T09:00:00.000Z'),
    );
    write(folder, `brunch-orders/proposals/second.${FP}.part.json`, {
      records: { 'ZZ-9': frozen.records['SD-01'] },
      models: ['a-model'],
    });
    write(folder, `brunch-orders/proposals/first.${FP}-progress.json`, {
      step: 'Proposed for 2 records.',
      error: null,
      running: false,
    });
    write(folder, `brunch-orders/proposals/second.${FP}-progress.json`, {
      step: 'Proposing 1 of 3 batches…',
      error: null,
      running: true,
    });
    write(folder, `brunch-orders/cross-checks/first.${CHECK_FP}.json`, {
      fingerprint: CHECK_FP,
      readId: 'first',
      model: 'a-model',
      at: '2026-11-01T10:00:00.000Z',
      cells,
      agreed: 1,
      total: 1,
    });
    write(folder, `brunch-orders/cross-checks/second.${CHECK_FP}.part.json`, {
      cells,
      models: ['a-model'],
    });
    write(folder, 'brunch-orders/drafts/86c4ba5959e9.json', {
      step: 'Drafted 2 definitions.',
      error: null,
      running: false,
      writing: null,
    });
    write(folder, 'brunch-orders/drafts/aaaaaaaaaaaa.json', {
      step: 'Writing 2 of 5…',
      error: null,
      running: true,
      writing: 'two_weekends',
    });
    // Not read as any of them: another kind's, and what is not a kept file.
    write(folder, 'brunch-orders/applied/first.abcdefabcdef.json', []);
    write(folder, 'brunch-orders/reads/leftover.json.123.tmp', 'half a file');
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  // What the made-up folder holds, as a first import counts it.
  const KEPT = {
    'run reads': [3, 3, 0, 0],
    'source reads': [2, 2, 0, 0],
    'model limits': [1, 2, 0, 0],
    proposals: [2, 2, 0, 0],
    'proposal parts': [1, 1, 0, 0],
    'cross-checks': [1, 1, 0, 0],
    'cross-check parts': [1, 1, 0, 0],
    'proposal progress': [2, 2, 0, 0],
    'draft progress': [2, 2, 0, 0],
  };
  const PRESENT = Object.fromEntries(
    Object.entries(KEPT).map(([kind, [files, inserted]]) => [
      kind,
      [files, 0, kind === 'model limits' ? 2 : inserted, 0],
    ]),
  );

  const counts = (report: Awaited<ReturnType<typeof importKeptData>>) =>
    Object.fromEntries(
      report.map(({ kind, tally }) => [
        kind,
        [tally.files, tally.inserted, tally.present, tally.refused.length],
      ]),
    );

  it('copies each kind, and the rows read back as the files held them', async () => {
    const before = snapshot(folder);
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual(KEPT);
    expect(refusals(report)).toBe(0);

    expect(await keptRead('first')).toEqual({ ...capturedRead(), id: 'first' });
    expect(
      (await db().select().from(reads))
        .map((r) => `${r.process}/${r.id}`)
        .sort(),
    ).toEqual([
      'brunch-orders/first',
      'brunch-orders/second',
      'other-process/third',
    ]);
    expect(
      await sourceValues(
        'brunch-store-sheet',
        '2026-11-13T09-00-00-000Z-aaaaaaaa',
      ),
    ).toEqual({
      readId: '2026-11-13T09-00-00-000Z-aaaaaaaa',
      resources: [
        {
          name: 'Stock',
          values: [['Item'], ['2026-11-13T09-00-00-000Z-aaaaaaaa', 1.5]],
        },
      ],
    });
    expect(await loadKeptLimits(db())).toEqual(
      JSON.parse(readFileSync(path.join(folder, 'model-limits.json'), 'utf8')),
    );
    // What a run kept reads back through the functions that keep it.
    expect(await keptProposal(owner, 'first', FP)).toEqual(
      proposalOf('first', FP, '2026-11-01T09:00:00.000Z'),
    );
    expect(
      Object.keys((await keptProposal(direct, 'first', CHECK_FP))!.records),
    ).toEqual(['ZZ-9', 'AV-RR']);
    expect(await keptCrossCheck(owner, 'first', CHECK_FP)).toMatchObject({
      agreed: 1,
      cells,
    });
    expect(await db().select().from(answerParts)).toHaveLength(2);
    // A job's progress as it was, and one kept as running reading as
    // interrupted, in the words of its kind, as the process that ran it is gone.
    const progress = (readId: string) =>
      jobProgress({
        kind: 'proposals',
        process: owner.id,
        key: `${readId}:${FP}`,
        schema: draftProgressSchema,
        interrupted: PROPOSAL_INTERRUPTED,
      });
    expect(await progress('first')).toMatchObject({
      step: 'Proposed for 2 records.',
      running: false,
      error: null,
    });
    expect(await progress('second')).toMatchObject({
      step: 'Proposing 1 of 3 batches…',
      running: false,
      error: PROPOSAL_INTERRUPTED,
    });
    expect(
      await jobProgress({
        kind: 'drafts',
        process: owner.id,
        key: 'aaaaaaaaaaaa',
        schema: draftProgressSchema,
        interrupted: 'Stopped.',
      }),
    ).toMatchObject({
      running: false,
      error: 'Stopped.',
      writing: 'two_weekends',
    });
    // Every file as it was.
    expect(snapshot(folder)).toEqual(before);
  });

  it('is safe to run twice: everything is then present, and nothing changes', async () => {
    await importKeptData(db(), folder);
    const rows = async () => [
      await db().select().from(reads),
      await db().select().from(sourceReads),
      await db().select().from(modelLimits),
      await db().select().from(proposals),
      await db().select().from(answerParts),
      await db().select().from(crossChecks),
      await db().select().from(jobs),
    ];
    const first = await rows();
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual(PRESENT);
    expect(await rows()).toEqual(first);
  });

  it('reports the same counts on a dry run, and writes nothing', async () => {
    const dry = await importKeptData(db(), folder, { dryRun: true });
    expect(counts(dry)).toEqual(KEPT);
    for (const table of [
      reads,
      sourceReads,
      modelLimits,
      proposals,
      answerParts,
      crossChecks,
      jobs,
    ])
      expect(await db().select().from(table)).toEqual([]);
    // As it would be after a real one: the same counts either way.
    expect(counts(await importKeptData(db(), folder))).toEqual(counts(dry));
    expect(
      counts(await importKeptData(db(), folder, { dryRun: true })),
    ).toEqual(PRESENT);
  });

  it('refuses what differs from the row it finds, and what does not fit, and overwrites nothing', async () => {
    await importKeptData(db(), folder);
    // The files change after they were imported, and four are not kept files.
    write(folder, 'brunch-orders/reads/first.json', {
      ...capturedRead(),
      id: 'first',
      source: 'Edited since',
    });
    write(folder, 'brunch-orders/reads/broken.json', '{');
    write(folder, 'brunch-orders/reads/misnamed.json', {
      ...capturedRead(),
      id: 'another',
    });
    write(
      folder,
      'sources/brunch-store-sheet/reads/captured.json',
      sourceRead('captured'),
    );
    write(folder, 'sources/brunch-store-sheet/reads/shapeless.json', {
      readId: 'shapeless',
    });
    write(folder, 'model-limits.json', {
      shares: { 'model-a': 'model-b' },
      perMinute: { 'model-b': { limit: 15.5, at: 1_760_000_000_000 } },
      perDay: { 'model-b': { limit: 25, at: 1_760_000_000_001 } },
      used: { 'model-b': { day: '2026-11-13', count: 7 } },
    });
    const before = snapshot(folder);
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toEqual({
      ...PRESENT,
      'run reads': [5, 0, 2, 3],
      'source reads': [4, 0, 2, 2],
      'model limits': [1, 0, 1, 1],
    });
    expect(refusals(report)).toBe(6);
    const text = say(report, false);
    expect(text).toContain(
      'first.json: the database has a row of this key with other content',
    );
    expect(text).toContain('broken.json: is not valid JSON');
    expect(text).toContain(
      'misnamed.json: the file is named misnamed but the read says it is another',
    );
    expect(text).toContain(
      'captured.json: the read id is not one the table takes',
    );
    expect(text).toContain('shapeless.json: does not fit the stored shape');
    expect(text).toContain('model-b: a value of it does not fit the table');
    // The row that was kept is the one that was kept.
    expect((await keptRead('first'))!.source).toBe('captured');
    expect(
      (await db().select().from(modelLimits)).find((r) => r.model === 'model-b')
        ?.perDay,
    ).toBe(20);
    expect(snapshot(folder)).toEqual(before);
  });

  it('refuses a proposal for a read that is not in the database, and a file that is no run key’s', async () => {
    const AT = '2026-11-03T09:00:00.000Z';
    write(
      folder,
      `brunch-orders/proposals/gone.${FP}.json`,
      proposalOf('gone', FP, AT),
    );
    // Named for one read, saying it is another's.
    write(
      folder,
      `brunch-orders/proposals/second.${FP}.json`,
      proposalOf('first', FP, AT),
    );
    write(folder, 'brunch-orders/proposals/notes.json', {});
    write(folder, `brunch-orders/cross-checks/gone.${CHECK_FP}.part.json`, {
      cells,
      models: [],
    });
    write(folder, 'brunch-orders/drafts/broken.json', '{');
    const before = snapshot(folder);
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toMatchObject({
      proposals: [5, 2, 0, 3],
      'cross-check parts': [2, 1, 0, 1],
      'draft progress': [3, 2, 0, 1],
    });
    const text = say(report, false);
    expect(text).toContain(
      'gone.5b895575e4e7.json: its read brunch-orders/gone is not in the database',
    );
    expect(text).toContain(
      'second.5b895575e4e7.json: the file is named second.5b895575e4e7 but says it is first.5b895575e4e7',
    );
    expect(text).toContain(
      'notes.json: the name is not <read>.<rulebook>.json',
    );
    expect(text).toContain(
      'gone.d23a4c56d75b.part.json: its read brunch-orders/gone is not in the database',
    );
    expect(text).toContain('broken.json: is not valid JSON');
    expect(snapshot(folder)).toEqual(before);
  });

  it('refuses a proposal that changed since it was imported, and leaves the row', async () => {
    await importKeptData(db(), folder);
    const changed = proposalOf('first', FP, '2026-11-01T09:00:00.000Z');
    write(folder, `brunch-orders/proposals/first.${FP}.json`, {
      ...changed,
      model: 'Edited since',
    });
    const report = await importKeptData(db(), folder);
    expect(counts(report)).toMatchObject({ proposals: [2, 0, 1, 1] });
    expect(say(report, false)).toContain(
      `first.${FP}.json: the database has a row of this key with other content`,
    );
    expect((await keptProposal(owner, 'first', FP))!.model).toBe(frozen.model);
  });

  it('has nothing to say of a folder with none of it', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'kept-data-empty-'));
    try {
      expect(counts(await importKeptData(db(), empty))).toEqual(
        Object.fromEntries(
          Object.keys(KEPT).map((kind) => [kind, [0, 0, 0, 0]]),
        ),
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
