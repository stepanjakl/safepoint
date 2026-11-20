import { brunchDirectScript } from '@/lib/processes/brunch-orders/direct-script';
import { describeEvent } from '@/lib/shell/model-run';
import {
  ProposingStepsWorkbench,
  type ProposingFrame,
} from './proposing-player';

/*
  Side-by-side comparison of the proposing sub-steps timeline (ModelAt), driven
  by the recorded Brunch orders activity fixture so typography, timestamps, line
  grammar and transitions can be inspected in isolation.
*/
export default function ProposingStepsPage() {
  const script = brunchDirectScript();
  const evaluating = script.mainLine.find((s) => s.key === 'evaluating')!;
  const awaiting = script.mainLine.find((s) => s.key === 'awaiting_review')!;
  const facts = evaluating.view.facts;
  const version = evaluating.view.instructions.version;

  const frames: ProposingFrame[] = [
    ...(evaluating.frames ?? []).map((frame, i) => {
      const activity = frame.view.activity;
      const lines = (activity?.events ?? []).flatMap((event) =>
        describeEvent(event, facts, version),
      );
      const lastLine = lines.at(-1)?.text;
      const suffix = activity?.writing
        ? `Writing · ${Math.min(activity.writing, facts.records)} of ${facts.records}`
        : activity?.thought
          ? 'Thinking…'
          : (lastLine ?? `Frame ${i + 1}`);
      return {
        key: `frame-${i}`,
        label: suffix,
        t: frame.t + 1600,
        working: true,
        activity,
      };
    }),
    {
      key: 'done',
      label: 'Settled (proposal ready)',
      t: ((evaluating.frames ?? []).at(-1)?.t ?? 0) + 3200,
      working: false,
      activity: awaiting.view.activity,
    },
  ];

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-8 p-6"
    >
      <header className="mx-auto grid w-[min(100%,760px)] gap-1">
        <h1 className="text-display font-semibold">Proposing sub-steps</h1>
        <p className="text-meta text-muted max-w-3xl">
          The model activity timeline inside a proposing step, played from the
          recorded Brunch orders activity fixture.
        </p>
      </header>
      <ProposingStepsWorkbench
        frames={frames}
        facts={facts}
        version={version}
      />
    </main>
  );
}
