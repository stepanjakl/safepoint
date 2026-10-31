import { APICallError, generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupOf, limitsOf, paced, rest, restingUntil } from './limits';
import { answer } from './models.fixture';
import { inScratchDirectory } from './scratch.fixture';

// Keeping to a model's limits, on stand-in models and a stand-in clock. Each
// test names its own models: what is learned stays for the run.

const refusal = (
  window: 'Minute' | 'Day',
  limit: number,
  retryDelay: string,
  model?: string,
) =>
  new APICallError({
    message: 'You exceeded your current quota.',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
    responseBody: JSON.stringify({
      error: {
        details: [
          {
            violations: [
              {
                quotaId: `GenerateRequestsPer${window}PerProjectPerModel-FreeTier`,
                quotaValue: String(limit),
                quotaDimensions: model ? { model } : {},
              },
            ],
          },
          { retryDelay },
        ],
      },
    }),
  });
const busy = () =>
  new APICallError({
    message: 'This model is currently experiencing high demand.',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });

// Answers, or throws each of `throwing` first.
const model = (...throwing: Error[]) => {
  const left = [...throwing];
  const mock = new MockLanguageModelV4({
    doGenerate: async () => {
      const error = left.shift();
      if (error) throw error;
      return answer({ ok: true }) as never;
    },
  });
  return mock;
};
// Moves the clock on until a request settles. Saving what is learned takes real
// time, so a wait may start only after the clock would have passed it.
const realTick = setImmediate;
async function settled<T>(request: Promise<T>): Promise<T> {
  let done = false;
  const tracked = request.finally(() => {
    done = true;
  });
  tracked.catch(() => undefined);
  while (!done) {
    await vi.advanceTimersByTimeAsync(500);
    await new Promise((next) => realTick(next));
  }
  return tracked;
}
const ask = (id: string, mock: MockLanguageModelV4) =>
  generateText({ model: paced(id, mock), prompt: 'hello', maxRetries: 0 });

describe('keeping to a model’s limits', () => {
  inScratchDirectory();
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-10-31T12:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a request back once a minute’s are sent, and says so', async () => {
    const mock = model();
    for (let i = 0; i < 5; i++) await ask('held-back', mock);
    expect(mock.doGenerateCalls).toHaveLength(5);

    const sixth = ask('held-back', mock);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.doGenerateCalls).toHaveLength(5);
    expect(limitsOf('held-back', ['held-back']).waitingUntil).toBeGreaterThan(
      Date.now(),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    await sixth;
    expect(mock.doGenerateCalls).toHaveLength(6);
    expect(limitsOf('held-back', ['held-back'])).toMatchObject({
      waitingUntil: null,
      usedToday: 6,
    });
  });

  it('waits out a per-minute refusal in place, and learns the limit', async () => {
    const mock = model(refusal('Minute', 15, '4.5s'));
    await settled(ask('per-minute', mock));
    expect(mock.doGenerateCalls).toHaveLength(2);
    expect(limitsOf('per-minute', []).perMinute).toBe(15);
  });

  it('keeps a tool loop’s progress through a refusal', async () => {
    // The refusal lands on the second request of the conversation; the same
    // request is sent again, not the first.
    const calls: number[] = [];
    let refused = false;
    const mock = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        calls.push(prompt.length);
        if (prompt.length > 1 && !refused) {
          refused = true;
          throw refusal('Minute', 5, '1s');
        }
        return answer({ ok: true }) as never;
      },
    });
    const wrapped = paced('in-a-loop', mock);
    await wrapped.doGenerate({ prompt: [{}] } as never);
    await settled(
      Promise.resolve(wrapped.doGenerate({ prompt: [{}, {}] } as never)),
    );
    expect(calls).toEqual([1, 2, 2]);
  });

  it('lets a daily refusal through, with the limit and the day’s count', async () => {
    const mock = model(refusal('Day', 20, '74412s'));
    await expect(ask('per-day', mock)).rejects.toThrow('quota');
    expect(mock.doGenerateCalls).toHaveLength(1);
    expect(limitsOf('per-day', [])).toMatchObject({
      perDay: 20,
      usedToday: 20,
    });
  });

  it('gives up on a per-minute refusal that keeps coming', async () => {
    const again = () => refusal('Minute', 5, '1s');
    const mock = model(again(), again(), again(), again());
    const refused = await settled(
      ask('keeps-refusing', mock).catch((error: Error) => error),
    );
    expect(refused).toBeInstanceOf(APICallError);
    expect(mock.doGenerateCalls).toHaveLength(3);
  });

  it('does not take a limit on tokens for one on requests', async () => {
    const tokens = new APICallError({
      message: 'You exceeded your current quota.',
      url: 'https://example.test',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              violations: [
                {
                  quotaId: 'GenerateContentInputTokensPerMinute-FreeTier',
                  quotaValue: '250000',
                },
              ],
            },
            { retryDelay: '1s' },
          ],
        },
      }),
    });
    await settled(ask('on-tokens', model(tokens)));
    expect(limitsOf('on-tokens', []).perMinute).toBe(5);
  });

  it('tries a busy model once more, then lets it through', async () => {
    const twice = model(busy(), busy());
    const gaveUp = await settled(
      ask('busy-twice', twice).catch((error: Error) => error),
    );
    expect(gaveUp).toBeInstanceOf(APICallError);
    expect(twice.doGenerateCalls).toHaveLength(2);

    const once = model(busy());
    await settled(ask('busy-once', once));
    expect(once.doGenerateCalls).toHaveLength(2);
  });

  it('treats models as one quota once a refusal names the other', async () => {
    await ask('shares-a', model());
    await ask('shares-b', model());
    await ask('shares-b', model());
    await expect(
      ask('shares-a', model(refusal('Day', 20, '74412s', 'shares-b'))),
    ).rejects.toThrow('quota');
    expect(groupOf('shares-a')).toBe('shares-b');
    expect(limitsOf('shares-a', ['shares-a', 'shares-b'])).toMatchObject({
      models: ['shares-a', 'shares-b'],
      perDay: 20,
    });
    // Spent together.
    rest('shares-a', 60_000);
    expect(restingUntil('shares-b')).not.toBeNull();
  });

  it('learns a limit afresh after a week', async () => {
    await settled(ask('week-old', model(refusal('Minute', 15, '1s'))));
    expect(limitsOf('week-old', []).perMinute).toBe(15);
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60_000);
    expect(limitsOf('week-old', []).perMinute).toBe(5);
  });

  it('counts a new day from Google’s midnight', async () => {
    await ask('day-count', model());
    expect(limitsOf('day-count', []).usedToday).toBe(1);
    // Midnight Pacific, later that day in UTC.
    vi.setSystemTime(Date.parse('2026-11-01T07:30:00Z'));
    expect(limitsOf('day-count', []).usedToday).toBe(0);
  });

  it('starts a model at what refusals have said of it, until told otherwise', async () => {
    const lite = 'gemini-3.5-flash-lite';
    expect(limitsOf(lite, [lite]).perMinute).toBe(15);
    const asked = ask(lite, model(refusal('Minute', 30, '1s')));
    await settled(asked);
    expect(limitsOf(lite, [lite]).perMinute).toBe(30);
  });

  it('takes a set limit over a learned one', async () => {
    vi.stubEnv('GEMINI_REQUESTS_PER_MINUTE', '100');
    expect(limitsOf('set-by-hand', []).perMinute).toBe(100);
    vi.unstubAllEnvs();
  });
});
