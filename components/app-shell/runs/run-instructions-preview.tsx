import { RequestBubble } from '@/components/app-shell/thread/thread-page';

// Placeholder: the text is kept with the run and nothing reads it yet.
export function RunInstructionsPreview({
  instructions,
}: {
  instructions: string;
}) {
  if (!instructions) return null;
  return (
    <div className="mb-6">
      <RequestBubble>
        <p className="text-meta text-muted mb-2">Additional instructions</p>
        <p className="text-body break-words whitespace-pre-wrap">
          {instructions}
        </p>
        <p className="text-meta text-muted mt-2">
          Saved with this run; not applied to execution yet.
        </p>
      </RequestBubble>
    </div>
  );
}
