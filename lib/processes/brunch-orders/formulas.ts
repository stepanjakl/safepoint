import { Environment } from '@marcbachmann/cel-js';

import type { KeptRead } from './reads';

/*
  What a Brunch orders formula can read, for one product: the product's row
  from every data tab joined by its key, its category's parameters, the
  proposed order and the values worked out before it. Standard CEL, nothing
  added: a formula is a rule (true when it holds) or a value (a number).

  Whole numbers are CEL ints, so money and counts stay exact; any other number
  is a double. A blank cell is absent from the record, so `has(product.x)`
  says whether it was filled in.
*/

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Row = Record<string, unknown>;
export type Context = {
  sku: string;
  product: Row;
  category: Row;
  order: bigint;
  values: Row;
  weekdays: Record<string, bigint>;
};

const cel = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? BigInt(value) : value;

// Rows keyed by their first column, with blank cells left out.
function keyed(values: unknown[][]): Map<string, Row> {
  const [header = [], ...rows] = values;
  const names = header.map((h) => String(h));
  return new Map(
    rows
      .filter((row) => row[0] !== undefined && row[0] !== '')
      .map((row) => [
        String(row[0]),
        Object.fromEntries(
          names
            .map((name, i) => [name, cel(row[i])] as const)
            .filter(([, v]) => v !== undefined && v !== ''),
        ),
      ]),
  );
}

// Each product's record, joined across the tabs keyed by product, and the
// parameters per category. The first tab lists the products.
export function recordsOf(read: KeptRead) {
  const tabs = read.tabs.filter((t) => t.name !== 'Parameters');
  const parameters = keyed(
    read.tabs.find((t) => t.name === 'Parameters')?.values ?? [],
  );
  const byTab = tabs.map((t) => keyed(t.values));
  const skus = [...(byTab[0]?.keys() ?? [])];
  const products = new Map(
    skus.map((sku) => [
      sku,
      Object.assign({}, ...byTab.map((rows) => rows.get(sku) ?? {})) as Row,
    ]),
  );
  return {
    skus,
    product: (sku: string) => products.get(sku) ?? {},
    category: (sku: string) =>
      parameters.get(String(products.get(sku)?.category ?? '')) ?? {},
  };
}

const env = new Environment({
  unlistedVariablesAreDyn: true,
  enableOptionalTypes: true,
});
const compiled = new Map<string, (ctx: object) => unknown>();

export function run(formula: string, context: Context): unknown {
  let fn = compiled.get(formula);
  if (!fn) {
    fn = env.parse(formula) as (ctx: object) => unknown;
    compiled.set(formula, fn);
  }
  return fn(context);
}

// Whether a formula parses at all, before it is run on anything.
export function parseError(formula: string): string | null {
  try {
    env.parse(formula);
    return null;
  } catch (error) {
    return (error as Error).message.split('\n')[0]!;
  }
}

// Each product's name, for showing a key with what it is: the first tab's
// second column, as the sheet writes it.
export function namesOf(read: KeptRead): Record<string, string> {
  const [, ...rows] = read.tabs[0]?.values ?? [];
  return Object.fromEntries(
    rows
      .filter((row) => row[0] !== undefined && row[0] !== '')
      .map((row) => [String(row[0]), String(row[1] ?? '')]),
  );
}

export function contextFor(
  read: KeptRead,
  sku: string,
  order: number,
  values: Row,
): Context {
  const records = recordsOf(read);
  return {
    sku,
    product: records.product(sku),
    category: records.category(sku),
    order: BigInt(Math.trunc(order)),
    values,
    weekdays: Object.fromEntries(WEEKDAYS.map((d, i) => [d, BigInt(i + 1)])),
  };
}

// What a model writing a formula is told it can read, with one product's
// record as it really is.
export function describe(read: KeptRead): string {
  const records = recordsOf(read);
  const sku = records.skus[0] ?? '';
  const show = (row: Row) =>
    JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  return [
    'A formula is standard CEL, evaluated for one product at a time, with these variables:',
    `- sku: the product's key, a string (the products are ${records.skus.join(', ')}).`,
    `- product: the product's row from every data tab, joined by its key. For ${sku}: ${show(records.product(sku))}.`,
    `- category: the Parameters row of the product's category. For ${sku}: ${show(records.category(sku))}.`,
    '- order: the proposed order, in units, an int.',
    '- values: the values worked out before this one, by id, such as values.expected_sales.',
    '- weekdays: Mon to Sun as 1 to 7, so days can be compared: weekdays[product.delivery_day] < weekdays["Sat"].',
    'Whole numbers are ints and other numbers doubles; CEL never mixes them, so convert with double(x) or int(x) (3 == 3.0 is an error). A time of day is a fraction of a day: 0.25 is 06:00, 0.291666 is 07:00. A blank cell is absent: test it with has(product.field). There is no rounding function: round a division of whole numbers up with (a + b - 1) / b, and write percentages as whole numbers (115 for 15% more) so the arithmetic stays exact.',
  ].join('\n');
}
