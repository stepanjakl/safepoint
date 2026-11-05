'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';

import { Button } from '@/components/ui/button';

/* As a box-shadow, in px: the feather's width (size), offset (x, y) and
   spread; edge is the blur beside the box, falling to nothing at the feather’s
   outer edge along the falloff curve (higher keeps it tighter to the box);
   wash is 0–1. */
type Halo = {
  size: number;
  edge: number;
  falloff: number;
  x: number;
  y: number;
  spread: number;
  wash: number;
};

const DROPPED: Halo = {
  size: 32,
  edge: 12,
  falloff: 1.5,
  x: 0,
  y: 8,
  spread: -4,
  wash: 0.35,
};

const OPTIONS: readonly { name: string; note: string; halo?: Halo }[] = [
  {
    name: '1 · Close: 16px, up to 8px',
    note: 'Even all round, as a small ambient shadow would be.',
    halo: { size: 16, edge: 8, falloff: 1.5, x: 0, y: 0, spread: 0, wash: 0.3 },
  },
  {
    name: '2 · Dropped: 32px, up to 12px, 8px down, −4px spread',
    note: 'Short above and at the sides, longer below, like a soft drop shadow.',
    halo: DROPPED,
  },
  {
    name: '3 · Long drop: 48px, up to 16px, 16px down, −8px spread',
    note: 'Almost nothing above; the page falls away below the popover.',
    halo: {
      size: 48,
      edge: 16,
      falloff: 2,
      x: 0,
      y: 16,
      spread: -8,
      wash: 0.4,
    },
  },
];

const BANDS = 6;

/* Band 0 is outermost. Each fades in over its step and holds until the next
   is fully in, so what is seen at any point is about one band's blur. The
   outermost also fades in from nothing, so the blur reaches zero at the edge. */
function bandBlurs({ edge, falloff }: Halo) {
  return Array.from(
    { length: BANDS },
    (_, band) => edge * ((band + 1) / BANDS) ** falloff,
  );
}

function HaloLayers({ halo }: { halo: Halo }) {
  const step = halo.size / BANDS;
  return (
    <span
      aria-hidden
      className="popover-halo"
      style={
        {
          '--halo-size': `${halo.size}px`,
          '--halo-x': `${halo.x}px`,
          '--halo-y': `${halo.y}px`,
          '--halo-spread': `${halo.spread}px`,
        } as CSSProperties
      }
    >
      {bandBlurs(halo).map((blur, band) => {
        const core = band === BANDS - 1;
        return (
          <span
            key={band}
            className="popover-halo-blur"
            data-halo-core={core ? '' : undefined}
            style={
              {
                '--halo-from': `${band * step}px`,
                '--halo-to': `${(band + 1) * step}px`,
                '--halo-cut': core
                  ? 'var(--halo-corner)'
                  : `${(band + 2) * step}px`,
                '--halo-blur': `${blur}px`,
              } as CSSProperties
            }
          />
        );
      })}
      <span
        className="popover-halo-wash"
        data-halo-core=""
        style={
          {
            '--halo-from': '0px',
            '--halo-to': `${halo.size}px`,
            '--halo-cut': 'var(--halo-corner)',
            '--halo-wash': halo.wash,
          } as CSSProperties
        }
      />
    </span>
  );
}

const LINES = [
  'Read 42 orders from the brunch inbox and grouped them by delivery window',
  'Matched 39 to existing customers; 3 need a delivery window before they can be confirmed',
  'Checked allergens against the menu and proposed two substitutions for review',
  'Totals agree with the till export, and confirmations are drafted for 39 customers',
];

/* Text on the left half, an empty surface on the right; the popover sits across both. */
function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="control-face surface-raised rounded-shell relative h-64 overflow-hidden">
      <ul className="text-body text-primary grid w-1/2 content-start gap-2 p-4">
        {LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function Face() {
  return (
    <div className="grid gap-3 p-4">
      <p className="text-dense font-medium">Schedule</p>
      <p className="text-meta text-muted leading-normal">
        Runs every weekday at 07:30 and waits for approval before sending.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="small">Cancel</Button>
        <Button size="small" variant="primary">
          Save
        </Button>
      </div>
    </div>
  );
}

type OuterLine = 'tight' | 'soft' | 'gap';

const EDGES: readonly { name: string; note: string; line?: OuterLine }[] = [
  { name: 'Now', note: 'What ships: the edge alone, no shadow and no blur.' },
  {
    name: 'A · Outer line, dark',
    note: 'A 1px line right outside the border, a clear step darker than it.',
    line: 'tight',
  },
  {
    name: 'B · Outer line, soft',
    note: 'The same line, a step lighter: separation without a drawn outline.',
    line: 'soft',
  },
  {
    name: 'C · Outer line with a gap',
    note: 'The dark line 2px out, the page showing between: a double edge.',
    line: 'gap',
  },
];

function EdgeOption({ name, note, line }: (typeof EDGES)[number]) {
  return (
    <section className="grid content-start gap-3" aria-label={name}>
      <div className="grid gap-1">
        <h3 className="text-dense font-semibold">{name}</h3>
        <p className="text-meta text-muted">{note}</p>
      </div>
      <Backdrop>
        <div className="absolute top-1/2 left-1/3 w-72 -translate-y-1/2">
          <div
            data-outer-line={line}
            className="control-face surface-popover rounded-shell relative"
          >
            <Face />
          </div>
        </div>
      </Backdrop>
    </section>
  );
}

function Option({ name, note, halo }: (typeof OPTIONS)[number]) {
  return (
    <section className="grid gap-3" aria-label={name}>
      <div className="grid gap-1">
        <h2 className="text-title font-semibold">{name}</h2>
        <p className="text-meta text-muted max-w-3xl">{note}</p>
      </div>
      <Backdrop>
        <div className="absolute top-1/2 left-1/3 isolate w-72 -translate-y-1/2">
          {halo && <HaloLayers halo={halo} />}
          <div className="control-face surface-popover rounded-shell">
            <Face />
          </div>
        </div>
      </Backdrop>
    </section>
  );
}

function LivePopover({
  motion,
  halo,
}: {
  motion: 'fade' | 'scale';
  halo: Halo;
}) {
  return (
    <DialogTrigger>
      <Button size="medium">
        {motion === 'fade' ? 'Fade and scale (as now)' : 'Scale only'}
      </Button>
      <Popover
        data-popover-halo-motion={motion === 'scale' ? 'scale' : undefined}
        placement="bottom start"
        offset={6}
        className={[motion === 'fade' && 'popover-motion', 'w-72']
          .filter(Boolean)
          .join(' ')}
      >
        <HaloLayers halo={halo} />
        <Dialog className="control-face surface-popover rounded-shell outline-none">
          <Heading slot="title" className="sr-only">
            Schedule
          </Heading>
          <Face />
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

const SLIDERS: readonly {
  key: keyof Halo;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: 'size', label: 'Feather', min: 8, max: 64, step: 2, unit: 'px' },
  {
    key: 'edge',
    label: 'Blur beside the box',
    min: 0.5,
    max: 32,
    step: 0.5,
    unit: 'px',
  },
  { key: 'falloff', label: 'Falloff', min: 0.5, max: 3, step: 0.25, unit: '' },
  { key: 'x', label: 'Offset x', min: -24, max: 24, step: 1, unit: 'px' },
  { key: 'y', label: 'Offset y', min: -24, max: 24, step: 1, unit: 'px' },
  { key: 'spread', label: 'Spread', min: -16, max: 16, step: 1, unit: 'px' },
  { key: 'wash', label: 'Wash', min: 0, max: 1, step: 0.05, unit: '' },
];

function Tuner({
  halo,
  onChange,
}: {
  halo: Halo;
  onChange: (halo: Halo) => void;
}) {
  const blurs = bandBlurs(halo);
  return (
    <section className="grid gap-3" aria-label="Tune">
      <div className="grid gap-1">
        <h2 className="text-title font-semibold">Tune</h2>
        <p className="text-meta text-muted max-w-3xl">
          Set like a box-shadow: the feather is how far the blur reaches, offset
          and spread move and resize it, so a downward offset leaves it short
          above and long below. The blur falls to nothing at the feather’s outer
          edge. The live popovers below use these values.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {SLIDERS.map(({ key, label, min, max, step, unit }) => (
          <label key={key} className="grid gap-1">
            <span className="text-meta text-muted">
              {label}:{' '}
              <span className="text-primary tabular-nums">
                {halo[key]}
                {unit}
              </span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={halo[key]}
              onChange={(event) =>
                onChange({ ...halo, [key]: Number(event.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <p className="text-micro text-muted tabular-nums">
        Bands, outer to edge:{' '}
        {blurs.map((blur) => `${blur.toFixed(1)}px`).join(' · ')}
      </p>
      <Backdrop>
        <div className="absolute top-1/2 left-1/3 isolate w-72 -translate-y-1/2">
          <HaloLayers halo={halo} />
          <div className="control-face surface-popover rounded-shell">
            <Face />
          </div>
        </div>
      </Backdrop>
    </section>
  );
}

export function PopoverHalo() {
  const [tuned, setTuned] = useState<Halo>(DROPPED);
  return (
    <div className="grid gap-10">
      <Tuner halo={tuned} onChange={setTuned} />
      <section className="grid gap-3" aria-label="Edge only">
        <div className="grid gap-1">
          <h2 className="text-title font-semibold">
            Now, beside an outer line
          </h2>
          <p className="text-meta text-muted max-w-3xl">
            No blur: the popover set apart by its edge alone. Each line is an
            opaque ramp step, darker than the page in both themes.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {EDGES.map((edge) => (
            <EdgeOption key={edge.name} {...edge} />
          ))}
        </div>
      </section>
      {OPTIONS.map((option) => (
        <Option key={option.name} {...option} />
      ))}
      <section className="grid gap-3" aria-label="Live popovers">
        <div className="grid gap-1">
          <h2 className="text-title font-semibold">
            Live, at the tuned values
          </h2>
          <p className="text-meta text-muted max-w-3xl">
            Either motion: the halo fades in once the popover has landed, and
            goes at once when it closes.
          </p>
        </div>
        <div className="flex gap-2">
          <LivePopover motion="fade" halo={tuned} />
          <LivePopover motion="scale" halo={tuned} />
        </div>
        <Backdrop>{null}</Backdrop>
      </section>
    </div>
  );
}
