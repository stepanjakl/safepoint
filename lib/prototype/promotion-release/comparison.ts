/** Compare valid timestamps by instant; invalid or missing values never match. */
export function sameInstant(left: string | null, right: string | null) {
  if (left === null || right === null) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/** Snapshots are JSON values. Object key order is not part of their meaning. */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((item, i) => sameJsonValue(item, right[i]))
    );
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = Object.entries(left);
    const b = Object.entries(right);
    return (
      a.length === b.length &&
      a.every(([key, value]) =>
        b.some(
          ([otherKey, otherValue]) =>
            key === otherKey && sameJsonValue(value, otherValue),
        ),
      )
    );
  }
  return false;
}
