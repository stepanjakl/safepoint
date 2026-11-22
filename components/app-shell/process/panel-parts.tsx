import type { ProcessTab } from './process-tab-store';

/*
  What each section calls itself, in one place. The heading is rendered once,
  by the section row, for assistive technology, and the list below points at
  it; sighted readers have the header's selected tab.
*/
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
