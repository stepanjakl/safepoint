/*
  A source is a place data lives -- a spreadsheet now, a database or a shop
  later -- described by what it holds and nothing else: its resources (a
  sheet's tabs), their rows and their columns. It knows nothing of the
  processes that read from it or write to it; a process names the resources
  it uses (`SourceUse`), and what it does with them stays with the process.

  Declared here, in code, for now. Safe for the browser.
*/

/*
  `database` is not declared by any source the app has: it is the engine's
  second kind, held to it in tests (lib/definitions/conformance.test.ts), so
  that nothing in lib/definitions/ assumes a sheet.
*/
export type SourceKind = 'google-sheets' | 'database';

// What a kind of source calls itself and its parts.
export const SOURCE_KINDS: Record<
  SourceKind,
  {
    name: string;
    // What one source of this kind is called in a sentence.
    noun: string;
    // The utility its mark is drawn in, named whole so it is scanned.
    mark: string;
    resource: { singular: string; plural: string };
    open: string;
  }
> = {
  'google-sheets': {
    name: 'Google Sheets',
    noun: 'sheet',
    mark: 'source-mark-sheets',
    resource: { singular: 'tab', plural: 'tabs' },
    open: 'Open in Google Sheets',
  },
  database: {
    name: 'Database',
    noun: 'database',
    mark: 'source-mark-sheets',
    resource: { singular: 'table', plural: 'tables' },
    open: 'Open the database',
  },
};

/*
  How a kind of source addresses what it holds, as a person reads it and as
  a write names its block. Positions count from zero, as a read holds a
  resource: a grid whose row 0 is the header.
*/
type ValueAt = {
  resource: string;
  column: { index: number; header: string };
  // The record's key where the row has one a person would know it by.
  row: { index: number; key?: string };
};
type BlockAt = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};
type SourceAddressing = {
  // One value, its resource included: a sheet's `Stock!B3`.
  value: (at: ValueAt) => string;
  // A rectangle within one resource, which is named apart: a sheet's `B2:C12`.
  block: (at: BlockAt) => string;
  // Where a block this kind addressed starts; null for any other text.
  blockStart: (block: string) => { top: number; left: number } | null;
  // The resource a value this kind addressed is in; null for any other text.
  resourceOf: (value: string) => string | null;
};

// A sheet's column letters and row number: column 0, row 0 is A1.
const a1 = (column: number, row: number) => {
  let letters = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
};

const SOURCE_ADDRESSING: Record<SourceKind, SourceAddressing> = {
  'google-sheets': {
    value: ({ resource, column, row }) =>
      `${resource}!${a1(column.index, row.index)}`,
    block: ({ top, left, bottom, right }) =>
      `${a1(left, top)}:${a1(right, bottom)}`,
    blockStart: (block) => {
      const match = /^([A-Z]+)(\d+)(?::|$)/.exec(block);
      if (!match) return null;
      const left =
        [...match[1]!].reduce(
          (n, letter) => n * 26 + letter.charCodeAt(0) - 64,
          0,
        ) - 1;
      return { top: Number(match[2]) - 1, left };
    },
    // A tab's name may hold a "!" itself; the cell after the last one.
    resourceOf: (value) => {
      const at = value.lastIndexOf('!');
      return at > 0 ? value.slice(0, at) : null;
    },
  },
  // A row by its key, where it has one, else by the number the data shows it
  // at (the header is row 1); a column by its name. A block by its positions.
  database: {
    value: ({ resource, column, row }) =>
      `${resource}[${row.key ?? `row ${row.index + 1}`}].${column.header}`,
    block: ({ top, left, bottom, right }) =>
      `rows ${top + 1}-${bottom + 1}, columns ${left + 1}-${right + 1}`,
    blockStart: (block) => {
      const match = /^rows (\d+)-\d+, columns (\d+)-\d+$/.exec(block);
      return match
        ? { top: Number(match[1]) - 1, left: Number(match[2]) - 1 }
        : null;
    },
    resourceOf: (value) => {
      const at = value.indexOf('[');
      return at > 0 ? value.slice(0, at) : null;
    },
  },
};

export type SourceTerms = (typeof SOURCE_KINDS)[SourceKind] & {
  address: SourceAddressing;
};

// A kind's words and addressing; a sheet's where no kind is said, as every
// source was before there were kinds.
export const sourceTermsOf = (
  kind: SourceKind = 'google-sheets',
): SourceTerms => ({
  ...SOURCE_KINDS[kind],
  address: SOURCE_ADDRESSING[kind],
});

export type SourceDeclaration = {
  id: string;
  kind: SourceKind;
  // Shown until a read gives the source's own title.
  label: string;
};

export const SOURCES = [
  {
    id: 'brunch-store-sheet',
    kind: 'google-sheets',
    label: 'Brunch store sheet',
  },
] as const satisfies readonly SourceDeclaration[];

export type SourceId = (typeof SOURCES)[number]['id'];

/*
  Where one cell of a source opens, by its kind: a sheet's cell by its tab's
  id and its A1 address. The source's own link where it cannot be reached.
*/
export function cellUrl(
  kind: SourceKind,
  url: string,
  resourceId: number | undefined,
  cell: string,
): string {
  switch (kind) {
    case 'google-sheets': {
      if (resourceId === undefined) return url;
      const base = url.replace(/[?#].*$/, '').replace(/\/(edit)?$/, '');
      return `${base}/edit#gid=${resourceId}&range=${cell}`;
    }
    case 'database':
      return url;
  }
}

export function sourceById(id: string): SourceDeclaration | undefined {
  return SOURCES.find((source) => source.id === id);
}

// The resources of one source a process reads and the ones it writes, by name.
export type SourceUse = {
  source: SourceId;
  inputs: readonly string[];
  outputs: readonly string[];
};

// One resource as a read found it: rows below the header, and the header.
export type SourceResource = {
  name: string;
  rows: number;
  columns: string[];
};

/*
  What a read of a source found, without the values. `captured` is the copy
  kept in the repository, shown until the source is first read here, so the
  page has something true to show without a network.
*/
export type SourceSummary = {
  readId: string;
  readAt: string;
  origin: 'live' | 'captured';
  title: string | null;
  url: string | null;
  resources: SourceResource[];
};

export type SourceValues = {
  readId: string;
  resources: { name: string; values: unknown[][] }[];
};

// The header row, as text, without the empty cells a sheet pads it with.
export function columnsOf(values: unknown[][]): string[] {
  const header = (values[0] ?? []).map((cell) =>
    cell === null || cell === undefined ? '' : String(cell).trim(),
  );
  while (header.length && header.at(-1) === '') header.pop();
  return header;
}
