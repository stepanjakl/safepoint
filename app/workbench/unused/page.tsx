import { UnusedParts } from './unused-parts';

/*
  Components the app no longer draws, kept for review before they are removed
  (`pnpm check:unused` reads them as used while they are shown here).
*/
export default function UnusedPartsWorkbenchPage() {
  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Unused parts</h1>
        <p className="text-meta text-muted max-w-3xl">
          Components nothing in the app draws any more, each as it renders
          today. Decide whether each stays or goes; once one goes, take it off
          this page too.
        </p>
      </header>
      <UnusedParts />
    </main>
  );
}
