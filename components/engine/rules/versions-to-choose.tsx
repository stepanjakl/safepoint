'use client';

import { useContext, useId } from 'react';

import { DecisionButton } from '@/components/engine/decision-button';
import { Formula } from '@/components/engine/rules/formula';
import { FromModel } from '@/components/engine/rules-parts';
import { AssistantContext } from '@/components/app-shell/assistant/assistant-state';
import { Button } from '@/components/ui/button';
import type { Advice } from '@/lib/engine/advise';
import { groupDifferences } from '@/lib/engine/group-differences';
import type { Definition } from '@/lib/engine/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';
import { wordDiff } from '@/lib/text/word-diff';

/*
  Writes that came out different, for a person to choose between, in the
  card's footer until one is chosen. A check's version is the sentence the app
  wrote from it, the words where the two differ marked. A calculation has no
  sentence, and two formulas name the same thing differently, so what is
  marked is where they fill a group differently, above its formula.
  Under each, what it gives on the first record where they part.
*/
export function VersionsToChoose({
  item,
  names,
  sentences,
  busy,
  canWrite,
  onChoose,
  onWrite,
  onAdvise,
}: {
  item: Definition;
  names: Record<string, string>;
  sentences: (string | null)[];
  busy: boolean;
  canWrite: boolean;
  onChoose?: (index: number) => void;
  onWrite: () => void;
  onAdvise?: () => Promise<Advice>;
}) {
  const headingId = useId();
  // Absent where the page has no assistant, as on /workbench.
  const assistant = useContext(AssistantContext);
  const { versions, differences } = item.agreement!;
  const worded = versions.map((version, index) =>
    version.unfit ? `No shape fits: ${version.unfit}` : sentences[index],
  );
  const runs =
    versions.length === 2 && worded[0] && worded[1]
      ? wordDiff(worded[0], worded[1])
      : worded.map((text) => (text ? [{ text, changed: false }] : []));
  const grouped =
    versions.length === 2
      ? groupDifferences(versions[0]!.groups, versions[1]!.groups)
      : [];
  const named = (key: string) => (names[key] ? `${key} (${names[key]})` : key);
  // The first record where they part, and what each gives there.
  const where = differences[0];
  const given = where
    ? Object.entries(where.inputs)
        .map(([id, value]) => {
          const field = SUBJECT.proposal.find((f) => f.id === id);
          return `${field ? `the proposed ${field.label.toLowerCase()}` : id} ${value}`;
        })
        .join(', ')
    : '';
  const result = (text: string | undefined) =>
    item.result === 'check' && (text === 'true' || text === 'false')
      ? text === 'true'
        ? 'holds'
        : 'fails'
      : (text ?? '');
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div className="grid gap-0.5">
        <h5 id={headingId} className="text-dense font-semibold">
          Two readings of this rule
        </h5>
        <p className="text-meta text-muted">
          Use the one that is right; marked is where they differ.
        </p>
      </div>
      <ul className="grid gap-2">
        {versions.map((version, index) => (
          <li
            key={index}
            className="rounded-control border-rule-default grid border"
          >
            <div className="flex min-h-12 items-center justify-between gap-3 py-2 pr-2 pl-3">
              <span className="readout text-muted">Version {index + 1}</span>
              {onChoose && !version.unfit ? (
                <DecisionButton
                  decision="accept"
                  isDisabled={busy}
                  onPress={() => onChoose(index)}
                >
                  Use version {index + 1}
                </DecisionButton>
              ) : null}
            </div>
            <div className="border-rule-faint grid justify-items-start gap-2 border-t px-3 py-2.5">
              {runs[index]!.length ? (
                <p className="text-body">
                  {runs[index]!.map((run, at) =>
                    run.changed ? (
                      <mark key={at} className="rules-differs">
                        {run.text}
                      </mark>
                    ) : (
                      run.text
                    ),
                  )}
                </p>
              ) : (
                <>
                  {grouped.length ? (
                    <ul className="text-body grid gap-1">
                      {grouped.map(({ quote, key, inFirst }) => (
                        <li key={`${quote}${key}`}>
                          <mark className="rules-differs">
                            {inFirst === (index === 0)
                              ? 'Counts'
                              : 'Does not count'}
                          </mark>{' '}
                          {named(key)} as one of &ldquo;{quote}&rdquo;
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Formula
                    item={{
                      ...item,
                      constants: version.constants,
                      groups: version.groups,
                    }}
                    formula={version.formula}
                    names={names}
                    reads={[]}
                    face="bg-surface-inset"
                    still
                  />
                </>
              )}
            </div>
            {where ? (
              <p className="border-rule-faint text-meta text-muted border-t px-3 py-2">
                On {named(where.key)}
                {given && item.result === 'check'
                  ? `, with ${given}`
                  : ''}:{' '}
                <mark className="rules-differs">
                  {result(where.results[index])}
                </mark>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="medium" isDisabled={busy || !canWrite} onPress={onWrite}>
          Neither: write again
        </Button>
        {assistant && onAdvise ? (
          <Button
            size="medium"
            onPress={() =>
              assistant.consult(
                `Which reading of “${item.name}” is right?`,
                async () => <AdviceAnswer advice={await onAdvise()} />,
              )
            }
          >
            Which is right?
          </Button>
        ) : null}
      </div>
    </section>
  );
}

const VERDICT: Record<Advice['verdict'], string> = {
  version_1: 'Version 1 says what the instructions mean.',
  version_2: 'Version 2 says what the instructions mean.',
  unclear: 'The instructions can be read either way.',
};

// The advice as the assistant shows it: advice, with the choice left on the card.
function AdviceAnswer({ advice }: { advice: Advice }) {
  return (
    <>
      <p className="text-body">{VERDICT[advice.verdict]}</p>
      {advice.quote ? (
        <FromModel label="From the instructions">
          <p className="text-body italic">&ldquo;{advice.quote}&rdquo;</p>
        </FromModel>
      ) : null}
      <p className="text-dense">{advice.reason}</p>
      {advice.rephrase ? (
        <div className="grid gap-1">
          <span className="readout text-muted">
            A wording that reads one way
          </span>
          <p className="text-dense">{advice.rephrase}</p>
        </div>
      ) : null}
      <p className="text-meta text-muted">
        Advice from {advice.model}. The choice is yours, on the card.
      </p>
    </>
  );
}
