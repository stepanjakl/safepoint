import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runDataDir } from '@/lib/storage/run-data';

import { findDefinitions, type Asking } from './find';
import { fitting, type KeptRead } from './records';
import { hashOf } from './store';
import type { DefinitionProcess, DraftProgress } from './types';
import { writeDefinition } from './write';

/*
  A whole draft: the definitions found again, then each written in order, on
  the server, so it carries on when the page is closed. One draft per version
  of the instructions. Its progress is held while the server runs and written
  to data/<process>/drafts/ as it goes, so a draft the server stopped part way
  through says so, rather than vanishing.
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
  'The server stopped during this draft, so it did not finish. Draft again to start over.';

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
  const held = drafts.get(keyOf(owner, text));
  if (held) return held;
  let kept: DraftProgress;
  try {
    kept = JSON.parse(await readFile(fileOf(owner, text), 'utf8'));
  } catch {
    return null;
  }
  // Running, but not on this server: it stopped with the one before.
  return kept.running ? { ...kept, running: false, error: INTERRUPTED } : kept;
}

// Starts a draft unless one is running for these instructions; the read must
// fit the process's declaration first.
export function startDraft(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead,
  asking: Asking = {},
): DraftProgress {
  const key = keyOf(owner, text);
  const running = drafts.get(key);
  if (running?.running) return running;
  fitting(read, owner.subject.data);
  const progress: DraftProgress = {
    step: 'Finding the definitions in the instructions…',
    error: null,
    running: true,
  };
  drafts.set(key, progress);
  // Recording is a convenience: a failed write never stops the draft.
  const note = () => record(owner, text, progress).catch(() => undefined);
  void (async () => {
    await note();
    try {
      const found = await findDefinitions(owner, text, version, read, asking);
      for (const [index, definition] of found.definitions.entries()) {
        progress.step = `Writing ${index + 1} of ${found.definitions.length}: ${definition.name}…`;
        await note();
        await writeDefinition(owner, text, read, definition.id, asking);
      }
      const count = found.definitions.length;
      progress.step = `Drafted ${count} definition${count === 1 ? '' : 's'}.`;
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      progress.running = false;
      await note();
    }
  })();
  return progress;
}
