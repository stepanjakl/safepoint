/*
  What the Vercel build does with the database, decided from the environment
  alone so a test can ask it (scripts/vercel-build.ts only carries it out).

  Only a production build migrates. A preview build may share the production
  database unless Neon preview branching is set up, and a preview of a branch
  that changes the schema would then migrate production before anyone
  promoted it. A development or local build has no database of its own to
  migrate. VERCEL_ENV is set by Vercel alone, so a local `pnpm build` never
  migrates.
*/
export type BuildPlan =
  // Build without touching a database, and why.
  | { kind: 'build'; reason: string }
  | { kind: 'migrate-then-build' }
  // Stop before building: the build would deploy something that cannot run.
  | { kind: 'refuse'; message: string };

type Environment = Record<string, string | undefined>;

export function buildPlan(env: Environment): BuildPlan {
  const target = env.VERCEL_ENV;
  if (target !== 'production')
    return {
      kind: 'build',
      reason: `VERCEL_ENV is ${target ? `"${target}"` : 'not set'}, not "production"`,
    };
  // Never the pooled URL: Neon's pooler is PgBouncer in transaction mode,
  // which a migration's session state does not survive.
  if (!env.DATABASE_URL_UNPOOLED)
    return {
      kind: 'refuse',
      message:
        'DATABASE_URL_UNPOOLED is not set for this production build. Migrations need the direct (unpooled) connection and are never run over the pooled one.',
    };
  if (!env.DATABASE_URL)
    return {
      kind: 'refuse',
      message:
        'DATABASE_URL is not set for this production build. The deployed app opens the database through it and has no other store.',
    };
  return { kind: 'migrate-then-build' };
}
