'use client';

import { useEffect, useRef } from 'react';

import type { ModelRunStage } from '@/lib/shell/model-run';

import { isMockRunId, type RunSelection } from './run-selection';

export type RunProgressStatus = NonNullable<
  Parameters<RunSelection['record']>[1]['status']
>;

export function useRunProgress(
  selection: RunSelection,
  runId: string,
  savedStatus: string | undefined,
  status: RunProgressStatus | null,
) {
  const last = useRef(savedStatus);
  useEffect(() => {
    if (status === null || last.current === status) return;
    last.current = status;
    if (isMockRunId(runId)) {
      selection.setMockStatus?.(runId, status);
    } else {
      void selection.record(runId, { status }).catch(() => undefined);
    }
  }, [selection, runId, status]);
}

export const MODEL_RUN_PROGRESS: Record<ModelRunStage, RunProgressStatus> = {
  starting: 'running',
  reading: 'running',
  evaluating: 'running',
  awaiting_review: 'awaiting_review',
  reviewing: 'awaiting_review',
  ready_to_commit: 'approved',
  committing: 'approved',
  intervention: 'held',
  committed: 'completed',
  stopped: 'failed',
};
