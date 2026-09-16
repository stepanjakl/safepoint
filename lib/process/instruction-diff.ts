/*
  What changed between two versions of a process's instructions.

  Instructions are prose, written in paragraphs, so a change is read at two
  levels: which paragraphs are new, gone or rewritten, and inside a rewritten
  one, which words. A character diff answers a question nobody asks, and a
  paragraph diff alone hides a one-word change in a long paragraph.

  Both levels use the same longest common subsequence. Between two paragraphs
  that survived unchanged, removals and additions are paired in order as
  rewrites -- but only when they still share enough words to be the same
  paragraph edited. Otherwise the reader sees one paragraph go and another
  arrive, which is what happened.
*/

type Op<T> = { kind: 'same' | 'added' | 'removed'; value: T };

function lcsOps<T>(before: readonly T[], after: readonly T[]): Op<T>[] {
  const n = before.length;
  const m = after.length;
  // lcs[i][j]: the longest run shared by before[i..] and after[j..].
  const lcs = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        before[i] === after[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      ops.push({ kind: 'same', value: before[i]! });
      i += 1;
      j += 1;
    } else if (j < m && (i === n || lcs[i]![j + 1]! > lcs[i + 1]![j]!)) {
      // Strictly greater: on a tie the removal goes first, so a rewrite
      // reads as the old words struck and then the new ones.
      ops.push({ kind: 'added', value: after[j]! });
      j += 1;
    } else {
      ops.push({ kind: 'removed', value: before[i]! });
      i += 1;
    }
  }
  return ops;
}

export type ClauseChange =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'changed'; before: string; after: string };

// Whole units -- clauses, paragraphs -- with removals and additions between
// two kept units paired in order as rewrites.
export function diffClauses(
  before: readonly string[],
  after: readonly string[],
  isRewrite: (before: string, after: string) => boolean = () => true,
): ClauseChange[] {
  const changes: ClauseChange[] = [];
  const removed: string[] = [];
  const added: string[] = [];
  const flush = () => {
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k += 1) {
      if (isRewrite(removed[k]!, added[k]!)) {
        changes.push({
          kind: 'changed',
          before: removed[k]!,
          after: added[k]!,
        });
      } else {
        changes.push({ kind: 'removed', text: removed[k]! });
        changes.push({ kind: 'added', text: added[k]! });
      }
    }
    for (const text of removed.slice(paired)) {
      changes.push({ kind: 'removed', text });
    }
    for (const text of added.slice(paired)) {
      changes.push({ kind: 'added', text });
    }
    removed.length = 0;
    added.length = 0;
  };
  for (const op of lcsOps(before, after)) {
    if (op.kind === 'same') {
      flush();
      changes.push({ kind: 'same', text: op.value });
    } else if (op.kind === 'added') {
      added.push(op.value);
    } else {
      removed.push(op.value);
    }
  }
  flush();
  return changes;
}

export type TextSegment = {
  kind: 'same' | 'added' | 'removed';
  text: string;
};

export type ParagraphChange =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'changed'; segments: TextSegment[] };

export type TextDiff = {
  paragraphs: ParagraphChange[];
  // Word counts for each paragraph, in the same order.
  stats: { wordsAdded: number; wordsRemoved: number }[];
  paragraphsChanged: number;
  wordsAdded: number;
  wordsRemoved: number;
};

// Paragraphs are separated by a blank line; a single line break stays inside
// its paragraph, so a short list reads as one block.
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

// Words, punctuation and the whitespace between them. Punctuation is its own
// token, so "multiple." becoming "multiple, and never above…" marks the comma
// and what follows, not the word that stayed; whitespace is kept, so a
// rendered diff keeps the text's own spacing and line breaks.
const WORD = /[\p{L}\p{N}'’-]+/gu;
const tokensOf = (text: string) =>
  text.match(/\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}'’-]/gu) ?? [];
const wordsOf = (text: string) => text.match(WORD) ?? [];
const wordsIn = (text: string) => wordsOf(text).length;

/*
  Whether a removed and an added paragraph are one paragraph rewritten or two
  different paragraphs. Either test is enough: most of the shorter one
  survives inside the longer -- a clause added to a sentence -- or a good
  share of both is common -- a sentence reworded throughout.
*/
const SHORTER_SURVIVES = 0.6;
const BOTH_SHARE = 0.35;

function isRewrite(before: string, after: string): boolean {
  const a = wordsOf(before);
  const b = wordsOf(after);
  const shared = lcsOps(a, b).filter((op) => op.kind === 'same').length;
  return (
    shared / Math.max(Math.min(a.length, b.length), 1) >= SHORTER_SURVIVES ||
    shared / Math.max(a.length, b.length, 1) >= BOTH_SHARE
  );
}

function diffWords(before: string, after: string): TextSegment[] {
  const ops = lcsOps(tokensOf(before), tokensOf(after));
  const segments: TextSegment[] = [];
  // A run of changes is gathered into one removal and one addition, so a
  // rewritten phrase reads as the old phrase struck and the new one inserted
  // rather than as alternating single words.
  let removed = '';
  let added = '';
  const flush = () => {
    if (removed.trim()) segments.push({ kind: 'removed', text: removed });
    if (added.trim()) segments.push({ kind: 'added', text: added });
    removed = '';
    added = '';
  };
  ops.forEach((op, index) => {
    if (op.kind === 'removed') {
      removed += op.value;
      return;
    }
    if (op.kind === 'added') {
      added += op.value;
      return;
    }
    // The space between two changed words belongs to the change on both
    // sides; the LCS would otherwise keep it, and split the phrase in two.
    const inChange =
      (removed || added) && !op.value.trim() && ops[index + 1]?.kind !== 'same';
    if (inChange && index + 1 < ops.length) {
      removed += op.value;
      added += op.value;
      return;
    }
    flush();
    const last = segments.at(-1);
    if (last?.kind === 'same') last.text += op.value;
    else segments.push({ kind: 'same', text: op.value });
  });
  flush();
  return segments;
}

export function diffText(before: string, after: string): TextDiff {
  const paragraphs: ParagraphChange[] = diffClauses(
    paragraphsOf(before),
    paragraphsOf(after),
    isRewrite,
  ).map((change) =>
    change.kind === 'changed'
      ? { kind: 'changed', segments: diffWords(change.before, change.after) }
      : change,
  );

  const stats = paragraphs.map((paragraph) => {
    switch (paragraph.kind) {
      case 'same':
        return { wordsAdded: 0, wordsRemoved: 0 };
      case 'added':
        return { wordsAdded: wordsIn(paragraph.text), wordsRemoved: 0 };
      case 'removed':
        return { wordsAdded: 0, wordsRemoved: wordsIn(paragraph.text) };
      case 'changed':
        return paragraph.segments.reduce(
          (counts, segment) => ({
            wordsAdded:
              counts.wordsAdded +
              (segment.kind === 'added' ? wordsIn(segment.text) : 0),
            wordsRemoved:
              counts.wordsRemoved +
              (segment.kind === 'removed' ? wordsIn(segment.text) : 0),
          }),
          { wordsAdded: 0, wordsRemoved: 0 },
        );
    }
  });
  return {
    paragraphs,
    stats,
    paragraphsChanged: paragraphs.filter((p) => p.kind !== 'same').length,
    wordsAdded: stats.reduce((sum, s) => sum + s.wordsAdded, 0),
    wordsRemoved: stats.reduce((sum, s) => sum + s.wordsRemoved, 0),
  };
}
