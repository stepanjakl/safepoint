'use client';

import { useEffect, useState } from 'react';

import { plural } from '@/components/brunch-orders/trial-parts';
import type { Definition, DefinitionSet } from '@/lib/definitions/types';
import { motionTime } from '@/lib/motion-time';

/*
  The one scripted draft both /workbench/draft-progress and /workbench/run walk
  through. Everything here is simulated: no model, no route, no file.
*/

// The words of the engine's own refusal (lib/definitions/calls.ts).
const QUOTA =
  'Out of quota: gemini-3.5-flash-lite until 14:20, gemini-3.1-flash-lite until 14:20. Choose a model of another family, or try again later.';

export type Scene = {
  name: string;
  // Whether the model has said what the rules are yet.
  found: boolean;
  // How many rules have their formula: the first ones, as a draft goes in order.
  written: number;
  running: boolean;
  // What the model is doing on the rule it is writing.
  activity: string | null;
  error: string | null;
};

export const SCENES: readonly Scene[] = [
  {
    name: 'Finding the definitions',
    found: false,
    written: 0,
    running: true,
    activity: null,
    error: null,
  },
  {
    name: 'First rule writing, the rest queued',
    found: true,
    written: 0,
    running: true,
    activity: 'Asking the model for a formula',
    error: null,
  },
  {
    name: 'Some written, one writing',
    found: true,
    written: 2,
    running: true,
    activity: 'Trying a formula on real data · attempt 2',
    error: null,
  },
  {
    name: 'A long wait',
    found: true,
    written: 2,
    running: true,
    activity: 'Waiting 40 s for a request slot',
    error: null,
  },
  {
    name: 'A rule sent back',
    found: true,
    written: 3,
    running: true,
    activity: 'Fixing 1 problem',
    error: null,
  },
  {
    name: 'Finished, rules waiting for a person',
    found: true,
    written: 5,
    running: false,
    activity: null,
    error: null,
  },
  {
    name: 'Stopped part way by quota',
    found: true,
    written: 3,
    running: false,
    activity: null,
    error: QUOTA,
  },
];

export type Stage = 'written' | 'writing' | 'queued' | 'unreached';

// A rule as the model found it, before it was written (lib/definitions/find.ts).
const asFound = (item: Definition): Definition => ({
  ...item,
  constants: [],
  groups: [],
  uses: [],
  formula: null,
  examples: [],
  problem: null,
  model: null,
});

export function stagesOf(set: DefinitionSet, scene: Scene) {
  if (!scene.found) return [];
  return set.definitions.map((item, index) => {
    if (index < scene.written) return { item, stage: 'written' as Stage };
    const stage: Stage = !scene.running
      ? 'unreached'
      : index === scene.written
        ? 'writing'
        : 'queued';
    return { item: asFound(item), stage };
  });
}

// What the server says today, in its own words (lib/definitions/draft.ts).
export function serverSays(set: DefinitionSet, scene: Scene) {
  const count = set.definitions.length;
  if (!scene.found) return 'Finding the definitions in the instructions…';
  if (scene.error) return scene.error;
  if (!scene.running) return `Drafted ${plural(count, 'definition')}.`;
  const rule = set.definitions[scene.written]!;
  return `Writing ${scene.written + 1} of ${count}: ${rule.name}…`;
}

export function summaryOf(set: DefinitionSet, scene: Scene) {
  const count = set.definitions.length;
  const share = scene.found ? (scene.written / count) * 100 : 0;
  if (!scene.found)
    return {
      headline: 'Drafting: finding the definitions',
      detail: 'How many rules there are is not known yet.',
      share,
    };
  const tally = `${scene.written} of ${count} written`;
  if (scene.error)
    return { headline: `Stopped: ${tally}`, detail: scene.error, share };
  if (!scene.running)
    return {
      headline: `Drafted: ${tally}`,
      detail: `${scene.written} waiting for you`,
      share,
    };
  return {
    headline: `Drafting: ${tally}`,
    detail: `Writing “${set.definitions[scene.written]!.name}”`,
    share,
  };
}

const PLAY_MS = 3500;
// Where a page opens: mid-draft, where the options differ most.
const FIRST_SHOWN = 2;

// Which scene is showing, moved by hand or played. Play stops at the end
// rather than looping, so it does not announce for ever.
export function useScript() {
  const [at, setAt] = useState(FIRST_SHOWN);
  const [playing, setPlaying] = useState(false);
  const last = SCENES.length - 1;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setAt(at + 1);
      if (at + 1 === last) setPlaying(false);
    }, motionTime(PLAY_MS));
    return () => clearTimeout(timer);
  }, [playing, at, last]);
  return {
    at,
    scene: SCENES[at]!,
    playing,
    move: (to: number) => {
      setPlaying(false);
      setAt(to);
    },
    toggle: () => {
      if (!playing && at === last) setAt(0);
      setPlaying(!playing);
    },
  };
}
