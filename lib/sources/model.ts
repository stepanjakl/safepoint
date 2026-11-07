/*
  A source is a place data lives -- a spreadsheet now, a database or a shop
  later -- described by what it holds and nothing else: its resources (a
  sheet's tabs), their rows and their columns. It knows nothing of the
  processes that read from it or write to it; a process names the resources
  it uses (`SourceUse`), and what it does with them stays with the process.

  Declared here, in code, for now. Safe for the browser.
*/

export type SourceKind = 'google-sheets';

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
};

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
