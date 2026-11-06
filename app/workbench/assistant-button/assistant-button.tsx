'use client';

import { useState } from 'react';
// Deep import: Blode's barrel is the whole icon library.
import Robot from 'blode-icons-react/icons/cute-robot';

import { Button } from '@/components/ui/button';
import { Notch } from '@/components/ui/notch';

const OPTIONS: readonly { id: string; name: string; note: string }[] = [
  {
    id: 'now',
    name: 'Now',
    note: 'What ships: open and closed look the same, so the panel’s own heading and close button carry the state.',
  },
  {
    id: 'spectrum',
    name: '1 · Spectrum edge',
    note: 'Neutral face; while open, the edge turns slowly through pink, violet and cyan. Every variation of 1 holds still under reduced motion.',
  },
  {
    id: 'spectrum-tint',
    name: '1a · Spectrum edge, still tint',
    note: 'The same edge over a still wash from violet to pink, laid over the button’s own shaded face.',
  },
  {
    id: 'spectrum-drift',
    name: '1b · Spectrum edge, drifting tint',
    note: 'A wash of pink, violet and cyan across the face, turning with the edge.',
  },
  {
    id: 'spectrum-swirl',
    name: '1c · Spectrum edge, swirling face',
    note: 'The wash is the edge’s own colour wheel, so face and edge turn as one.',
  },
  {
    id: 'fill',
    name: '6 · Spectrum fill',
    note: 'Filled like 2 and 3, across all three hues: pink, violet and a deeper cyan, white ink.',
  },
  {
    id: 'fill-step',
    name: '6b · Spectrum fill, shaded by step',
    note: 'Lighter at the top, as the plain face is: each hue’s Radix step 9 above its step 10 in light, the other way round in dark, where the steps lighten upwards.',
  },
  {
    id: 'fill-lightness',
    name: '6c · Spectrum fill, shaded by lightness',
    note: 'The same shading made by lifting the top and lowering the bottom of every hue by one fixed amount of lightness.',
  },
  {
    id: 'fill-even',
    name: '6d · Spectrum fill, even perception',
    note: 'All three hues set to one lightness, top and bottom, so none reads brighter than the others across the face.',
  },
  {
    id: 'gradient',
    name: '2 · Pink to violet face',
    note: 'A filled face, pink at the top to violet at the bottom, white ink. The loudest.',
  },
  {
    id: 'violet',
    name: '3 · Solid violet',
    note: 'One hue, filled like the primary button. Closest to iris, so it may read as “needs review”.',
  },
  {
    id: 'tint',
    name: '4 · Violet tint',
    note: 'A pale violet-to-pink face with a violet edge and violet ink: says “on” without filling.',
  },
  {
    id: 'glow',
    name: '5 · Violet edge',
    note: 'Neutral face; only the edge and the icon turn violet. The quietest.',
  },
];

export function AssistantButtonOptions() {
  return (
    <div className="grid gap-8">
      {OPTIONS.map((option) => (
        <section key={option.id} className="grid gap-3">
          <div className="grid gap-0.5">
            <h2 className="text-title font-medium">{option.name}</h2>
            <p className="text-meta text-muted max-w-3xl">{option.note}</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(22rem,1fr))] gap-4">
            <Sample option={option.id} initiallyOpen={false} />
            <Sample option={option.id} initiallyOpen />
          </div>
        </section>
      ))}
    </div>
  );
}

/* The pane and header as the shell draws them (app-shell.tsx,
   process-header.tsx), cut to the header row and a little of the sheet. */
function Sample({
  option,
  initiallyOpen,
}: {
  option: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="grid gap-1.5">
      <p className="readout text-muted">{open ? 'Open' : 'Closed'}</p>
      <div className="ground-raised rounded-shell relative isolate min-w-0 overflow-clip rounded-tr-none">
        <div
          aria-hidden="true"
          className="control-face surface-raised rounded-shell pointer-events-none absolute inset-0 -z-10"
        />
        <div className="p-pane-inset">
          <header className="process-header -mx-control-highlight px-control-highlight relative z-10 grid grid-cols-[minmax(0,1fr)_auto] border-b">
            <div className="-mt-pane-inset -mb-control-edge text-title flex min-w-0 items-center px-4 [font-weight:550]">
              Promotion release
            </div>
            <Notch className="-mt-pane-inset -mr-pane-inset -mb-control-edge">
              <Button
                slant="left"
                aria-label="Assistant"
                aria-expanded={open}
                onPress={() => setOpen((value) => !value)}
                data-option={option}
                data-open={open || undefined}
                className="assistant-option group/assistant px-5"
              >
                <Robot
                  aria-hidden
                  size={16}
                  strokeWidth={1.8}
                  className="assistant-option-icon text-muted group-interact/assistant:text-primary flex-none -translate-y-px transition-colors duration-(--duration-state) ease-out"
                />
                <span>Assistant</span>
              </Button>
            </Notch>
          </header>
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
