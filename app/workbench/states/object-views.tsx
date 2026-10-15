'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  drawExtrusion,
  Extrusion,
  ISOMETRIC,
  type View,
} from '@/components/ui/extrusion';
import { LOCKUP } from '@/components/ui/state-illustration';

const PRESETS: { name: string; view: View }[] = [
  { name: 'Isometric', view: ISOMETRIC },
  {
    name: 'Isometric, turned',
    view: { yaw: 60, elevation: ISOMETRIC.elevation },
  },
  { name: 'Dimetric 2:1', view: { yaw: 0, elevation: 30 } },
  { name: 'Trimetric', view: { yaw: 20, elevation: 25 } },
  { name: 'Low', view: { yaw: 15, elevation: 12 } },
  { name: 'High', view: { yaw: 30, elevation: 62 } },
  { name: 'Plan', view: { yaw: 0, elevation: 90 } },
  { name: 'Edge-on', view: { yaw: 30, elevation: 0 } },
  {
    name: 'From below',
    view: { yaw: 0, elevation: -ISOMETRIC.elevation },
  },
  { name: 'Rolled', view: { ...ISOMETRIC, roll: -30 } },
  {
    name: 'Cavalier',
    view: { kind: 'oblique', yaw: 0, angle: 45, depth: 1 },
  },
  {
    name: 'Cabinet',
    view: { kind: 'oblique', yaw: 0, angle: 45, depth: 0.5 },
  },
  {
    name: 'Military',
    view: { kind: 'plan oblique', yaw: 45, height: 1 },
  },
  {
    name: 'Planometric',
    view: { kind: 'plan oblique', yaw: 30, height: 2 / 3 },
  },
];

const KINDS = [
  { kind: 'orthographic', label: 'Orthographic' },
  { kind: 'oblique', label: 'Oblique (front true)' },
  { kind: 'plan oblique', label: 'Plan oblique (plan true)' },
] as const;
type Kind = (typeof KINDS)[number]['kind'];

/* Every parameter at once, so switching projection keeps the others. */
type Settings = {
  kind: Kind;
  yaw: number;
  roll: number;
  elevation: number;
  angle: number;
  depth: number;
  height: number;
};
const START: Settings = {
  kind: 'orthographic',
  yaw: 0,
  roll: 0,
  elevation: ISOMETRIC.elevation,
  angle: 45,
  depth: 0.5,
  height: 1,
};

const viewOf = ({
  kind,
  yaw,
  roll,
  elevation,
  angle,
  depth,
  height,
}: Settings): View =>
  kind === 'oblique'
    ? { kind, yaw, roll, angle, depth }
    : kind === 'plan oblique'
      ? { kind, yaw, roll, height }
      : { yaw, roll, elevation };

const degrees = (n: number) => `${Number(n.toFixed(2))}°`;
const times = (n: number) => `×${Number(n.toFixed(2))}`;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/* A view's parameters, in the order its controls list them. */
const describe = (view: View) =>
  [
    degrees(view.yaw),
    view.kind === 'oblique'
      ? `${degrees(view.angle)} ${times(view.depth)}`
      : view.kind === 'plan oblique'
        ? `heights ${times(view.height)}`
        : degrees(view.elevation),
    ...(view.roll ? [degrees(view.roll)] : []),
  ].join(' · ');

/* The isometric outline as a solid, at fixed angles and on an orbit. */
export function ObjectViews() {
  const [settings, setSettings] = useState<Settings>(START);
  const [thickness, setThickness] = useState(LOCKUP.height);
  const [turntable, setTurntable] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const set = (change: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...change }));
  const solid = useMemo(() => ({ ...LOCKUP, height: thickness }), [thickness]);
  const layers = useMemo(
    () =>
      drawExtrusion(solid, viewOf(settings), turntable ? 'turntable' : 'view'),
    [solid, settings, turntable],
  );

  useEffect(() => {
    if (!spinning) return;
    let frame = requestAnimationFrame(function step() {
      setSettings((s) => ({ ...s, yaw: (s.yaw + 0.5) % 360 }));
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  return (
    <div className="grid gap-4">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
        {PRESETS.map(({ name, view: preset }) => (
          <li
            key={name}
            className="bg-surface-primary grid justify-items-center gap-3 rounded-lg p-6 text-center"
          >
            <Extrusion
              layers={drawExtrusion(LOCKUP, preset)}
              className="text-muted size-24"
            />
            <div className="grid gap-1">
              <h3 className="text-body font-medium">{name}</h3>
              <p className="text-meta text-muted">{describe(preset)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="bg-surface-primary grid gap-6 rounded-lg p-6 md:grid-cols-2">
        <div
          className="grid cursor-grab touch-none place-items-center active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
            setSpinning(false);
          }}
          onPointerMove={(e) => {
            const from = drag.current;
            if (!from) return;
            drag.current = { x: e.clientX, y: e.clientY };
            const dy = e.clientY - from.y;
            setSettings((s) => ({
              ...s,
              yaw: (((s.yaw - (e.clientX - from.x) * 0.5) % 360) + 360) % 360,
              ...(s.kind === 'oblique'
                ? { angle: clamp(s.angle - dy * 0.5, -180, 180) }
                : s.kind === 'plan oblique'
                  ? { height: clamp(s.height - dy * 0.005, 0, 2) }
                  : { elevation: clamp(s.elevation + dy * 0.3, -90, 90) }),
            }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <Extrusion layers={layers} className="text-muted size-64" />
        </div>
        <div className="grid content-start gap-4">
          <p className="text-meta text-muted">
            Drag the figure to turn it, or set the angles here.
          </p>
          <fieldset className="text-meta grid gap-1">
            <legend className="mb-1">Projection</legend>
            {KINDS.map(({ kind, label }) => (
              <label key={kind} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="projection"
                  checked={settings.kind === kind}
                  onChange={() => set({ kind })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Range
            label={`Yaw ${degrees(settings.yaw)}`}
            min={0}
            max={359}
            step={1}
            value={settings.yaw}
            onChange={(yaw) => set({ yaw })}
          />
          {settings.kind === 'oblique' ? (
            <>
              <Range
                label={`Receding angle ${degrees(settings.angle)}`}
                min={-180}
                max={180}
                step={1}
                value={settings.angle}
                onChange={(angle) => set({ angle })}
              />
              <Range
                label={`Depth ${times(settings.depth)} (cavalier ×1, cabinet ×0.5)`}
                min={0}
                max={1.5}
                step={0.05}
                value={settings.depth}
                onChange={(depth) => set({ depth })}
              />
            </>
          ) : settings.kind === 'plan oblique' ? (
            <Range
              label={`Heights ${times(settings.height)} (military ×1)`}
              min={0}
              max={2}
              step={0.05}
              value={settings.height}
              onChange={(height) => set({ height })}
            />
          ) : (
            <Range
              label={`Elevation ${degrees(settings.elevation)}`}
              min={-90}
              max={90}
              step={0.25}
              value={settings.elevation}
              onChange={(elevation) => set({ elevation })}
            />
          )}
          <Range
            label={`Roll ${degrees(settings.roll)}`}
            min={-180}
            max={180}
            step={1}
            value={settings.roll}
            onChange={(roll) => set({ roll })}
          />
          <Range
            label={`Thickness ${thickness} (the slot is ${LOCKUP.height})`}
            min={0}
            max={256}
            step={8}
            value={thickness}
            onChange={setThickness}
          />
          <label className="text-meta flex items-center gap-2">
            <input
              type="checkbox"
              checked={turntable}
              onChange={(e) => setTurntable(e.target.checked)}
            />
            Hold the scale while turning
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onPress={() => setSpinning((s) => !s)}>
              {spinning ? 'Stop' : 'Spin'}
            </Button>
            <Button
              onPress={() => {
                setSpinning(false);
                setSettings(START);
                setThickness(LOCKUP.height);
              }}
            >
              Isometric
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Range({
  label,
  onChange,
  ...input
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-meta grid gap-1">
      {label}
      <input
        type="range"
        {...input}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
