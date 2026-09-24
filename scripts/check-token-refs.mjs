/*
  Every var(--…) in the app's CSS resolves to something.

  The bug this exists for: a role that reads a name nothing defines -- not
  Tailwind, not a generator, not the app -- is invalid at computed-value time.
  CSS says nothing about it, the build says nothing about it, and the page
  quietly loses its colours. A typo in a token name fails exactly the same way.

  Two passes, so that neither rots into an allow list:

  1. What this project defines -- its own stylesheets and the generated ones,
     Tailwind's installed theme, and the properties components set at runtime
     from inline styles, setProperty, or a next/font `variable`.
  2. Whatever is still unaccounted for, looked up once across node_modules. A
     library may set a property on an element it owns -- react-aria-components
     does this for --trigger-anchor-point -- and that is a real definition this
     project should not have to restate. Only leftovers reach this pass, so its
     cost is paid on the rare run that needs it.

  A reference carrying a fallback -- var(--x, 1rem) -- is left alone; that is
  the syntax for "may not exist".

  It also holds every --sp-* role to MAX_DEPTH reads from a step: a ramp step
  (--sp-neutral-N), a state step (--sp-state-<scale>-N), or a primitive
  outside --sp-*. A role may alias one other role, never a chain of them, so
  what paints is never more than two lookups from the role an element names.

  And every stylesheet must be imported by app/styles/index.css. A component's
  .css is only ever reached through that list, so one left out of it is
  silently ignored -- the same silent failure as an unresolved token.
  Run `pnpm check:tokens`.
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const stylesheets = ['app', 'components'];
const sources = ['app', 'components', 'lib'];

function walk(dir, extensions) {
  const found = [];
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    if (statSync(join(root, path)).isDirectory()) {
      found.push(...walk(path, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

const read = (path) => readFileSync(join(root, path), 'utf8');
const cssFiles = stylesheets.flatMap((dir) => walk(dir, ['.css']));
const sourceFiles = sources.flatMap((dir) => walk(dir, ['.ts', '.tsx']));

const defined = new Set();

/* Declarations in the app's own stylesheets, generated ones included. */
for (const path of cssFiles) {
  for (const [, name] of read(path).matchAll(/(--[\w-]+)\s*:/g)) {
    defined.add(name);
  }
}

/*
  Tailwind's theme, read from the installed package rather than assumed: a
  palette it drops then surfaces here rather than at runtime. Its colours are
  not among them -- app/styles/theme.css resets --color-* -- so a stylesheet that
  reads one fails here instead of painting nothing.
*/
const tailwind = readFileSync(
  new URL(import.meta.resolve('tailwindcss/theme.css')),
  'utf8',
);
for (const [, name] of tailwind.matchAll(/(--[\w-]+)\s*:/g)) {
  if (!name.startsWith('--color-')) defined.add(name);
}

/*
  Properties the app sets from TypeScript: an inline style object, an explicit
  setProperty, or the name a next/font face is published under.
*/
const fromSource = [
  /['"](--[\w-]+)['"]\s*:/g,
  /setProperty\(\s*['"](--[\w-]+)['"]/g,
  /variable:\s*['"](--[\w-]+)['"]/g,
];
for (const path of sourceFiles) {
  const text = read(path);
  for (const pattern of fromSource) {
    for (const [, name] of text.matchAll(pattern)) defined.add(name);
  }
}

/* Tailwind's utility internals, declared by generated CSS this never sees. */
const internal = /^--tw-/;

const references = [];
for (const path of cssFiles) {
  read(path)
    .split('\n')
    .forEach((line, index) => {
      for (const [, name] of line.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (defined.has(name) || internal.test(name)) continue;
        references.push({ path, line: index + 1, name });
      }
    });
}

/* Pass two: anything left over may still belong to a dependency. */
const leftovers = [...new Set(references.map(({ name }) => name))];
const fromPackages = new Set();
if (leftovers.length > 0) {
  const grep = spawnSync(
    'grep',
    [
      '-rhoF',
      '--include=*.js',
      '--include=*.mjs',
      '--include=*.cjs',
      '--include=*.css',
      ...leftovers.flatMap((name) => ['-e', name]),
      'node_modules',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  for (const name of grep.stdout.split('\n')) {
    if (name) fromPackages.add(name);
  }
}

/* Tailwind's package still declares its palette, but this app resets it, so
   a --color-* name found there is not a definition. */
const broken = references.filter(
  ({ name }) => name.startsWith('--color-') || !fromPackages.has(name),
);

if (broken.length > 0) {
  for (const { path, line, name } of broken) {
    process.stderr.write(
      `${relative('.', join(root, path))}:${line}  ${name} is referenced but never defined\n`,
    );
  }
  const count = broken.length;
  process.stderr.write(
    `\n${count} unresolved reference${count === 1 ? '' : 's'}. Define the ` +
      `property, or give the reference a fallback if it is meant to be optional.\n`,
  );
  process.exit(1);
}

/* Pass three: every stylesheet is reachable from the entry. */
const entry = 'app/styles/index.css';
const imported = new Set(
  [...read(entry).matchAll(/^@import '(\.[^']+)';$/gm)].map(([, path]) =>
    relative(root, join(root, 'app/styles', path)),
  ),
);
const orphans = cssFiles.filter(
  (path) => path !== entry && !imported.has(path),
);
if (orphans.length > 0) {
  for (const path of orphans) {
    process.stderr.write(`${path}  is not imported by ${entry}\n`);
  }
  process.stderr.write(
    `\n${orphans.length} stylesheet${orphans.length === 1 ? '' : 's'} the app ` +
      `never loads. Import ${orphans.length === 1 ? 'it' : 'them'} in cascade order.\n`,
  );
  process.exit(1);
}

/* Pass four: how far each role is from a colour. */
const MAX_DEPTH = 2;
const roleValues = new Map();
for (const path of cssFiles) {
  for (const [, name, value] of read(path).matchAll(
    /(--sp-[\w-]+)\s*:\s*([^;]*);/g,
  )) {
    if (!roleValues.has(name)) roleValues.set(name, []);
    roleValues.get(name).push(value);
  }
}
const isStep = (name) =>
  /^--sp-neutral-\d+$/.test(name) ||
  /^--sp-state-[a-z]+-\d+$/.test(name) ||
  !name.startsWith('--sp-');
const chains = new Map();
function chainOf(name, seen = []) {
  if (isStep(name)) return [name];
  if (chains.has(name)) return chains.get(name);
  let longest = [name];
  for (const value of roleValues.get(name) ?? []) {
    for (const [, next] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (seen.includes(next)) continue;
      const chain = [name, ...chainOf(next, [...seen, name])];
      if (chain.length > longest.length) longest = chain;
    }
  }
  chains.set(name, longest);
  return longest;
}
const deep = [...roleValues.keys()]
  .map((name) => chainOf(name))
  .filter((chain) => chain.length - 1 > MAX_DEPTH);
if (deep.length > 0) {
  for (const chain of deep) {
    process.stderr.write(`${chain.join(' → ')}\n`);
  }
  process.stderr.write(
    `\n${deep.length} role${deep.length === 1 ? '' : 's'} more than ` +
      `${MAX_DEPTH} reads from a step. Read the step, or alias a role that ` +
      `reads one directly.\n`,
  );
  process.exit(1);
}

const provided = fromPackages.size;
process.stdout.write(
  `${cssFiles.length} stylesheets, ${defined.size} properties in scope` +
    (provided > 0 ? `, ${provided} provided by dependencies` : '') +
    `, all imported, no unresolved references, every role within ${MAX_DEPTH} reads of a step\n`,
);
