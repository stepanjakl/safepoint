import { z } from 'zod';

import { modelIdSchema } from '@/lib/model-workbench/models';
import { runModelWorkbench } from '@/lib/model-workbench/run';
import { skuSchema } from '@/lib/promotion-release/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  if (
    process.env.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  ) {
    return Response.json(
      { kind: 'error', message: 'Not found' },
      { status: 404 },
    );
  }
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin) {
    return Response.json(
      {
        kind: 'error',
        message: 'Cross-origin model requests are not allowed.',
      },
      { status: 403 },
    );
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        kind: 'error',
        message:
          'Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local and restart the dev server.',
      },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const input = z
    .strictObject({
      model: modelIdSchema,
      sku: skuSchema,
      reviewAt: z.iso.datetime({ offset: false }),
    })
    .safeParse(body);
  if (!input.success) {
    return Response.json(
      {
        kind: 'error',
        message: 'Choose a valid model, candidate, and review time.',
      },
      { status: 400 },
    );
  }

  const runId = crypto.randomUUID();
  try {
    const result = await runModelWorkbench({ ...input.data, runId });
    console.info(
      '[model-workbench]',
      JSON.stringify({
        runId,
        sku: input.data.sku,
        model: input.data.model,
        stage: result.issues.length ? 'contract' : 'policy',
        contractIssueCount: result.issues.length,
        verdict: result.review?.policy.verdict ?? null,
        treatment: result.review?.treatment ?? null,
        durationMs: result.durationMs,
        usage: result.usage,
      }),
    );
    return Response.json({
      kind: 'result',
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Model request failed.';
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const safeMessage = key ? message.replaceAll(key, '[redacted]') : message;
    console.error(
      '[model-workbench]',
      JSON.stringify({
        runId,
        sku: input.data.sku,
        model: input.data.model,
        stage: 'generation',
        error: safeMessage,
      }),
    );
    return Response.json(
      {
        kind: 'error',
        runId,
        stage: 'generation',
        message: safeMessage,
      },
      { status: 502 },
    );
  }
}
