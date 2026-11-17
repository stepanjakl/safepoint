/*
  Where two versions of a definition sort records into groups differently:
  each group of the first is paired with the group of the second it shares
  most keys with, and each key only one of the pair holds is a difference.
  What a person can read where two formulas name the same groups alike but
  fill them differently. Safe for the browser.
*/

type Group = { id: string; keys: string[]; quote: string };

export type GroupDifference = {
  // The pair's shorter quote, so both versions name the group alike.
  quote: string;
  key: string;
  // Whether the first version holds the key; the second does not if so.
  inFirst: boolean;
};

const shared = (a: Group, b: Group) =>
  a.keys.filter((key) => b.keys.includes(key)).length;

export function groupDifferences(a: Group[], b: Group[]): GroupDifference[] {
  return a.flatMap((group) => {
    const pair = b.reduce<Group | null>(
      (best, candidate) =>
        shared(group, candidate) > (best ? shared(group, best) : 0)
          ? candidate
          : best,
      null,
    );
    if (!pair) return [];
    const quote =
      pair.quote.length < group.quote.length ? pair.quote : group.quote;
    return [
      ...group.keys
        .filter((key) => !pair.keys.includes(key))
        .map((key) => ({ quote, key, inFirst: true })),
      ...pair.keys
        .filter((key) => !group.keys.includes(key))
        .map((key) => ({ quote, key, inFirst: false })),
    ];
  });
}
