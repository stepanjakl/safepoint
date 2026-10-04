'use client';

import { useEffect, useRef, type RefObject } from 'react';
// Deep import: Blode's barrel is the whole icon library.
import X from 'blode-icons-react/icons/x';
import { Button } from '@/components/ui/button';
import { useAssistant } from './assistant-state';

const PROMPTS = [
  'Explain this run',
  'Summarise the evidence',
  'Help refine instructions',
];

export function AssistantPanel({
  draft,
  onDraftChange,
  composer,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  composer: RefObject<HTMLTextAreaElement | null>;
}) {
  const assistant = useAssistant();
  const initialFocus = useRef(assistant.open);
  useEffect(() => {
    if (initialFocus.current) composer.current?.focus({ preventScroll: true });
  }, [composer]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-title font-medium">Assistant</h2>
        <Button
          aria-label="Close assistant"
          onPress={assistant.close}
          className="w-11"
        >
          <X aria-hidden size={16} strokeWidth={1.8} className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <p className="text-body font-medium">
          A little help with what’s on screen.
        </p>
        <p className="text-muted text-dense mt-2">
          Explore a run, its evidence, or the instructions behind it.
        </p>
        <div className="mt-6 grid gap-2">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="control-wash border-rule-default hover:bg-surface-selected focus-visible:bg-surface-selected rounded-control text-dense border px-3 py-2.5 text-left"
              onClick={() => {
                onDraftChange(prompt);
                composer.current?.focus();
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0">
        <label
          className="text-meta text-muted mb-2 block"
          htmlFor={`${assistant.id}-message`}
        >
          Message
        </label>
        <div className="field p-3">
          <textarea
            ref={composer}
            id={`${assistant.id}-message`}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Ask about this process…"
            aria-describedby={`${assistant.id}-preview`}
            rows={3}
            className="text-body w-full resize-none bg-transparent outline-none"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" isDisabled>
              Send
            </Button>
          </div>
        </div>
        <p id={`${assistant.id}-preview`} className="text-muted text-meta mt-2">
          Preview — sending isn’t available yet.
        </p>
      </div>
    </div>
  );
}
