import { Button } from '@/components/ui/button';
import { TooltipArrowShape } from '@/components/ui/tooltip';

/*
  A popover's and a tooltip's edge five ways at 2x: as they shipped, with the
  soft rows inside drawn opaque as the pane's are, and with the dark outline
  outside them at whole device pixels or with a soft row of its own. The app
  draws the fifth; the others
  are scoped to this page (floating-edges.css). The outline shows only in
  dark.
*/

const OPTIONS = [
  {
    id: 'now',
    title: 'Before',
    note: 'As they shipped until November 2026. Each 0.75px ring and sheen is a solid device pixel and a translucent one; so is the dark outline outside, over whatever lies behind.',
  },
  {
    id: 'opaque',
    title: 'Opaque inside',
    note: 'The ring’s soft row mixed with the sheen, the sheen’s with the face, as the pane’s edge is. The outline stays translucent.',
  },
  {
    id: 'half',
    title: 'Opaque inside, outline 0.5px',
    note: 'The outline one solid device pixel, with no soft one: it no longer depends on what lies behind.',
  },
  {
    id: 'whole',
    title: 'Opaque inside, outline 1px',
    note: 'The outline two solid device pixels.',
  },
  {
    id: 'rim',
    title: 'Opaque inside, outline with a soft row (the app)',
    note: 'Four lines: the ring and its soft row, then the dark outline and a fainter line mixed from it, as the soft row is from the ring. Each one solid device pixel; the outline’s lines show in dark only.',
  },
] as const;

const LINES = [
  'Read 42 orders from the brunch inbox and grouped them by delivery window',
  'Matched 39 to existing customers; 3 need a delivery window',
  'Checked allergens against the menu and proposed two substitutions',
  'Totals agree with the till export',
];

function Specimen({ option }: { option: (typeof OPTIONS)[number]['id'] }) {
  return (
    <div
      className="floating-edges-backdrop control-face surface-raised rounded-shell"
      data-floating={option}
    >
      <div className="floating-edges-popover control-face surface-popover rounded-shell grid gap-3 p-4">
        <p className="text-dense font-medium">Schedule</p>
        <p className="text-meta text-muted leading-normal">
          Runs every weekday at 07:30 and waits for approval before sending.
        </p>
        <div className="flex justify-end gap-2">
          <Button size="small" excludeFromTabOrder>
            Cancel
          </Button>
          <Button size="small" variant="primary" excludeFromTabOrder>
            Save
          </Button>
        </div>
      </div>
      <div className="relative">
        <ul className="text-body text-primary grid gap-2">
          {LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="floating-edges-tooltip app-tooltip ground-tooltip">
          <span className="font-medium">Start run</span>
          <span className="text-micro text-muted">
            Runs now, under the current instructions.
          </span>
          <div
            className="app-tooltip-arrow floating-edges-arrow flex"
            data-placement="top"
          >
            <TooltipArrowShape />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FloatingEdgesPage() {
  return (
    <main id="main" className="floating-edges bg-canvas min-h-dvh">
      <h1 className="text-title font-semibold">Floating edges</h1>
      <p className="floating-edges-intro text-muted">
        A popover’s and a tooltip’s edge four ways. Inside, the first two look
        the same: opaque only changes how the soft rows are drawn. The outline
        outside shows in dark, over the page behind it; compare it over the
        text.
      </p>
      <div className="floating-edges-options">
        {OPTIONS.map((option) => (
          <figure key={option.id} className="floating-edges-option">
            <figcaption>
              <span className="font-semibold">{option.title}</span>
              <span className="text-muted block">{option.note}</span>
            </figcaption>
            <div aria-hidden="true">
              <Specimen option={option.id} />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
