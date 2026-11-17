/*
  The build Vercel runs (package.json `vercel-build`, which Vercel uses in
  place of `build`): on a production build, apply drizzle/'s migrations over
  the direct connection and then build; on any other, just build. A failed
  migration fails the build, so a deployment never goes live on a schema it
  was not written for. The reasoning is in scripts/runtime/vercel-build/plan.ts.

  Exit 0 built, 1 refused or something failed.
*/
import { spawnSync } from 'node:child_process';

import { buildPlan } from './vercel-build/plan.ts';

const plan = buildPlan(process.env);

function run(command: string, args: string[]) {
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}

if (plan.kind === 'refuse') {
  console.error(plan.message);
  process.exit(1);
}
if (plan.kind === 'build') {
  console.log(`Not migrating: ${plan.reason}.`);
} else {
  console.log('Migrating the production database before the build.');
  // scripts/db/db.ts as `pnpm db:migrate` runs it, but over the direct
  // connection alone (--direct), and without .env.local, which Vercel has not.
  run(process.execPath, [
    '--conditions=react-server',
    'scripts/db/db.ts',
    'migrate',
    '--direct',
  ]);
}
run('pnpm', ['build']);
