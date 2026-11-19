'use client';

import { Select } from '@/components/ui/select';
import { DRAFTING_MODELS, type DraftingModel } from '@/lib/models';

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
        {DRAFTING_MODELS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </Select>
    </label>
  );
}
