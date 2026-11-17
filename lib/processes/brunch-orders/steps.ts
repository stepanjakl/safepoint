import type { ProcessStep } from '@/lib/shell/model';

/* The steps of a Brunch orders run, for both processes. */

// Each step of a run, in order. The thread sets each one's status from the
// run's progress; the phase in each label says which part of the plan brings
// a step that is not built yet.
export const ORDER_STEPS: ProcessStep[] = [
  {
    id: 'instructions',
    name: 'Instructions',
    status: 'complete',
    origin: 'manual',
  },
  { id: 'read', name: 'Read the sheet', status: 'attention' },
  {
    id: 'rules',
    name: 'Rules',
    label: 'From the instructions',
    status: 'pending',
  },
  {
    id: 'calculate',
    name: 'Calculate',
    label: 'From the rules',
    status: 'pending',
  },
  {
    id: 'propose',
    name: 'Propose',
    label: 'From the values',
    status: 'pending',
  },
  {
    id: 'apply',
    name: 'Apply',
    label: 'To the Orders tab',
    status: 'pending',
  },
];

// What each step not built yet will do, in place of its body.
export const COMING: Record<string, string> = {
  rules:
    'The rules found in the instructions, each turned into a check and approved on its own against worked examples.',
  calculate:
    'Expected demand, stock available before the start and what is required, worked out for every product.',
  propose:
    'What to set for every record, why, and how the accepted checks find it, for a person to approve, change or reject.',
  apply:
    'What the decided proposal writes to the sheet, cell by cell, before and after.',
};

// Its steps: no rulebook to draft, so nothing to calculate from; the model
// proposes straight from the instructions and the sheet.
export const DIRECT_ORDER_STEPS: ProcessStep[] = ORDER_STEPS.filter(
  (step) => step.id !== 'rules' && step.id !== 'calculate',
).map((step) =>
  step.id === 'propose' ? { ...step, label: 'From the instructions' } : step,
);
