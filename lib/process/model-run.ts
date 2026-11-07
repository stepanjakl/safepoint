import {
  RUN_TRIGGER_LABELS,
  type ProcessStep,
  type RunTrigger,
} from '@/lib/process/model';
import type { RunStage } from '@/lib/process/run-lifecycle';
import type { AnswerProblem, ProposalEvent } from '@/lib/definitions/types';

/*
  A run the model works out alone, from the instructions and its inputs, with
  no rulebook: in the run lifecycle's own stages, so it moves as every run
  does. There is no policy check: nothing but
  the person reviewing checks what the model proposes. The live page works its
  stage out from the run's state; the workbench pins each one.
*/
export type ModelRunStage = Exclude<RunStage, 'waiting' | 'checking'>;

export const MODEL_RUN_MAIN_LINE: ModelRunStage[] = [
  'starting',
  'reading',
  'evaluating',
  'awaiting_review',
  'reviewing',
  'ready_to_commit',
  'committing',
  'committed',
];

// What the steps say, worked out once from the run so a label and the box
// beneath it cannot disagree.
export type ModelRunFacts = {
  requestLabel: string;
  trigger: RunTrigger;
  // What the process works on and what it sets, in its own words, so the
  // steps name them without knowing the process: product, orders.
  // The record, singular and plural, and the field a proposal sets: the
  // process's own nouns, for the facts the steps state, never their names.
  subject: { one: string; other: string; field: string };
  // The sources a run reads, and their tabs.
  sources: number;
  tabs: number;
  // Where the read does not fit what the process reads.
  unfit: string[];
  // The proposal: how many records, how many the model is unsure of, and how
  // many a person has decided.
  records: number;
  needYou: number;
  decided: number;
  // Values the decisions write, across every output.
  writes: number;
  output: string;
  // Why a stopped run stopped, and at which step.
  stopped: { at: 'sources' | 'evaluation'; reason: string } | null;
  // Read back differently from what was written.
  mismatch: string | null;
};

const ORDER: ModelRunStage[] = [...MODEL_RUN_MAIN_LINE, 'intervention'];
const reached = (stage: ModelRunStage, from: ModelRunStage) =>
  stage !== 'stopped' && ORDER.indexOf(stage) >= ORDER.indexOf(from);

const plural = (count: number, one: string, other = `${one}s`) =>
  `${count} ${count === 1 ? one : other}`;

export function modelRunStepsAt(
  stage: ModelRunStage,
  facts: ModelRunFacts,
): ProcessStep[] {
  const steps: ProcessStep[] = [
    {
      id: 'request',
      name: 'Instructions',
      label: facts.requestLabel,
      status: 'complete',
      origin: facts.trigger,
      note:
        facts.trigger === 'schedule'
          ? 'Raised by the weekly schedule, not by a person.'
          : `${RUN_TRIGGER_LABELS[facts.trigger]}.`,
    },
  ];
  if (stage === 'starting') return steps;

  const readFailed = stage === 'stopped' && facts.stopped?.at === 'sources';
  const records = plural(facts.records, facts.subject.one, facts.subject.other);
  const sources = plural(facts.sources, 'source');
  steps.push(
    stage === 'reading'
      ? {
          id: 'sources',
          name: 'Reading inputs',
          label: sources,
          status: 'running',
        }
      : readFailed
        ? {
            id: 'sources',
            name: 'Inputs',
            label: 'Not read',
            flag: 'Stopped',
            status: 'blocked',
          }
        : {
            id: 'sources',
            name: 'Inputs',
            label: `${sources} read`,
            flag: facts.unfit.length ? 'Does not fit' : undefined,
            status: facts.unfit.length ? 'blocked' : 'complete',
            note: facts.unfit.length
              ? 'Nothing is proposed on a sheet the process cannot read.'
              : undefined,
          },
  );
  if (stage === 'reading' || readFailed || facts.unfit.length) return steps;

  if (stage === 'evaluating' || stage === 'stopped') {
    const stopped = stage === 'stopped';
    steps.push({
      id: 'evaluation',
      name: stopped ? 'Proposal' : 'Proposing',
      label: records,
      flag: stopped ? 'Stopped' : undefined,
      status: stopped ? 'blocked' : 'running',
      note: stopped
        ? 'No proposal came back, so nothing is asked of you.'
        : undefined,
    });
    return steps;
  }
  steps.push({
    id: 'evaluation',
    name: 'Proposal',
    label: `${records} proposed`,
    flag: facts.needYou ? `${facts.needYou} unsure` : undefined,
    status: 'complete',
  });

  const decided = reached(stage, 'ready_to_commit');
  steps.push({
    id: 'review',
    name: 'Review',
    label: decided
      ? 'All decided'
      : facts.decided
        ? `${facts.decided} of ${facts.records} decided`
        : 'Awaiting a reviewer',
    status: decided ? 'complete' : 'attention',
    note: decided ? undefined : 'Nothing is written until a person decides.',
  });
  if (!decided) return steps;

  // Values, across every output: what the approval button counts too.
  const rows = plural(facts.writes, 'value');
  steps.push(
    stage === 'ready_to_commit'
      ? {
          id: 'commit',
          name: 'Approval',
          label: facts.writes ? `${rows} to write` : 'Nothing to write',
          status: facts.writes ? 'attention' : 'complete',
        }
      : stage === 'committing'
        ? {
            id: 'commit',
            name: 'Approval',
            label: `Writing ${rows}`,
            status: 'running',
          }
        : stage === 'intervention'
          ? {
              id: 'commit',
              name: 'Approval',
              label: rows,
              flag: 'Check the sheet',
              status: 'blocked',
              note: facts.mismatch ?? undefined,
            }
          : {
              id: 'commit',
              name: 'Approval',
              label: `${rows} written · read back`,
              status: 'complete',
            },
  );
  return steps;
}

// One polite line per stage: a milestone, never a running count.
export function modelRunAnnouncement(stage: ModelRunStage): string {
  return {
    starting: 'Run requested. Starting.',
    reading: 'Reading the inputs.',
    evaluating: 'Inputs read. Proposing.',
    awaiting_review: 'Proposal ready for review.',
    reviewing: 'Review in progress.',
    ready_to_commit: 'Everything decided. Awaiting approval.',
    committing: 'Writing the approved changes.',
    intervention: 'Written, but the output reads back differently.',
    committed: 'Approved changes written and read back.',
    stopped: 'Run stopped before a proposal was ready.',
  }[stage];
}

export const MODEL_RUN_STAGE_LABELS: Record<ModelRunStage, string> = {
  starting: 'Starting',
  reading: 'Reading inputs',
  evaluating: 'Proposing',
  awaiting_review: 'Awaiting review',
  reviewing: 'In review',
  ready_to_commit: 'Awaiting approval',
  committing: 'Writing',
  intervention: 'Needs intervention',
  committed: 'Written',
  stopped: 'Stopped',
};

// A line of the proposing step's timeline: what was done, and by whom.
export type EventLine = {
  at: string;
  by: 'model' | 'app';
  text: string;
  problem: boolean;
  // Each thing behind a grouped line, one per record, for whoever opens it.
  details?: string[];
};

const clockOf = (at: string) =>
  new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

const FINISHED: Record<string, string> = {
  length: 'The answer was cut short at the length limit.',
  'content-filter': 'The answer was withheld by a content filter.',
  error: 'The answer ended in an error.',
};

/*
  An engine event (ProposalEvent) as the timeline says it, in the process's
  own nouns: nothing here names a process. An answer is two lines -- what the
  model gave, and what the app's checks made of it.
*/
export function describeEvent(
  event: ProposalEvent,
  facts: Pick<ModelRunFacts, 'subject' | 'sources' | 'records'>,
  version: string,
): EventLine[] {
  const { one, other, field } = facts.subject;
  const records = (count: number) => plural(count, one, other);
  const line = (
    text: string,
    problem = false,
    by: EventLine['by'] = 'model',
  ) => ({
    at: event.at,
    by,
    text,
    problem,
  });
  switch (event.kind) {
    case 'asked':
      return [
        line(
          `Sent instructions ${version} and ${plural(facts.sources, 'source')} (${records(facts.records)}) to ${event.model}.`,
          false,
          'app',
        ),
      ];
    case 'busy':
      return [
        line(
          `${event.model} ${
            event.why === 'quota'
              ? `is out of quota${event.until ? ` until ${clockOf(event.until)}` : ''}`
              : event.why === 'slow'
                ? 'took too long to answer'
                : `is unavailable${event.status ? ` (${event.status})` : ''}`
          }; trying the next model.`,
          true,
          'app',
        ),
      ];
    case 'tried':
      return [
        line(`Tried values for ${records(event.records)} against the checks.`),
      ];
    case 'answered': {
      const parts = [
        event.set ? `${event.set} with a new ${field}` : null,
        event.leave ? `${event.leave} unchanged` : null,
        event.unsure ? `${event.unsure} unsure` : null,
      ].filter(Boolean);
      const all = event.records === facts.records ? 'all ' : '';
      const sentBack = sentBackFor(event.problems, facts);
      return [
        line(
          `Answered ${all}${records(event.records)}${parts.length ? `: ${parts.join(', ')}` : ''}.`,
        ),
        event.problems.length
          ? {
              ...line(`Sent back to fix: ${sentBack.summary}.`, true, 'app'),
              details: sentBack.details,
            }
          : line(
              `Checked: every ${one} answered${event.cited ? `, ${plural(event.cited, 'cited cell')} found` : ''}.`,
              false,
              'app',
            ),
      ];
    }
    case 'warned':
      return [line(`The model warned: ${event.warnings.join('; ')}.`, true)];
    case 'ended':
      return [
        line(
          FINISHED[event.reason] ?? `The answer ended: ${event.reason}.`,
          true,
        ),
      ];
  }
}

/*
  What the app's check sent back, grouped: one clause for each kind of
  problem and what it names, said once for however many records share it;
  and each problem on its own, for the list beneath.
*/
function sentBackFor(
  problems: AnswerProblem[],
  facts: Pick<ModelRunFacts, 'subject' | 'records'>,
): { summary: string; details: string[] } {
  const { one, other } = facts.subject;
  const groups = new Map<string, AnswerProblem[]>();
  for (const problem of problems) {
    // What it names, not which record: blank cells differ cell by cell, so
    // they group by kind alone.
    const id =
      problem.kind === 'blank'
        ? problem.kind
        : JSON.stringify({ ...problem, key: null });
    groups.set(id, [...(groups.get(id) ?? []), problem]);
  }
  const clause = (group: AnswerProblem[]) => {
    const first = group[0]!;
    const n = new Set(group.map((p) => p.key)).size;
    const every = n > 1 && n === facts.records;
    const single = n === 1 || every;
    const who = every ? `every ${one}` : plural(n, one, other);
    const cite = single ? 'cites' : 'cite';
    switch (first.kind) {
      case 'no-column':
        return `${who} ${cite} a column that isn't there (${first.tab} › ${first.column})`;
      case 'no-tab':
        return `${who} ${cite} a tab that isn't there (${first.tab})`;
      case 'no-row':
        return `${who} ${cite} a row that isn't there (${first.tab} row ${first.row})`;
      case 'blank':
        return `${who} ${cite} ${group.length === 1 ? 'a blank cell' : 'blank cells'}`;
      case 'twice':
        return `${who} ${single ? 'is' : 'are'} answered twice`;
      case 'no-values':
        return `${who} ${single ? 'has' : 'have'} no values to set`;
      case 'unanswered':
        return `${who} ${single ? "wasn't" : "weren't"} answered`;
    }
  };
  const detail = (p: AnswerProblem) => {
    switch (p.kind) {
      case 'no-column':
        return `${p.key} cites ${p.tab} › ${p.column}, a column that isn't there`;
      case 'no-tab':
        return `${p.key} cites ${p.tab}, a tab that isn't there`;
      case 'no-row':
        return `${p.key} cites ${p.tab} row ${p.row}, a row that isn't there`;
      case 'blank':
        return `${p.key} cites ${p.cell}, which is blank`;
      case 'twice':
        return `${p.key} is answered twice`;
      case 'no-values':
        return `${p.key} has no values to set`;
      case 'unanswered':
        return `${p.key} wasn't answered`;
    }
  };
  return {
    summary: [...groups.values()].map(clause).join('; '),
    details: problems.map(detail),
  };
}
