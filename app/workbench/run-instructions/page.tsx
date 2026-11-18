import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

import { RunInstructionsWorkbench } from './run-instructions-workbench';

/*
  Run's own note bubble alongside the standing process instructions inside the
  Instructions step, rendered from the frozen Brunch orders instructions.
*/
export default function RunInstructionsWorkbenchPage() {
  const { version, text } = brunchOrdersProcess.instructions;
  return (
    <main id="main" className="bg-canvas text-primary min-h-dvh p-4 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-8">
        <header className="grid gap-2">
          <h1 className="text-display font-semibold">Run instructions</h1>
          <p className="text-body text-muted max-w-3xl">
            A run’s own note bubble stacked above the standing process
            instructions inside the Instructions step, with line-counted height
            and a progressive bottom fade.
          </p>
        </header>
        <RunInstructionsWorkbench version={version} processText={text} />
      </div>
    </main>
  );
}
