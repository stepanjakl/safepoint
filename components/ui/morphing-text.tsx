import { TextMorph } from 'torph/react';

/*
  A value that morphs when it changes -- a count ticking over, a label
  switching. The morph is drawn for the eye only (torph hides its letters from
  assistive technology), so the words are said once more, plainly, for a
  screen reader.
*/
export function MorphingText({
  text,
  duration = 260,
}: {
  text: string;
  // Longer for a phrase that changes whole words than for a ticking digit.
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
