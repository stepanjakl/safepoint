'use client';

import { useState } from 'react';

import { DecisionButton } from '@/components/brunch-orders/decision-button';
import { Button } from '@/components/ui/button';
import { MorphingText } from '@/components/ui/morphing-text';

type Action = 'accept' | 'deny' | 'write';
type Phase = 'idle' | 'writing' | 'done';

const CASES: { action: Action; title: string; detail: string }[] = [
  {
    action: 'accept',
    title: 'Accept',
    detail: 'The accepted button becomes the accepted status.',
  },
  {
    action: 'deny',
    title: 'Deny',
    detail:
      'The denial is confirmed here; the live flow first asks for an optional note.',
  },
  {
    action: 'write',
    title: 'Write again',
    detail:
      'The app asks the model to rewrite this definition, including any denial note. Finish the simulated reply to see the new review state.',
  },
];

const LABELS: Record<Action, { idle: string; writing: string; done: string }> =
  {
    accept: { idle: 'Accept', writing: 'Accept', done: 'Accepted' },
    deny: { idle: 'Deny', writing: 'Deny', done: 'Denied' },
    write: {
      idle: 'Write again',
      writing: 'Writing…',
      done: 'Ready to review',
    },
  };

function DecisionTrial({ action, title, detail }: (typeof CASES)[number]) {
  const [phase, setPhase] = useState<Phase>('idle');
  const active = phase !== 'idle';
  const label = LABELS[action][phase];
  const press = () => {
    if (!active) setPhase(action === 'write' ? 'writing' : 'done');
  };

  return (
    <section className="control-face surface-floating rounded-shell grid gap-4 p-5">
      <div className="grid gap-1">
        <h2 className="text-heading font-semibold">{title}</h2>
        <p className="text-dense text-muted max-w-prose">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {action === 'write' ? (
          <Button
            pill
            data-severity={1}
            data-phase={phase}
            data-action={action}
            aria-disabled={active}
            className="decision-morph-control"
            onPress={press}
          >
            <MorphingText text={label} duration={360} />
          </Button>
        ) : (
          <DecisionButton
            decision={action}
            data-phase={phase}
            data-action={action}
            aria-disabled={active}
            className="decision-morph-control"
            onPress={press}
          >
            <MorphingText text={label} duration={360} />
          </DecisionButton>
        )}
        {phase === 'writing' ? (
          <Button pill onPress={() => setPhase('done')}>
            Finish simulated reply
          </Button>
        ) : null}
        {active ? (
          <Button pill onPress={() => setPhase('idle')}>
            Reset
          </Button>
        ) : null}
      </div>
      <span className="sr-only" role="status">
        {phase === 'idle' ? '' : label}
      </span>
    </section>
  );
}

export function DecisionTransitions() {
  return (
    <div className="grid max-w-2xl gap-5">
      {CASES.map((trial) => (
        <DecisionTrial key={trial.action} {...trial} />
      ))}
    </div>
  );
}
