'use client';

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
      <select
        className="field text-dense min-h-9 px-2"
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
      </select>
    </label>
  );
}
