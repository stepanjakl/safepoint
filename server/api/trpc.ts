import 'server-only';

import { initTRPC, TRPCError } from '@trpc/server';

import {
  crossOriginRefusal,
  gateApplies,
  isLocalDevelopment,
  localDevelopmentRefusal,
} from '@/lib/dev/dev-route';
import { accessConfig, NOT_CONFIGURED_MESSAGE } from '@/server/access/config';
import { readSession } from '@/server/access/session';
import { readVisitor, visitorSecret } from '@/server/access/visitor';
import { Refused } from '@/server/storage/refused';

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
  development as today, or, wherever the shared-password gate applies
  (lib/dev/dev-route.ts `gateApplies`), a request that carries a valid gate
  cookie. The request proxy (/proxy.ts) turns the same requests away before
  they get here; this checks again, on purpose, so a procedure never depends
  on the proxy having run. A foreign origin is refused either way. The gate
  runs before the input is parsed, as the plain routes refuse first.

  Past it, a procedure is told who is acting (`ctx.actor`): the name on the
  gate's cookie when there is one, otherwise the visitor's own (the anonymous
  name the proxy issues), otherwise nobody. `ctx.visitor` carries the visitor
  whole, id included, for what is counted per visitor later. A refusal its
  work throws (`Refused`) reaches the screen in its own words and code.
*/
type VisitorOnContext = { id: string; name: string; orb: number };

async function visitorOf(request: Request): Promise<VisitorOnContext | null> {
  const secret = visitorSecret(isLocalDevelopment(new URL(request.url)));
  if (secret === null) return null;
  const visitor = await readVisitor(request, secret);
  return visitor && { id: visitor.id, name: visitor.name, orb: visitor.orb };
}

async function actorOf(
  request: Request,
): Promise<{ actor: string | null; visitor: VisitorOnContext | null }> {
  if (!gateApplies(new URL(request.url))) {
    const refusal = localDevelopmentRefusal(request, { allowDevHost: true });
    if (refusal)
      throw new TRPCError({
        code: refusal.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
        message: refusal.message,
      });
    const visitor = await visitorOf(request);
    return { actor: visitor?.name ?? null, visitor };
  }
  const foreign = crossOriginRefusal(request, { allowDevHost: true });
  if (foreign)
    throw new TRPCError({ code: 'FORBIDDEN', message: foreign.message });
  const config = accessConfig();
  if (config === null)
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: NOT_CONFIGURED_MESSAGE,
    });
  const session = await readSession(request, config.cookieSecret);
  if (session === null)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required.' });
  const visitor = await visitorOf(request);
  return { actor: session.name, visitor };
}

export const gatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const result = await next({ ctx: await actorOf(ctx.request) });
  if (!result.ok && result.error.cause instanceof Refused)
    throw new TRPCError({
      code: result.error.cause.code,
      message: result.error.cause.message,
    });
  return result;
});

// What the routes answered for anything that went wrong while working: the
// message, as a bad gateway.
export const failed = (error: unknown) =>
  new TRPCError({
    code: 'BAD_GATEWAY',
    message: error instanceof Error ? error.message : 'Failed.',
    cause: error,
  });
