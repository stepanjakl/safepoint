import { limitsOf } from '@/lib/definitions/limits';
import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { DRAFTING_MODELS, draftingModelSchema } from '@/lib/models';

export const runtime = 'nodejs';

// Development only: how a model's quota stands. Asks Google nothing.
export function GET(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const model = draftingModelSchema.safeParse(
    new URL(request.url).searchParams.get('model'),
  );
  if (!model.success)
    return Response.json(
      { kind: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  return Response.json(limitsOf(model.data, DRAFTING_MODELS));
}
