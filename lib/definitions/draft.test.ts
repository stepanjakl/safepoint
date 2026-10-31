import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { draftProgress, startDraft, startRewrite } from './draft';
import { accountedFor, answer, check, standIn } from './models.fixture';
import { inScratchDirectory } from './scratch.fixture';
import { TEXT } from './set.fixture';
import { hashOf, loadSet } from './store';

// A whole draft runs on the server: found, then each definition written, with
// its progress there to be asked for, and never on a read that does not fit.

inScratchDirectory();

const found = {
  intent: 'Order enough.',
  definitions: [
    {
      id: 'two_weekends',
      name: 'Two weekends',
      text: 'The sales of the first two weekends',
      result: 'number',
      consequence: null,
    },
  ],
};
// SD-01 sold 28 and 31; AV-RR 21 and 23.
const written = {
  constants: [],
  groups: [],
  formula: 'record.weekend_1 + record.weekend_2',
  examples: [
    { key: 'SD-01', inputs: { order: null }, result: 59, why: '28 and 31.' },
    { key: 'AV-RR', inputs: { order: null }, result: 44, why: '21 and 23.' },
  ],
};

describe('a draft on the server', () => {
  it('reports progress as it stood when asked, not as it later becomes', async () => {
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written),
      check(written),
    );
    startDraft(owner, TEXT, 'v1', capturedRead(), { resolve: () => model });
    const asked = await draftProgress(owner, TEXT);
    expect(asked?.running).toBe(true);
    await vi.waitFor(async () =>
      expect((await draftProgress(owner, TEXT))?.running).toBe(false),
    );
    expect(asked?.running).toBe(true);
  });

  it('finds, then writes each definition, reporting as it goes', async () => {
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written),
      check(written),
    );
    const started = startDraft(owner, TEXT, 'v1', capturedRead(), {
      resolve: () => model,
    });
    expect(started.running).toBe(true);
    await vi.waitFor(async () =>
      expect((await draftProgress(owner, TEXT))?.running).toBe(false),
    );
    expect(await draftProgress(owner, TEXT)).toMatchObject({
      step: 'Drafted 1 definition.',
      error: null,
    });
    const set = await loadSet(owner, TEXT);
    expect(set?.definitions[0]).toMatchObject({
      formula: 'record.weekend_1 + record.weekend_2',
      problem: null,
    });
  });

  it('says so when the server stopped part way through a draft', async () => {
    const text = `${TEXT} Interrupted.`;
    const dir = path.join(process.cwd(), 'data', owner.id, 'drafts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${hashOf(text)}.json`),
      JSON.stringify({ step: 'Writing 2 of 5…', error: null, running: true }),
    );
    expect(await draftProgress(owner, text)).toMatchObject({
      running: false,
      error: expect.stringMatching(
        /server stopped while this was being written/,
      ),
    });
    expect(await draftProgress(owner, `${TEXT} Never.`)).toBeNull();
  });

  it('refuses a read that does not fit what the process reads', () => {
    const tabs = capturedTabs();
    tabs.find((t) => t.name === 'Sales')!.values.length = 0;
    expect(() =>
      startDraft(owner, `${TEXT} Again.`, 'v1', capturedRead(tabs)),
    ).toThrow(/The Sales tab is missing or empty/);
  });

  describe('writing one definition again', () => {
    const settled = () =>
      vi.waitFor(async () =>
        expect((await draftProgress(owner, TEXT))?.running).toBe(false),
      );
    const drafted = async () => {
      const model = standIn(
        answer(accountedFor(found, TEXT)),
        check(written),
        check(written),
      );
      startDraft(owner, TEXT, 'v1', capturedRead(), { resolve: () => model });
      await settled();
    };
    const again = {
      ...written,
      formula: 'record.weekend_2 + record.weekend_1',
    };

    it('runs as a job, naming what it writes, and keeps the new version', async () => {
      await drafted();
      const model = standIn(check(again), check(again));
      const job = startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => model,
      });
      expect(job).toMatchObject({ running: true, error: null });
      await settled();
      expect(await draftProgress(owner, TEXT)).toMatchObject({
        running: false,
        writing: null,
        step: 'Written again.',
      });
      const kept = await loadSet(owner, TEXT);
      expect(kept?.definitions[0]?.formula).toBe(again.formula);
    });

    it('says which definition it is on, on disk as well as in memory', async () => {
      await drafted();
      let release = () => {};
      const held = new Promise<void>((done) => {
        release = done;
      });
      const step = check(again);
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          await held;
          return step;
        },
      });
      startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => model,
      });
      await vi.waitFor(async () =>
        expect((await draftProgress(owner, TEXT))?.writing).toBe(
          'two_weekends',
        ),
      );
      const file = path.join(
        process.cwd(),
        'data',
        owner.id,
        'drafts',
        `${hashOf(TEXT)}.json`,
      );
      await vi.waitFor(() =>
        expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
          running: true,
          writing: 'two_weekends',
        }),
      );
      release();
      await settled();
    });

    it('says what stopped it, and leaves the old version', async () => {
      await drafted();
      const before = (await loadSet(owner, TEXT))?.definitions[0]?.formula;
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('The service went away.');
        },
      });
      startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => model,
      });
      await settled();
      expect((await draftProgress(owner, TEXT))?.error).toBeTruthy();
      expect((await loadSet(owner, TEXT))?.definitions[0]?.formula).toBe(
        before,
      );
    });

    it('does not start while another job is running', async () => {
      await drafted();
      const slow = standIn(check(again), check(again));
      const first = startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => slow,
      });
      const second = startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => {
          throw new Error('Should not be asked.');
        },
      });
      expect(second).toBe(first);
      await settled();
    });
  });
});
