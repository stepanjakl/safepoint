/*
  Every var(--…) in the app's CSS resolves to something.

  The bug this exists for: a ramp in tokens/ramps.css can bind a palette by
  name that nothing defines -- not Tailwind, not a generator, not the app -- so
  selecting one makes every --sp-* role in that subtree invalid at computed-value
  time. CSS says nothing about it, the build says nothing about it, and the page
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
  the syntax for "may not exist". Run `pnpm check:tokens`.
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const stylesheets = ['app'];
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
  palette it drops then surfaces here rather than at runtime.
*/
const tailwind = readFileSync(
  new URL(import.meta.resolve('tailwindcss/theme.css')),
  'utf8',
);
for (const [, name] of tailwind.matchAll(/(--[\w-]+)\s*:/g)) defined.add(name);

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

const broken = references.filter(({ name }) => !fromPackages.has(name));

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

const provided = fromPackages.size;
process.stdout.write(
  `${cssFiles.length} stylesheets, ${defined.size} properties in scope` +
    (provided > 0 ? `, ${provided} provided by dependencies` : '') +
    `, no unresolved references\n`,
);
