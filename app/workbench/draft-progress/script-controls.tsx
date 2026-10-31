'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { SCENES, type useScript } from './script';

/*
  What moves the scripted draft, and the one status region on the page. Back
  and Next lead on at both ends, so neither is ever disabled under focus.
*/
export function ScriptControls({
  script: { at, playing, move, toggle },
  children,
}: {
  script: ReturnType<typeof useScript>;
  // Further switches for the page.
  children?: ReactNode;
}) {
  const last = SCENES.length - 1;
  return (
    <section
      aria-label="The scripted draft"
      className="draft-controls control-face surface-raised rounded-shell sticky top-2 z-10 flex flex-wrap items-end gap-2 p-3"
    >
      <Button onPress={() => move(at === 0 ? last : at - 1)}>Back</Button>
      <Button variant="primary" onPress={() => move(at === last ? 0 : at + 1)}>
        Next
      </Button>
      <Button onPress={toggle}>{playing ? 'Pause' : 'Play'}</Button>
      {children}
      <label className="grid min-w-0 flex-1 basis-56 gap-1">
        <span className="text-meta text-muted">State</span>
        <select
          className="field text-dense min-h-9 min-w-0 px-2"
          value={at}
          onChange={(event) => move(Number(event.target.value))}
        >
          {SCENES.map((scene, index) => (
            <option key={scene.name} value={index}>
              {index + 1}. {scene.name}
            </option>
          ))}
        </select>
      </label>
      <p role="status" className="sr-only">
        State {at + 1} of {SCENES.length}: {SCENES[at]!.name}.
      </p>
    </section>
  );
}
