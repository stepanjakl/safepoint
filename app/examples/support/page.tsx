import { AppShell } from '@/components/app-shell/app-shell';
import { ProcessView } from '@/components/app-shell/process-view';
import { ReplayReview } from '@/components/review/replay-review';
import { supportProcess } from '@/lib/process/placeholder-process';
import { supportPlan } from '@/lib/review/support-fixture';

export default function SupportExamplePage() {
  return (
    <AppShell current="/examples/support">
      <ProcessView process={supportProcess}>
        <main id="main" tabIndex={-1} className="chat-main">
          <div className="chat-thread-heading">
            <p className="text-meta text-muted">Support operations</p>
            <h1>Morning handoff</h1>
          </div>
          <div className="chat-request">
            <p>
              Review the proposed case handoffs before the next team takes over.
            </p>
          </div>
          <section className="chat-response" aria-label="Safepoint response">
            <p className="chat-response-intro">
              Three cases reviewed. One needs identity evidence before it can
              move.
            </p>
            <ReplayReview plan={supportPlan} />
            <p className="chat-caption">
              Synthetic example · Recorded checks · No cases moved or messages
              sent
            </p>
          </section>
        </main>
      </ProcessView>
    </AppShell>
  );
}
