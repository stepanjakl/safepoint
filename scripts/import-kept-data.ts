/*
  pnpm db:import [--dry-run]

  Copies what the server kept as files under data/ into the database the app
  would open (server/db/client.ts): DATABASE_URL, else PGlite at data/pglite/
  under the working directory: every kind the server once kept as files
  (scripts/import-kept-data/kinds.ts).

  Safe to run twice: a row already there with the same content is left alone
  and counted as present, and one there with other content is reported and
  not overwritten. It never writes, moves or deletes a file. --dry-run reports
  the same counts and writes nothing.

  The folder is SAFEPOINT_DATA_DIR, else data/ under the working directory.
  Exit 0 done, 1 something was refused, 2 it could not run.

  Run with Node's `react-server` condition and the alias resolver
  (package.json), as scripts/db.ts is.
*/
import { existsSync } from 'node:fs';
import path from 'node:path';

import { driverFor, open } from '../server/db/client.ts';

import {
  describe,
  importKeptData,
  refusals,
} from './import-kept-data/report.ts';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--dry-run');
if (unknown.length) {
  console.error(
    `Unknown ${unknown.join(' ')}. Usage: pnpm db:import [--dry-run]`,
  );
  process.exit(2);
}
const dryRun = args.includes('--dry-run');

const dataDir = path.resolve(
  process.env.SAFEPOINT_DATA_DIR || path.join(process.cwd(), 'data'),
);
if (!existsSync(dataDir)) {
  console.error(`${dataDir} is not there: nothing to import.`);
  process.exit(2);
}

const driver = driverFor(process.env, { migrating: true });
const target =
  driver.kind === 'pglite'
    ? `PGlite at ${driver.dataDir}`
    : `the server at ${new URL(driver.url).host}`;

// A dry run opens no database that is not there: it would have to make one.
const nothingYet = driver.kind === 'pglite' && !existsSync(driver.dataDir);

let exitCode = 0;
try {
  console.log(
    `${dryRun ? 'Dry run: ' : ''}importing ${dataDir} into ${target}${dryRun && nothingYet ? ' (not there yet: all of it would be new)' : ''}`,
  );
  const opened = await open(
    dryRun && nothingYet
      ? // An empty one of its own, in memory: the same counts, nothing on disk.
        { kind: 'pglite', dataDir: 'memory://' }
      : driver,
    { migrate: driver.kind === 'pglite' },
  );
  try {
    const report = await importKeptData(opened.db, dataDir, { dryRun });
    console.log(describe(report, dryRun));
    exitCode = refusals(report) ? 1 : 0;
  } finally {
    await opened.close();
  }
} catch (error) {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  console.error(cause instanceof Error ? cause.message : cause);
  exitCode = 2;
}
process.exitCode = exitCode;
