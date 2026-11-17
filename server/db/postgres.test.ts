import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { and, count, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { DecisionMade } from '@/lib/engine/apply';
import { capturedRead } from '@/lib/engine/captured.fixture';
import { hashOf } from '@/lib/engine/fingerprint';
import type { KeptRead } from '@/lib/engine/records';
import { eventually } from '@/lib/engine/scratch.fixture';
import { profileOf, setColumnBlank } from '@/lib/engine/profile';
import { definition, keepText } from '@/lib/engine/set.fixture';
import {
  definitionSetSchema,
  type DefinitionSet,
  type Proposal,
} from '@/lib/engine/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';
import {
  applications,
  instructionVersions,
  proposals,
  reads,
  recordDecisions,
  rulebookRevisions,
} from '@/server/db/schema';
import { keptProcess, runProcess } from '@/server/operations/kept-processes';
import {
  applyDecisions,
  DECIDED_SINCE,
  keptApplication,
  undoApplication,
} from '@/server/storage/applications';
import { readAndKeep } from '@/server/storage/brunch-orders-reads';
import {
  appendDecisions,
  currentDecisions,
  type NewEvent,
} from '@/server/storage/decisions';
import { publishVersion } from '@/server/storage/instructions';
import { currentProposalOf, keepProposal } from '@/server/storage/proposals';
import { keepStandInRead } from '@/server/storage/reads.fixture';
import { Refused } from '@/server/storage/refused';
import { seedRulebooks } from '@/server/storage/rulebook-files';
import {
  listRevisions,
  loadProfile,
  loadSet,
  putRevision,
  saveProfile,
  saveSet,
  updateProfile,
  updateSet,
} from '@/server/storage/rulebooks';
import { startRun } from '@/server/storage/runs';
import { memorySheet } from '@/server/storage/sheet.fixture';

import { inPostgresDatabase, POSTGRES_URL, REPEATS } from './postgres.fixture';

/*
  The locks and guarded statements, under real concurrency: a PostgreSQL
  server reached through a pool, so two callers fired together hold two
  connections and two transactions at once, and the server, not a test,
  orders them. Opt-in (postgres.fixture.ts): skipped unless
  SAFEPOINT_TEST_DATABASE_URL names a server, and then run in a schema of
  the file's own that is dropped when it ends. Each race is run REPEATS
  times, each time afresh, and fails on the first repetition that breaks
  its invariant.

  Where a race needs two server processes (a job's lease, held per process
  in memory), it is two Node processes, each the app's own modules on the
  same schema.
*/

const pg = inPostgresDatabase();

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const FP = 'abcabcabcabc';
const THURSDAY = '2026-10-29T08:45:00.000Z';
const readOf = (id: string): KeptRead => ({
  ...capturedRead(),
  id,
  readAt: THURSDAY,
});
const record = (order: number) => ({
  action: 'set' as const,
  values: { order },
  reason: 'Worked out.',
  cited: [],
  unsure: null,
  verdict: 'ready' as const,
  checks: [],
});
const proposalOn = (readId: string): Proposal => ({
  fingerprint: FP,
  readId,
  model: 'test',
  at: '2026-10-29T09:00:00.000Z',
  records: { 'EG-06': record(12), 'CT-250': record(10) },
});
const approve: DecisionMade = { kind: 'approve', at: THURSDAY };
const original = () => [
  ['sku', 'order', 'note'],
  ['EG-06', 24, 'keep'],
  ['CT-250', 20, 'keep'],
];
const keyOf = (readId: string) => ({
  process: owner.id,
  readId,
  fingerprint: FP,
});

// A read and a proposal of their own for one repetition, and a sheet.
async function arranged(readId: string) {
  await keepStandInRead(pg.db(), readId);
  await keepProposal(owner, proposalOn(readId));
  return memorySheet(readOf(readId), original());
}
const writeOn = (readId: string, sheet: ReturnType<typeof memorySheet>) =>
  applyDecisions(
    owner,
    set,
    readOf(readId),
    FP,
    proposalOn(readId),
    { 'EG-06': approve, 'CT-250': approve },
    [],
    sheet,
  );
const rowsOf = (readId: string) =>
  pg
    .db()
    .select({ status: applications.status, decisions: applications.decisions })
    .from(applications)
    .where(eq(applications.readId, readId))
    .orderBy(applications.id);

describe.skipIf(!POSTGRES_URL)('on a real PostgreSQL server', () => {
  describe('isolation', () => {
    it('keeps everything in the schema of the run, and leaves public as it was', async () => {
      // Something of every kind the storage code keeps, through it.
      await publishVersion(
        keptProcess('brunch-orders'),
        'Isolated.',
        null,
        null,
      );
      await arranged('isolated');
      await startRun(runProcess('brunch-orders'), {
        instructions: hashOf(brunchOrdersProcess.instructions.text),
        trigger: 'manual',
        additionalInstructions: null,
        actor: null,
      });
      const [where] = (
        (await pg
          .db()
          .execute(sql`select current_schema() as at`)) as unknown as {
          rows: { at: string }[];
        }
      ).rows;
      expect(where!.at).toBe(pg.schema());
      const [kept] = await pg
        .db()
        .select({ n: count() })
        .from(instructionVersions);
      expect(kept!.n).toBeGreaterThan(0);
      expect(await pg.publicNow()).toEqual(pg.publicBefore());
    });
  });

  describe('instruction versions', () => {
    it('get two labels for two different texts at once, and one version for the same text', async () => {
      const brunch = keptProcess('brunch-orders');
      let next = 4;
      for (let at = 0; at < REPEATS; at += 1) {
        const different = await Promise.all([
          publishVersion(brunch, `First ${at}.`, null, null),
          publishVersion(brunch, `Second ${at}.`, null, null),
        ]);
        expect(different.map((p) => p.created)).toEqual([true, true]);
        expect(different.map((p) => p.version.version).sort()).toEqual(
          [`v${next}`, `v${next + 1}`].sort(),
        );
        next += 2;
        const same = await Promise.all([
          publishVersion(brunch, `Same ${at}.`, null, null),
          publishVersion(brunch, `Same ${at}.`, null, null),
        ]);
        expect(same.filter((p) => p.created)).toHaveLength(1);
        expect(same[0]!.version).toEqual(same[1]!.version);
        next += 1;
      }
      const labels = await pg
        .db()
        .select({ version: instructionVersions.version })
        .from(instructionVersions)
        .where(eq(instructionVersions.process, 'brunch-orders'));
      expect(new Set(labels.map((l) => l.version)).size).toBe(labels.length);
      expect(labels).toHaveLength(next - 1);
    });
  });

  describe('writes to the output', () => {
    it('claim once for two writes of one run key at once, and write the sheet once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const readId = `write-${at}`;
        const sheet = await arranged(readId);
        const outcomes = await Promise.all([
          writeOn(readId, sheet),
          writeOn(readId, sheet),
        ]);
        expect(outcomes.map((o) => o.kind).sort()).toEqual([
          'refused',
          'written',
        ]);
        expect(sheet.writes).toHaveLength(1);
        expect((await rowsOf(readId)).map((r) => r.status)).toEqual([
          'verified',
        ]);
      }
    });

    it('are settled to one outcome by two settlers of one lapsed pending write', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const readId = `settle-${at}`;
        const sheet = await arranged(readId);
        // The write lands, then its process cannot read it back: pending,
        // its lease given back.
        const landing = { ...sheet };
        landing.writeRange = async (tab, range, values) => {
          await sheet.writeRange(tab, range, values);
          sheet.failReads = 1;
        };
        expect(await writeOn(readId, landing as typeof sheet)).toMatchObject({
          application: { status: 'pending' },
        });
        const settled = await Promise.all([
          keptApplication(owner, readId, FP, sheet),
          keptApplication(owner, readId, FP, sheet),
        ]);
        expect(settled.map((a) => a?.status)).toEqual(['verified', 'verified']);
        expect((await rowsOf(readId)).map((r) => r.status)).toEqual([
          'verified',
        ]);
        expect(sheet.writes).toHaveLength(1);
      }
    });

    it('are undone once for two undos at once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const readId = `undo-${at}`;
        const sheet = await arranged(readId);
        await writeOn(readId, sheet);
        const outcomes = await Promise.all([
          undoApplication(owner, readId, FP, sheet),
          undoApplication(owner, readId, FP, sheet),
        ]);
        expect(outcomes.some((o) => o.kind === 'undone')).toBe(true);
        // The write and exactly one undo reached the sheet.
        expect(sheet.writes).toHaveLength(2);
        expect(sheet.grid).toEqual(original());
        expect((await rowsOf(readId)).map((r) => r.status)).toEqual(['undone']);
      }
    });
  });

  describe('decisions', () => {
    // A run, on a read and proposal of its own, and where it decides.
    async function decidingOn(readId: string) {
      const sheet = await arranged(readId);
      const run = await startRun(runProcess('brunch-orders'), {
        instructions: hashOf(brunchOrdersProcess.instructions.text),
        trigger: 'manual',
        additionalInstructions: null,
        actor: null,
      });
      const proposal = (await currentProposalOf(keyOf(readId)))!;
      const on = { process: owner.id, runId: run.id, proposalId: proposal.id };
      return { sheet, on };
    }
    const event = (recordKey: string, kind: NewEvent['kind']): NewEvent => ({
      recordKey,
      kind,
      values: null,
      verdict: kind === 'withdraw' ? null : 'ready',
      checks: kind === 'withdraw' ? null : [],
    });

    it('keep one event for the same decision sent twice at once', async () => {
      const { on } = await decidingOn('twice');
      const key = keyOf('twice');
      for (let at = 0; at < REPEATS; at += 1) {
        const kind = at % 2 ? 'reject' : 'approve';
        await Promise.all([
          appendDecisions(owner, key, on, [event('EG-06', kind)], null),
          appendDecisions(owner, key, on, [event('EG-06', kind)], null),
        ]);
        const [kept] = await pg
          .db()
          .select({ n: count() })
          .from(recordDecisions)
          .where(eq(recordDecisions.runId, on.runId));
        expect(kept!.n).toBe(at + 1);
      }
    });

    /*
      A decision racing a write through a kept run: the decision is refused
      (the write is in flight), or the write is refused (a decision moved
      after it read them), or the write records exactly the decisions it
      wrote. Never a write of decisions the server no longer held when it
      claimed: a decision that had already committed when the write reached
      the sheet must be in what it wrote.
    */
    it('never lets a write differ from the decisions it was claimed on', async () => {
      const seen = { written: 0, writeRefused: 0, decisionRefused: 0 };
      for (let at = 0; at < REPEATS; at += 1) {
        const readId = `race-${at}`;
        const { sheet, on } = await decidingOn(readId);
        const key = keyOf(readId);
        await appendDecisions(
          owner,
          key,
          on,
          [event('EG-06', 'approve'), event('CT-250', 'approve')],
          null,
        );
        let tick = 0;
        let decidedAt = Infinity;
        let wroteAt = Infinity;
        const watched = { ...sheet };
        watched.writeRange = async (tab, range, values) => {
          wroteAt = ++tick;
          await sheet.writeRange(tab, range, values);
        };
        const made = (
          decisions: Awaited<ReturnType<typeof currentDecisions>>,
        ) =>
          Object.fromEntries(
            Object.entries(decisions).map(([k, { kind, values, at }]) => [
              k,
              { kind, ...(values ? { values } : {}), at },
            ]),
          ) as Record<string, DecisionMade>;
        const writing = (async () => {
          const decisions = made(await currentDecisions(on));
          const read = JSON.stringify(decisions);
          return applyDecisions(
            owner,
            set,
            readOf(readId),
            FP,
            proposalOn(readId),
            decisions,
            [],
            watched as typeof sheet,
            {
              runId: on.runId,
              unchanged: async (db) =>
                JSON.stringify(made(await currentDecisions(on, db))) === read,
            },
          );
        })();
        const deciding = appendDecisions(
          owner,
          key,
          on,
          [event('CT-250', 'reject')],
          null,
        ).then(
          () => {
            decidedAt = ++tick;
            return true;
          },
          (error: unknown) => {
            if (!(error instanceof Refused)) throw error;
            return false;
          },
        );
        const [outcome, decided] = await Promise.all([writing, deciding]);
        const rows = await rowsOf(readId);
        if (outcome.kind === 'refused') {
          seen.writeRefused += 1;
          expect(outcome.prepared.problems).toEqual([DECIDED_SINCE]);
          expect(rows).toEqual([]);
          expect(sheet.writes).toEqual([]);
          expect(decided).toBe(true);
          continue;
        }
        seen.written += 1;
        if (!decided) seen.decisionRefused += 1;
        expect(rows).toHaveLength(1);
        const wrote = rows[0]!.decisions as Record<string, { kind: string }>;
        // What the sheet holds is what the record says was written.
        expect(sheet.grid?.[2]?.[1]).toBe(
          wrote['CT-250']!.kind === 'reject' ? 20 : 10,
        );
        // A decision committed before the sheet was written is in the write.
        if (decided && decidedAt < wroteAt)
          expect(wrote['CT-250']!.kind).toBe('reject');
      }
      expect(seen.written + seen.writeRefused).toBe(REPEATS);
    });
  });

  describe('rulebooks', () => {
    const base = (text: string): DefinitionSet => ({
      hash: hashOf(text),
      version: 'v1',
      intent: 'Order enough.',
      intentConfirmedAt: null,
      readId: 'test',
      foundAt: '2026-10-08T00:00:00.000Z',
      model: 'test',
      definitions: [definition('first'), definition('second')],
    });
    const approving = (id: string) => (s: DefinitionSet) => ({
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === id ? { ...d, approvedAt: THURSDAY } : d,
      ),
    });

    it('land both of two changes at once, the later worked out again', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const text = `Rules for a race ${at}.`;
        await keepText(text);
        await saveSet(owner, base(text));
        await Promise.all([
          updateSet(owner, text, approving('first')),
          updateSet(owner, text, approving('second')),
        ]);
        const kept = await loadSet(owner, text);
        expect(kept!.definitions.map((d) => d.approvedAt)).toEqual([
          THURSDAY,
          THURSDAY,
        ]);
      }
    });

    it('make a straight line of revisions kept at once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const text = `Revisions for a race ${at}.`;
        await keepText(text);
        const bodies = ['first', 'second', 'third'].map((id) => ({
          ...base(text),
          definitions: [
            definition(id, {
              formula: 'record.weekend_1',
              approvedAt: THURSDAY,
            }),
          ],
        }));
        await Promise.all(
          bodies.map((body) =>
            putRevision(owner, body, { reason: 'accepted' }),
          ),
        );
        const { head, revisions } = await listRevisions(owner, text);
        const oldestFirst = [...revisions].reverse();
        expect(oldestFirst.map((r) => r.parent)).toEqual([
          null,
          oldestFirst[0]!.id,
          oldestFirst[1]!.id,
        ]);
        expect(head).toBe(oldestFirst[2]!.id);
      }
    });

    it('change the profile under review losing neither of two at once', async () => {
      const proposed = profileOf(capturedRead(), owner.subject.data);
      const [a, b] = proposed.columns;
      for (let at = 0; at < REPEATS; at += 1) {
        await saveProfile(owner, proposed);
        await Promise.all([
          updateProfile(owner, (p) => setColumnBlank(p, a!.column, 'skip')),
          updateProfile(owner, (p) => setColumnBlank(p, b!.column, 'fail')),
        ]);
        const kept = (await loadProfile(owner))!;
        expect([kept.columns[0]!.blank, kept.columns[1]!.blank]).toEqual([
          'skip',
          'fail',
        ]);
      }
    });

    it('are seeded from fixtures/ once by two servers at once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        await pg.reset();
        const reports = await Promise.all([
          seedRulebooks(pg.db(), owner.id, 'fixtures'),
          seedRulebooks(pg.db(), owner.id, 'fixtures'),
        ]);
        expect(reports.map((r) => r.inserted).sort((x, y) => x - y)).toEqual([
          0, 10,
        ]);
        const [revisions] = await pg
          .db()
          .select({ n: count() })
          .from(rulebookRevisions);
        expect(revisions!.n).toBe(4);
      }
    });
  });

  describe('keeping', () => {
    it('keeps one read for two keeps of the same read at once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        await pg.reset();
        const both = await Promise.all([
          readAndKeep('captured'),
          readAndKeep('captured'),
        ]);
        expect(both[0]).toEqual(both[1]);
        const [kept] = await pg.db().select({ n: count() }).from(reads);
        expect(kept!.n).toBe(1);
      }
    });

    it('keeps one row for two keeps of the same proposal at once', async () => {
      for (let at = 0; at < REPEATS; at += 1) {
        const readId = `keep-${at}`;
        await keepStandInRead(pg.db(), readId);
        const proposal = proposalOn(readId);
        await Promise.all([
          keepProposal(owner, proposal),
          keepProposal(owner, proposal),
        ]);
        const [kept] = await pg
          .db()
          .select({ n: count() })
          .from(proposals)
          .where(
            and(eq(proposals.process, owner.id), eq(proposals.readId, readId)),
          );
        expect(kept!.n).toBe(1);
      }
    });
  });

  /*
    Two server processes starting one job at once: each is a Node process
    of its own, on this run's schema, waiting for `go <key>` to claim the
    key as a start does before it starts the job's workflow run, and
    answering whether it holds it. A claim records no run here, and lapses
    only after LEASE_MS, so the second claim always meets a live one.
  */
  describe('jobs', () => {
    const CHILD = `
      import { createInterface } from 'node:readline';
      const { z } = await import('zod');
      const { sql } = await import('drizzle-orm');
      const { claimJob } = await import('@/server/jobs/run-job');
      const { database, closeDatabase } = await import('@/server/db/client');
      await (await database()).execute(sql\`select 1\`);
      const schema = z.object({ step: z.string(), running: z.boolean(), error: z.string().nullable() });
      console.log('ready');
      for await (const line of createInterface({ input: process.stdin })) {
        if (line === 'end') break;
        const key = line.slice(3);
        const claim = await claimJob(
          { kind: 'drafts', process: 'postgres-test', key, schema, interrupted: 'Stopped.' },
          { step: 'Working', running: true, error: null },
        );
        console.log(JSON.stringify({ key, ran: 'holder' in claim }));
      }
      await closeDatabase();
    `;
    type Child = { process: ChildProcessWithoutNullStreams; lines: string[] };
    const spawned = (): Child => {
      const child = spawn(
        process.execPath,
        [
          '--conditions=react-server',
          '--import',
          './scripts/resolve-aliases.mjs',
          '--input-type=module',
          '-e',
          CHILD,
        ],
        {
          env: {
            ...process.env,
            DATABASE_URL: pg.url(),
            DATABASE_URL_UNPOOLED: '',
          },
        },
      );
      const lines: string[] = [];
      createInterface({ input: child.stdout }).on('line', (line) =>
        lines.push(line),
      );
      return { process: child, lines };
    };
    const answerOf = async (child: Child, key: string) => {
      let answer: { ran: boolean } | undefined;
      await eventually(() => {
        const line = child.lines.find((l) => l.includes(`"${key}"`));
        expect(line).toBeDefined();
        answer = JSON.parse(line!) as { ran: boolean };
      });
      return answer!;
    };

    it('are claimed by one of two starts of one key at once, in two processes', async () => {
      const both = [spawned(), spawned()];
      try {
        for (const child of both) await ready(child);
        const rounds = Math.min(REPEATS, 10);
        for (let at = 0; at < rounds; at += 1) {
          const key = `job-${at}`;
          for (const child of both) child.process.stdin.write(`go ${key}\n`);
          const answers = await Promise.all(
            both.map((child) => answerOf(child, key)),
          );
          expect(answers.filter((a) => a.ran)).toHaveLength(1);
        }
      } finally {
        for (const child of both) child.process.stdin.end('end\n');
        await Promise.all(
          both.map(
            (child) => new Promise((done) => child.process.once('exit', done)),
          ),
        );
      }
    }, 60_000);

    // The child's modules load slower than eventually() waits for: up to
    // half a minute for both, polled.
    async function ready(child: Child) {
      for (let waited = 0; waited < 30_000; waited += 100) {
        if (child.lines.includes('ready')) return;
        if (child.process.exitCode !== null)
          throw new Error('A job process stopped before it was ready.');
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error('A job process was not ready in 30 s.');
    }
  });
});
