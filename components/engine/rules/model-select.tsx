'use client';

import { Select } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/components/trpc/provider';
import {
  DRAFTING_MODELS,
  isTrialModel,
  type DraftingModel,
} from '@/lib/models';

// Which model to ask; a busy or spent one hands over to the next older one
// of its family on the server.
export function ModelSelect<M extends DraftingModel | null = DraftingModel>({
  model,
  busy,
  recommended,
  onChange,
}: {
  model: M;
  busy: boolean;
  // Offers no model in particular, in these words.
  recommended?: string;
  onChange: (model: M) => void;
}) {
  const trpc = useTRPC();
  const { data: available } = useQuery(
    trpc.modelLimits.available.queryOptions(undefined, { staleTime: Infinity }),
  );
  const models = available ?? DRAFTING_MODELS.filter((id) => !isTrialModel(id));

  return (
    <label className="grid gap-1">
      <span className="text-meta text-muted">Model</span>
      <Select
        size="large"
        value={model ?? ''}
        disabled={busy}
        onChange={(e) => onChange((e.target.value || null) as M)}
      >
        {recommended ? <option value="">{recommended}</option> : null}
        {models.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </Select>
    </label>
  );
}
