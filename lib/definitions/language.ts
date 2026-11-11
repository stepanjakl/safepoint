/*
  What the engine reads in a process's instructions that belongs to the
  language they are written in: numbers said as words, the names of the days,
  how a percentage is said, the words of a name and their singular, where a
  sentence ends and what marks a list item. English is the only language so
  far; another is one more `InstructionsLanguage`, and no other engine file
  holds such words (language.test.ts).

  What the engine itself writes for a person (sentences, problems, prompts)
  is the app's English, not this.
*/

export type InstructionsLanguage = {
  // Each number a quote says in words; a quote is lower-cased first.
  numbersInWords: (said: string) => number[];
  // Each day a quote names, Monday 1 to Sunday 7, as weekday cells are read.
  daysNamed: (said: string) => number[];
  // What follows a number to make it a percentage, as a pattern.
  percent: string;
  // The words of a name, each singular, for matching a record's name to the
  // words a group is quoted with.
  nameWords: (name: string) => string[];
  // Where a line breaks into sentences, and what begins a list item.
  sentenceBreak: RegExp;
  listMark: RegExp;
};

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// The language instructions are read in, until a process can say its own.
export const ENGLISH: InstructionsLanguage = {
  numbersInWords: (said) =>
    NUMBER_WORDS.flatMap((word, n) =>
      new RegExp(`\\b${word}\\b`).test(said) ? [n] : [],
    ),
  // A day by its first three letters, so "Sat" and "Saturday's" both name it.
  daysNamed: (said) =>
    DAY_NAMES.flatMap((day, i) =>
      new RegExp(`\\b${day.slice(0, 3)}`).test(said) ? [i + 1] : [],
    ),
  percent: '%|per ?cent',
  // Letters of any script, so a name is never cut where a letter is not a-z;
  // words of three letters or more, a plural's s or es dropped.
  nameWords: (name) =>
    name
      .toLowerCase()
      .split(/[^\p{L}\p{M}]+/u)
      .filter((w) => [...w].length >= 3)
      .map((w) => w.replace(/(es|s)$/, '')),
  // Only whitespace after a stop ends a sentence, so 2.5 and 07:00 stay whole.
  sentenceBreak: /(?<=[.!?])\s+/,
  listMark: /^\s*(?:\d+[.)]|[-*•])\s+/,
};
