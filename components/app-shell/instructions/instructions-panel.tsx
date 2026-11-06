'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { DURATION_PANE, DURATION_STATE } from '@/lib/motion';
// Deep import: Blode's barrel is the whole icon library.
import CircleHalfFill from 'blode-icons-react/icons/circle-half-fill';
import Check from 'blode-icons-react/icons/checkmark-1-filled';
import { RunStatusIcon } from '@/components/ui/run-status-icon';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { KeyHint } from '@/components/ui/key-hint';
import { MorphingText } from '@/components/ui/morphing-text';
import { useSwap } from '@/components/ui/swap';
import { Tooltip } from '@/components/ui/tooltip';
import { cx } from '@/lib/cx';
import { diffText, paragraphsOf } from '@/lib/process/instruction-diff';
import type { ProcessSummary } from '@/lib/process/model';
import type { AsideView } from '@/components/app-shell/drawer-aside';
import { SECTION } from '@/components/app-shell/process/panel-parts';
import { useRunSelection } from '@/components/app-shell/runs/run-selection';
import { liveRange, useInstructions } from './instructions-store';
import { TextDiff } from './text-diff';

const pad = (n: number) => String(n).padStart(2, '0');

const FIELD =
  'field text-body text-primary field-sizing-content w-full resize-none leading-relaxed';

// Numbered clauses, in the gutter the change view's signs sit in, so turning
// between Text and Changes leaves every paragraph where it was.
function Clauses({ text }: { text: string }) {
  return (
    <ol className="text-body grid gap-1 leading-relaxed">
      {paragraphsOf(text).map((paragraph, index) => (
        <li key={index} className="clause-row whitespace-pre-line">
          <span aria-hidden="true" className="clause-number value text-micro">
            {pad(index + 1)}
          </span>
          <span>{paragraph}</span>
        </li>
      ))}
    </ol>
  );
}

/*
  Every version the process's instructions have been, newest first, as the
  runs rail lists runs: rows edge to edge with a rule between them, the
  version over when it was live, its state over how many runs ran under it.
  A version opens in the side panel -- its text, and what changed in it --
  and the latest opens there with the tab.

  Editing never changes a published version: a draft is its own thing until
  it is published, and publishing appends, so "Ran under v4" on a run keeps
  meaning what it said.
*/
export function InstructionsPanel({
  process,
  aside,
  onShowVersion,
  onEdit,
}: {
  process: ProcessSummary;
  aside: AsideView | null;
  onShowVersion: (version: string) => void;
  onEdit: () => void;
}) {
  const { current, versions, next, draft } = useInstructions(
    process.id,
    process.instructions,
  );
  const editing = aside?.kind === 'edit';
  const showing = aside?.kind === 'version' ? aside.version : null;
  // The runs the rail lists, a run started here included.
  const runs = useRunSelection()?.runs ?? process.runs;
  const ranUnder = (version: string) =>
    runs.filter((run) => run.instructionsVersion === version).length;

  return (
    <ol className="sheet-list" aria-labelledby={SECTION.instructions.id}>
      {draft !== null ? (
        <li>
          <VersionRow
            version={next}
            state="draft"
            when="Not published"
            open={editing}
            onPress={onEdit}
          />
        </li>
      ) : null}
      {[...versions].reverse().map((version, reversed) => {
        const index = versions.length - 1 - reversed;
        const count = ranUnder(version.version);
        return (
          <li key={version.version}>
            <VersionRow
              version={version.version}
              state={version === current ? 'current' : null}
              when={liveRange(versions, index)}
              runs={
                count === 0
                  ? 'No runs'
                  : `${count} ${count === 1 ? 'run' : 'runs'}`
              }
              open={showing === version.version}
              onPress={() => onShowVersion(version.version)}
            />
          </li>
        );
      })}
    </ol>
  );
}

// The run row's grid (runs-list.css): the version where the day is, its state
// where the run's is -- the live one settled, as a finished run is marked, a
// draft half written -- when it was live under them and its runs at the end.
const STATE = {
  current: {
    label: 'Live',
    Icon: () => <RunStatusIcon status="completed" size={14} />,
  },
  // Half written: the circle Live's mark is drawn in, part filled.
  draft: {
    label: 'Draft',
    Icon: () => <CircleHalfFill size={14} aria-hidden />,
  },
} as const;

function VersionRow({
  version,
  state,
  when,
  runs,
  open,
  onPress,
}: {
  version: string;
  state: keyof typeof STATE | null;
  when: string;
  runs?: string;
  open: boolean;
  onPress: () => void;
}) {
  const shown = state ? STATE[state] : null;
  return (
    <button
      type="button"
      className="sheet-row instruction-row"
      data-state={state ?? undefined}
      aria-label={[shown ? `${version} · ${shown.label}` : version, when, runs]
        .filter(Boolean)
        .join(', ')}
      aria-expanded={open}
      data-current={open ? '' : undefined}
      onClick={onPress}
    >
      <span
        aria-hidden="true"
        className="sheet-row-day instruction-row-version value"
      >
        {version}
      </span>
      <span aria-hidden="true" className="instruction-row-state text-micro">
        {shown ? (
          <>
            {shown.label}
            <shown.Icon />
          </>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className="sheet-row-when value text-micro tracking-wider"
      >
        {when}
      </span>
      <span aria-hidden="true" className="instruction-row-runs text-meta">
        {runs}
      </span>
    </button>
  );
}

/*
  One version, in the side panel: its text, or -- one press away -- what
  changed in it from the one before. The current version is edited from here;
  an earlier one is restored as a draft, never republished as it stands.
*/
export function InstructionVersionView({
  process,
  version,
  face,
  onEdit,
}: {
  process: ProcessSummary;
  version: string;
  face: 'text' | 'changes';
  onEdit: () => void;
}) {
  const store = useInstructions(process.id, process.instructions);
  const { versions, current, draft } = store;
  const index = versions.findIndex((entry) => entry.version === version);
  const to = versions[index];
  const from = index > 0 ? versions[index - 1] : undefined;
  const [shown, setShown] = useState(from ? face : 'text');
  if (!to) return null;
  const isCurrent = to === current;
  const changesLabel = from ? `Changes from ${from.version}` : '';

  return (
    <Banded
      band={
        <>
          {from ? (
            // The track's outline, not its first tab, starts where the band's title
            // would (.instruction-tabs).
            <span className="instruction-tabs">
              <FilterTabs
                size="small"
                tabs={[
                  {
                    key: 'text',
                    short: to.version,
                    label: `Text of ${to.version}`,
                  },
                  { key: 'changes', short: changesLabel, label: changesLabel },
                ]}
                selected={shown}
                onChange={setShown}
                leadKey={null}
                ariaLabel={`Instructions ${to.version}`}
                menuLabel="Other views"
                className="w-fit"
              />
            </span>
          ) : (
            <span className="text-dense value">{to.version}</span>
          )}
          <Button
            size="small"
            onPress={() => {
              // Restoring replaces any draft. The current one needs none: the
              // editor starts from its text, and a draft is kept once written.
              if (!isCurrent) store.saveDraft(to.text);
              onEdit();
            }}
          >
            {/* Never an edit: a published version stays as it was, and this
              starts the next one. */}
            {isCurrent
              ? draft === null
                ? 'New version'
                : `Continue ${store.next}`
              : `Draft from ${to.version}`}
          </Button>
        </>
      }
    >
      <div className="p-5">
        {shown === 'changes' && from ? (
          <TextDiff before={from.text} after={to.text} label={changesLabel} />
        ) : (
          <Clauses text={to.text} />
        )}
      </div>
    </Banded>
  );
}

/*
  A detail led by a band, in the section row's face (.sheet-head), holding
  what the panel is showing and its actions. The band stays put and only what
  is under it scrolls, so the scrollbar starts below it.
*/
function Banded({ band, children }: { band: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div
        // Held still through a swap, as a header is (swap.css).
        className="sheet-head instruction-band swap-band"
      >
        {band}
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}

/*
  Writing the next version, in the side panel: one field for the whole text,
  then a review of what it changes before it is published. One field because
  instructions are prose and a box per clause fights anyone writing more than a
  sentence; the structure a reviewer needs comes back in the comparison.

  The panel has no header: a band stays at its top through both steps, saying
  what the draft changes so far and holding that step's actions. The field
  sets its text where the comparison sets it (.draft-field), so turning to the
  review leaves every unchanged paragraph where it was.
*/
type EditorActions = 'write' | 'confirm-discard' | 'review';

export function InstructionEditor({
  process,
  onDone,
}: {
  process: ProcessSummary;
  onDone: () => void;
}) {
  const store = useInstructions(process.id, process.instructions);
  const { current, next, draft } = store;
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  // Changed since the writer last came into the field: what "Saved" answers.
  // Leaving the field ends it, so the next visit says it afresh.
  const [edited, setEdited] = useState(false);

  // Spacing is not content: the draft is compared and published with its
  // paragraphs trimmed and separated by exactly one blank line.
  const normalised = paragraphsOf(draft ?? current.text).join('\n\n');
  const pending = diffText(current.text, normalised);
  const changed = pending.paragraphsChanged > 0 && normalised !== '';

  const body = useSwap(step, (_, to) => (to === 'review' ? 'up' : 'down'));
  const mode: EditorActions =
    step === 'review' ? 'review' : confirming ? 'confirm-discard' : 'write';

  const review = () => {
    if (!changed) return;
    setConfirming(false);
    setStep('review');
  };
  const publish = () => {
    store.publish(normalised, note.trim() || null);
    onDone();
  };
  // ⌘↵ moves on wherever focus is, the field included -- it is where a writer
  // is when they finish -- and even where a swap left it on the page. Inside
  // the publish note the note's own handler takes it first.
  const advance = useEffectEvent(() => {
    if (mode === 'write') review();
    else if (mode === 'review') setPublishing(true);
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey || event.defaultPrevented) return;
      event.preventDefault();
      advance();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /*
    Two buttons for the whole session, whatever the step: their words morph
    from one step's actions to the next, so nothing in the band comes and
    goes. Pressed, a button keeps focus under it as its words change -- and
    what it turns into is always the safe way out: Discard draft becomes Keep
    writing, Back to writing becomes Discard draft, which only asks.
  */
  const LABELS = {
    write: { secondary: 'Discard draft', primary: 'Review changes' },
    'confirm-discard': { secondary: 'Keep writing', primary: 'Discard' },
    review: { secondary: 'Back to writing', primary: `Publish ${next}` },
  }[mode];
  const blocked = mode === 'write' && !changed;
  const pressSecondary = () => {
    if (mode === 'write') setConfirming(true);
    else if (mode === 'confirm-discard') setConfirming(false);
    else setStep('write');
  };
  const pressPrimary = () => {
    if (mode === 'write') review();
    else if (mode === 'confirm-discard') {
      store.discardDraft();
      onDone();
    }
    // In the review the press opens the publish note (its DialogTrigger).
  };
  const actions = (
    <div className="flex items-center gap-1.5">
      <span
        className="band-collapse draft-question text-meta text-muted"
        data-open={mode === 'confirm-discard' || undefined}
        aria-hidden="true"
      >
        <span className="whitespace-nowrap">Discard the draft of {next}?</span>
      </span>
      <span className="sr-only" role="status">
        {mode === 'confirm-discard' ? `Discard the draft of ${next}?` : ''}
      </span>
      <Button size="small" onPress={pressSecondary}>
        <MorphingText text={LABELS.secondary} duration={360} />
      </Button>
      <PublishNote
        version={next}
        note={note}
        onNote={setNote}
        isOpen={publishing}
        onOpenChange={(open) => setPublishing(open && mode === 'review')}
        onPublish={publish}
      >
        <Tooltip
          label="No changes yet"
          placement="bottom"
          isDisabled={!blocked}
        >
          <Button
            size="small"
            variant={mode === 'confirm-discard' ? 'danger' : 'primary'}
            aria-disabled={blocked || undefined}
            aria-keyshortcuts={
              mode === 'confirm-discard'
                ? undefined
                : 'Meta+Enter Control+Enter'
            }
            onPress={pressPrimary}
          >
            <MorphingText text={LABELS.primary} duration={360} />
            <span
              className="band-collapse draft-key"
              data-open={(mode !== 'confirm-discard' && !blocked) || undefined}
              // Said by the button's aria-keyshortcuts, open or not.
              aria-hidden="true"
            >
              <span>
                <KeyHint
                  keys={['mod', 'enter']}
                  on="button-primary"
                  className="pointer-coarse:hidden"
                />
              </span>
            </span>
          </Button>
        </Tooltip>
      </PublishNote>
    </div>
  );

  return (
    <Banded
      band={
        <>
          <DraftSummary
            version={next}
            from={current.version}
            diff={pending}
            changed={changed}
            saved={edited && step === 'write'}
          />
          {actions}
        </>
      }
    >
      <motion.div key={body.shown} {...body.layer}>
        {body.shown === 'review' ? (
          // Focus lands on the comparison, where the reviewer reads next.
          <div
            className="p-5 outline-none"
            tabIndex={-1}
            ref={focusInPlace}
            aria-label={`Changes from ${current.version}, review`}
          >
            <TextDiff
              before={current.text}
              after={normalised}
              label={`Changes from ${current.version}`}
            />
          </div>
        ) : (
          <div className="relative p-5">
            <textarea
              value={draft ?? current.text}
              onChange={(event) => {
                store.saveDraft(event.target.value);
                setEdited(true);
              }}
              onFocus={() => setEdited(false)}
              onBlur={() => setEdited(false)}
              aria-label={`Instructions, draft of ${next}`}
              // The field is the whole task here, so it takes focus on arrival.
              ref={focusInPlace}
              className={cx(FIELD, 'draft-field min-h-80')}
            />
            <DraftNumbers text={draft ?? current.text} />
          </div>
        )}
      </motion.div>
    </Banded>
  );
}

/*
  Publishing asks for its reason as it happens: a note beside the button that
  publishes, rather than a field under the comparison, which a reviewer would
  have to scroll to and which moved the text they were reading. ⌘↵ opens it
  from the review, and publishes from inside it.
*/
function PublishNote({
  version,
  note,
  onNote,
  isOpen,
  onOpenChange,
  onPublish,
  children,
}: {
  version: string;
  note: string;
  onNote: (note: string) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPublish: () => void;
  // The band's primary button, which opens this in the review.
  children: ReactNode;
}) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {children}
      <Popover
        placement="bottom end"
        offset={6}
        className="popover-motion control-face surface-popover rounded-shell w-[min(20rem,calc(100vw-2rem))]"
      >
        <Dialog className="outline-none">
          <div
            className="grid gap-3 p-4"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey))
                return;
              event.preventDefault();
              onPublish();
            }}
          >
            <Heading slot="title" className="text-dense font-medium">
              Publish {version}
            </Heading>
            <label className="text-meta text-muted grid gap-1.5">
              Why this change (optional)
              <textarea
                value={note}
                onChange={(event) => onNote(event.target.value)}
                placeholder="What went wrong, or what the process should do differently"
                autoFocus
                className={cx(FIELD, 'text-dense min-h-20 px-3 py-2.5')}
              />
            </label>
            <div className="flex justify-end">
              <Button size="small" variant="primary" onPress={onPublish}>
                Publish {version}
                <KeyHint
                  keys={['mod', 'enter']}
                  on="button-primary"
                  className="-me-1 pointer-coarse:hidden"
                />
              </Button>
            </div>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/*
  The numbers the published text will carry, in the field's gutter beside each
  paragraph's first line. The field cannot hold text a writer cannot edit, so
  they sit in a mirror over it: the same text, set the same way but unseen, so
  each paragraph starts where the field starts it, with its number beside it.
  Counted as publishing counts -- a blank line ends a paragraph, an empty one
  is none -- so they read as the version will. For the eye only: a screen
  reader gets them from the published text.
*/
function DraftNumbers({ text }: { text: string }) {
  const parts = numberedParts(text);
  return (
    <div aria-hidden="true" className="draft-numbers text-body leading-relaxed">
      {parts.map((part, index) =>
        part.number === null ? (
          part.text
        ) : (
          <span key={index}>
            {part.lead}
            <span className="draft-number">
              <span className="clause-number value text-micro">
                {pad(part.number)}
              </span>
            </span>
            {part.text}
          </span>
        ),
      )}
      {/* A field shows a last line that ends in a break; so does this. */}
      {'\u200b'}
    </div>
  );
}

// The text in its pieces, each paragraph numbered from the start of the line
// its first word is on.
function numberedParts(text: string) {
  const pieces = text.split(/(\n\s*\n)/);
  const numbers = pieces.map((piece, index): number =>
    index % 2 === 0 && piece.trim() ? 1 : 0,
  );
  return pieces.map((piece, index) => {
    if (!numbers[index]) return { number: null, lead: '', text: piece };
    const line = piece.lastIndexOf('\n', piece.search(/\S/)) + 1;
    return {
      number: numbers.slice(0, index + 1).reduce((sum, n) => sum + n, 0),
      lead: piece.slice(0, line),
      text: piece.slice(line),
    };
  });
}

// Focus on arrival without scrolling the panel to the field: autoFocus scrolls
// a field into view, which moves the text a reader was keeping their place in.
function focusInPlace(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

// "Saved" is said once, when the draft is first kept, and then only marked.
const SAVED_WORD_MS = 2000;

function useFirstSave(saved: boolean) {
  const [was, setWas] = useState(saved);
  const [announcing, setAnnouncing] = useState(false);
  if (saved !== was) {
    setWas(saved);
    if (saved) setAnnouncing(true);
  }
  useEffect(() => {
    if (!announcing) return;
    const timer = window.setTimeout(() => setAnnouncing(false), SAVED_WORD_MS);
    return () => window.clearTimeout(timer);
  }, [announcing]);
  return announcing;
}

/*
  What the draft changes, at a glance: its paragraphs as a strip, each marked
  by what happened to it, then the words put in and taken out. Each is one
  object with a name for a screen reader, and a tooltip saying what it counts.
*/
function DraftSummary({
  version,
  from,
  diff,
  changed,
  saved,
}: {
  version: string;
  from: string;
  diff: ReturnType<typeof diffText>;
  changed: boolean;
  // Changed since the field was entered: every keystroke is kept as it lands.
  saved: boolean;
}) {
  const announcing = useFirstSave(saved);
  const paragraphs = diff.paragraphs.length;
  const touched = diff.paragraphsChanged;
  const strip = `${touched} of ${paragraphs} ${paragraphs === 1 ? 'paragraph' : 'paragraphs'} changed`;
  return (
    <div className="flex min-w-0 items-center gap-5">
      {/* Set as the tabs' word is, so a draft's band reads as a version's. */}
      <span
        className="draft-pill text-meta text-primary whitespace-nowrap"
        data-saved={saved || undefined}
      >
        <span>
          Draft&nbsp;<span className="font-semibold">{version}</span>
        </span>
        {/* Opens on the first change since the field was entered -- the
            chip's room, then its check and word -- and the word goes again
            after a moment; the check stays until the writer leaves the field.
            Staged as the runs list's arrow opens in its pill. */}
        <span
          className="band-collapse"
          data-open={saved || undefined}
          aria-hidden="true"
        >
          <span>
            <span className="draft-saved-face text-micro">
              <Check aria-hidden className="draft-saved-check" />
              <span
                className="band-collapse draft-saved-word"
                data-open={announcing || undefined}
              >
                <span>Saved</span>
              </span>
            </span>
          </span>
        </span>
        <span className="sr-only" role="status">
          {announcing ? 'Draft saved' : ''}
        </span>
      </span>
      <span className="text-meta flex min-w-0 items-center gap-3 whitespace-nowrap">
        <Tooltip
          label={changed ? strip : `No changes from ${from} yet`}
          placement="bottom"
        >
          <span
            role="img"
            aria-label={changed ? strip : `No changes from ${from} yet`}
            tabIndex={0}
            className="draft-glance"
          >
            <DraftMap diff={diff} />
          </span>
        </Tooltip>
        {changed ? (
          <span className="flex items-center gap-1">
            <AnimatePresence initial={false}>
              {diff.wordsAdded > 0 ? (
                <DraftCount key="added" kind="added" value={diff.wordsAdded} />
              ) : null}
              {diff.wordsRemoved > 0 ? (
                <DraftCount
                  key="removed"
                  kind="removed"
                  value={diff.wordsRemoved}
                />
              ) : null}
            </AnimatePresence>
          </span>
        ) : (
          <span className="text-muted">No changes from {from} yet</span>
        )}
      </span>
    </div>
  );
}

/*
  A count of words put in or taken out. It comes and goes by growing from and
  shrinking to nothing, and its figure rolls when it changes -- up as it grows,
  down as it falls -- so a reader typing sees it move rather than flicker.
*/
function DraftCount({
  kind,
  value,
}: {
  kind: 'added' | 'removed';
  value: number;
}) {
  const reduceMotion = useReducedMotion();
  const label = `${value} ${value === 1 ? 'word' : 'words'} ${kind}`;
  return (
    <Tooltip label={label} placement="bottom">
      <motion.span
        role="img"
        aria-label={label}
        tabIndex={0}
        className="draft-count draft-glance value"
        data-kind={kind}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
        transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
      >
        <span aria-hidden="true">{kind === 'added' ? '+' : '−'}</span>
        <RollingFigure value={value} />
      </motion.span>
    </Tooltip>
  );
}

/*
  A figure whose digits roll one by one: each place, counted from the right,
  keeps its own cell, and only a place whose digit changed rolls -- up as the
  figure grows, down as it falls. A place gained or lost grows or shrinks.
*/
function RollingFigure({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [last, setLast] = useState(value);
  const [rising, setRising] = useState(true);
  if (value !== last) {
    setRising(value > last);
    setLast(value);
  }
  const digits = String(value).split('');
  const from = rising ? '100%' : '-100%';
  const to = rising ? '-100%' : '100%';
  return (
    <span className="draft-figure">
      <AnimatePresence initial={false}>
        {digits.map((digit, index) => {
          const place = digits.length - 1 - index;
          return (
            <motion.span
              key={place}
              className="draft-figure-place"
              initial={reduceMotion ? false : { width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={reduceMotion ? undefined : { width: 0, opacity: 0 }}
              transition={{ duration: DURATION_STATE, ease: 'easeOut' }}
            >
              <AnimatePresence initial={false}>
                <motion.span
                  key={digit}
                  initial={reduceMotion ? false : { y: from, opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  exit={reduceMotion ? undefined : { y: to, opacity: 0 }}
                  transition={{ duration: DURATION_PANE, ease: 'easeOut' }}
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

// Past this many paragraphs a mark stands for a run of them, so the strip
// keeps its length and a long draft cannot crowd out the band's actions.
const MAX_MARKS = 16;
// A mark's width and the gap after it, which a mark arriving grows from none.
const MARK = { width: '0.25rem', marginInlineEnd: '0.125rem', opacity: 1 };
const NO_MARK = { width: '0rem', marginInlineEnd: '0rem', opacity: 0 };

function DraftMap({ diff }: { diff: ReturnType<typeof diffText> }) {
  const reduceMotion = useReducedMotion();
  const kinds = diff.paragraphs.map(markKind);
  const keys = paragraphKeys(diff.paragraphs);
  const per = Math.ceil(kinds.length / MAX_MARKS) || 1;
  // Past the cap a mark is a run of paragraphs, so it is keyed by its place;
  // under it each mark is its paragraph's, so one put in between arrives
  // where it is rather than every mark after it changing colour.
  const marks = Array.from(
    { length: Math.ceil(kinds.length / per) },
    (_, at) => ({
      key: per === 1 ? keys[at]! : `run-${at}`,
      kind: strongest(kinds.slice(at * per, at * per + per)),
    }),
  );
  return (
    <span aria-hidden="true" className="draft-map">
      <AnimatePresence initial={false}>
        {marks.map(({ key, kind }) => (
          <motion.span
            key={key}
            data-kind={kind}
            initial={reduceMotion ? false : NO_MARK}
            animate={MARK}
            exit={reduceMotion ? undefined : NO_MARK}
            transition={{ duration: DURATION_PANE, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </span>
  );
}

/*
  A name for each paragraph that holds while the draft changes around it: one
  the current version has is named by its place there, which typing elsewhere
  never moves; one put in is named by the paragraph it follows and how many
  were put in after that one before it.
*/
function paragraphKeys(
  paragraphs: ReturnType<typeof diffText>['paragraphs'],
): string[] {
  let before = 0;
  let added = 0;
  return paragraphs.map((paragraph) => {
    if (paragraph.kind === 'added') return `new-${before}-${added++}`;
    added = 0;
    return `was-${before++}`;
  });
}

type MarkKind = 'same' | 'added' | 'removed' | 'both';

// A changed paragraph is marked by what it gained or lost, or both.
function markKind(
  paragraph: ReturnType<typeof diffText>['paragraphs'][number],
): MarkKind {
  if (paragraph.kind !== 'changed') return paragraph.kind;
  const added = paragraph.segments.some((segment) => segment.kind === 'added');
  const removed = paragraph.segments.some(
    (segment) => segment.kind === 'removed',
  );
  return added && removed ? 'both' : added ? 'added' : 'removed';
}

// A run of paragraphs shows the most that happened in it.
function strongest(kinds: MarkKind[]): MarkKind {
  const added = kinds.some((kind) => kind === 'added' || kind === 'both');
  const removed = kinds.some((kind) => kind === 'removed' || kind === 'both');
  return added && removed
    ? 'both'
    : added
      ? 'added'
      : removed
        ? 'removed'
        : 'same';
}
