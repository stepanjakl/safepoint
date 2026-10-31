import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runDataDir } from '@/lib/storage/run-data';

import { findDefinitions, type Asking } from './find';
import { fitting, type KeptRead } from './records';
import { hashOf } from './store';
import type { DefinitionProcess, DraftProgress } from './types';
import { writeAgreed } from './write';

/*
  A whole draft: the definitions found again, then each written in order, on
  the server, so it carries on when the page is closed. Writing one definition
  again is the same kind of job, for the same reason. One job per version of the
  instructions. Its progress is held while the server runs and written to
  data/<process>/drafts/ as it goes, so a job the server stopped part way through
  says so, rather than vanishing.
*/

// Held on globalThis: a development recompile re-runs this module, and a new
// map would report a draft still running as stopped.
const server = globalThis as { definitionDrafts?: Map<string, DraftProgress> };
const drafts = (server.definitionDrafts ??= new Map<string, DraftProgress>());
const keyOf = (owner: DefinitionProcess, text: string) =>
  `${owner.id}:${hashOf(text)}`;
const fileOf = (owner: DefinitionProcess, text: string) =>
  path.join(runDataDir(owner.id, 'drafts'), `${hashOf(text)}.json`);

const INTERRUPTED =
  'The server stopped while this was being written, so it did not finish. Try it again.';

async function record(
  owner: DefinitionProcess,
  text: string,
  progress: DraftProgress,
) {
  const file = fileOf(owner, text);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(progress));
  await rename(temporary, file);
}

export async function draftProgress(
  owner: DefinitionProcess,
  text: string,
): Promise<DraftProgress | null> {
  // A copy: the draft changes the one held, and a reply built from it could
  // otherwise say finished beside rules read before it finished.
  const held = drafts.get(keyOf(owner, text));
  if (held) return { ...held };
  let kept: DraftProgress;
  try {
    kept = JSON.parse(await readFile(fileOf(owner, text), 'utf8'));
  } catch {
    return null;
  }
  // Running, but not on this server: it stopped with the one before.
  return kept.running ? { ...kept, running: false, error: INTERRUPTED } : kept;
}

// Runs a job unless one is running for these instructions, recording its
// progress; what it resolves to is its last word.
function startJob(
  owner: DefinitionProcess,
  text: string,
  step: string,
  work: (progress: DraftProgress, note: () => Promise<void>) => Promise<string>,
): DraftProgress {
  const key = keyOf(owner, text);
  const running = drafts.get(key);
  if (running?.running) return running;
  const progress: DraftProgress = {
    step,
    error: null,
    running: true,
    writing: null,
  };
  drafts.set(key, progress);
  // Recording is a convenience: a failed write never stops the job.
  const note = () => record(owner, text, progress).catch(() => undefined);
  void (async () => {
    await note();
    try {
      progress.step = await work(progress, note);
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      progress.running = false;
      progress.writing = null;
      await note();
    }
  })();
  return progress;
}

// Starts a draft unless a job is running for these instructions; the read must
// fit the process's declaration first.
export function startDraft(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead,
  asking: Asking = {},
): DraftProgress {
  const running = drafts.get(keyOf(owner, text));
  if (running?.running) return running;
  fitting(read, owner.subject.data);
  return startJob(
    owner,
    text,
    'Finding the definitions in the instructions…',
    async (progress, note) => {
      const found = await findDefinitions(owner, text, version, read, asking);
      for (const [index, definition] of found.definitions.entries()) {
        progress.writing = definition.id;
        await writeAgreed(owner, text, read, definition.id, {
          ...asking,
          onRun: async (run) => {
            progress.step = `Writing ${index + 1} of ${found.definitions.length}: ${definition.name}${run > 1 ? `, write ${run}` : ''}…`;
            await note();
          },
        });
      }
      const count = found.definitions.length;
      return `Drafted ${count} definition${count === 1 ? '' : 's'}.`;
    },
  );
}

// Writes one definition again, as a job, so a person can leave or reload the
// page and still find out it is being written, and what came of it.
export function startRewrite(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): DraftProgress {
  return startJob(owner, text, 'Writing it again…', async (progress, note) => {
    progress.writing = id;
    await writeAgreed(owner, text, read, id, {
      ...asking,
      onRun: async (run) => {
        progress.step = `Writing it again${run > 1 ? `, write ${run}` : ''}…`;
        await note();
      },
    });
    return 'Written again.';
  });
}
