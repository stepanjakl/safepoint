import 'server-only';

import path from 'node:path';

import { FILE_ID } from './ids';
import { runDataDir } from './run-data';

/*
  Server-only. What names a run: the process, the read it was taken on and the
  fingerprint of the rulebook it used. Every file a run keeps is found by it, so
  the way a name is built from it is written here and nowhere else.
*/

export type RunKey = { process: string; readId: string; fingerprint: string };

type Variants = {
  applied: 'whole';
  'cross-checks': 'whole' | 'part';
  proposals: 'whole' | 'part' | 'progress';
};

export type RunKind = keyof Variants;

function assertRunKey({ readId, fingerprint }: RunKey) {
  // Both name a file: never a path.
  if (![readId, fingerprint].every((id) => FILE_ID.test(id)))
    throw new Error('Not a read or rulebook id.');
}

// A part is kept beside the whole while it is being answered, batch by batch;
// progress is a job's, written as it goes.
export function runFile<K extends RunKind>(
  kind: K,
  key: RunKey,
  variant?: Variants[K],
): string {
  assertRunKey(key);
  const suffix =
    variant === 'part' ? '.part' : variant === 'progress' ? '-progress' : '';
  return path.join(
    runDataDir(key.process, kind),
    `${key.readId}.${key.fingerprint}${suffix}.json`,
  );
}
