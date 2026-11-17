import 'server-only';

import type { Definition, DefinitionProcess } from '@/lib/definitions/types';
import { hashOf } from '@/lib/definitions/fingerprint';
import { fitting } from '@/lib/definitions/records';
import { findDefinitions } from '@/server/operations/find';
import { writeAgreed } from '@/server/operations/write';
import { loadSet, ownerToDraft } from '@/server/storage/rulebooks';

import { inStep, instructionsOf, readOf, settle } from './in-step';
import { standInsFor } from './stand-ins';
import type { DraftFind, DraftRun, Found, Outcome } from './types';

/*
  Server-only. What the steps of a draft do (draft-steps.ts): find the
  definitions in the instructions, write one, say how the draft ended. Each
  is handed ids, reads what it works on where it is kept, and may be done
  twice (a retry, or a server that stopped during it), so each first looks
  for what it would make: a find this draft already kept is taken as it is,
  and a definition written since the draft began is not written again.
*/

// Where a draft starts, should its row not say.
const STARTING = { step: '', error: null, running: true, writing: null };

async function opened(run: DraftRun) {
  const { owner, text } = await instructionsOf(run.job.process, run.job.key);
  const read = await readOf(run.readId);
  fitting(read, owner.subject.data);
  const asking = { model: run.model, resolve: standInsFor(run.holder) };
  return { owner, text, read, asking };
}

const context = (run: DraftRun) => ({
  instructionsHash: run.job.key,
  readId: run.readId,
});

export function find(run: DraftFind): Promise<Outcome<Found[]>> {
  return inStep(
    run,
    context(run),
    STARTING,
    async (_progress, _note, record) => {
      const { owner, text, read, asking } = await opened(run);
      // Found by this draft already, and kept: its writes may have begun.
      const kept = await loadSet(owner, text);
      const set =
        kept && Date.parse(kept.foundAt) >= run.since
          ? kept
          : await findDefinitions(
              await ownerToDraft(owner),
              text,
              run.version,
              read,
              { ...asking, record },
            );
      return set.definitions.map(({ id, name }) => ({ id, name }));
    },
  );
}

// What only a write changes of a definition.
const writtenOf = (d: Definition | undefined) =>
  hashOf(
    JSON.stringify(
      d && [
        d.formula,
        d.problem,
        d.model,
        d.examples,
        d.agreement ?? null,
        d.approvedAt,
        d.deniedAt,
      ],
    ),
  );

// What a definition is now, for a write to know whether it has been made.
export async function writtenNow(
  owner: DefinitionProcess,
  text: string,
  id: string,
): Promise<string> {
  const set = await loadSet(owner, text);
  return writtenOf(set?.definitions.find((d) => d.id === id));
}

// A definition as finding leaves it: no write has touched it.
const FOUND = writtenOf({
  formula: null,
  problem: null,
  model: null,
  examples: [],
  approvedAt: null,
  deniedAt: null,
} as unknown as Definition);

/*
  Writes one definition until two writes agree, and keeps it: a draft's, at
  its place in the list (`at`), or one written again. `before` is what it was when the job
  began (none: as found), so one that has been written since is not written
  a second time.
*/
export function write(
  run: DraftRun,
  found: Found,
  at: { index: number; of: number } | null,
  before: string | null,
): Promise<Outcome<null>> {
  return inStep(run, context(run), STARTING, async (progress, note, record) => {
    progress.writing = found.id;
    const { owner, text, read, asking } = await opened(run);
    if ((await writtenNow(owner, text, found.id)) !== (before ?? FOUND))
      return null;
    await writeAgreed(
      at ? await ownerToDraft(owner) : owner,
      text,
      read,
      found.id,
      {
        ...asking,
        record,
        onRun: async (write) => {
          const again = write > 1 ? `, write ${write}` : '';
          progress.step = at
            ? `Writing ${at.index + 1} of ${at.of}: ${found.name}${again}…`
            : `Writing it again${again}…`;
          await note();
        },
      },
    );
    return null;
  });
}

export function end(
  run: DraftRun,
  { step, error }: { step: string | null; error: string | null },
): Promise<void> {
  return settle(run, STARTING, (progress) => {
    if (step) progress.step = step;
    progress.error = error;
    progress.writing = null;
  });
}
