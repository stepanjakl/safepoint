import { APICallError } from 'ai';

import { runReviewLab } from '@/lib/model-workbench/review-lab-run';
import { labRequestSchema } from '@/lib/model-workbench/review-lab-contract';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return Response.json(
      { kind: 'error', message: 'Not found.' },
      { status: 404 },
    );
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== url.origin)
    return Response.json(
      { kind: 'error', message: 'Cross-origin request rejected.' },
      { status: 403 },
    );
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    return Response.json(
      {
        kind: 'error',
        message: 'Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local.',
      },
      { status: 503 },
    );
  const body: unknown = await request.json().catch(() => null);
  const parsed = labRequestSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      {
        kind: 'error',
        message: 'Invalid local review request.',
        issues: parsed.error.issues.map(
          ({ path, message }) => `${path.join('.')}: ${message}`,
        ),
      },
      { status: 400 },
    );
  if (
    parsed.data.stage === 'extract' &&
    (parsed.data.input.role !== 'case_evidence' ||
      !parsed.data.input.text.trim())
  )
    return Response.json(
      {
        kind: 'error',
        message: 'Case evidence text is required for extraction.',
      },
      { status: 400 },
    );
  if (
    Object.keys(parsed.data.confirmedFacts).length &&
    (parsed.data.input.role !== 'case_evidence' ||
      !parsed.data.input.text.trim() ||
      Object.entries(parsed.data.confirmedFacts).some(
        ([field, value]) =>
          !parsed.data.confirmedClaims.some(
            (claim) =>
              claim.field === field &&
              claim.value === value &&
              parsed.data.input.text.includes(claim.quote),
          ),
      ))
  )
    return Response.json(
      {
        kind: 'error',
        message:
          'Confirmed facts need accepted claims with supporting quotes in case evidence.',
      },
      { status: 400 },
    );
  const runId = crypto.randomUUID();
  const started = performance.now();
  try {
    const result = await runReviewLab(parsed.data, runId);
    const durationMs = Math.round(performance.now() - started);
    console.info(
      '[review-lab]',
      JSON.stringify({
        stage: result.stage,
        runId: result.runId,
        sku: parsed.data.sku,
        model: result.model,
        issueCount: result.issues.length,
        durationMs,
      }),
    );
    return Response.json({ ...result, durationMs });
  } catch (error) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const detail =
      error instanceof Error ? error.message : 'Model request failed.';
    const safeDetail = key ? detail.replaceAll(key, '[redacted]') : detail;
    console.error(
      '[review-lab]',
      JSON.stringify({
        runId,
        stage: parsed.data.stage,
        sku: parsed.data.sku,
        durationMs: Math.round(performance.now() - started),
        error: safeDetail,
        providerDetail: APICallError.isInstance(error)
          ? (key
              ? error.responseBody?.replaceAll(key, '[redacted]')
              : error.responseBody
            )?.slice(0, 4_000)
          : undefined,
      }),
    );
    return Response.json(
      { kind: 'error', runId, message: safeDetail },
      { status: 502 },
    );
  }
}
