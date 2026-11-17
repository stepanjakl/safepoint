'use client';

import { useRef, useState } from 'react';

import { ModelLimits } from '@/components/engine/model-limits';
import { ModelSelect } from '@/components/engine/rules/model-select';
import { plural } from '@/components/engine/trial-parts';
import { Button } from '@/components/ui/button';
import type { DraftingModel } from '@/lib/models';

/*
  A new rulebook for these instructions, from the data as this run read it:
  the rules found again, then each written, by the chosen model. Replacing a
  kept one asks first, as its acceptances go with it.
*/
export function DraftControl({
  kept,
  accepted,
  canDraft,
  busy,
  onDraft,
}: {
  kept: number;
  accepted: number;
  canDraft: boolean;
  busy: boolean;
  // No model: the recommended pair, one to find and one to write.
  onDraft: (model: DraftingModel | null) => void;
}) {
  const [model, setModel] = useState<DraftingModel | null>(null);
  const [confirming, setConfirming] = useState(false);
  const draftButton = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setConfirming(false);
    requestAnimationFrame(() => draftButton.current?.focus());
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <ModelSelect
          model={model}
          busy={busy}
          recommended="3.6 Flash to find, 3.5 Flash-Lite to write"
          onChange={setModel}
        />
        {confirming ? (
          <>
            <Button
              variant="primary"
              autoFocus
              onPress={() => {
                setConfirming(false);
                onDraft(model);
              }}
            >
              Replace the rulebook
            </Button>
            <Button onPress={cancel}>Cancel</Button>
          </>
        ) : (
          <Button
            ref={draftButton}
            variant={kept ? 'secondary' : 'primary'}
            isDisabled={busy || !canDraft}
            onPress={() => (kept ? setConfirming(true) : onDraft(model))}
          >
            {kept ? 'Draft a new rulebook' : 'Draft the rulebook'}
          </Button>
        )}
      </div>
      {model ? (
        <ModelLimits model={model} />
      ) : (
        <>
          <ModelLimits model="gemini-3.6-flash" />
          <ModelLimits model="gemini-3.5-flash-lite" />
        </>
      )}
      <p className="text-meta text-muted max-w-prose">
        {confirming
          ? `This replaces the ${plural(kept, 'definition')} kept for these instructions${accepted ? `, and the ${accepted} you accepted,` : ''} with a new draft worked out on the data as this run read it.`
          : 'Finds the calculations and checks in the instructions, then writes each one on the data as this run read it. If the model is busy or out of quota, the next one of its family answers.'}
      </p>
    </div>
  );
}
