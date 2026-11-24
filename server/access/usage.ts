import 'server-only';

import { lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { database } from '@/server/db/client';
import { usageCounts, type USAGE_KINDS } from '@/server/db/schema';

/*
  Server-only. What a deployment lets be spent in a day (UTC), so a page
  open to anyone cannot run up the model bill, use up the sheet's quota or
  fill the database. Each kind of work is counted three ways: by the visitor
  cookie, by the address it came from (hashed, never kept as is), and for
  everyone together. A cookie is free to throw away and an address can be
  shared, so neither alone is a limit; the total is the one that holds.

  Counting happens before the work, and a refused attempt counts nothing for
  the subject that refused it. Local development counts nothing
  (server/api/trpc.ts decides that).

  SAFEPOINT_DAILY_LIMITS overrides any of these as JSON, e.g.
  {"model":{"all":500}}.
*/

export type UsageKind = (typeof USAGE_KINDS)[number];
type Limits = { visitor: number; ip: number; all: number };

const DEFAULTS: Record<UsageKind, Limits> = {
  // Starting a run: a row, and usually a read.
  runs: { visitor: 15, ip: 40, all: 400 },
  // Asking a model: a proposal, a cross-check, advice, a draft or a rewrite.
  model: { visitor: 15, ip: 40, all: 250 },
  // Reading the live sheet.
  reads: { visitor: 40, ip: 100, all: 600 },
  // Writing to the sheet, or undoing a write.
  writes: { visitor: 15, ip: 40, all: 300 },
};

const overrideSchema = z
  .partialRecord(
    z.enum(['runs', 'model', 'reads', 'writes']),
    z
      .object({
        visitor: z.number().int().positive(),
        ip: z.number().int().positive(),
        all: z.number().int().positive(),
      })
      .partial(),
  )
  .catch({});

export function dailyLimits(
  env: Partial<Record<string, string>> = process.env,
): Record<UsageKind, Limits> {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(env.SAFEPOINT_DAILY_LIMITS ?? '{}');
  } catch {
    parsed = {};
  }
  const override = overrideSchema.parse(parsed);
  return Object.fromEntries(
    (Object.keys(DEFAULTS) as UsageKind[]).map((kind) => [
      kind,
      { ...DEFAULTS[kind], ...override[kind] },
    ]),
  ) as Record<UsageKind, Limits>;
}

const WHAT: Record<UsageKind, string> = {
  runs: 'runs started',
  model: 'model requests',
  reads: 'sheet reads',
  writes: 'sheet writes',
};

export const usageRefusal = (kind: UsageKind, whose: 'yours' | 'everyone') =>
  whose === 'yours'
    ? `That is today's limit of ${WHAT[kind]} for one visitor in this demo. It resets at midnight UTC.`
    : `This demo has reached today's limit of ${WHAT[kind]} for everyone. It resets at midnight UTC.`;

const today = (now: Date) => now.toISOString().slice(0, 10);

// The address, hashed with the deployment's secret, so the table holds no
// address and a hash cannot be looked up elsewhere.
async function hashed(address: string, secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${address}`),
  );
  return Array.from(new Uint8Array(bytes).slice(0, 12), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

// The address a request came from. On Vercel `x-real-ip` is the client's,
// set by the platform; a request that names none is counted as one address.
export function addressOf(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

// One more of `kind` for a subject, if it is under its limit: true if it was
// counted, false if the subject is at its limit. One statement, so two
// requests at once cannot both take the last one.
async function take(
  kind: UsageKind,
  subject: string,
  limit: number,
  day: string,
): Promise<boolean> {
  const db = await database();
  const rows = await db
    .insert(usageCounts)
    .values({ kind, subject, day, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounts.kind, usageCounts.subject, usageCounts.day],
      set: { count: sql`${usageCounts.count} + 1`, updatedAt: sql`now()` },
      setWhere: lt(usageCounts.count, limit),
    })
    .returning({ count: usageCounts.count });
  return rows.length > 0;
}

/*
  Counts one of `kind` for this visitor, address and everyone, or says why
  not. The visitor and the address are checked before the total, so one
  visitor at their limit does not use up everyone's.
*/
export async function spend(
  kind: UsageKind,
  who: { visitor: string | null; address: string; secret: string },
  {
    now = new Date(),
    env = process.env as Partial<Record<string, string>>,
  }: { now?: Date; env?: Partial<Record<string, string>> } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limits = dailyLimits(env)[kind];
  const day = today(now);
  if (
    who.visitor &&
    !(await take(kind, `visitor:${who.visitor}`, limits.visitor, day))
  )
    return { ok: false, message: usageRefusal(kind, 'yours') };
  const ip = `ip:${await hashed(who.address, who.secret)}`;
  if (!(await take(kind, ip, limits.ip, day)))
    return { ok: false, message: usageRefusal(kind, 'yours') };
  if (!(await take(kind, 'all', limits.all, day)))
    return { ok: false, message: usageRefusal(kind, 'everyone') };
  return { ok: true };
}
