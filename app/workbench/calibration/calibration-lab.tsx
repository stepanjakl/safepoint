'use client';

import Color from 'colorjs.io';
import { useEffect, useRef, useState } from 'react';

import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import {
  lightnessModels,
  type LightnessModels,
} from '@/scripts/colour-theme/perceptual/metrics';

const TABS: FilterTab[] = [
  { key: 'all', short: 'All', label: 'All', count: 24 },
  { key: 'blocked', short: 'Blocked', label: 'Blocked', count: 3, severity: 0 },
  {
    key: 'decision',
    short: 'Decision',
    label: 'Decision',
    count: 5,
    severity: 1,
  },
  {
    key: 'deferred',
    short: 'Deferred',
    label: 'Deferred',
    count: 2,
    severity: 2,
  },
  { key: 'ready', short: 'Ready', label: 'Ready', count: 14, severity: 3 },
];
const TONES = ['blocked', 'decision', 'ready'];
const STEP = 0.0224; // one ramp step's worth of OKLab lightness
const SURFACES = {
  canvas: 'bg-canvas',
  primary: 'control-face surface-raised',
  floating: 'control-face surface-floating',
} as const;
type Surface = keyof typeof SURFACES;
type Part = 'rest-chip' | 'pill-top' | 'pill-bottom';
const PARTS: Part[] = ['rest-chip', 'pill-top', 'pill-bottom'];

/* Machado et al. (2009), severity 1, as an SVG filter for the human view. */
const CVD: Record<string, string> = {
  protanopia:
    '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia:
    '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.01182 0.04294 0.968881 0 0  0 0 0 1 0',
  tritanopia:
    '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.3039 0 0  0 0 0 1 0',
};

const FUNCTION = /(?:rgba?|color|oklab|oklch|lab|lch)\([^)]*\)/g;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

type Colours = Record<Part, Record<string, string>>;

export function CalibrationLab() {
  const [surface, setSurface] = useState<Surface>('canvas');
  const [part, setPart] = useState<Part>('rest-chip');
  const [steps, setSteps] = useState(0);
  const [view, setView] = useState('normal');
  const [flicker, setFlicker] = useState(false);
  const [blur, setBlur] = useState(false);
  const [recorded, setRecorded] = useState<number[]>([]);
  const [colours, setColours] = useState<Colours | null>(null);
  const [phase, setPhase] = useState(0);
  const probe = useRef<HTMLDivElement>(null);

  /* The real parts, read from real strips in this surface. */
  useEffect(() => {
    const read = () => {
      const root = probe.current;
      if (!root) return;
      const next: Colours = {
        'rest-chip': {},
        'pill-top': {},
        'pill-bottom': {},
      };
      const resting = root.querySelector('[data-pick="all"]');
      for (const tab of TABS) {
        const chip = resting?.querySelector(
          `[data-review-filter="${tab.key}"] .review-tab-count`,
        );
        if (chip)
          next['rest-chip'][tab.key] = getComputedStyle(chip).backgroundColor;
        const strip = root.querySelector(
          `[data-pick="${tab.key}"] .review-tab-indicator`,
        );
        const [top, bottom] =
          (strip ? getComputedStyle(strip).backgroundImage : '').match(
            FUNCTION,
          ) ?? [];
        if (top && bottom) {
          next['pill-top'][tab.key] = top;
          next['pill-bottom'][tab.key] = bottom;
        }
      }
      setColours(next);
    };
    const frame = requestAnimationFrame(read);
    const interval = window.setInterval(read, 800);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [surface]);

  useEffect(() => {
    if (!flicker) return;
    const interval = window.setInterval(() => setPhase((p) => 1 - p), 125);
    return () => window.clearInterval(interval);
  }, [flicker]);

  const nudged = (colour: string) =>
    new Color(colour)
      .to('oklch')
      .set('l', (l) => (l ?? 0) + steps * STEP)
      .toString({ format: 'oklch' });

  const set = colours?.[part];
  const tones = set ? TONES.map((key) => set[key]).filter(Boolean) : [];
  const neutral = set?.deferred;
  const models = (colour: string): LightnessModels => lightnessModels(colour);
  const gap = (model: keyof LightnessModels) =>
    neutral && tones.length === TONES.length
      ? models(nudged(neutral))[model] -
        tones.reduce((sum, c) => sum + models(c!)[model], 0) / tones.length
      : NaN;

  const filter = [
    view === 'greyscale' ? 'grayscale(1)' : view in CVD ? 'url(#cvd)' : '',
    blur ? 'blur(5px)' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="grid gap-6">
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id="cvd" colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={CVD[view] ?? CVD.deuteranopia} />
        </filter>
      </svg>

      <div className="text-meta flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="grid gap-1">
          Surface
          <select
            className="field px-2 py-1"
            value={surface}
            onChange={(e) => setSurface(e.target.value as Surface)}
          >
            {Object.keys(SURFACES).map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          Part
          <select
            className="field px-2 py-1"
            value={part}
            onChange={(e) => setPart(e.target.value as Part)}
          >
            {PARTS.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          View
          <select
            className="field px-2 py-1"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {['normal', 'greyscale', ...Object.keys(CVD)].map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={blur}
            onChange={(e) => setBlur(e.target.checked)}
          />{' '}
          Blur
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={flicker}
            onChange={(e) => setFlicker(e.target.checked)}
          />{' '}
          Flicker (8 Hz)
        </label>
      </div>

      <label className="text-meta grid max-w-xl gap-1">
        Neutral nudge: {steps >= 0 ? '+' : ''}
        {steps.toFixed(2)} ramp steps (a step is about 0.022 OKLab lightness;
        positive is lighter)
        <input
          type="range"
          min={-4}
          max={4}
          step={0.25}
          value={steps}
          onChange={(e) => setSteps(Number(e.target.value))}
        />
      </label>

      <div className={`${SURFACES[surface]} rounded-shell grid gap-4 p-6`}>
        <div className="grid gap-4" style={{ filter: filter || undefined }}>
          {TONES.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[6rem_1fr] items-center gap-3"
            >
              <span className="text-meta text-muted">{key}</span>
              <div className="grid h-14 grid-cols-2">
                <div style={{ background: set?.[key] }} />
                <div
                  style={{ background: neutral ? nudged(neutral) : undefined }}
                />
                {flicker ? (
                  <div
                    className="col-span-2 row-start-1 h-14"
                    style={{
                      background: phase
                        ? set?.[key]
                        : neutral
                          ? nudged(neutral)
                          : undefined,
                    }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {/* The real strips the colours are read from. */}
        <div
          ref={probe}
          aria-hidden="true"
          className="pointer-events-none grid h-0 gap-2 overflow-hidden opacity-0"
        >
          {TABS.map((tab) => (
            <div key={tab.key} data-pick={tab.key}>
              <FilterTabs tabs={TABS} selected={tab.key} onChange={() => {}} />
            </div>
          ))}
        </div>
      </div>

      <section className="text-meta grid max-w-3xl gap-2">
        <h2 className="text-title font-semibold">
          What the models say about this setting
        </h2>
        <p className="text-muted">
          Neutral minus the mean of the tones, per model; 0 is equal, positive
          means the neutral is lighter. Only H-K lightness knows that saturated
          colours look brighter than greys.
        </p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6">
          {(
            [
              'oklab',
              'cieLstar',
              'cam16J',
              'hellwigJ',
              'hellwigJHK',
              'helmlab',
            ] as const
          ).map((model) => (
            <div key={model}>
              <div className="text-muted">{model}</div>
              <div className="value">
                {Number.isNaN(gap(model))
                  ? '-'
                  : `${gap(model) >= 0 ? '+' : ''}${gap(model).toFixed(1)}`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="text-meta grid max-w-3xl gap-2">
        <h2 className="text-title font-semibold">Record</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="field px-3 py-1"
            onClick={() => setRecorded((r) => [...r, steps])}
          >
            These look equally light
          </button>
          <button
            type="button"
            className="field px-3 py-1"
            onClick={() => setRecorded([])}
          >
            Clear
          </button>
          <span className="text-muted">{recorded.length} recorded</span>
        </div>
        {recorded.length ? (
          <pre className="bg-surface-inset rounded-control value p-3">
            {`${surface} ${part}: median ${median(recorded).toFixed(2)} steps, spread ${(Math.max(...recorded) - Math.min(...recorded)).toFixed(2)} (n=${recorded.length})\nH-K gap at the median: ${(() => {
              const at =
                neutral && tones.length === TONES.length
                  ? models(
                      new Color(neutral)
                        .to('oklch')
                        .set('l', (l) => (l ?? 0) + median(recorded) * STEP)
                        .toString({ format: 'oklch' }),
                    ).hellwigJHK -
                    tones.reduce((sum, c) => sum + models(c!).hellwigJHK, 0) /
                      tones.length
                  : NaN;
              return Number.isNaN(at)
                ? '-'
                : `${at >= 0 ? '+' : ''}${at.toFixed(1)} J`;
            })()}`}
          </pre>
        ) : null}
        <p className="text-muted">
          Record at least three settings, from a start above and a start below
          the match, on the display you design on. A large spread means the pair
          is not distinguishable: keep the models&rsquo; value. Then move the
          neutral step in components/ui/filter-tabs.css by the median and record
          the accepted gap in PERCEPTUAL_OFFSETS.
        </p>
      </section>
    </div>
  );
}
