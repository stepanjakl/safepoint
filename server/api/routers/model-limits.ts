import 'server-only';

import { z } from 'zod';

import { limitsOf } from '@/lib/definitions/limits';
import { DRAFTING_MODELS, draftingModelSchema } from '@/lib/models';

import { gatedProcedure, router } from '../trpc';

/*
  Server-only. How a model's quota stands, for the screen to poll. It asks
  Google nothing.
*/
export const modelLimitsRouter = router({
  get: gatedProcedure
    .input(z.strictObject({ model: draftingModelSchema }))
    .query(({ input }) => limitsOf(input.model, DRAFTING_MODELS)),
});
