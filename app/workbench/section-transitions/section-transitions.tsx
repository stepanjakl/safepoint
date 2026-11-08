'use client';

import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { MorphingText, MORPH_WORDS_MS } from '@/components/ui/morphing-text';

const TITLES = ['Runs', 'Instructions', 'Inputs', 'Outputs', 'Settings'];
const OPTIONS = [
  { id: 'morph', name: 'Letter morph' },
  { id: 'window', name: 'Vertical exchange' },
  { id: 'tracking', name: 'Tracking settles' },
  { id: 'sweep', name: 'Soft wipe' },
  { id: 'scale', name: 'Scale into place' },
  { id: 'lateral', name: 'Horizontal exchange' },
  { id: 'focus', name: 'Into focus' },
  { id: 'centre', name: 'Centre reveal' },
  { id: 'fade', name: 'Crossfade' },
] as const;

type Option = (typeof OPTIONS)[number];
type Change = { from: number; to: number; revision: number; speed: number };
type Cue = {
  part: 'title' | 'old';
  frames: Keyframe[];
  at: number;
  length: number;
};

function cues(id: Option['id'], direction: number, tracking: string): Cue[] {
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  switch (id) {
    case 'morph':
      return [];
    case 'window':
      return [
        {
          part: 'title',
          frames: [
            { transform: 'translateY(110%)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1 },
          ],
          at: 0.18,
          length: 0.65,
        },
        {
          part: 'old',
          frames: [
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(-110%)', opacity: 0 },
          ],
          at: 0,
          length: 0.5,
        },
      ];
    case 'tracking':
      return [
        {
          part: 'title',
          frames: [
            { letterSpacing: '0.22em', opacity: 0 },
            { letterSpacing: tracking, opacity: 1 },
          ],
          at: 0,
          length: 1,
        },
      ];
    case 'sweep':
      return [
        {
          part: 'title',
          frames: [{ maskPosition: '100% 0' }, { maskPosition: '0% 0' }],
          at: 0,
          length: 1,
        },
      ];
    case 'scale':
      return [
        {
          part: 'title',
          frames: [
            { transform: 'scale(0.8)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          at: 0,
          length: 1,
        },
      ];
    case 'lateral':
      return [
        {
          part: 'title',
          frames: [
            { transform: `translateX(${direction * 24}px)`, opacity: 0 },
            { transform: 'translateX(0)', opacity: 1 },
          ],
          at: 0.2,
          length: 0.75,
        },
        {
          part: 'old',
          frames: [
            { transform: 'translateX(0)', opacity: 1 },
            { transform: `translateX(${-direction * 24}px)`, opacity: 0 },
          ],
          at: 0,
          length: 0.5,
        },
      ];
    case 'focus':
      return [
        {
          part: 'title',
          frames: [
            { filter: 'blur(5px)', opacity: 0 },
            { filter: 'blur(0)', opacity: 1 },
          ],
          at: 0,
          length: 1,
        },
      ];
    case 'centre':
      return [
        {
          part: 'title',
          frames: [
            { clipPath: 'inset(0 50%)', opacity: 0 },
            { clipPath: 'inset(0 0)', opacity: 1 },
          ],
          at: 0,
          length: 1,
        },
      ];
    case 'fade':
      return [
        { part: 'title', frames: fade, at: 0, length: 1 },
        {
          part: 'old',
          frames: [{ opacity: 1 }, { opacity: 0 }],
          at: 0,
          length: 1,
        },
      ];
  }
}

export function SectionTransitions() {
  const [change, setChange] = useState<Change>({
    from: 0,
    to: 0,
    revision: 0,
    speed: 1,
  });
  const [speed, setSpeed] = useState(1);
  const previews = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  useLayoutEffect(() => {
    // Child effects prepare the titles first; one committed frame starts all.
    const started = document.timeline.currentTime;
    for (const animation of previews.current?.getAnimations({
      subtree: true,
    }) ?? []) {
      if (
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target instanceof HTMLElement &&
        animation.effect.target.dataset.part
      )
        animation.startTime = started;
    }
  }, [change]);
  function choose(to: number) {
    setChange((previous) => ({
      from: previous.to,
      to,
      revision: previous.revision + 1,
      speed,
    }));
  }
  return (
    <div className="grid gap-8">
      <div className="section-motion-toolbar grid gap-4">
        <div
          role="group"
          aria-label="Preview section"
          className="flex flex-wrap gap-2"
        >
          {TITLES.map((title, index) => (
            <Button
              key={title}
              aria-pressed={change.to === index}
              onPress={() => choose(index)}
            >
              {title}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onPress={() => choose((change.to + 1) % TITLES.length)}>
            Next section
          </Button>
          <Button
            onPress={() =>
              setChange((previous) => ({
                ...previous,
                revision: previous.revision + 1,
                speed,
              }))
            }
            isDisabled={change.revision === 0}
          >
            Replay all
          </Button>
          <div role="group" aria-label="Playback speed" className="flex gap-1">
            {[1, 0.5, 0.25].map((value) => (
              <Button
                key={value}
                size="small"
                aria-pressed={speed === value}
                onPress={() => setSpeed(value)}
              >{`${value}×`}</Button>
            ))}
          </div>
          <p className="text-meta text-muted">
            {reduced
              ? 'Reduced motion: titles change immediately.'
              : 'Speed applies to the next replay. No automatic looping.'}
          </p>
        </div>
      </div>
      <div
        ref={previews}
        className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2"
      >
        {OPTIONS.map((option, index) => (
          <Preview
            key={option.id}
            option={option}
            index={index}
            change={change}
            speed={speed}
            reduced={reduced}
          />
        ))}
      </div>
    </div>
  );
}

function Preview({
  option,
  index,
  change,
  speed,
  reduced,
}: {
  option: Option;
  index: number;
  change: Change;
  speed: number;
  reduced: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState({
    revision: 0,
    speed: 1,
    changeRevision: 0,
  });
  const getSpeed = useEffectEvent(() =>
    replay.changeRevision === change.revision && replay.revision > 0
      ? replay.speed
      : change.speed,
  );
  const from = TITLES[change.from] ?? 'Runs';
  const to = TITLES[change.to] ?? 'Runs';
  const playbackSpeed =
    replay.changeRevision === change.revision && replay.revision > 0
      ? replay.speed
      : change.speed;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || change.revision === 0 || reduced) return;
    const styles = getComputedStyle(element);
    const duration =
      Number.parseFloat(styles.getPropertyValue('--section-motion-duration')) /
      getSpeed();
    const animations = cues(
      option.id,
      Math.sign(change.to - change.from) || 1,
      getComputedStyle(element.querySelector('[data-part="title"]')!)
        .letterSpacing,
    ).flatMap((cue) => {
      const target = element.querySelector(`[data-part="${cue.part}"]`);
      return target
        ? [
            target.animate(cue.frames, {
              duration: duration * cue.length,
              delay: duration * cue.at,
              easing: styles.getPropertyValue('--section-motion-ease').trim(),
              fill: 'backwards',
            }),
          ]
        : [];
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [change, option.id, replay, reduced]);
  const morph = option.id === 'morph';
  return (
    <section
      aria-labelledby={`motion-option-${option.id}`}
      className="grid min-w-0 content-start gap-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`motion-option-${option.id}`}
          className="text-dense font-medium"
        >
          {index + 1}. {option.name}
        </h2>
        <Button
          size="small"
          aria-label={`Replay ${option.name}`}
          isDisabled={change.revision === 0}
          onPress={() =>
            setReplay((previous) => ({
              revision: previous.revision + 1,
              speed,
              changeRevision: change.revision,
            }))
          }
        >
          Replay
        </Button>
      </div>
      <div
        ref={root}
        className="section-motion-preview ground-raised border-raised-ring rounded-control overflow-hidden border"
        data-option={option.id}
      >
        <div className="sheet-head">
          <div className="section-motion-title-window overflow-clip">
            <span
              aria-hidden="true"
              className="section-motion-size readout text-muted pr-6"
            >
              Instructions
            </span>
            <span
              data-part="old"
              aria-hidden="true"
              className="section-motion-old readout text-muted"
            >
              {from}
            </span>
            <h3
              data-part="title"
              className="section-motion-title readout text-muted"
            >
              <ReplayTitle
                key={`${change.revision}-${replay.revision}-${reduced}`}
                from={from}
                to={to}
                duration={
                  reduced || !morph ? 0 : MORPH_WORDS_MS / playbackSpeed
                }
              />
            </h3>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReplayTitle({
  from,
  to,
  duration,
}: {
  from: string;
  to: string;
  duration: number;
}) {
  const [text, setText] = useState(duration === 0 ? to : from);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setText(to));
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return duration === 0 ? to : <MorphingText text={text} duration={duration} />;
}
