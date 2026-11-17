import { z } from 'zod';

import { rejectUnlessLocalDevelopment } from '@/lib/dev/dev-route';
import { proposalSchema } from '@/lib/engine/types';
import {
  runProcess,
  runProcessIdSchema,
} from '@/server/operations/kept-processes';
import { runKeyOfKept } from '@/server/operations/record-decisions';
import { runIdSchema } from '@/server/storage/ids';
import { keepProposal } from '@/server/storage/proposals';
import { runOrRefuse } from '@/server/storage/runs';

export const runtime = 'nodejs';

/*
  Development only, for the browser tests (e2e/runs-in-a-second-browser.spec.ts):
  keeps a proposal for a run that has read its data, so a decision can be made
  on it through the real procedures without a model. Nothing else makes one
  without a model request. The proposal is kept under the run's own key, as the
  job a model runs would keep it; the records are the caller's.
*/
export async function POST(request: Request) {
  const rejected = rejectUnlessLocalDevelopment(request);
  if (rejected) return rejected;
  const parsed = z
    .strictObject({
      process: runProcessIdSchema,
      runId: runIdSchema,
      at: proposalSchema.shape.at,
      records: proposalSchema.shape.records,
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { kind: 'error', message: 'Invalid proposal.' },
      { status: 400 },
    );
  const { process, runId, at, records } = parsed.data;
  try {
    const kept = runProcess(process);
    const key = await runKeyOfKept(kept, await runOrRefuse(process, runId));
    if (!key)
      return Response.json(
        { kind: 'error', message: 'This run has not read its data yet.' },
        { status: 409 },
      );
    await keepProposal(kept.runs.definitions, {
      fingerprint: key.fingerprint,
      readId: key.readId,
      model: 'browser test',
      at,
      records,
    });
    return Response.json({ kind: 'kept', at });
  } catch (error) {
    return Response.json(
      {
        kind: 'error',
        message: error instanceof Error ? error.message : 'Failed.',
      },
      { status: 500 },
    );
  }
}
