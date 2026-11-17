/*
  Where two nearly identical texts differ, word by word: each text as runs,
  marked where it has words the other lacks. Spaces and punctuation are
  tokens too, so a run keeps its spacing; a space between two changed words
  joins them into one run. Safe for the browser.
*/

export type Run = { text: string; changed: boolean };

const tokensOf = (text: string) => text.match(/\w+|\s+|[^\w\s]/g) ?? [];

const isSpace = (token: string) => /^\s+$/.test(token);

// Each token's run, merged with its neighbours of the same kind.
function runsOf(tokens: string[], changed: boolean[]): Run[] {
  // A space between two changed tokens is part of the change it sits in.
  const marked = changed.map(
    (c, i) =>
      c ||
      (isSpace(tokens[i]!) &&
        i > 0 &&
        i < tokens.length - 1 &&
        changed[i - 1]! &&
        changed[i + 1]!),
  );
  const runs: Run[] = [];
  tokens.forEach((text, i) => {
    const last = runs.at(-1);
    if (last && last.changed === marked[i]) last.text += text;
    else runs.push({ text, changed: marked[i]! });
  });
  return runs;
}

export function wordDiff(a: string, b: string): [Run[], Run[]] {
  const x = tokensOf(a);
  const y = tokensOf(b);
  // The longest common subsequence, as lengths from each position on.
  const lengths = Array.from({ length: x.length + 1 }, () =>
    new Array<number>(y.length + 1).fill(0),
  );
  for (let i = x.length - 1; i >= 0; i -= 1)
    for (let j = y.length - 1; j >= 0; j -= 1)
      lengths[i]![j] =
        x[i] === y[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const inX = new Array<boolean>(x.length).fill(true);
  const inY = new Array<boolean>(y.length).fill(true);
  for (let i = 0, j = 0; i < x.length && j < y.length;)
    if (x[i] === y[j]) {
      inX[i] = false;
      inY[j] = false;
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i += 1;
    else j += 1;
  return [runsOf(x, inX), runsOf(y, inY)];
}
