'use client';

import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
// Deep imports: Blode's barrel is the whole icon library. The two data icons
// are one drawing: the same tray, with the arrow turned in or out, so the pair
// reads as a direction rather than as two unrelated pictures.
import ArrowInbox from 'blode-icons-react/icons/arrow-inbox';
import ArrowOutOfBox from 'blode-icons-react/icons/arrow-out-of-box';
import Lab from 'blode-icons-react/icons/lab';
import { Button } from '@/components/ui/button';
import { Notch } from '@/components/ui/notch';
import { cx } from '@/lib/cx';
import type { InputDetail } from '@/lib/process/input-details';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import {
  needsAttention,
  worstFreshness,
  type SystemLink,
} from '@/lib/process/system-links';
import { useInstructions } from './instructions-store';
import { useRemovedInputs } from './inputs-store';
import { ProcessDrawer, type ProcessDrawerTab } from './process-drawer';
import { ProcessTitle } from './process-title';
import { RefineInstructions } from './refine-instructions';

/*
  The Instructions button's construction at pill size: the same lit face, the
  same icon weight and text, and no edge, so the face floats in the row rather
  than being outlined in it. The notch keeps the outlined shape; these are its
  siblings, not copies.

  Their stops are their own -- `--sp-header-button-*`, read by
  control-header-button -- so this row can be retuned without moving every
  quiet control in the interface.
*/
const DATA_BUTTON =
  'group/data header-button control-face text-primary text-dense inline-flex flex-none cursor-pointer items-center gap-2 rounded-full ps-3 font-medium whitespace-nowrap';

/*
  One face utility per button, chosen by what its list has to report. Written
  as whole class lists rather than added to the line above, because two face
  utilities on one element would be settled by the order they were emitted in
  the stylesheet rather than by the order they are written here.
*/
const FACE = {
  none: 'control-header-button data-[hovered]:control-header-button-hover data-[focus-visible]:control-header-button-hover data-[pressed]:control-header-button-hover',
  stale:
    'control-header-button-caution data-[hovered]:control-header-button-caution-hover data-[focus-visible]:control-header-button-caution-hover data-[pressed]:control-header-button-caution-hover',
  unavailable:
    'control-header-button-blocked data-[hovered]:control-header-button-blocked-hover data-[focus-visible]:control-header-button-blocked-hover data-[pressed]:control-header-button-blocked-hover',
} as const;

/*
  The count, in one colour rather than a face, stepping with the button. Its
  size and the button's end padding are derived together (`.header-button` in
  app/components.css), so with nothing after it the pill sits the same distance
  from the button's end as from its top and bottom.
*/
const COUNT =
  'value header-button-count bg-header-button-count control-wash group-data-[hovered]/data:bg-header-button-count-hover group-data-[focus-visible]/data:bg-header-button-count-hover group-data-[pressed]/data:bg-header-button-count-hover text-meta inline-grid place-items-center rounded-full px-1.5';

const STATE_DOT = {
  stale: 'bg-state-caution',
  unavailable: 'bg-state-blocked',
} as const;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/*
  What the process reads and what it may write, as two controls rather than a
  cluster of discs. The discs named systems without saying what they were; the
  buttons say it -- input files, output APIs -- and each opens its own tab.

  A condition is a dot, not a word and not a mark: whether anything needs
  looking at is all the header owes a reader, and the button's name says what
  and how many. Square and triangle stay with the review, where they mean a
  held line and a line needing attention.

  Both describe the recorded run's data. There is no live source behind the
  inputs, so there is no "next run" readiness to report.
*/
function DataButtons({
  inputs,
  outputs,
  onShow,
}: {
  inputs: SystemLink[];
  outputs: SystemLink[];
  onShow: (tab: ProcessDrawerTab) => void;
}) {
  const attention = inputs.filter(needsAttention).length;
  const worst = worstFreshness(inputs);
  const condition = worst === 'unavailable' ? 'unavailable' : 'stale';

  return (
    // Below the phone breakpoint the row cannot hold the name, two controls
    // and the notch, and the name has first claim: the buttons give way and
    // what they carry is a tab away, in the drawer the notch opens.
    <div className="flex flex-none items-center gap-2 max-sm:hidden">
      {inputs.length > 0 ? (
        <AriaButton
          onPress={() => onShow('inputs')}
          aria-label={`Inputs: ${plural(inputs.length, 'file', 'files')}${
            attention ? `, ${attention} ${condition}` : ''
          }`}
          className={cx(DATA_BUTTON, FACE[worst ?? 'none'])}
        >
          <ArrowInbox
            aria-hidden
            size={16}
            strokeWidth={1.8}
            className="flex-none -translate-y-px"
          />
          <span className="max-md:hidden">Inputs</span>
          <span className={COUNT}>{inputs.length}</span>
          {worst ? (
            <span
              aria-hidden="true"
              className={cx(
                'header-button-state-dot size-1.5 flex-none rounded-full',
                STATE_DOT[worst],
              )}
            />
          ) : null}
        </AriaButton>
      ) : null}
      <AriaButton
        onPress={() => onShow('outputs')}
        aria-label={`Outputs: ${plural(outputs.length, 'API', 'APIs')}`}
        className={cx(DATA_BUTTON, FACE.none)}
      >
        <ArrowOutOfBox
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className="flex-none -translate-y-px"
        />
        <span className="max-md:hidden">Outputs</span>
        <span className={COUNT}>{outputs.length}</span>
      </AriaButton>
    </div>
  );
}

/*
  Two cells on one row: the heading and the data buttons, then the notch the
  instructions sit in. The notch sets the row's height -- the heading cell is
  a single line with no vertical padding of its own, so it stays shorter than
  the notch at any control height -- and reaches down over the header's rule,
  so its floor is that rule.

  The rule and its sheen belong to the header, whole width, not to the
  heading cell. The notch starts wherever the button's text width puts it,
  usually on a fraction of a pixel, and a translucent sheen drawn by two
  elements meeting there double-paints that pixel into a bright dot.

  A client component because several triggers in different cells open one
  drawer, each on its own tab.
*/
export function ProcessHeader({
  process,
  inputs,
  inputDetails,
}: {
  process: ProcessSummary;
  inputs: SystemLink[];
  inputDetails?: Record<string, InputDetail>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ProcessDrawerTab>('instructions');
  // Inputs can be changed, as a preview, only where they have details to
  // show: the promotion scenario's files. Everything downstream reads the kept
  // set, so a removed input leaves the count and the list together.
  const { removed, remove, restore } = useRemovedInputs(process.id);
  // The current version, which a publish in this browser can move on.
  const { version } = useInstructions(process.id, process.instructions).current;
  const kept = inputs.filter((input) => !removed.has(input.id));
  const available = inputs.filter((input) => removed.has(input.id));
  const editable = inputDetails !== undefined;
  const show = (next: ProcessDrawerTab) => {
    setTab(next);
    setOpen(true);
  };

  return (
    <header className="border-rule-faint shadow-separator-bottom-strong grid grid-cols-[minmax(0,1fr)_auto] border-b">
      {/* Centred in the row. The notch holds the same inset above its
          controls as below them, so their centre is the row's too and the
          heading lines up with them at any control height or gap, with even
          space above and below. The controls' icons keep their own 1px
          optical lift on top of this. */}
      <div className="flex min-w-0 items-center justify-between gap-x-4 px-4 sm:px-6">
        <ProcessTitle processId={process.id} fallback={process.name} />
        <DataButtons inputs={kept} outputs={process.outputs} onShow={show} />
      </div>
      {/* Two slants sharing a seam: the first leans on both sides, the last
          keeps its far side square, parallel to the pane's side and the
          notch's gap in from it. */}
      <Notch className="-mt-control-edge -mr-control-edge -mb-control-edge">
        <Button
          slant="both"
          onPress={() => show('instructions')}
          className="group/instructions"
        >
          <Lab
            aria-hidden
            size={16}
            strokeWidth={1.8}
            className="flex-none -translate-y-px"
          />
          {/* The word goes at phone width; the flask and the version say
              enough there, and the row needs the space for the name. */}
          <span className="max-sm:hidden">Instructions</span>{' '}
          {/* 20px tall in a 42px face (see --slant-height): 11px above and
              below. The end margin leaves 13px to the slope at mid-height,
              about 12px measured square to it -- the way the notch measures
              its gaps -- so the pill reads as far from the slope as from the
              top and bottom.
              It steps to its hover fill with the face's hover stops -- hover,
              keyboard focus and press, the same three the button uses -- and
              fades on the wash's timing. */}
          <span className="value bg-value-pill text-meta control-wash group-data-[hovered]/instructions:bg-value-pill-hover group-data-[focus-visible]/instructions:bg-value-pill-hover group-data-[pressed]/instructions:bg-value-pill-hover -me-px inline-grid h-5 place-items-center rounded-full px-1.5">
            {version}
          </span>
        </Button>
        <RefineInstructions version={version} slant="left" />
      </Notch>
      <ProcessDrawer
        process={process}
        inputs={kept}
        availableInputs={available}
        inputDetails={inputDetails}
        onRemoveInput={editable ? remove : undefined}
        onAddInput={editable ? restore : undefined}
        isOpen={open}
        onOpenChange={setOpen}
        tab={tab}
        onTabChange={setTab}
      />
    </header>
  );
}
