'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
// Deep imports: Blode's barrel is the whole icon library.
import ArrowUp from 'blode-icons-react/icons/arrow-up';
import X from 'blode-icons-react/icons/x';
import { Button as AriaButton } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import {
  DURATION_PANE,
  DURATION_STATE,
  EMPTY_STATE_ARRIVE,
  EMPTY_STATE_STAGGER,
} from '@/lib/motion';
import {
  ContextPicker,
  HistoryButton,
  type AssistantContextChoice,
  type ContextProcess,
} from './assistant-context';
import { AssistantMark } from './assistant-mark';
import { useAssistant, type Consultation } from './assistant-state';

// Short enough to read at a glance; each one is a question already written.
const PROMPTS = [
  'Explain this run',
  'Summarise evidence',
  'Refine instructions',
];

const UNAVAILABLE = 'Sending isn’t available yet.';

/*
  The conversation above, the composer below, and nothing to read before
  either: the suggestions say what the assistant is for, and go once the
  reader starts writing or an answer is showing. Rows are spaced by the
  panel's gap and their own margins, one inset on every side
  (assistant-panel.css), never by padding on the panel itself.
*/
export function AssistantPanel({
  docked = false,
  processes = [],
  onScreen = null,
  consultation = null,
  draft,
  onDraftChange,
  composer,
}: {
  // Docked beside the sheet, the header's notch button says it is open and
  // closes it, so the panel carries no heading or close button of its own.
  // As an overlay it covers that button, and keeps both.
  docked?: boolean;
  // Every process it can be asked about, and the one the page is showing.
  processes?: ContextProcess[];
  onScreen?: string | null;
  // A question asked from elsewhere on the page, and its answer.
  consultation?: Consultation | null;
  draft: string;
  onDraftChange: (draft: string) => void;
  composer: RefObject<HTMLTextAreaElement | null>;
}) {
  const assistant = useAssistant();
  const initialFocus = useRef(assistant.open);
  const [context, setContext] = useState<AssistantContextChoice>('page');
  const reduceMotion = useReducedMotion();
  const suggesting = draft === '' && !consultation;
  // Said once each time Enter is pressed with nothing able to send it.
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (initialFocus.current) composer.current?.focus({ preventScroll: true });
  }, [composer]);
  const send = () => {
    // Re-set so a second press is announced again.
    setNotice('');
    requestAnimationFrame(() => setNotice(UNAVAILABLE));
  };
  const suggest = (prompt: string) => {
    onDraftChange(prompt);
    const field = composer.current;
    if (!field) return;
    field.focus();
    // After the value lands, so the caret sits at its end.
    requestAnimationFrame(() =>
      field.setSelectionRange(prompt.length, prompt.length),
    );
  };

  return (
    <div className="assistant-panel" data-docked={docked || undefined}>
      {/* Level with the notch button across the gap when docked; the
          overlay's own heading and close button otherwise. */}
      <header className="assistant-bar flex items-center justify-between gap-3">
        {docked ? null : <h2 className="text-title font-medium">Assistant</h2>}
        <span className="ms-auto flex items-center gap-2">
          <HistoryButton hideTooltip={!assistant.open} />
          {docked ? null : (
            <Button
              aria-label="Close assistant"
              onPress={assistant.close}
              className="w-11"
            >
              <X aria-hidden size={16} strokeWidth={1.8} className="size-4" />
            </Button>
          )}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {consultation ? (
          <section aria-label="Answer" className="grid gap-3">
            <p className="text-body text-muted-strong">
              {consultation.question}
            </p>
            {/* Polite: the answer is read once it is all there, not as the
                question is asked. */}
            <div aria-live="polite" className="text-body grid gap-3">
              {consultation.state === 'asking' ? (
                <p className="text-muted">Asking…</p>
              ) : consultation.state === 'failed' ? (
                <p>{consultation.message}</p>
              ) : (
                consultation.answer
              )}
            </div>
          </section>
        ) : (
          // Remounted with each opening, so it rises in afresh every time.
          <EmptyState
            key={assistant.open ? 'open' : 'closed'}
            open={assistant.open}
          />
        )}
      </div>
      {/* Kept in place while hidden, so nothing above them moves as the
          reader starts writing: they fade and go inert, and come back when
          the field is empty again, on the controls' own step. */}
      <motion.ul
        aria-label="Suggestions"
        aria-hidden={!suggesting || undefined}
        inert={!suggesting}
        className="flex flex-wrap justify-center gap-1.5"
        initial={false}
        animate={{ opacity: suggesting ? 1 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : DURATION_STATE,
          ease: 'easeOut',
        }}
      >
        {PROMPTS.map((prompt) => (
          <li key={prompt}>
            <Button size="small" shape="round" onPress={() => suggest(prompt)}>
              {prompt}
            </Button>
          </li>
        ))}
      </motion.ul>
      {/* What is written, then a row with what it is asked about and the
          send button; the row centres where the account row's content does
          across the shell (assistant-panel.css). */}
      <div className="assistant-composer field">
        <textarea
          ref={composer}
          id={`${assistant.id}-message`}
          aria-label="Message"
          aria-keyshortcuts="Enter"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends and Shift+Enter starts a new line; a composing
            // input method keeps its own Enter.
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (draft.trim()) send();
            }
          }}
          placeholder={
            context === 'none' || (context === 'page' && !onScreen)
              ? 'Ask anything'
              : 'Ask about this process'
          }
          rows={1}
          className="text-body field-sizing-content max-h-40 w-full resize-none bg-transparent px-1.5 py-1 outline-none"
        />
        {/* Both ends sit down in the field's corners. */}
        <div className="flex items-end justify-between gap-2">
          <ContextPicker
            choice={context}
            onChoiceChange={setContext}
            // Back to the writing, once the menu has let focus go.
            onClose={() =>
              requestAnimationFrame(() =>
                composer.current?.focus({ preventScroll: true }),
              )
            }
            processes={processes}
            onScreen={onScreen}
          />
          {/* Pressable once there is something to send; until then it is
              disabled and out of the tab order. */}
          <AriaButton
            aria-label="Send"
            isDisabled={!draft.trim()}
            onPress={send}
            // One face in both states, so it fades between them.
            className={
              draft.trim()
                ? 'assistant-send control-face control-button-secondary interact:control-button-secondary-hover text-primary grid flex-none place-items-center rounded-full'
                : 'assistant-send control-face control-off text-muted grid flex-none place-items-center rounded-full'
            }
          >
            <ArrowUp aria-hidden size={16} strokeWidth={1.8} />
          </AriaButton>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {notice}
      </span>
    </div>
  );
}

/*
  Before anything is asked: the assistant's mark and one line. They rise in
  once the panel has finished opening -- the docked column's content fade,
  or the overlay's entrance -- rather than while it is still travelling, as
  the run page's empty state waits for its page. A timer just past the
  pane's duration covers a panel that opened without either, and reduced
  motion shows them at once.
*/
function EmptyState({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!open) return;
    const panel = box.current?.closest('.assistant-content');
    const modal = box.current?.closest('.assistant-modal');
    const arrive = () => setArrived(true);
    const onEnd = (event: Event) => {
      if (event.target === panel || event.target === modal) arrive();
    };
    panel?.addEventListener('transitionend', onEnd);
    modal?.addEventListener('animationend', onEnd);
    const fallback = window.setTimeout(arrive, DURATION_PANE * 1000 + 80);
    return () => {
      panel?.removeEventListener('transitionend', onEnd);
      modal?.removeEventListener('animationend', onEnd);
      window.clearTimeout(fallback);
    };
  }, [open]);
  return (
    <div ref={box} className="grid h-full place-items-center">
      <motion.div
        className="grid justify-items-center gap-3"
        initial={reduceMotion ? false : 'hidden'}
        animate={arrived || reduceMotion ? 'shown' : 'hidden'}
        transition={{ staggerChildren: EMPTY_STATE_STAGGER }}
      >
        <motion.span variants={EMPTY_STATE_ARRIVE} className="grid">
          <AssistantMark />
        </motion.span>
        <motion.p
          variants={EMPTY_STATE_ARRIVE}
          className="text-body text-muted"
        >
          What would you like to know?
        </motion.p>
      </motion.div>
    </div>
  );
}
