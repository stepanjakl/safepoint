import { AppShell } from '@/components/app-shell/app-shell';
import { ThreadPage } from '@/components/app-shell/thread-page';
import { StatesGallery } from '@/components/review/states-gallery';

// A rendering harness for the eight card states, not a product surface.
export default function StatesPage() {
  return (
    <AppShell current="/examples/states">
      <div className="flex min-h-dvh flex-col">
        <header className="border-rule-faint flex min-h-19 items-center justify-between gap-4 border-b px-8 py-4 max-sm:min-h-16 max-sm:px-5 max-sm:py-3">
          <span className="text-dense font-medium">Release card states</span>
          <span className="text-meta text-muted">Rendering harness</span>
        </header>
        <ThreadPage eyebrow="Rendering harness" title="Release card states">
          <StatesGallery />
        </ThreadPage>
      </div>
    </AppShell>
  );
}
