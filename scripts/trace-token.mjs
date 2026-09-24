/*
  What a role paints, and where each step of the way is declared.

    pnpm trace:token --sp-sheet-row-etch
    pnpm trace:token sheet-row-etch --neutral steel

  Follows the role through every var() it reads, splitting light-dark() into
  its two themes, down to a ramp or Radix step and that step's value in the
  chosen neutral family (Graphite by default). Stylesheets are read in the
  order app/styles/index.css imports them, and the last declaration on :root
  wins, as the cascade has it. Element-scoped properties such as
  --control-face-top are set by utilities, not :root, so trace the role the
  utility reads instead.
*/

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = join(root, 'app/styles/index.css');
const args = process.argv.slice(2);
const familyAt = args.indexOf('--neutral');
const family = familyAt === -1 ? null : args[familyAt + 1];
const flagged = familyAt === -1 ? [] : [familyAt, familyAt + 1];
const names = args
  .filter((_, index) => !flagged.includes(index))
  .map((arg) => (arg.startsWith('--') ? arg : `--sp-${arg}`));

if (names.length === 0) {
  process.stderr.write('usage: pnpm trace:token <role> [--neutral <family>]\n');
  process.exit(2);
}

/* name -> { value, where }, last declaration wins. */
const declarations = new Map();
const files = [
  ...readFileSync(entry, 'utf8').matchAll(/^@import '(\.[^']+)';$/gm),
].map(([, path]) => join(dirname(entry), path));
for (const file of files) {
  const css = readFileSync(file, 'utf8');
  for (const block of css.matchAll(/(^|\n)([^{}\n][^{}]*?)\{([^{}]*)\}/g)) {
    const selector = block[2].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const scoped = /\[data-neutral='([a-z]+)'\]/.exec(selector)?.[1];
    if (selector !== ':root' && !(scoped && scoped === family)) continue;
    const body = block[3];
    for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const line = css
        .slice(0, block.index + block[0].indexOf(match[0]))
        .split('\n').length;
      declarations.set(match[1], {
        value: match[2].replace(/\s+/g, ' ').trim(),
        where: `${relative(root, file)}:${line}`,
      });
    }
  }
}

/* The top-level arguments of light-dark(), or null. */
function themes(value) {
  const match = /^light-dark\((.*)\)$/s.exec(value);
  if (!match) return null;
  let depth = 0;
  for (let index = 0; index < match[1].length; index += 1) {
    const char = match[1][index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      return [
        match[1].slice(0, index).trim(),
        match[1].slice(index + 1).trim(),
      ];
    }
  }
  return null;
}

const isStep = (name) => /^--(sp-neutral|radix-[a-z]+(-dark)?)-\d+$/.test(name);

function trace(expression, indent, seen) {
  const pad = '  '.repeat(indent);
  const split = themes(expression);
  if (split) {
    for (const [label, part] of [
      ['light', split[0]],
      ['dark', split[1]],
    ]) {
      process.stdout.write(`${pad}${label}: ${part}\n`);
      trace(part, indent + 1, seen);
    }
    return;
  }
  for (const [, name] of expression.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const found = declarations.get(name);
    if (!found) {
      process.stdout.write(
        `${pad}${name}  (not on :root -- set by a utility or an element)\n`,
      );
      continue;
    }
    if (isStep(name)) {
      process.stdout.write(`${pad}${name} = ${found.value}  ${found.where}\n`);
      continue;
    }
    if (seen.has(name)) continue;
    process.stdout.write(`${pad}${name}: ${found.value}  ${found.where}\n`);
    trace(found.value, indent + 1, new Set(seen).add(name));
  }
}

for (const name of names) {
  trace(`var(${name})`, 0, new Set());
  if (names.length > 1) process.stdout.write('\n');
}
