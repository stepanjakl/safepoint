import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionTransitions } from './section-transitions';

export default function SectionTransitionsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-8 p-6"
    >
      <header className="grid gap-2">
        <Link
          href="/workbench"
          className="text-meta text-muted w-fit underline underline-offset-4"
        >
          Back to workbench
        </Link>
        <h1 className="text-display font-semibold">Section transitions</h1>
        <p className="text-dense text-muted max-w-3xl">
          Nine title transitions on the same header band. Choose a section,
          replay an option, or slow them down to compare. Only the text moves.
        </p>
      </header>
      <SectionTransitions />
    </main>
  );
}
