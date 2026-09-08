import { AppShell } from '@/components/app-shell/app-shell';
import { StatesGallery } from '@/components/review/states-gallery';

// A rendering harness for the eight card states, not a product surface.
export default function StatesPage() {
  return (
    <AppShell current="/examples/states">
      <div className="chat-shell">
        <header className="chat-header">
          <span className="text-dense font-medium">Release card states</span>
          <span className="text-meta text-muted">Rendering harness</span>
        </header>
        <main id="main" tabIndex={-1} className="chat-main">
          <div className="chat-thread-heading">
            <p className="text-meta text-muted">Rendering harness</p>
            <h1>Release card states</h1>
          </div>
          <StatesGallery />
        </main>
      </div>
    </AppShell>
  );
}
