'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { KeyHint } from '@/components/ui/key-hint';
import { Pill } from '@/components/ui/pill';

/* By button size: small is 28px high, medium 32px, large 36px. */
type Radii = { small: string; medium: string; large: string };

const even = (radius: string): Radii => ({
  small: radius,
  medium: radius,
  large: radius,
});

const OPTIONS: readonly { name: string; note: string; radii?: Radii }[] = [
  {
    name: 'Now',
    note: 'What ships: 6 / 8 / 10px for small, medium and large, one step apart, all on radii the tokens already have.',
  },
  {
    name: '1 · 8px',
    note: 'The lower bound here, and the corner of the icon squares.',
    radii: even('var(--radius-icon)'),
  },
  {
    name: '2 · 10px',
    note: 'The corner of panes, cards and dialogs, so a button echoes what holds it.',
    radii: even('var(--radius-shell)'),
  },
  {
    name: '3 · 12px',
    note: 'Clearly soft, with a short straight side left at the live view’s 32px height. Needs a new token.',
    radii: even('0.75rem'),
  },
  {
    name: '4 · 14px',
    note: 'Nearly round at 32px, and exactly round on a 28px table-row button. Needs a new token.',
    radii: even('0.875rem'),
  },
  {
    name: '5 · By size: 8 / 10 / 12px',
    note: 'About a third of the height at every size, so all three read as one shape. The 12px needs a new token.',
    radii: {
      small: 'var(--radius-icon)',
      medium: 'var(--radius-shell)',
      large: '0.75rem',
    },
  },
  {
    name: '6 · By size: 10 / 12 / 14px',
    note: 'The same idea, softer: a little over a third of the height. The 12px and 14px need new tokens.',
    radii: {
      small: 'var(--radius-shell)',
      medium: '0.75rem',
      large: '0.875rem',
    },
  },
];

const TABS: FilterTab[] = [
  { key: 'all', short: 'All', label: 'All items', count: 24 },
  { key: 'blocked', short: 'Blocked', label: 'Blocked', count: 3, severity: 0 },
  { key: 'ready', short: 'Ready', label: 'Ready', count: 14, severity: 3 },
];

const LABEL = 'text-micro text-muted';

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="grid content-start gap-1.5">
      <figcaption className={LABEL}>{label}</figcaption>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </figure>
  );
}

function Tabs() {
  const [selected, setSelected] = useState('all');
  return <FilterTabs tabs={TABS} selected={selected} onChange={setSelected} />;
}

function Option({ name, note, radii: option }: (typeof OPTIONS)[number]) {
  // Around the buttons alone, so the tabs and the status keep their own shape.
  const radii = option
    ? ({
        'data-button-rounding': '',
        style: {
          '--option-radius-small': option.small,
          '--option-radius-medium': option.medium,
          '--option-radius-large': option.large,
        } as CSSProperties,
      } as const)
    : {};
  return (
    <section className="grid gap-3" aria-label={name}>
      <div className="grid gap-1">
        <h2 className="text-title font-semibold">{name}</h2>
        <p className="text-meta text-muted max-w-3xl">{note}</p>
      </div>
      <div className="control-face surface-raised rounded-shell flex flex-wrap items-start gap-x-8 gap-y-4 p-4">
        <Sample label="All three sizes: 28, 32, 36px">
          <div {...radii} className="flex items-center gap-2">
            <Button variant="primary" size="small">
              Start run
            </Button>
            <Button variant="primary" size="medium">
              Start run
            </Button>
            <Button variant="primary">Start run</Button>
            <Button size="small">Cancel</Button>
            <Button size="medium">Cancel</Button>
            <Button>Cancel</Button>
          </div>
        </Sample>
        <Sample label="Live view">
          <div {...radii} className="flex gap-2">
            <Button variant="primary" size="medium">
              Start run
              <KeyHint
                keys={['mod', 'enter']}
                on="button-primary"
                className="-me-1 pointer-coarse:hidden"
              />
            </Button>
            <Button size="medium">Review instructions</Button>
          </div>
        </Sample>
        <Sample label="Beside tabs and a status">
          <Tabs />
          <Pill tone="ready">Ready</Pill>
          <div {...radii}>
            <Button size="medium">Open</Button>
          </div>
        </Sample>
        <Sample label="In a table row">
          <div {...radii} className="flex gap-2">
            <Button size="small">Change</Button>
            <Button variant="primary" size="small">
              Accept
            </Button>
          </div>
        </Sample>
        <Sample label="In a popover">
          <div {...radii} className="flex gap-2">
            <Button>Cancel</Button>
            <Button variant="primary">Start run</Button>
          </div>
        </Sample>
      </div>
    </section>
  );
}

export function ButtonRounding() {
  return (
    <>
      {OPTIONS.map((option) => (
        <Option key={option.name} {...option} />
      ))}
    </>
  );
}
