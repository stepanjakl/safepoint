import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { sentencesOf } from './find';
import { ENGLISH } from './language';

/*
  The words of the language instructions are written in live in one module,
  language.ts: its number words, day names and patterns appear in no other
  engine source, so another language is one more implementation of its
  interface and nothing else to find.
*/

const DIRECTORY = 'lib/definitions';
const MODULE = 'language.ts';

const read = (name: string) => readFileSync(path.join(DIRECTORY, name), 'utf8');

// Every string literal and every regular expression a source writes.
function literalsIn(name: string, text: string) {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const strings: string[] = [];
  const patterns: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      strings.push(node.text);
    if (ts.isRegularExpressionLiteral(node))
      patterns.push(node.text.slice(1, node.text.lastIndexOf('/')));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { strings, patterns };
}

const own = literalsIn(MODULE, read(MODULE));
// The module's words: its literals made of letters alone.
const WORDS = own.strings
  .filter((s) => /^\p{L}{3,}$/u.test(s))
  .map((s) => s.toLowerCase());
// Its patterns, and the percent pattern it gives as text.
const PATTERNS = [
  ...own.patterns,
  ...own.strings.filter((s) => /[|?]/.test(s)),
];

const others = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith('.ts') && name !== MODULE)
  .filter((name) => !/\.(test|fixture)\.ts$/.test(name));

describe('the language instructions are read in', () => {
  it('gathers the module’s words and patterns', () => {
    // A guard on the guard: if these came out empty, nothing is checked.
    expect(WORDS).toEqual(
      expect.arrayContaining(['twelve', 'saturday', 'monday']),
    );
    expect(PATTERNS).toEqual(expect.arrayContaining(['%|per ?cent']));
  });

  it.each(others)('%s holds none of its words or patterns', (name) => {
    const text = read(name);
    const { strings } = literalsIn(name, text);
    expect(strings.filter((s) => WORDS.includes(s.toLowerCase()))).toEqual([]);
    expect(PATTERNS.filter((pattern) => text.includes(pattern))).toEqual([]);
  });

  it('is English, read as it was before it had a module', () => {
    expect(ENGLISH.numbersInWords('one of the twelve')).toEqual([1, 12]);
    expect(ENGLISH.daysNamed("before saturday's opening, or sun")).toEqual([
      6, 7,
    ]);
    expect(ENGLISH.nameWords('Harbour docks, piers')).toEqual([
      'harbour',
      'dock',
      'pier',
    ]);
    expect(
      sentencesOf('Intro. It costs 2.5 at 07:00! Next?\n1. A rule. Still one.'),
    ).toEqual([
      'Intro.',
      'It costs 2.5 at 07:00!',
      'Next?',
      'A rule. Still one.',
    ]);
  });

  it('keeps a name’s letters whatever its script', () => {
    expect(ENGLISH.nameWords('Crème brûlée')).toEqual(['crème', 'brûlée']);
    expect(ENGLISH.nameWords('Набережная 12')).toEqual(['набережная']);
  });
});
