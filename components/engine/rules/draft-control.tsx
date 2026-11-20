'use client';

import { useRef, useState } from 'react';

import { ModelLimits } from '@/components/engine/model-limits';
import { ModelSelect } from '@/components/engine/rules/model-select';
import { plural } from '@/components/engine/trial-parts';
import { Button } from '@/components/ui/button';
import {
  GEMINI_FIND,
  GEMINI_WRITE,
  modelPlanLabel,
  modelsFor,
  type DraftingModel,
  type ModelPlan,
} from '@/lib/models';

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
  mock = false,
  modelPlan,
}: {
  kept: number;
  accepted: number;
  canDraft: boolean;
  busy: boolean;
  // No model: the recommended pair, one to find and one to write.
  onDraft: (model: DraftingModel | null) => void;
  mock?: boolean;
  modelPlan?: ModelPlan | null;
}) {
  const [model, setModel] = useState<DraftingModel | null>(null);
  const quotaModel = modelPlan
    ? modelsFor({ plan: modelPlan }, [GEMINI_FIND])[0]
    : model;
  const [confirming, setConfirming] = useState(false);
  const draftButton = useRef<HTMLButtonElement>(null);
  const cancel = () => {
    setConfirming(false);
    requestAnimationFrame(() => draftButton.current?.focus());
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        {modelPlan ? (
          <p className="text-meta text-muted">
            Using {modelPlanLabel(modelPlan)}
          </p>
        ) : (
          <ModelSelect
            model={model}
            busy={busy}
            recommended="3.6 Flash to find, 3.5 Flash-Lite to write"
            onChange={setModel}
          />
        )}
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
      {quotaModel && modelPlan !== 'gemini' ? (
        <ModelLimits model={quotaModel} enabled={!mock} />
      ) : (
        <>
          <ModelLimits model={GEMINI_FIND} enabled={!mock} />
          <ModelLimits model={GEMINI_WRITE} enabled={!mock} />
        </>
      )}
      <p className="text-meta text-muted max-w-prose">
        {confirming
          ? `This replaces the ${plural(kept, 'definition')} kept for these instructions${accepted ? `, and the ${accepted} you accepted,` : ''} with a new draft worked out on the data as this run read it.`
          : 'Finds the calculations and checks in the instructions, then writes each one on the data as this run read it. Gemini models fall back within their family when busy or out of quota.'}
      </p>
    </div>
  );
}
