import { afterEach, describe, expect, it, vi } from 'vitest';

import { inScratchDatabase } from '@/lib/engine/scratch.fixture';

import { addressOf, dailyLimits, spend, usageRefusal } from './usage';

inScratchDatabase();

const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';
const NOW = new Date('2026-11-24T12:00:00Z');
const env = (limits: object) => ({
  SAFEPOINT_DAILY_LIMITS: JSON.stringify(limits),
});
const who = (visitor: string | null, address = '203.0.113.7') => ({
  visitor,
  address,
  secret: SECRET,
});

describe('dailyLimits', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('takes what the environment overrides and keeps the rest', () => {
    const limits = dailyLimits(env({ model: { all: 9 } }));
    expect(limits.model.all).toBe(9);
    expect(limits.model.visitor).toBeGreaterThan(0);
    expect(limits.runs).toEqual(dailyLimits({}).runs);
  });

  it('ignores an override it cannot read', () => {
    expect(dailyLimits({ SAFEPOINT_DAILY_LIMITS: '{nope' })).toEqual(
      dailyLimits({}),
    );
    expect(dailyLimits(env({ model: { all: -1 } }))).toEqual(dailyLimits({}));
  });
});

describe('spend', () => {
  it('counts a visitor up to their limit, then refuses them alone', async () => {
    const limits = env({ model: { visitor: 2, ip: 100, all: 100 } });
    const at = { now: NOW, env: limits };
    expect(await spend('model', who('a'), at)).toEqual({ ok: true });
    expect(await spend('model', who('a'), at)).toEqual({ ok: true });
    expect(await spend('model', who('a'), at)).toEqual({
      ok: false,
      message: usageRefusal('model', 'yours'),
    });
    expect(await spend('model', who('b'), at)).toEqual({ ok: true });
    // Another kind is counted apart.
    expect(await spend('runs', who('a'), at)).toEqual({ ok: true });
  });

  it('holds an address to its limit whatever cookie it sends', async () => {
    const at = { now: NOW, env: env({ reads: { ip: 2 } }) };
    expect((await spend('reads', who('c', '198.51.100.1'), at)).ok).toBe(true);
    expect((await spend('reads', who('d', '198.51.100.1'), at)).ok).toBe(true);
    expect((await spend('reads', who('e', '198.51.100.1'), at)).ok).toBe(false);
    expect((await spend('reads', who('f', '198.51.100.2'), at)).ok).toBe(true);
  });

  it('stops everyone at the total, and starts again the next day', async () => {
    const limits = env({ writes: { all: 2 } });
    const at = { now: NOW, env: limits };
    expect((await spend('writes', who('g', '192.0.2.1'), at)).ok).toBe(true);
    expect((await spend('writes', who('h', '192.0.2.2'), at)).ok).toBe(true);
    expect(await spend('writes', who('i', '192.0.2.3'), at)).toEqual({
      ok: false,
      message: usageRefusal('writes', 'everyone'),
    });
    const tomorrow = { now: new Date('2026-11-25T00:00:01Z'), env: limits };
    expect((await spend('writes', who('i', '192.0.2.3'), tomorrow)).ok).toBe(
      true,
    );
  });

  it('two requests at once cannot both take the last one', async () => {
    const at = { now: NOW, env: env({ runs: { visitor: 1 } }) };
    const both = await Promise.all([
      spend('runs', who('j'), at),
      spend('runs', who('j'), at),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe('addressOf', () => {
  it('reads the platform header first, then the first forwarded address', () => {
    expect(
      addressOf(
        new Request('https://x.example', {
          headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' },
        }),
      ),
    ).toBe('203.0.113.9');
    expect(
      addressOf(
        new Request('https://x.example', {
          headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
        }),
      ),
    ).toBe('203.0.113.5');
    expect(addressOf(new Request('https://x.example'))).toBe('unknown');
  });
});
