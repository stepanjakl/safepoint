'use client';

import { useEffect, useRef, useState } from 'react';

import { ModelAt } from '@/components/app-shell/thread/model-run-thread';
import {
  ThreadPlayerBar,
  useSlowMotion,
  type ThreadPlayerStep,
} from '@/components/app-shell/thread/thread-player';
import { Button } from '@/components/ui/button';
import type { ProposalActivity } from '@/lib/engine/types';
import type { ModelRunFacts } from '@/lib/shell/model-run';
import { motionTime } from '@/lib/ui/motion-time';

export type ProposingFrame = {
  key: string;
  label: string;
  t: number;
  working: boolean;
  activity: ProposalActivity | null;
};

export function ProposingStepsWorkbench({
  frames,
  facts,
  version,
}: {
  frames: ProposingFrame[];
  facts: ModelRunFacts;
  version: string;
}) {
  const [index, setIndex] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [debug, setDebug] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  useSlowMotion(container, rate);

  const lastIndex = frames.length - 1;
  const current = frames[index] ?? frames[0]!;
  const steps: ThreadPlayerStep[] = frames.map((frame) => ({
    key: frame.key,
    label: frame.label,
    group: 'main',
  }));

  useEffect(() => {
    if (!playing || index >= lastIndex) return;
    const next = frames[index + 1];
    if (!next) return;
    const delta = Math.max(600, next.t - current.t);
    const timer = setTimeout(
      () => {
        const target = index + 1;
        if (target >= lastIndex) setPlaying(false);
        setIndex(target);
      },
      motionTime(delta) / rate,
    );
    return () => clearTimeout(timer);
  }, [playing, index, lastIndex, frames, current.t, rate]);

  return (
    <div ref={container} className="grid gap-6">
      <div className="mx-auto w-[min(100%,760px)]">
        <ThreadPlayerBar
          steps={steps}
          index={index}
          playing={playing}
          rate={rate}
          onSelect={(next) => {
            setPlaying(false);
            if (next <= index) setRunKey((key) => key + 1);
            setIndex(next);
          }}
          onTogglePlay={() => {
            if (index >= lastIndex) {
              setRunKey((key) => key + 1);
              setIndex(0);
              setPlaying(true);
            } else {
              setPlaying(!playing);
            }
          }}
          onRateChange={setRate}
        />

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant={debug ? 'primary' : 'secondary'}
            aria-pressed={debug}
            onPress={() => setDebug(!debug)}
          >
            Debug section
          </Button>
        </div>

        <section className="surface-pane border-raised-ring rounded-shell grid content-start gap-4 border p-6">
          <ModelAt
            key={runKey}
            activity={current.activity}
            facts={facts}
            version={version}
            working={current.working}
            debug={debug}
            rate={rate}
          />
        </section>
      </div>
    </div>
  );
}
