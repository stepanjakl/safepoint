import frozen from '@/e2e/fixtures/brunch-orders-rules.json';
import snapshot from '@/fixtures/brunch-orders/sheet-snapshot.json';
import { definitionSetSchema } from '@/lib/definitions/types';

// The frozen rulebook the browser tests use, and the names of its records.
export function sampleDraft() {
  const [, ...products] = snapshot.valueRanges[0]!.values;
  return {
    set: definitionSetSchema.parse(frozen),
    names: Object.fromEntries(
      products.map((row) => [String(row[0]), String(row[1])] as const),
    ),
  };
}
