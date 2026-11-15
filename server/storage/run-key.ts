import 'server-only';

import path from 'node:path';

import { FILE_ID } from './ids';
import { runDataDir } from './run-data';

/*
  Server-only. What names a run: the process, the read it was taken on and the
  fingerprint of the rulebook it used. Proposals, cross-checks and their parts
  are kept by it in the database; the files a run still keeps are found by it,
  so the way a name is built from it is written here and nowhere else.
*/

export type RunKey = { process: string; readId: string; fingerprint: string };

export type RunKind = 'applied';

function assertRunKey({ readId, fingerprint }: RunKey) {
  // Both name a file: never a path.
  if (![readId, fingerprint].every((id) => FILE_ID.test(id)))
    throw new Error('Not a read or rulebook id.');
}

export function runFile(kind: RunKind, key: RunKey): string {
  assertRunKey(key);
  return path.join(
    runDataDir(key.process, kind),
    `${key.readId}.${key.fingerprint}.json`,
  );
}
