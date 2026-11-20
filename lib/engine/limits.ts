import { google } from '@ai-sdk/google';
import { APICallError, wrapLanguageModel } from 'ai';

import { isTrialModel, TRIAL_MODELS } from '@/lib/models';

import {
  limitsStore,
  countRequest,
  loadKeptLimits,
  saveKeptLimits,
  type KeptLimits,
  type Learned,
  type LimitsStore,
} from '@/server/storage/models/model-limits';

import { heldFor, sentAgain } from './attempts';
import { quotaOf, type Quota } from './quota';

/*
  Keeps requests to a model within its limits, one request at a time: a tool
  loop is many requests, and a refusal part way through one used to throw its
  finished steps away.

  Nothing can be asked of Google ahead of time: its limits are not in the model
  list or on a response. A refusal does state them, so they are learned from
  refusals and kept in the database (server/storage/models/model-limits.ts), and a limit
  learned a week ago is learned afresh, so a raised one is found. A refusal
  naming another model than the one asked says the two share their quota,
  whatever the limit's name says; they are one group from then on.
  GEMINI_REQUESTS_PER_MINUTE overrides what is learned.

  What is kept is read once per process, by `limitsReady`, which every path
  that spends or reports on a request awaits before it reads the state; the
  state is read synchronously after that, and `state()` refuses to hand out
  what has not been through it.
*/

// Until a refusal says otherwise: the lowest limit seen on any model, or what
// refusals have said of a model, since a model never refused stays at the guess.
const FIRST_GUESS_PER_MINUTE = 5;
const SEEN_PER_MINUTE: Record<string, number> = {
  'gemini-3.5-flash-lite': 15,
};
const MINUTE = 60_000;
const LEARNED_FOR = 7 * 24 * 60 * 60_000;
// A retry slightly later than Google's clock says it can be.
const MARGIN = 500;
// A per-minute refusal is waited out when it says how long; a longer one is
// the model's to report (calls.ts moves to the next).
const MAX_WAIT = 90_000;
const MAX_TRIES = 3;
const BUSY_WAIT = 2_000;

// Stands for "tried and could not": the learning starts afresh, and is tried
// again at the next request.
const UNAVAILABLE = {};

type State = KeptLimits & {
  // The store these were read from; null before any attempt.
  loaded: LimitsStore | typeof UNAVAILABLE | null;
  loading: { store: LimitsStore; done: Promise<void> } | null;
  // When each recent request went, by group.
  sent: Record<string, number[]>;
  // Spent until then, by group.
  resting: Record<string, number>;
  // Holding a request back until then, by group.
  waiting: Record<string, number>;
};

// Held on globalThis: each route is its own module in development, and a
// recompile re-runs this one; they must all count the same requests.
const server = globalThis as { modelLimits?: State };
const empty = (): State => ({
  loaded: null,
  loading: null,
  shares: {},
  perMinute: {},
  perDay: {},
  used: {},
  sent: {},
  resting: {},
  waiting: {},
});

const LEARNED = ['shares', 'perMinute', 'perDay', 'used'] as const;

async function read(held: State, store: LimitsStore) {
  try {
    const kept = await loadKeptLimits(store);
    // What was learned before a failed attempt is newer than what is kept.
    const newer = held.loaded === null || held.loaded === UNAVAILABLE;
    for (const map of LEARNED)
      Object.assign(held, { [map]: { ...kept[map], ...(newer && held[map]) } });
    held.loaded = store;
  } catch {
    // A convenience: what cannot be read is learned afresh.
    held.loaded ??= UNAVAILABLE;
  } finally {
    held.loading = null;
  }
}

/*
  Reads what is kept, once for the store the process uses, and returns when
  it has. Awaited where a model request is paced or chosen (`takeSlot`,
  calls.ts `withModels`: every request goes through both) and where the
  quota is reported (the modelLimits router); a failure to read is not an
  error, and a failed read is tried again at the next call.
*/
export async function limitsReady(): Promise<void> {
  const held = (server.modelLimits ??= empty());
  let store: LimitsStore;
  try {
    store = await limitsStore();
  } catch {
    held.loaded ??= UNAVAILABLE;
    return;
  }
  if (held.loaded === store) return;
  if (held.loading?.store !== store)
    held.loading = { store, done: read(held, store) };
  await held.loading.done;
}

function state(): State {
  const held = (server.modelLimits ??= empty());
  if (held.loaded === null)
    throw new Error('Model limits are used before limitsReady() is awaited.');
  return held;
}

// Keeps what is held of these models, each as its own row.
async function keep(models: (string | null)[]) {
  const held = state();
  // Not read: writing now would put a fresh count over what is kept.
  if (held.loaded === UNAVAILABLE) return;
  try {
    await saveKeptLimits(
      held.loaded as LimitsStore,
      models.filter((model) => model !== null),
      () => held,
    );
  } catch {
    // Keeping them is a convenience: a failed write never stops a request.
  }
}

export function groupOf(model: string): string {
  const { shares } = state();
  if (isTrialModel(model) && TRIAL_MODELS[model].provider === 'openrouter')
    return 'openrouter';
  let group = model;
  while (shares[group]) group = shares[group]!;
  return group;
}

function share(model: string, other: string) {
  const held = state();
  const [from, into] = [groupOf(model), groupOf(other)];
  if (from === into) return;
  held.shares[from] = into;
  held.sent[into] = [
    ...(held.sent[into] ?? []),
    ...(held.sent[from] ?? []),
  ].sort((a, b) => a - b);
  // Each was a guess at the one quota; the fuller count is the closer.
  const [a, b] = [held.used[from], held.used[into]];
  if (a && (!b || a.day > b.day || (a.day === b.day && a.count > b.count)))
    held.used[into] = a;
  for (const limits of [held.perMinute, held.perDay]) {
    if (limits[from] && !limits[into]) limits[into] = limits[from];
    delete limits[from];
  }
  delete held.sent[from];
  delete held.used[from];
}

// Counts a request of a group, in the database where it can: the count kept
// there is every instance's, so it is the one held after.
async function count(group: string) {
  const held = state();
  held.used[group] = { day: dayNow(), count: usedToday(group) + 1 };
  if (held.loaded === UNAVAILABLE) return;
  try {
    held.used[group] = await countRequest(
      held.loaded as LimitsStore,
      group,
      held.used[group].day,
    );
  } catch {
    // Keeping it is a convenience: a failed write never stops a request.
  }
}

const fresh = (learned: Learned | undefined) =>
  learned && Date.now() - learned.at < LEARNED_FOR ? learned.limit : null;

function perMinuteOf(group: string): number {
  if (group === 'openrouter') return 20;
  if (isTrialModel(group)) return 30;
  const set = Number(process.env.GEMINI_REQUESTS_PER_MINUTE);
  return set > 0
    ? set
    : (fresh(state().perMinute[group]) ??
        SEEN_PER_MINUTE[group] ??
        FIRST_GUESS_PER_MINUTE);
}

// Google's day starts at midnight Pacific time.
const dayNow = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(Date.now());

const usedToday = (group: string) => {
  const used = state().used[group];
  return used?.day === dayNow() ? used.count : 0;
};

function wait(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((done, fail) => {
    if (signal?.aborted) return fail(signal.reason as Error);
    const stop = () => {
      clearTimeout(timer);
      fail(signal?.reason as Error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      done();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

// Waits until the model's group may send another request, and counts it.
async function takeSlot(model: string, signal: AbortSignal | undefined) {
  await limitsReady();
  const held = state();
  for (;;) {
    const group = groupOf(model);
    const from = Date.now() - MINUTE;
    const sent = (held.sent[group] ?? []).filter((at) => at > from);
    held.sent[group] = sent;
    if (sent.length < perMinuteOf(group)) {
      sent.push(Date.now());
      await count(group);
      return;
    }
    const until = sent[0]! + MINUTE + MARGIN;
    held.waiting[group] = until;
    const since = Date.now();
    try {
      await wait(until - Date.now(), signal);
    } finally {
      delete held.waiting[group];
      heldFor(Date.now() - since);
    }
  }
}

async function learnFrom(model: string, quota: Quota) {
  const held = state();
  const before = groupOf(model);
  if (quota.model && quota.model !== model) share(model, quota.model);
  const group = groupOf(model);
  if (quota.requests !== null && quota.window) {
    const limits = quota.window === 'minute' ? held.perMinute : held.perDay;
    limits[group] = { limit: quota.requests, at: Date.now() };
    if (quota.window === 'day')
      held.used[group] = {
        day: dayNow(),
        count: Math.max(usedToday(group), quota.requests),
      };
  }
  await keep([model, quota.model, before, group]);
}

/*
  A model that keeps to its limits, for one request at a time, inside a tool
  loop as well as between calls: it waits for a slot, waits out a per-minute
  refusal, and tries a busy model once more, all without ending the loop. What
  it cannot wait out it lets through, for calls.ts to move to the next model.
*/
export function paced<
  M extends Parameters<typeof wrapLanguageModel>[0]['model'],
>(id: string, model: M) {
  async function request<R>(
    send: () => PromiseLike<R>,
    signal: AbortSignal | undefined,
  ): Promise<R> {
    for (let tries = 1; ; tries++) {
      await takeSlot(id, signal);
      try {
        return await send();
      } catch (error) {
        if (!APICallError.isInstance(error)) throw error;
        const status = error.statusCode ?? 0;
        if (status === 429) {
          const quota = quotaOf(error);
          if (!isTrialModel(id)) await learnFrom(id, quota);
          if (
            quota.window !== 'day' &&
            quota.retryAfterMs !== null &&
            quota.retryAfterMs <= MAX_WAIT &&
            tries < MAX_TRIES
          ) {
            const from = Date.now();
            await wait(quota.retryAfterMs + MARGIN, signal);
            heldFor(Date.now() - from);
            sentAgain();
            continue;
          }
        } else if (status >= 500 && tries === 1) {
          await wait(BUSY_WAIT, signal);
          sentAgain();
          continue;
        }
        throw error;
      }
    }
  }
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: ({ doGenerate, params }) =>
        request(doGenerate, params.abortSignal),
      wrapStream: isTrialModel(id)
        ? ({ doStream, params }) => request(doStream, params.abortSignal)
        : undefined,
    },
  });
}

// The app's own models: Google's, kept to their limits. A test gives its own.
export const limitedGoogle = (id: string) => paced(id, google(id));

// OpenRouter shares the request allowance, but an upstream refusal can affect one model.
const restKey = (model: string) =>
  isTrialModel(model) ? model : groupOf(model);

export function rest(model: string, ms: number) {
  state().resting[restKey(model)] = Date.now() + ms;
}

// Until when a model is spent, if it is.
export function restingUntil(model: string): number | null {
  const until = state().resting[restKey(model)] ?? 0;
  return until > Date.now() ? until : null;
}

export type ModelLimits = {
  // The models that share this quota.
  models: string[];
  perMinute: number;
  // Null until a refusal has said.
  perDay: number | null;
  usedToday: number;
  restingUntil: number | null;
  // How much later a request is being held back to, if one is.
  waitingUntil: number | null;
};

// How a model's quota stands, for showing before and while it is used.
export function limitsOf(model: string, all: readonly string[]): ModelLimits {
  const held = state();
  const group = groupOf(model);
  return {
    models: all.filter((id) => groupOf(id) === group),
    perMinute: perMinuteOf(group),
    perDay: fresh(held.perDay[group]),
    usedToday: usedToday(group),
    restingUntil: restingUntil(model),
    waitingUntil: held.waiting[group] ?? null,
  };
}
