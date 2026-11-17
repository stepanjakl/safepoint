/*
  pnpm db:migrate | pnpm db:reset

  Applies the committed migrations in drizzle/ to the database the app would
  open (server/db/client.ts): the direct connection where DATABASE_URL_UNPOOLED
  is set, else DATABASE_URL, else the PGlite folder data/pglite/ (`migrate
  --direct` takes the direct connection alone and refuses without it). A reset
  drops everything first, and refuses any target not marked as development
  (server/db/reset.ts). Exit 0 done, 1 refused or failed.

  Run with Node's `react-server` condition (package.json), under which the
  `server-only` the modules begin with is the empty module.
*/
import { driverFor, open } from '../server/db/client.ts';
import { dropEverything, resetRefusal } from '../server/db/reset.ts';

const command = process.argv[2];
if (command !== 'migrate' && command !== 'reset') {
  console.error('Usage: node scripts/db.ts migrate | reset');
  process.exit(1);
}

// --direct: a migration that must not run over the pooled connection (the
// Vercel build, scripts/vercel-build.ts). Without a direct URL it refuses,
// rather than fall back to DATABASE_URL or a PGlite folder.
if (process.argv.includes('--direct') && !process.env.DATABASE_URL_UNPOOLED) {
  console.error('Refused: --direct needs DATABASE_URL_UNPOOLED.');
  process.exit(1);
}

const driver = driverFor(process.env, { migrating: true });
const target =
  driver.kind === 'pglite'
    ? `PGlite at ${driver.dataDir}`
    : `the server at ${new URL(driver.url).host}`;

if (command === 'reset') {
  const refusal = resetRefusal(driver);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
}

const opened = await open(driver, { migrate: false });
try {
  if (command === 'reset') {
    await dropEverything(opened.db);
    console.log(`Dropped everything in ${target}.`);
  }
  await opened.migrate();
  console.log(`Migrations applied to ${target}.`);
} catch (error) {
  // Drizzle reports the statement; the database's reason is its cause.
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await opened.close();
}
