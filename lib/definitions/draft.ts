import { findDefinitions, type Asking } from './find';
import { fitting, type KeptRead } from './records';
import { hashOf } from './store';
import type { DefinitionProcess, DraftProgress } from './types';
import { writeDefinition } from './write';

/*
  A whole draft: the definitions found again, then each written in order, on
  the server, so it carries on when the page is closed. Its progress is kept
  in memory while the server runs, one draft per version of the
  instructions, and the page asks for it.
*/

const drafts = new Map<string, DraftProgress>();
const keyOf = (owner: DefinitionProcess, text: string) =>
  `${owner.id}:${hashOf(text)}`;

export const draftProgress = (owner: DefinitionProcess, text: string) =>
  drafts.get(keyOf(owner, text)) ?? null;

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
  void (async () => {
    try {
      const found = await findDefinitions(owner, text, version, read, asking);
      for (const [index, definition] of found.definitions.entries()) {
        progress.step = `Writing ${index + 1} of ${found.definitions.length}: ${definition.name}…`;
        await writeDefinition(owner, text, read, definition.id, asking);
      }
      progress.step = `Drafted ${found.definitions.length} definitions.`;
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      progress.running = false;
    }
  })();
  return progress;
}
