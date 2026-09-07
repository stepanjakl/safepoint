import Link from 'next/link';
import { ReplayReview } from '@/components/review/replay-review';
import { supportBatch } from '@/lib/review/support-fixture';

export default function SupportExamplePage() {
  return (
    <div className="chat-shell">
      <header className="chat-header">
        <Link href="/" className="review-text-button">
          ← Promotion review
        </Link>
        <span className="text-meta text-muted">Contrasting replay example</span>
      </header>
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
          <ReplayReview batch={supportBatch} />
          <p className="chat-caption">
            Synthetic example · Recorded checks · No cases moved or messages
            sent
          </p>
        </section>
      </main>
    </div>
  );
}
