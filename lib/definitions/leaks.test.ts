import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BRUNCH_ORDERS_DEFINITIONS,
  DATA_TABS,
} from '@/lib/processes/brunch-orders/process';

import { capturedTabs } from './captured.fixture';

/*
  The engine names no process. Every word Brunch orders supplies -- its tabs,
  column headers, record words, proposal fields, lookups, moments, and the
  keys and names of its records -- is gathered from its declaration and its
  captured read, and no engine source may hold one: not in code, strings or
  comments. A word the engine also uses as its own is allowed only in the
  phrases listed below, each with its reason.
*/

const DIRECTORY = 'lib/definitions';

// Engine sources: what a process plugs into, never its tests or fixtures.
const sources = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith('.ts'))
  .filter((name) => !/\.(test|fixture)\.ts$/.test(name))
  .map((name) => ({
    name,
    text: readFileSync(path.join(DIRECTORY, name), 'utf8'),
  }));

// Everything the Brunch process supplies, as words a source could repeat.
function brunchWords(): string[] {
  const { id, subject } = BRUNCH_ORDERS_DEFINITIONS;
  const { data } = subject;
  const timing = data.timing;
  const tabs = capturedTabs();
  const headers = tabs.flatMap((tab) => (tab.values[0] ?? []).map(String));
  const columnOf = (tab: string, column: string) => {
    const [header = [], ...rows] =
      tabs.find((t) => t.name === tab)?.values ?? [];
    const at = header.map(String).indexOf(column);
    return at < 0 ? [] : rows.map((row) => String(row[at] ?? ''));
  };
  const [first = ''] = data.records.tabs;
  return [
    id,
    ...id.split('-'),
    ...DATA_TABS,
    ...data.records.tabs,
    data.records.key,
    data.records.name,
    ...data.lookups.flatMap((l) => [l.tab, l.key, l.via, l.as]),
    ...Object.keys(data.types),
    ...(data.output ? [data.output.tab, data.output.key] : []),
    ...Object.keys(timing?.since ?? {}),
    ...Object.keys(timing?.until ?? {}),
    ...Object.entries(timing?.moments ?? {}).flatMap(([name, moment]) => [
      name,
      ...(moment.label ? [moment.label] : []),
    ]),
    subject.record.singular,
    subject.record.plural,
    subject.reader,
    ...subject.proposal.flatMap((f) => [f.id, f.label, f.unit]),
    ...headers,
    // The records' keys and names, and the keys of the rows they look up.
    ...columnOf(first, data.records.key),
    ...columnOf(first, data.records.name),
    ...data.lookups.flatMap((l) => columnOf(l.tab, l.key)),
  ]
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

/*
  Phrases where a Brunch word is the engine's own, or plain English, and not
  the process speaking. Kept short: each one is a place the test is blind.
*/
const ALLOWED: { phrase: RegExp; why: string }[] = [
  {
    phrase: /\bunit\b/gi,
    why: 'a proposal field’s unit is the engine’s own term (DefinitionSubject)',
  },
  {
    phrase: /\bminor units\b/gi,
    why: 'money is held in its currency’s minor units (field types)',
  },
  {
    phrase: /\b(in|own|examples'|versions') order\b/gi,
    why: 'sequence, as in "in order"',
  },
  { phrase: /\ba product of\b/gi, why: 'arithmetic: a product of decimals' },
  { phrase: /\bParameters</g, why: 'the TypeScript utility type' },
  { phrase: /\bcounted on\b/gi, why: 'the verb, as in "counted on a model"' },
];

const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each place a source says one of these words, allowed phrases aside.
function leaksIn(text: string, words: string[]) {
  const bare = ALLOWED.reduce(
    (rest, { phrase }) => rest.replace(phrase, (m) => ' '.repeat(m.length)),
    text,
  );
  const lines = bare.split('\n');
  return [...new Set(words)].flatMap((word) => {
    const pattern = new RegExp(`(?<![\\w-])${escaped(word)}(?![\\w-])`, 'i');
    return lines.flatMap((line, i) =>
      pattern.test(line) ? [`${i + 1}: ${word}`] : [],
    );
  });
}

describe('the engine’s sources', () => {
  const words = brunchWords();

  it('gathers the Brunch words from its declaration and data', () => {
    // A guard on the guard: if this list came out empty, nothing is checked.
    expect(words).toEqual(
      expect.arrayContaining([
        'sku',
        'Stock',
        'order',
        'counted',
        'supplier’s cutoff',
        'SD-01',
        'bakery',
      ]),
    );
  });

  it('finds a word in a comment, a string and a name alike', () => {
    expect(leaksIn('// every delivery arrives', ['delivery'])).toEqual([
      '1: delivery',
    ]);
    expect(leaksIn("const tab = 'Stock!B3';", ['Stock'])).toEqual(['1: Stock']);
    expect(leaksIn('record.case_size', ['case_size'])).toEqual([
      '1: case_size',
    ]);
    expect(leaksIn('the records in order', ['order'])).toEqual([]);
  });

  it.each(sources.map((s) => [s.name, s.text]))(
    '%s names nothing of the Brunch process',
    (_, text) => {
      expect(leaksIn(text, words)).toEqual([]);
    },
  );
});
