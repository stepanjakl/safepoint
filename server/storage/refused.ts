import 'server-only';

/*
  Server-only. What a storage function or an operation says when it will
  not do what was asked, in words a person can act on, and what kind of
  refusal it is. The tRPC gate (server/api/trpc.ts) answers it with that
  code and those words; anything else thrown is a failure.
*/
export type RefusalCode = 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST';

export class Refused extends Error {
  constructor(
    message: string,
    readonly code: RefusalCode = 'CONFLICT',
  ) {
    super(message);
    this.name = 'Refused';
  }
}
