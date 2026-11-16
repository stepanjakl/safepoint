import 'server-only';

/*
  Server-only. What a storage function or an operation says when it will
  not do what was asked, in words a person can act on, and what kind of
  refusal it is. The tRPC gate (server/api/trpc.ts) answers it with that
  code and those words; anything else thrown is a failure.
*/
export type RefusalCode = 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST';

// No parameter property: scripts load this through Node's type stripping.
export class Refused extends Error {
  readonly code: RefusalCode;
  constructor(message: string, code: RefusalCode = 'CONFLICT') {
    super(message);
    this.code = code;
    this.name = 'Refused';
  }
}
