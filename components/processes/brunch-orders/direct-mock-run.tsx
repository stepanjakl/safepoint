'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { RunSelection } from '@/components/app-shell/runs/run-selection';
import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
import {
  ModelRunThread,
  type ModelRunActions,
  type ModelRunView,
} from '@/components/app-shell/thread/model-run-thread';
import {
  ThreadPlayerBar,
  usePersistedMockStage,
  useSlowMotion,
  type ThreadPlayerStep,
} from '@/components/app-shell/thread/thread-player';
import type { Decision } from '@/components/engine/propose/types';
import { needsPerson } from '@/components/engine/propose/verdict';
import {
  brunchDirectScript,
  mockWriteOutputs,
  type ScriptedStage,
} from '@/lib/processes/brunch-orders/direct-script';
import {
  MODEL_RUN_STAGE_LABELS,
  type ModelRunStage,
} from '@/lib/shell/model-run';
import type { RunStatus } from '@/lib/shell/model';
import { runDay, runTime } from '@/lib/shell/run-time';
import { motionTime } from '@/lib/ui/motion-time';

const STAGE_TO_RUN_STATUS: Record<ModelRunStage, RunStatus> = {
  starting: 'queued',
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

const STEP_MS = 5200;
const STAGE_HOLD_MS: Partial<Record<string, number>> = { starting: 2800 };
const NO_FRAMES: NonNullable<ScriptedStage['frames']> = [];
const AFTER_FRAMES_MS = 2400;
const COMMIT_MS = 1200;
const UNDO_MS = 600;

export function DirectMockRun({
  runId,
  selection,
}: {
  runId: string;
  selection: RunSelection;
}) {
  const script = useMemo(() => brunchDirectScript(), []);
  const allStages = useMemo(
    () => [
      ...script.mainLine.map((s) => ({ ...s, group: 'main' as const })),
      ...script.branches.map((s) => ({ ...s, group: 'branch' as const })),
    ],
    [script],
  );
  const steps: ThreadPlayerStep[] = useMemo(
    () =>
      allStages.map((s) => ({
        key: s.key,
        label:
          s.label === s.key ? MODEL_RUN_STAGE_LABELS[s.view.stage] : s.label,
        group: s.group,
      })),
    [allStages],
  );
  const indexOfStage = useMemo(
    () => new Map(allStages.map((s, i) => [s.key, i])),
    [allStages],
  );

  const [index, setIndex] = usePersistedMockStage(runId, steps);
  const [runKey, setRunKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [userDecisions, setUserDecisions] = useState<Record<
    string,
    Decision
  > | null>(null);
  const [writtenAt, setWrittenAt] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [announced, setAnnounced] = useState('');
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useSlowMotion(container, rate);

  const clearPendingAction = () => {
    if (actionTimer.current !== null) {
      clearTimeout(actionTimer.current);
      actionTimer.current = null;
    }
    setActing(false);
  };
  useEffect(() => clearPendingAction, []);

  const lastMainIndex = script.mainLine.length - 1;
  const scripted = allStages[index] ?? allStages[0]!;
  const isBranch = scripted.group === 'branch';
  const atLastMain = !isBranch && index >= lastMainIndex;
  const running = playing && !isBranch && !atLastMain;
  useWorkingFavicon(
    running ||
      scripted.view.stage === 'reading' ||
      scripted.view.stage === 'evaluating' ||
      scripted.view.stage === 'committing',
  );

  const frames = scripted.frames ?? NO_FRAMES;
  const [frame, setFrame] = useState({ index, at: 0 });
  const at = frame.index === index ? frame.at : 0;

  useEffect(() => {
    const next = frames[at + 1];
    if (!next) return;
    const timer = setTimeout(
      () => setFrame({ index, at: at + 1 }),
      motionTime(next.t - (frames[at]?.t ?? 0)) / rate,
    );
    return () => clearTimeout(timer);
  }, [at, index, frames, rate]);

  useEffect(() => {
    if (!running) return;
    const hold = frames.length
      ? frames.at(-1)!.t + AFTER_FRAMES_MS
      : (STAGE_HOLD_MS[scripted.key] ?? STEP_MS);
    const timer = setTimeout(
      () => {
        setIndex((current) => {
          const next = current + 1;
          if (next >= lastMainIndex) setPlaying(false);
          return Math.min(next, lastMainIndex);
        });
      },
      motionTime(hold) / rate,
    );
    return () => clearTimeout(timer);
  }, [running, index, scripted.key, frames, lastMainIndex, rate, setIndex]);

  const activeView = frames[at]?.view ?? scripted.view;
  const nextStatus = STAGE_TO_RUN_STATUS[activeView.stage];
  const setMockStatus = selection.setMockStatus;
  useEffect(() => {
    setMockStatus?.(runId, nextStatus);
  }, [runId, nextStatus, setMockStatus]);

  const decisions = userDecisions ?? activeView.review?.decisions ?? {};
  const computedOutputs = useMemo(
    () => (userDecisions ? mockWriteOutputs(userDecisions) : null),
    [userDecisions],
  );
  const computedWritesCount = useMemo(
    () =>
      computedOutputs
        ? computedOutputs.reduce((sum, out) => sum + out.changes.length, 0)
        : null,
    [computedOutputs],
  );

  const runNote = selection.live?.kept.additionalInstructions;
  const startedAt = selection.live?.run.startedAt;
  const requestLabel = startedAt
    ? `${runDay(startedAt)} · ${runTime(startedAt)}`
    : activeView.facts.requestLabel;

  const needYou = activeView.review
    ? Object.entries(activeView.review.proposal.records).filter(
        ([key, one]) => !decisions[key] && needsPerson(one.verdict),
      ).length
    : activeView.facts.needYou;

  const view: ModelRunView = {
    ...activeView,
    facts: {
      ...activeView.facts,
      requestLabel,
      needYou,
      decided: Object.keys(decisions).length,
      writes: computedWritesCount ?? activeView.facts.writes,
    },
    instructions: runNote
      ? { ...activeView.instructions, note: runNote }
      : activeView.instructions,
    review: activeView.review
      ? { ...activeView.review, decisions }
      : activeView.review,
    write: activeView.write
      ? {
          ...activeView.write,
          outputs: computedOutputs ?? activeView.write.outputs,
          writtenAt:
            activeView.stage === 'committed'
              ? (writtenAt ?? activeView.write.writtenAt)
              : null,
        }
      : null,
  };

  const jumpToStage = (key: string) => {
    const target = indexOfStage.get(key);
    if (target === undefined) return;
    setFrame({ index: target, at: 0 });
    setIndex(target);
  };

  const actions: ModelRunActions = {
    announced,
    busy: acting || activeView.stage === 'committing',
    onDecide: (changes, words) => {
      if (!activeView.review) return;
      setPlaying(false);
      clearPendingAction();
      const next = { ...decisions };
      for (const [key, decision] of Object.entries(changes)) {
        if (decision) next[key] = decision;
        else delete next[key];
      }
      setUserDecisions(next);
      setAnnounced(words);

      const totalRecords = Object.keys(
        activeView.review.proposal.records,
      ).length;
      const decidedCount = Object.keys(next).length;
      if (totalRecords > 0 && decidedCount === totalRecords) {
        if (activeView.stage !== 'ready_to_commit') {
          setWrittenAt(null);
          jumpToStage('ready_to_commit');
        }
      } else if (decidedCount > 0) {
        if (activeView.stage !== 'reviewing') {
          setWrittenAt(null);
          jumpToStage('reviewing');
        }
      } else if (activeView.stage !== 'awaiting_review') {
        setWrittenAt(null);
        jumpToStage('awaiting_review');
      }
    },
    onCheck: async () => ({ kind: 'check', verdict: 'ready', checks: [] }),
    onRetry: activeView.facts.stopped
      ? () => {
          clearPendingAction();
          const target =
            activeView.facts.stopped?.at === 'sources'
              ? 'reading'
              : 'evaluating';
          jumpToStage(target);
          setPlaying(true);
        }
      : undefined,
    onWrite: () => {
      setPlaying(false);
      clearPendingAction();
      if (!userDecisions) setUserDecisions(decisions);
      setActing(true);
      jumpToStage('committing');
      actionTimer.current = setTimeout(
        () => {
          actionTimer.current = null;
          setWrittenAt(new Date().toISOString());
          setActing(false);
          jumpToStage('committed');
        },
        motionTime(COMMIT_MS) / rate,
      );
    },
    onUndo: () => {
      setPlaying(false);
      clearPendingAction();
      setActing(true);
      actionTimer.current = setTimeout(
        () => {
          actionTimer.current = null;
          setWrittenAt(null);
          setActing(false);
          jumpToStage('ready_to_commit');
        },
        motionTime(UNDO_MS) / rate,
      );
    },
  };

  return (
    <div ref={container}>
      <ThreadPlayerBar
        steps={steps}
        index={index}
        playing={running}
        rate={rate}
        onSelect={(next) => {
          setPlaying(false);
          clearPendingAction();
          setUserDecisions(null);
          setWrittenAt(null);
          setFrame({ index: next, at: 0 });
          if (next === 0) setRunKey((key) => key + 1);
          setIndex(next);
        }}
        onTogglePlay={() => {
          clearPendingAction();
          if (isBranch || atLastMain) {
            setUserDecisions(null);
            setWrittenAt(null);
            setFrame({ index: 0, at: 0 });
            setRunKey((key) => key + 1);
            setIndex(0);
            setPlaying(true);
          } else {
            setPlaying(!playing);
          }
        }}
        onRateChange={setRate}
      />
      <ModelRunThread
        key={runKey}
        run={view}
        actions={actions}
        look="proposed"
        enterFirst={index === 0}
      />
    </div>
  );
}
