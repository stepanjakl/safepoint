/*
  Every page of the workbench, in the groups the menu at /workbench shows. The
  menu, the breadcrumb on each page and the smoke test read this one list, so a
  new page is added here and nowhere else.
*/

export type WorkbenchEntry = {
  href: string;
  title: string;
  // One line: what the page shows.
  summary: string;
  // The page draws a frame of its own, so the breadcrumb bar is not added
  // above it, and it carries its own way back.
  framed?: true;
};

export type WorkbenchGroup = {
  id: string;
  title: string;
  summary: string;
  entries: readonly WorkbenchEntry[];
};

export const WORKBENCH_HOME = '/workbench';

export const WORKBENCH_GROUPS: readonly WorkbenchGroup[] = [
  {
    id: 'process',
    title: 'Process',
    summary:
      'How a run of the Brunch orders process looks and moves, from frozen fixtures: no model, no sheet.',
    entries: [
      {
        href: '/workbench/run',
        title: 'Run lifecycle',
        summary:
          'A Brunch orders run at every stage, with a player that steps one thread through them.',
      },
      {
        href: '/workbench/proposing-steps',
        title: 'Proposing sub-steps',
        summary:
          'The model activity log inside a proposing step: typography, timestamps, line grammar and transitions.',
      },
      {
        href: '/workbench/run-instructions',
        title: 'Run instructions',
        summary:
          'A run’s own note bubble alongside the standing process instructions inside the Instructions step.',
      },
      {
        href: '/workbench/draft-progress',
        title: 'Draft progress',
        summary:
          'Ways to show a rulebook being drafted, tried on one scripted draft of five rules.',
      },
      {
        href: '/workbench/decisions',
        title: 'Decision transitions',
        summary:
          'The pressed control stays put while its label morphs and its face settles into a status pill.',
      },
      {
        href: '/workbench/loading',
        title: 'Loading states',
        summary:
          'Every wait the app shows as plain words, as it is drawn now and as it would be.',
      },
    ],
  },
  {
    id: 'design-system',
    title: 'Design system',
    summary:
      'The colours, controls and states every screen is built from, as the page paints them.',
    entries: [
      {
        href: '/workbench/colours',
        title: 'Colour reference',
        summary:
          'Surfaces, text and edges on their grounds with measured contrast, state scales and the neutral ramp.',
      },
      {
        href: '/workbench/calibration',
        title: 'Colour calibration',
        summary:
          'Nudge a neutral until it looks as light as its coloured neighbours; the median of a few settings is the number kept.',
      },
      {
        href: '/workbench/controls',
        title: 'Control states',
        summary:
          'Every control in every interaction state at once, pinned rather than hovered.',
      },
      {
        href: '/workbench/states',
        title: 'State illustrations',
        summary:
          'Candidates for the empty run page, drawn on the pane face they sit on.',
      },
      {
        href: '/workbench/table-headers',
        title: 'Table headers',
        summary:
          'Five ways to give column names and tab names their own roles, against the equal bands they had.',
      },
      {
        href: '/workbench/dividers',
        title: 'Header and footer dividers',
        summary:
          'Rules of 1px, 1.5px and 2px on a table, a popover and a panel.',
      },
      {
        href: '/workbench/highlight-crispness',
        title: 'Highlight crispness',
        summary:
          'Inset box-shadow vs pixel-snapped border and outline for inner highlights and lit dividers.',
      },
    ],
  },
  {
    id: 'components',
    title: 'Components and motion',
    summary:
      'Single components and transitions, tried in candidate forms before one was chosen.',
    entries: [
      {
        href: '/workbench/drawers',
        title: 'Drawers',
        summary:
          'The shared drawer components, configurations side by side and a live overlay.',
      },
      {
        href: '/workbench/popover-halo',
        title: 'Popover halo',
        summary:
          'A feathered backdrop blur around a popover in place of a cast shadow.',
      },
      {
        href: '/workbench/popover-edge',
        title: 'Popover edge',
        summary:
          'The popover and tooltip as they ship, beside an outer line with and without the inner highlight.',
      },
      {
        href: '/workbench/assistant-button',
        title: 'Assistant button',
        summary:
          'Ways for the assistant’s notch button to say the panel is open, in each candidate colour.',
      },
      {
        href: '/workbench/button-rounding',
        title: 'Button rounding',
        summary:
          'Text buttons at candidate corner radii, beside the tabs and status pills they should read apart from.',
      },
      {
        href: '/workbench/section-transitions',
        title: 'Section transitions',
        summary:
          'Nine title transitions on one header band, to replay or slow down.',
      },
      {
        href: '/workbench/process-icons',
        title: 'Process icons',
        summary:
          'Candidate icon pairs for a process in the sidebar: checked by rules, or by the model’s judgement.',
      },
    ],
  },
  {
    id: 'history',
    title: 'History',
    summary:
      'Earlier prototypes, brought back from the archive and kept as they were: not maintained, and nothing else depends on them.',
    entries: [
      {
        href: '/workbench/history/promotion',
        title: 'Promotion run',
        summary:
          'The original product idea: a promotion-release review run in the shell, from a recorded replay.',
        framed: true,
      },
      {
        href: '/workbench/history/policy',
        title: 'Policy workbench',
        summary:
          'Edit a promotion policy and see each product’s findings change, from the prototype’s recorded evidence.',
      },
      {
        href: '/workbench/history/explore',
        title: 'Review explorer',
        summary:
          'Change a scenario’s rules or a product’s terms and watch the review’s outcomes move, from recorded data.',
      },
      {
        href: '/workbench/history/colour-ramps',
        title: 'Colour ramps',
        summary:
          'The first colour workbench: the neutral ramp’s revisions in both themes, with the contrast measured on each step.',
      },
    ],
  },
];

// The group and entry a pathname belongs to, for the breadcrumb.
export function workbenchEntryAt(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  for (const group of WORKBENCH_GROUPS) {
    const entry = group.entries.find((candidate) => candidate.href === path);
    if (entry) return { group, entry };
  }
  return null;
}
