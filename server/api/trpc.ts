import 'server-only';

import { initTRPC, TRPCError } from '@trpc/server';

import { localDevelopmentRefusal } from '@/lib/dev/dev-route';

/*
  Server-only. tRPC's one initialisation: what every procedure is given (the
  request it answers), how a failure reads on the screen, and the gate every
  stateful procedure passes. No data transformer: every date kept is already
  an ISO string, so JSON carries it unchanged.
*/

type Context = { request: Request };

export const createContext = ({ req }: { req: Request }): Context => ({
  request: req,
});

const t = initTRPC.context<Context>().create({
  /*
    What a person sees of a failure, kept as the plain routes had it: the
    first line of the message, and "Invalid request." for an input tRPC
    refused (a validation or parse failure carries its cause; one a procedure
    throws for itself does not), so no Zod issue list reaches the screen. No
    stack trace: nothing on the client reads it.
  */
  errorFormatter({ shape, error }) {
    const refusedInput =
      (error.code === 'BAD_REQUEST' || error.code === 'PARSE_ERROR') &&
      error.cause !== undefined;
    return {
      message: refusedInput
        ? 'Invalid request.'
        : (shape.message.split('\n')[0] ?? ''),
      code: shape.code,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
        path: shape.data.path,
      },
    };
  },
});

export const router = t.router;

/*
  Who may call a stateful procedure is decided here and nowhere else: local
  development today, and a signed-in session as well once there is one. The
  gate runs before the input is parsed, as the plain routes refuse first.
*/
export const gatedProcedure = t.procedure.use(({ ctx, next }) => {
  const refusal = localDevelopmentRefusal(ctx.request);
  if (refusal)
    throw new TRPCError({
      code: refusal.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
      message: refusal.message,
    });
  return next();
});

// What the routes answered for anything that went wrong while working: the
// message, as a bad gateway.
export const failed = (error: unknown) =>
  new TRPCError({
    code: 'BAD_GATEWAY',
    message: error instanceof Error ? error.message : 'Failed.',
    cause: error,
  });
