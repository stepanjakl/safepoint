import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { draftProgress, startDraft } from './draft';
import { answer, check, standIn } from './models.fixture';
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
  it('finds, then writes each definition, reporting as it goes', async () => {
    const model = standIn(answer(found), check(written));
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
      error: expect.stringMatching(/server stopped during this draft/),
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
});
