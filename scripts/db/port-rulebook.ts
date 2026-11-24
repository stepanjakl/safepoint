/*
  pnpm rulebook:port -- export --run <run id> [--out <file>]
  pnpm rulebook:port -- import <file> [--write]

  Carries a rulebook one run accepted on its own (runs.own_rulebook, as a
  model trial keeps it) from one database to another, where it becomes the
  accepted rulebook for its instructions.

  `export` reads the database the app would (.env.local) and writes a file:
  the run's accepted revision, the confirmed data profile it reads through,
  the instructions it answers to, and where it came from. `import` reads the
  file into the database the environment names -- run it with another env
  file to reach another database, e.g. one `vercel env pull` wrote:

    node --env-file=<file> --conditions=react-server \
      --import ./scripts/runtime/resolve-aliases.mjs \
      scripts/db/port-rulebook.ts import <file> [--write]

  Without --write it says what it would do and changes nothing. With it, it
  keeps the profile if the database lacks it, keeps the rulebook as an
  accepted revision (the head moves to it) and as the rulebook under review.
  It refuses instructions the database does not keep, and a revision the
  database already holds as some run's own.

  Exit 0 done, 1 refused or failed, 2 it could not run.
*/
import { readFileSync, writeFileSync } from 'node:fs';

import { and, eq } from 'drizzle-orm';

import { fingerprintOf, hashOf } from '../../lib/engine/fingerprint.ts';
import {
  dataProfileSchema,
  definitionSetSchema,
} from '../../lib/engine/types.ts';
import { database } from '../../server/db/client.ts';
import { rulebookRevisions } from '../../server/db/schema.ts';
import {
  rulebookProcess,
  runProcess,
} from '../../server/operations/kept-processes.ts';
import { versionByHash } from '../../server/storage/rules/instructions.ts';
import {
  headOf,
  loadConfirmedProfile,
  loadRevision,
  putProfile,
  putRevision,
  saveSet,
} from '../../server/storage/rules/rulebooks.ts';
import { keptRun } from '../../server/storage/runs/runs.ts';

const PROCESS = 'brunch-orders';
const owner = rulebookProcess().runs.definitions;
const [mode, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(name);
  return at >= 0 ? rest[at + 1] : undefined;
};
const usage = () => {
  console.error(
    'Usage: port-rulebook.ts export --run <run id> [--out <file>] | import <file> [--write]',
  );
  process.exit(2);
};
const refuse = (why: string) => {
  console.error(why);
  process.exit(1);
};

const host = () => {
  const url = process.env.DATABASE_URL;
  return url ? (url.match(/@([^/:?]+)/)?.[1] ?? 'postgres') : 'PGlite';
};

async function exportRun() {
  const runId = flag('--run');
  if (!runId) usage();
  const run = await keptRun(PROCESS, runId!);
  if (!run) return refuse(`No run ${runId} is kept.`);
  if (!run.ownRulebook)
    return refuse(
      `Run ${runId} shares its instructions' rulebook; nothing of its own to port.`,
    );
  if (!run.rulebook)
    return refuse(
      `Run ${runId} has not accepted and calculated on its rules yet.`,
    );
  const version = await versionByHash(
    runProcess(PROCESS),
    run.instructions.hash,
  );
  if (!version) return refuse('Its instructions are not kept.');
  const rulebook = await loadRevision(owner, version.text, run.rulebook);
  if (!rulebook) return refuse(`Its rulebook ${run.rulebook} is not kept.`);
  const profile = rulebook.profileId
    ? await loadConfirmedProfile(owner, rulebook.profileId)
    : null;
  const file = flag('--out') ?? `rulebook-${run.rulebook}.json`;
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        process: PROCESS,
        instructions: { hash: version.hash, version: version.version },
        from: {
          runId: run.id,
          modelPlan: run.modelPlan,
          startedAt: run.startedAt,
          database: host(),
        },
        profile,
        rulebook,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Wrote ${file}: rulebook ${run.rulebook} of ${version.version} (${rulebook.definitions.length} rules), from run ${run.id} (${run.modelPlan ?? 'default models'}).`,
  );
}

async function importFile() {
  const file = rest.find((arg) => !arg.startsWith('--'));
  if (!file) usage();
  const write = rest.includes('--write');
  const kept = JSON.parse(readFileSync(file!, 'utf8'));
  const rulebook = definitionSetSchema.parse(kept.rulebook);
  const profile = kept.profile ? dataProfileSchema.parse(kept.profile) : null;
  const id = fingerprintOf(rulebook);
  if (kept.process !== PROCESS)
    return refuse(`The file is for ${kept.process}.`);
  const version = await versionByHash(runProcess(PROCESS), rulebook.hash);
  if (!version || hashOf(version.text) !== rulebook.hash)
    return refuse(
      `${host()} does not keep instructions ${rulebook.hash} (${kept.instructions?.version}): publish them there first.`,
    );
  const [held] = await (
    await database()
  )
    .select({ runId: rulebookRevisions.runId })
    .from(rulebookRevisions)
    .where(
      and(
        eq(rulebookRevisions.process, owner.id),
        eq(rulebookRevisions.instructionsHash, rulebook.hash),
        eq(rulebookRevisions.id, id),
      ),
    );
  if (held?.runId)
    return refuse(
      `${host()} holds rulebook ${id} as run ${held.runId}'s own: it is already there, and a revision is written once.`,
    );
  const head = await headOf(owner, version.text);
  const profileHeld = profile
    ? Boolean(await loadConfirmedProfile(owner, profile.id))
    : true;
  const note = `Ported from run ${kept.from?.runId} (${kept.from?.modelPlan ?? 'default models'}).`;
  console.log(
    [
      `Into ${host()}, instructions ${version.version} (${rulebook.hash}):`,
      `- data profile ${profile?.id ?? '(none)'}: ${profileHeld ? 'already kept' : 'to keep'}`,
      `- rulebook ${id}: ${held ? 'already accepted here' : 'to keep as accepted'}, ${rulebook.definitions.length} rules`,
      `- head: ${head ?? '(none)'} -> ${held ? `${head ?? '(none)'} (unchanged)` : id}`,
      `- rulebook under review: replaced by ${id}`,
      `- note: ${note}`,
    ].join('\n'),
  );
  if (!write) {
    console.log('Nothing written: add --write to do it.');
    return;
  }
  if (profile && !profileHeld) await putProfile(owner, profile);
  await putRevision(owner, rulebook, {
    reason: 'accepted',
    note,
    actor: 'rulebook:port',
  });
  await saveSet(owner, rulebook);
  console.log(`Done: head is ${await headOf(owner, version.text)}.`);
}

try {
  if (mode === 'export') await exportRun();
  else if (mode === 'import') await importFile();
  else usage();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
