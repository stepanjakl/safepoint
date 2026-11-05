import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { TooltipArrowShape } from '@/components/ui/tooltip';

const SAMPLES: readonly {
  name: string;
  note: string;
  outerLine: boolean;
  highlight: boolean;
  chosen?: boolean;
}[] = [
  {
    name: 'Now',
    note: 'What ships: the edge alone, no shadow.',
    outerLine: false,
    highlight: true,
  },
  {
    name: 'Outer line',
    note: 'A 1px line right outside the border: white in light, near-black in dark.',
    outerLine: true,
    highlight: true,
  },
  {
    name: 'Outer line, no inner highlight',
    note: 'The same line, with the lit 1px just inside each border taken away.',
    outerLine: true,
    highlight: false,
  },
  {
    name: 'Chosen',
    note: 'Now in light; the outer line without the inner highlight in dark.',
    outerLine: true,
    highlight: true,
    chosen: true,
  },
];

const LINES = [
  'Read 42 orders from the brunch inbox and grouped them by delivery window',
  'Matched 39 to existing customers; 3 need a delivery window before they can be confirmed',
  'Checked allergens against the menu and proposed two substitutions for review',
  'Totals agree with the till export, and confirmations are drafted for 39 customers',
];

/* The popover on the plain surface above the text; the tooltip on the text. */
function Backdrop({
  popover,
  tooltip,
}: {
  popover: ReactNode;
  tooltip: ReactNode;
}) {
  return (
    <div className="control-face surface-raised rounded-shell grid content-start gap-6 p-4">
      {popover}
      <div className="relative">
        <ul className="text-body text-primary grid gap-2">
          {LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {tooltip}
      </div>
    </div>
  );
}

type Edge = { outerLine: boolean; highlight: boolean; chosen?: boolean };

function PopoverBox({ outerLine, highlight, chosen }: Edge) {
  return (
    <div
      data-edge={chosen ? 'chosen' : undefined}
      data-outer-line={outerLine ? 'popover' : undefined}
      data-highlight={highlight ? undefined : 'none'}
      className="control-face surface-popover rounded-shell relative grid w-72 gap-3 p-4"
    >
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

/* The shipped tooltip, drawn static: the box and its arrow as Tooltip builds them. */
function TooltipBox({ outerLine, highlight, chosen }: Edge) {
  return (
    <div
      data-edge={chosen ? 'chosen' : undefined}
      data-outer-line={outerLine ? 'tooltip' : undefined}
      data-highlight={highlight ? undefined : 'none'}
      className="app-tooltip ground-tooltip absolute top-1/2 left-1/4 -translate-y-1/2"
    >
      <span className="font-medium">Start run</span>
      <span className="text-micro text-muted">
        Runs now, under the current instructions.
      </span>
      {outerLine && (
        <div
          className="app-tooltip-arrow outer-line-arrow absolute top-full left-1/2 flex -translate-x-1/2"
          data-placement="top"
        >
          <TooltipArrowShape />
        </div>
      )}
      <div
        className="app-tooltip-arrow absolute top-full left-1/2 flex -translate-x-1/2"
        data-placement="top"
      >
        <TooltipArrowShape />
      </div>
    </div>
  );
}

export function PopoverEdge() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {SAMPLES.map(({ name, note, outerLine, highlight, chosen }) => (
        <section
          key={name}
          className="grid content-start gap-3"
          aria-label={name}
        >
          <div className="grid gap-1">
            <h2 className="text-title font-semibold">{name}</h2>
            <p className="text-meta text-muted">{note}</p>
          </div>
          <Backdrop
            popover={
              <PopoverBox
                outerLine={outerLine}
                highlight={highlight}
                chosen={chosen}
              />
            }
            tooltip={
              <TooltipBox
                outerLine={outerLine}
                highlight={highlight}
                chosen={chosen}
              />
            }
          />
        </section>
      ))}
    </div>
  );
}
