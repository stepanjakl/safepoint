import type { Page } from '@playwright/test';
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import {
  TRPC_ERROR_CODES_BY_KEY,
  type TRPC_ERROR_CODE_KEY,
} from '@trpc/server/rpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@/server/api/root';

/*
  Serves one tRPC procedure in a browser test, typed from the router: the
  page's call never reaches the server. The client sends each call on its own
  (an unbatched link), queries too as POST /api/trpc/<path> with the input as
  its JSON body; the answer is tRPC's own, `{ result: { data } }` or
  `{ error }` with the status its code maps to, or a `raw` response that is
  not tRPC's. `inputs` collects what the page sent, call by call.
*/

type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;
type Area = keyof Outputs & string;
type ProcedurePath = {
  [A in Area]: `${A}.${keyof Outputs[A] & string}`;
}[Area];
type At<T, P> = P extends `${infer A}.${infer N}`
  ? A extends keyof T
    ? N extends keyof T[A]
      ? T[A][N]
      : never
    : never
  : never;

// `raw` is no tRPC answer at all, as a server that is recompiling gives: the
// page's call fails without the server having said anything.
export type Answer<T> =
  | { data: T }
  | { error: { code: TRPC_ERROR_CODE_KEY; message: string } }
  | { raw: { status: number; body: string } };

export async function mockProcedure<P extends ProcedurePath>(
  page: Page,
  path: P,
  answer:
    | Answer<At<Outputs, P>>
    | ((
        input: At<Inputs, P>,
      ) => Answer<At<Outputs, P>> | Promise<Answer<At<Outputs, P>>>),
) {
  const inputs: At<Inputs, P>[] = [];
  await page.route(
    (url) => url.pathname === `/api/trpc/${path}`,
    async (route) => {
      const raw = route.request().postData();
      const input = (raw ? JSON.parse(raw) : undefined) as At<Inputs, P>;
      inputs.push(input);
      const reply = typeof answer === 'function' ? await answer(input) : answer;
      if ('data' in reply)
        return route.fulfill({ json: { result: { data: reply.data } } });
      if ('raw' in reply) return route.fulfill(reply.raw);
      const { code, message } = reply.error;
      const httpStatus = getHTTPStatusCodeFromError(
        new TRPCError({ code, message }),
      );
      return route.fulfill({
        status: httpStatus,
        json: {
          error: {
            message,
            code: TRPC_ERROR_CODES_BY_KEY[code],
            data: { code, httpStatus, path },
          },
        },
      });
    },
  );
  return { inputs };
}
