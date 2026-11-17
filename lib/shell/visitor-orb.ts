/*
  The faces a visitor's orb can have, one per orb index: the hue roles the
  stylesheets already publish, minus the two that mean something went wrong.
  Each reads against any ground, as the state text it is drawn from does.
  Written out whole, because Tailwind reads class names as plain text.
*/
export const VISITOR_ORB_FILLS = [
  'bg-state-advisory',
  'bg-state-verified',
  'bg-state-caution',
  'bg-state-decision',
  'bg-mode-live',
  'bg-mode-simulated',
] as const;

export const VISITOR_ORB_COUNT = VISITOR_ORB_FILLS.length;
