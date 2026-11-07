'use client';

import { useEffect, useState } from 'react';
import { TextMorph } from 'torph/react';

/*
  How long a morph takes: a figure ticking over is quick, words changing
  whole are slower so each can be read. Every morph uses one of these.
*/
const MORPH_FIGURE_MS = 260;
export const MORPH_WORDS_MS = 360;

/*
  A value that morphs when it changes -- a count ticking over, a label
  switching. The morph is drawn for the eye only (torph hides its letters from
  assistive technology), so the words are said once more, plainly, for a
  screen reader.
*/
export function MorphingText({
  text,
  duration = MORPH_FIGURE_MS,
}: {
  text: string;
  // MORPH_WORDS_MS for a phrase that changes whole words.
  duration?: number;
}) {
  return (
    <>
      <span aria-hidden="true">
        <TextMorph as="span" duration={duration}>
          {text}
        </TextMorph>
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

/*
  A control's label that morphs when it changes -- Show to Hide, Edit to Done
  -- and is plain text until it first does, so a label that never changes is
  drawn as it always was. The first change starts from the label it replaces:
  the morph is mounted on the old words and given the new ones a frame later.
*/
export function MorphingLabel({
  text,
  duration = MORPH_WORDS_MS,
}: {
  text: string;
  duration?: number;
}) {
  const [changed, setChanged] = useState(false);
  const [from, setFrom] = useState(text);
  if (!changed && text !== from) setChanged(true);
  useEffect(() => {
    if (!changed || from === text) return;
    const frame = requestAnimationFrame(() => setFrom(text));
    return () => cancelAnimationFrame(frame);
  }, [changed, from, text]);
  if (!changed) return text;
  return (
    <>
      <span aria-hidden="true">
        <TextMorph as="span" duration={duration}>
          {from}
        </TextMorph>
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

// A label given as children, when it is only words: what a control morphs.
export function plainLabel(children: unknown): string | null {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children);
  if (
    Array.isArray(children) &&
    children.every(
      (child) =>
        typeof child === 'string' ||
        typeof child === 'number' ||
        child === null ||
        child === false ||
        child === undefined,
    )
  )
    return children
      .filter((child) => child != null && child !== false)
      .join('');
  return null;
}
