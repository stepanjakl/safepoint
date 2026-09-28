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

  And every component class is styled in one stylesheet (pass five), every
  role has a reader (six), and no white or black is faded or mixed (seven).

  And every stylesheet must be imported by app/styles/index.css. A component's
  .css is only ever reached through that list, so one left out of it is
  silently ignored -- the same silent failure as an unresolved token.
  Run `pnpm check:tokens`.
*/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

import { readStylesheets, subjectClasses } from '../lib/dev/stylesheets.ts';

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

/*
  Pass five: a component's class has one home. Every class a component
  stylesheet styles is styled by no other component stylesheet, so a class
  seen in DevTools is one search -- or one line in the style inspector -- from
  every rule that paints it. A class from app/styles is shared by design, and a
  component may refine it in its own context (`.sheet-seg > .value`).
*/
const homes = new Map();
const { rules, utilities, declarations } = readStylesheets(root);
for (const { file, line, name } of utilities) {
  homes.set(name, [...(homes.get(name) ?? []), { file, line }]);
}
for (const { file, line, selector } of rules) {
  for (const name of subjectClasses(selector)) {
    homes.set(name, [...(homes.get(name) ?? []), { file, line }]);
  }
}
const scattered = [...homes].filter(([, sites]) => {
  const files = new Set(sites.map(({ file }) => file));
  return (
    files.size > 1 && [...files].every((file) => file.startsWith('components/'))
  );
});
if (scattered.length > 0) {
  for (const [name, sites] of scattered) {
    process.stderr.write(
      `.${name} is styled in ${sites.map(({ file, line }) => `${file}:${line}`).join(', ')}\n`,
    );
  }
  process.stderr.write(
    `\n${scattered.length} class${scattered.length === 1 ? '' : 'es'} styled ` +
      `by more than one component stylesheet. Move the rules beside the ` +
      `component the class belongs to.\n`,
  );
  process.exit(1);
}

/*
  Pass six: every role has a reader. A role nothing reads is a knob that
  turns nothing -- the leftover when a declaration that used it is deleted or
  commented out. Read means a var() in a stylesheet or the name in TypeScript
  (an inline style, the workbench), comments excluded. The ramp steps and the
  state scales' numbered steps are the colour system's own API, read by names
  built at runtime, so they are exempt.
*/
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const readInCss = new Set();
for (const path of cssFiles) {
  for (const [, name] of stripComments(read(path)).matchAll(
    /var\(\s*(--sp-[\w-]+)/g,
  )) {
    readInCss.add(name);
  }
}
const namedInSource = new Set();
for (const path of sourceFiles) {
  for (const [name] of stripComments(read(path)).matchAll(/--sp-[\w-]+/g)) {
    namedInSource.add(name);
  }
}
const isApi = (name) =>
  /^--sp-neutral-\d+$/.test(name) || /^--sp-state-[a-z]+-\d+$/.test(name);
const unread = new Map();
for (const { name, file, line } of declarations) {
  if (!name.startsWith('--sp-') || isApi(name)) continue;
  if (readInCss.has(name) || namedInSource.has(name)) continue;
  if (!unread.has(name)) unread.set(name, `${file}:${line}`);
}
if (unread.size > 0) {
  for (const [name, where] of unread) {
    process.stderr.write(
      `${where}  ${name} is declared but nothing reads it\n`,
    );
  }
  process.stderr.write(
    `\n${unread.size} role${unread.size === 1 ? '' : 's'} with no reader. ` +
      `Delete the declaration, or read it where it was meant to paint.\n`,
  );
  process.exit(1);
}

/*
  Pass seven: no pure white or black at partial strength. A sheen or edge is
  a step of the ramp or of a Radix scale, opaque, so it belongs to the palette
  of whichever family is showing; white or black faded, or mixed into a hue,
  belongs to none. Covers the app's stylesheets and its TypeScript -- the
  development tools in components/dev keep their own fixed look.
*/
const FADED = [
  /rgba?\(\s*(?:255|0)\s*[, ]\s*(?:255|0)\s*[, ]\s*(?:255|0)\s*[,/]\s*[\d.]+%?\s*\)/,
  /#(?:fff|000)[0-9a-f]\b|#(?:ffffff|000000)[0-9a-f]{2}\b/i,
  /color-mix\([^;]*?(?<![\w-])(?:white|black|#fff(?:fff)?|#000(?:000)?)(?![\w-])/i,
];
const faded = [];
for (const path of [
  ...cssFiles,
  ...sourceFiles.filter((path) => !path.startsWith('components/dev/')),
]) {
  if (path.startsWith('app/styles/generated/')) continue;
  stripComments(read(path))
    .split('\n')
    .forEach((text, index) => {
      if (FADED.some((pattern) => pattern.test(text))) {
        faded.push(`${path}:${index + 1}  ${text.trim()}`);
      }
    });
}
if (faded.length > 0) {
  for (const entry of faded) process.stderr.write(`${entry}\n`);
  process.stderr.write(
    `\n${faded.length} pure white or black at partial strength. Use a step ` +
      `of the neutral ramp or of the hue's Radix scale instead.\n`,
  );
  process.exit(1);
}

const provided = fromPackages.size;
process.stdout.write(
  `${cssFiles.length} stylesheets, ${defined.size} properties in scope` +
    (provided > 0 ? `, ${provided} provided by dependencies` : '') +
    `, all imported, no unresolved references, every role within ${MAX_DEPTH} reads of a step, ` +
    `every component class styled in one file, every role read, ` +
    `no faded white or black\n`,
);
