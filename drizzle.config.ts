import { defineConfig } from 'drizzle-kit';

/*
  For drizzle-kit: `pnpm db:generate` writes a migration from
  server/db/schema.ts (no database needed), `pnpm db:studio` migrates and browses one.
  Migrations are applied by `pnpm db:migrate` (scripts/db/db.ts), through the
  same driver choice the app makes (server/db/client.ts).

  The schema imports `server-only`, which throws outside a React server
  build; the scripts run drizzle-kit with Node's `react-server` condition,
  under which it is the empty module a server build gets.
*/

// Migrations and studio take the direct connection: Neon's pooler cannot
// hold the session state they use.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(url
    ? { dbCredentials: { url } }
    : // The database `pnpm dev` keeps when no DATABASE_URL is set. Studio
      // cannot open it while the dev server has it open.
      { driver: 'pglite', dbCredentials: { url: './data/pglite' } }),
});
