import 'server-only';

/*
  Server-only. What names a run: the process, the read it was taken on and the
  fingerprint of the rulebook it used. Proposals, cross-checks, their parts
  and the record of each write are kept by it in the database.
*/

export type RunKey = { process: string; readId: string; fingerprint: string };
