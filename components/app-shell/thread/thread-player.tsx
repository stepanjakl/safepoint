'use client';

import { useEffect, type RefObject } from 'react';

import { Button } from '@/components/ui/button';

export type ThreadPlayerStep = {
  key: string;
  label: string;
  group?: 'main' | 'branch';
};

export const PLAYER_SPEEDS = [
  { rate: 1, label: '1×' },
  { rate: 0.25, label: '¼×' },
] as const;

/*
  Plays every animation inside `container` at `rate`, so motion can be judged
  slowed down. Every frame rather than once: animations that start later --
  a ring leaving on its own beat -- must be slowed before their first frame.
*/
export function useSlowMotion(
  container: RefObject<HTMLElement | null>,
  rate: number,
) {
  useEffect(() => {
    const animations = () =>
      container.current?.getAnimations({ subtree: true }) ?? [];
    if (rate === 1) {
      animations().forEach((animation) => (animation.playbackRate = 1));
      return;
    }
    let frame = 0;
    const slow = () => {
      animations().forEach((animation) => {
        if (animation.playbackRate !== rate) animation.playbackRate = rate;
      });
      frame = requestAnimationFrame(slow);
    };
    slow();
    return () => cancelAnimationFrame(frame);
  }, [container, rate]);
}

/*
  Sticky floating player bar for stepping, playing, pausing, jumping to a stage
  or branch/error state, and toggling playback speed in a mock run.
*/
export function ThreadPlayerBar({
  steps,
  index,
  playing,
  rate,
  onSelect,
  onTogglePlay,
  onRateChange,
}: {
  steps: readonly ThreadPlayerStep[];
  index: number;
  playing: boolean;
  rate: number;
  onSelect: (next: number) => void;
  onTogglePlay: () => void;
  onRateChange: (rate: number) => void;
}) {
  const mainSteps = steps
    .map((step, i) => ({ ...step, index: i }))
    .filter((step) => step.group !== 'branch');
  const branchSteps = steps
    .map((step, i) => ({ ...step, index: i }))
    .filter((step) => step.group === 'branch');
  const lastMainIndex = (mainSteps.at(-1)?.index ?? steps.length - 1);
  const current = steps[index] ?? steps[0]!;
  const isBranch = current.group === 'branch';
  const atLastMain = !isBranch && index >= lastMainIndex;

  return (
    <section
      aria-label="Mock run player"
      className="thread-player-bar ground-floating control-face surface-popover rounded-shell sticky top-3 z-20 mb-6 flex flex-wrap items-center gap-2 p-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Button
          size="small"
          onPress={() =>
            onSelect(index <= 0 ? lastMainIndex : index - 1)
          }
        >
          Back
        </Button>
        <Button
          size="small"
          variant="primary"
          onPress={onTogglePlay}
        >
          {playing ? 'Pause' : atLastMain ? 'Replay' : 'Play'}
        </Button>
        <Button
          size="small"
          onPress={() =>
            onSelect(index >= steps.length - 1 ? 0 : index + 1)
          }
        >
          Next
        </Button>
      </div>

      <label className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        <span className="sr-only">Mock run stage</span>
        <select
          aria-label="Mock run stage"
          className="field text-dense min-h-7 min-w-0 flex-1 px-2"
          value={index}
          onChange={(event) => onSelect(Number(event.target.value))}
        >
          {branchSteps.length > 0 ? (
            <>
              <optgroup label="Main stages">
                {mainSteps.map((step, pos) => (
                  <option key={step.key} value={step.index}>
                    {pos + 1}. {step.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Branches & error states">
                {branchSteps.map((step) => (
                  <option key={step.key} value={step.index}>
                    {step.label}
                  </option>
                ))}
              </optgroup>
            </>
          ) : (
            steps.map((step, i) => (
              <option key={step.key} value={i}>
                {i + 1}. {step.label}
              </option>
            ))
          )}
        </select>
      </label>

      <div
        role="group"
        aria-label="Playback speed"
        className="flex items-center gap-1"
      >
        {PLAYER_SPEEDS.map((speed) => (
          <Button
            key={speed.rate}
            size="small"
            variant={speed.rate === rate ? 'primary' : 'secondary'}
            aria-pressed={speed.rate === rate}
            onPress={() => onRateChange(speed.rate)}
          >
            {speed.label}
          </Button>
        ))}
      </div>

      <p role="status" className="sr-only">
        Stage {index + 1} of {steps.length}: {current.label}.
      </p>
    </section>
  );
}
