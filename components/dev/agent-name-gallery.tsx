import type { ComponentType } from 'react';
// Deep imports: Blode's barrel is the whole icon library.
import BubbleSparkle from 'blode-icons-react/icons/bubble-sparkle';
import EyeSparkle from 'blode-icons-react/icons/eye-sparkle';
import FocusMagic from 'blode-icons-react/icons/focus-magic';
import LightbulbSparkle from 'blode-icons-react/icons/lightbulb-sparkle';
import MagicEdit from 'blode-icons-react/icons/magic-edit';
import PencilSparkle from 'blode-icons-react/icons/pencil-sparkle';
import ScanTextSparkle from 'blode-icons-react/icons/scan-text-sparkle';
import SearchLinesSparkle from 'blode-icons-react/icons/search-lines-sparkle';
import Sparkle2 from 'blode-icons-react/icons/sparkle-2';

/*
  Names and icons for the global helper the notch would hold.

  A name here is a promise about authority. Safepoint's claim is that the model
  proposes and a person decides, so a name or a glyph that implies the thing
  acts undoes in the header what the review boundary spends the rest of the
  interface establishing.

  The pencil with stars is `magic-edit`, already in use on the Refine
  placeholder beside Instructions. It is the strongest drawing in the set, and
  it says drafting: a pencil writes. That makes it right for a helper that
  produces something to review, and wrong for one that only answers -- which is
  the choice the first group is really asking about.
*/

type Icon = ComponentType<{
  'aria-hidden'?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

const PENCIL_NAMES: { name: string; note: string }[] = [
  {
    name: 'Draft',
    note: 'What the pencil actually promises: it writes something you then review. Reads as a verb, claims nothing about judgement, and matches a helper whose output is always a proposal.',
  },
  {
    name: 'Suggest',
    note: 'The same promise, one step softer, and it names the boundary out loud: a suggestion is not a change. Slightly passive as a button.',
  },
  {
    name: 'Propose',
    note: 'The project’s own word for what the agent does to effects. Reusing it here ties the helper to the review vocabulary, at the risk of reading as the formal proposal a run produces.',
  },
  {
    name: 'Compose',
    note: 'Fits drafting instructions or a note. Wrong register for asking why a line is blocked, which is the other half of what a global helper is for.',
  },
  {
    name: 'Refine',
    note: 'Already the name for redrafting instructions from review decisions. Using it globally would blur a process-level feature with an app-level one.',
  },
];

const ICONS: { glyph: string; icon: Icon; name: string; note: string }[] = [
  {
    glyph: 'magic-edit',
    icon: MagicEdit,
    name: 'Draft',
    note: 'In use on Refine. Pencil and stars: makes something, with the stars saying a model made it.',
  },
  {
    glyph: 'pencil-sparkle',
    icon: PencilSparkle,
    name: 'Draft',
    note: 'The same idea with a lighter pencil and one star. Quieter beside the flask; less distinct at 16px.',
  },
  {
    glyph: 'sparkle-2',
    icon: Sparkle2,
    name: 'Ask',
    note: 'Stars alone, no tool. Promises nothing about acting, which suits a helper that answers, and says nothing about what it does either.',
  },
  {
    glyph: 'bubble-sparkle',
    icon: BubbleSparkle,
    name: 'Ask',
    note: 'A speech bubble: plainly a conversation. Risks reading as a support chat widget, which is the shape Safepoint argues against.',
  },
  {
    glyph: 'search-lines-sparkle',
    icon: SearchLinesSparkle,
    name: 'Find',
    note: 'Search with stars. Right for a helper that mostly opens the correct record, and it never implies writing.',
  },
  {
    glyph: 'scan-text-sparkle',
    icon: ScanTextSparkle,
    name: 'Explain',
    note: 'Reading a document. Closest to what the helper does with evidence, but busy at header size.',
  },
  {
    glyph: 'focus-magic',
    icon: FocusMagic,
    name: 'Focus',
    note: 'A reticle with stars: points at the thing that matters. Distinctive, though a reticle reads as targeting elsewhere.',
  },
  {
    glyph: 'eye-sparkle',
    icon: EyeSparkle,
    name: 'Watch',
    note: 'Fits the unprompted half — noticing a stale input. An eye also reads as surveillance in an operations tool.',
  },
  {
    glyph: 'lightbulb-sparkle',
    icon: LightbulbSparkle,
    name: 'Insight',
    note: 'The most generic AI glyph there is, and it claims cleverness every answer then has to earn.',
  },
];

const BUTTON =
  'control-face control-header-button text-primary text-dense inline-flex h-8 flex-none items-center gap-2 rounded-full ps-3 pe-3 font-medium whitespace-nowrap';
const ICON_ONLY =
  'control-face control-header-button text-primary inline-grid size-8 flex-none place-items-center rounded-full';
const CARD = 'border-rule-default bg-surface-primary grid gap-2.5 border p-4';

export function AgentNameGallery() {
  return (
    <div className="grid gap-5">
      <section aria-labelledby="agent-pencil-names" className="grid gap-3">
        <h3 id="agent-pencil-names" className="readout text-muted">
          The pencil, named
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {PENCIL_NAMES.map(({ name, note }) => (
            <div key={name} className={CARD}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={BUTTON}>
                  <MagicEdit
                    aria-hidden
                    size={16}
                    strokeWidth={1.8}
                    className="flex-none -translate-y-px"
                  />
                  {name}
                </span>
                <span className={ICON_ONLY}>
                  <MagicEdit
                    aria-hidden
                    size={16}
                    strokeWidth={1.8}
                    className="flex-none -translate-y-px"
                  />
                </span>
              </div>
              <p className="text-meta text-muted leading-normal">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="agent-icons" className="grid gap-3">
        <h3 id="agent-icons" className="readout text-muted">
          Other glyphs with the same feel
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {ICONS.map(({ glyph, icon: Icon, name, note }) => (
            <div key={glyph} className={CARD}>
              <p className="value text-micro text-muted">{glyph}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={BUTTON}>
                  <Icon
                    aria-hidden
                    size={16}
                    strokeWidth={1.8}
                    className="flex-none -translate-y-px"
                  />
                  {name}
                </span>
                {/* The notch is narrow, so the glyph has to carry the control
                    on its own wherever the word is dropped. */}
                <span className={ICON_ONLY}>
                  <Icon
                    aria-hidden
                    size={16}
                    strokeWidth={1.8}
                    className="flex-none -translate-y-px"
                  />
                </span>
              </div>
              <p className="text-meta text-muted leading-normal">{note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
