'use client';

import { styleDebug } from '@/lib/style-debug';
import { Button as AriaButton } from 'react-aria-components';
// Deep imports: Blode's barrel is the whole icon library. The two data icons
// are one drawing: the same tray, with the arrow turned in or out, so the pair
// reads as a direction rather than as two unrelated pictures.
import ArrowInbox from 'blode-icons-react/icons/arrow-inbox';
import ArrowOutOfBox from 'blode-icons-react/icons/arrow-out-of-box';
import History from 'blode-icons-react/icons/history';
import Lab from 'blode-icons-react/icons/lab';
import SettingsGear from 'blode-icons-react/icons/settings-gear-1';
import { Notch } from '@/components/ui/notch';
import { cx } from '@/lib/cx';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import {
  needsAttention,
  worstFreshness,
  type SystemLink,
} from '@/lib/process/system-links';
import { OverlayDemo } from './overlay-demo';
import type { ProcessTab } from './process-tab-store';
import { ProcessTitle } from './process-title';
import { Assistant } from './assistant';

/*
  The process's own controls, as one object rather than five. Each keeps the
  data button's face, while the group only holds their spacing. Whichever tab
  the sheet is showing is the darker one, so the row says where you already
  are.
*/
const MENU = 'flex flex-none items-center gap-1 rounded-full p-1 max-sm:hidden';

/*
  No ink here: which of the three steps an item is written in belongs with the
  face it wears, so that one element never carries two text colours and the
  order the stylesheet happened to emit them in decides nothing.
*/
const ITEM =
  'group/data header-button control-face text-dense inline-flex flex-none cursor-pointer items-center gap-2 rounded-full ps-3 font-medium whitespace-nowrap';

/*
  One face utility per item, chosen by what it has to report and whether its
  tab is showing. Written as whole class lists rather than added to the line
  above, because two face utilities on one element would be settled by the
  order the stylesheet emitted them, not by the order they are written here.

  Selected outranks a condition -- the open tab is where the reader is, and the
  dot still says the list has something in it -- and it takes no hover step of
  its own: hover says "this can be pressed", which an item you are already
  reading has nothing to answer.
*/
const FACE = {
  none: 'control-header-button text-header-ink data-[hovered]:control-header-button-hover data-[hovered]:text-header-ink-hover data-[focus-visible]:control-header-button-hover data-[focus-visible]:text-header-ink-hover data-[pressed]:control-header-button-hover data-[pressed]:text-header-ink-hover',
  stale:
    'control-header-button-caution text-header-ink data-[hovered]:control-header-button-caution-hover data-[hovered]:text-header-ink-hover data-[focus-visible]:control-header-button-caution-hover data-[focus-visible]:text-header-ink-hover data-[pressed]:control-header-button-caution-hover data-[pressed]:text-header-ink-hover',
  unavailable:
    'control-header-button-blocked text-header-ink data-[hovered]:control-header-button-blocked-hover data-[hovered]:text-header-ink-hover data-[focus-visible]:control-header-button-blocked-hover data-[focus-visible]:text-header-ink-hover data-[pressed]:control-header-button-blocked-hover data-[pressed]:text-header-ink-hover',
  selected: 'control-header-button-selected text-header-ink-selected',
} as const;

/*
  The count, in one colour rather than a face. Its size and the item's end
  padding are derived together (`.header-button` in app/components.css), so
  with nothing after it the pill sits the same distance from the item's end as
  from its top and bottom.
*/
const COUNT =
  'value header-button-count bg-header-button-count control-wash group-data-[hovered]/data:bg-header-button-count-hover group-data-[focus-visible]/data:bg-header-button-count-hover group-data-[pressed]/data:bg-header-button-count-hover text-meta inline-grid place-items-center rounded-full px-1.5';

/*
  The same item with nothing to say. Settings is reached a few times in a
  process's life, where the others are read every run, so it drops the word
  rather than claiming the same width; its name is its accessible name. Square,
  so its icon sits the same distance from all four edges: the derived end
  padding the labelled items use is exactly what it must not have.
*/
const ICON_ITEM =
  'group/data header-button control-face inline-grid aspect-square flex-none cursor-pointer place-items-center rounded-full ps-0 pe-0';

const ICON = {
  none: 'text-header-icon transition-colors duration-(--duration-state) ease-out group-data-[hovered]/data:text-header-icon-hover group-data-[focus-visible]/data:text-header-icon-hover group-data-[pressed]/data:text-header-icon-hover',
  selected:
    'text-header-icon-selected transition-colors duration-(--duration-state) ease-out',
} as const;

/*
  Not the bare state colour. The face under the dot is mixed from that same
  colour, so at the bare token the mark and its ground are one colour at two
  strengths -- see --sp-header-button-dot-caution.
*/
const STATE_DOT = {
  stale: 'bg-header-button-dot-caution',
  unavailable: 'bg-header-button-dot-blocked',
} as const;

// The word goes before the row runs out of it.
const LABEL = 'max-lg:hidden';

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/*
  The run, what the process is told to do, what it reads, what it may write,
  and how it is set up: five views of one process, and the menu that chooses
  between them. The run comes first because it is what the page is for.

  A condition is a dot, not a word and not a mark: whether anything needs
  looking at is all the header owes a reader, and the item's name says what and
  how many. Square and triangle stay with the review, where they mean a held
  line and a line needing attention.

  All of it describes the recorded run's data. There is no live source behind
  the inputs, so there is no "next run" readiness to report.
*/
function ProcessMenu({
  version,
  inputs,
  outputs,
  tab,
  onTabChange,
}: {
  version: string;
  inputs: SystemLink[];
  outputs: SystemLink[];
  tab: ProcessTab;
  onTabChange: (tab: ProcessTab) => void;
}) {
  const attention = inputs.filter(needsAttention).length;
  const worst = worstFreshness(inputs);
  const condition = worst === 'unavailable' ? 'unavailable' : 'stale';
  const face = (item: ProcessTab, state: keyof typeof FACE = 'none') =>
    tab === item ? FACE.selected : FACE[state];
  const icon = (item: ProcessTab) => (tab === item ? ICON.selected : ICON.none);

  return (
    // Below the phone breakpoint the row cannot hold the name, the group and
    // the notch, and the name has first claim.
    <div
      {...styleDebug({ component: 'ProcessHeader', part: 'menu' })}
      className={MENU}
    >
      {/* It ends in its word rather than a count, so it ends in the padding it
          starts with: the derived end inset belongs to the items whose last
          thing is a pill. */}
      <AriaButton
        onPress={() => onTabChange('runs')}
        aria-label="Runs"
        aria-current={tab === 'runs' ? 'true' : undefined}
        {...styleDebug({
          component: 'ProcessHeader',
          part: 'runs',
          appearance: 'header-button',
        })}
        className={cx(ITEM, 'pe-3', face('runs'))}
      >
        <History
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className={cx('flex-none', icon('runs'))}
        />
        <span className={LABEL}>Runs</span>
      </AriaButton>
      <AriaButton
        onPress={() => onTabChange('instructions')}
        aria-label={`Instructions: version ${version}`}
        aria-current={tab === 'instructions' ? 'true' : undefined}
        {...styleDebug({
          component: 'ProcessHeader',
          part: 'instructions',
          appearance: 'header-button',
        })}
        className={cx(ITEM, face('instructions'))}
      >
        <Lab
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className={cx('flex-none -translate-y-px', icon('instructions'))}
        />
        <span className={LABEL}>Instructions</span>
        <span
          {...styleDebug({
            component: 'ProcessHeader',
            part: 'count',
            appearance: 'header-button-count',
          })}
          className={COUNT}
        >
          {version}
        </span>
      </AriaButton>
      {inputs.length > 0 ? (
        <AriaButton
          onPress={() => onTabChange('inputs')}
          aria-label={`Inputs: ${plural(inputs.length, 'file', 'files')}${
            attention ? `, ${attention} ${condition}` : ''
          }`}
          aria-current={tab === 'inputs' ? 'true' : undefined}
          data-has-state-dot={worst || undefined}
          {...styleDebug({
            component: 'ProcessHeader',
            part: 'inputs',
            appearance: 'header-button',
          })}
          className={cx(ITEM, face('inputs', worst ?? 'none'))}
        >
          <ArrowInbox
            aria-hidden
            size={16}
            strokeWidth={1.8}
            className={cx('flex-none -translate-y-px', icon('inputs'))}
          />
          <span className={LABEL}>Inputs</span>
          {worst ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                {...styleDebug({
                  component: 'ProcessHeader',
                  part: 'count',
                  appearance: 'header-button-count',
                })}
                className={COUNT}
              >
                {inputs.length}
              </span>
              <span
                aria-hidden="true"
                className={cx(
                  'size-1.5 flex-none rounded-full',
                  STATE_DOT[worst],
                )}
              />
            </span>
          ) : (
            <span
              {...styleDebug({
                component: 'ProcessHeader',
                part: 'count',
                appearance: 'header-button-count',
              })}
              className={COUNT}
            >
              {inputs.length}
            </span>
          )}
        </AriaButton>
      ) : null}
      <AriaButton
        onPress={() => onTabChange('outputs')}
        aria-label={`Outputs: ${plural(outputs.length, 'API', 'APIs')}`}
        aria-current={tab === 'outputs' ? 'true' : undefined}
        {...styleDebug({
          component: 'ProcessHeader',
          part: 'outputs',
          appearance: 'header-button',
        })}
        className={cx(ITEM, face('outputs'))}
      >
        <ArrowOutOfBox
          aria-hidden
          size={16}
          strokeWidth={1.8}
          className={cx('flex-none -translate-y-px', icon('outputs'))}
        />
        <span className={LABEL}>Outputs</span>
        <span
          {...styleDebug({
            component: 'ProcessHeader',
            part: 'count',
            appearance: 'header-button-count',
          })}
          className={COUNT}
        >
          {outputs.length}
        </span>
      </AriaButton>
      <AriaButton
        onPress={() => onTabChange('settings')}
        aria-label="Settings"
        aria-current={tab === 'settings' ? 'true' : undefined}
        {...styleDebug({
          component: 'ProcessHeader',
          part: 'settings',
          appearance: 'header-button',
        })}
        className={cx(ICON_ITEM, face('settings'))}
      >
        {/* No optical lift: the lift aligns an icon with text on a baseline,
            and this one has no text to align to -- it is centred in its own
            square instead. As the whole control's content, it inherits the
            button's ink rather than taking the secondary icon colour. */}
        <SettingsGear aria-hidden size={16} strokeWidth={1.8} />
      </AriaButton>
    </div>
  );
}

/*
  Two cells on one row: the heading and the process's menu, then the notch the
  assistant sits in. The notch sets the row's height -- the heading cell is a
  single line with no vertical padding of its own, so it stays shorter than the
  notch at any control height -- and reaches down over the header's rule, so
  its floor is that rule.

  The rule and its sheen belong to the header, whole width, not to the heading
  cell. The notch starts wherever the button's text width puts it, usually on a
  fraction of a pixel, and a translucent sheen drawn by two elements meeting
  there double-paints that pixel into a bright dot.

  The tab itself belongs to the sheet: both the menu here and the body below it
  answer to the same choice.
*/
export function ProcessHeader({
  process,
  version,
  inputs,
  outputs,
  tab,
  onTabChange,
}: {
  process: ProcessSummary;
  version: string;
  inputs: SystemLink[];
  outputs: SystemLink[];
  tab: ProcessTab;
  onTabChange: (tab: ProcessTab) => void;
}) {
  return (
    // The separator shadow extends into the first list row. Paint this header
    // above the sticky section headings so their opaque fills cannot cover it;
    // the notch stays in the same layer as the edge it continues.
    <header
      {...styleDebug({ component: 'ProcessHeader' })}
      className="process-header border-rule-faint shadow-separator-bottom-strong relative z-10 grid grid-cols-[minmax(0,1fr)_auto] border-b"
    >
      {/* Both cells recover the same top inset and bottom edge, so their
          centres agree even when the pane's highlight thickness changes. */}
      <div className="-mt-pane-inset -mb-control-edge flex min-w-0 items-center justify-between gap-x-4 px-4 sm:px-6">
        <ProcessTitle processId={process.id} fallback={process.name} />
        {/* The demo sits beside the menu rather than in it: it opens an
            overlay, not a tab, and the group is a set of tabs. */}
        <div className="flex flex-none items-center gap-2">
          <ProcessMenu
            version={version}
            inputs={inputs}
            outputs={outputs}
            tab={tab}
            onTabChange={onTabChange}
          />
          <OverlayDemo />
        </div>
      </div>
      {/* One slanted control now that the process's own buttons are in the
          row: it leans towards them on its left and keeps its far side
          square, parallel to the pane's side and the notch's gap in from it.
          Top and right recover the pane inset; the bottom overlaps only the
          header's border, keeping its rule and sheen level with the notch. */}
      <Notch className="-mt-pane-inset -mr-pane-inset -mb-control-edge">
        <Assistant slant="left" />
      </Notch>
    </header>
  );
}
