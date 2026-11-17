/*
  pnpm rulebooks:export [-- --to <folder>]

  Writes the rulebooks and data profiles the database holds back to
  fixtures/, the copy reviewed in git, in its layout and serialisation
  (server/storage/rules/rulebook-files.ts): commit what it changes. It opens the
  database the app would (server/db/client.ts): DATABASE_URL, else PGlite at
  data/pglite/, which `pnpm dev` must not hold. Each process with a folder in
  fixtures/ is first seeded with what the database lacks of it, as the app
  does on first need, so a database that never ran gives fixtures/ back as
  it is. Files the database does not hold are left alone.

  --to writes into another folder in place of fixtures/ (a test's scratch).
  Exit 0 done, 1 refused or failed, 2 it could not run.

  Run with Node's `react-server` condition and the alias resolver
  (package.json), as scripts/import-kept-data.ts is.
*/
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { driverFor, open } from '../server/db/client.ts';
import {
  exportRulebooks,
  seedRulebooks,
} from '../server/storage/rules/rulebook-files.ts';

const args = process.argv.slice(2);
let to = path.join(process.cwd(), 'fixtures');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--to' && args[i + 1]) to = path.resolve(args[++i]!);
  else {
    console.error(
      `Unknown ${args[i]}. Usage: pnpm rulebooks:export [-- --to <folder>]`,
    );
    process.exit(2);
  }
}

const fixtures = path.join(process.cwd(), 'fixtures');
const driver = driverFor(process.env);

let exitCode = 0;
try {
  const opened = await open(driver, { migrate: driver.kind === 'pglite' });
  try {
    const processes = existsSync(fixtures)
      ? readdirSync(fixtures, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() &&
              ['rulebooks', 'profile'].some((kind) =>
                existsSync(path.join(fixtures, entry.name, kind)),
              ),
          )
          .map((entry) => entry.name)
      : [];
    for (const name of processes)
      await seedRulebooks(opened.db, name, fixtures);
    const written = await exportRulebooks(opened.db, to);
    console.log(
      `Wrote ${written.length} files to ${path.relative(process.cwd(), to) || '.'}.`,
    );
  } finally {
    await opened.close();
  }
} catch (error) {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  console.error(cause instanceof Error ? cause.message : cause);
  exitCode = 1;
}
process.exitCode = exitCode;
