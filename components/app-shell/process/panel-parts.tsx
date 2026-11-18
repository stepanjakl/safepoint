/*
  What each section calls itself, in one place. The heading is rendered once,
  by the section row, and the list below points at it -- so a list is labelled
  by the row a reader can actually see rather than by a heading of its own that
  says the same word again.
*/
export type ProcessTab =
  'runs' | 'instructions' | 'rules' | 'inputs' | 'outputs' | 'settings';

export const SECTION: Record<
  Exclude<ProcessTab, 'runs'>,
  { id: string; title: string }
> = {
  instructions: { id: 'instructions-heading', title: 'Instructions' },
  rules: { id: 'rules-heading', title: 'Rules' },
  inputs: { id: 'inputs-heading', title: 'Inputs' },
  outputs: { id: 'outputs-heading', title: 'Outputs' },
  settings: { id: 'settings-heading', title: 'Settings' },
};
