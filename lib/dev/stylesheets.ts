/*
  The app's stylesheets, read the way the browser receives them: in the order
  app/styles/index.css imports them, with every block's place in its file.

  One reader for every tool that has to say where a style comes from --
  `pnpm trace:token` and the development style inspector -- so the two never
  disagree about what a stylesheet declares. Node only; plain erasable
  TypeScript, so scripts can import it without a build step.
*/

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export type Site = { file: string; line: number };

/** A custom property declared in a block, and the selector it sits in. */
export type Declaration = Site & {
  name: string;
  value: string;
  /** The block's own prelude: `:root`, `@theme inline`, `&[data-x]`. */
  selector: string;
};

/**
 * One declaration of a rule or utility. `when` holds the blocks it is nested
 * in, outermost first: `&:is([data-hovered])`, `@media (forced-colors: active)`.
 */
export type Property = {
  property: string;
  value: string;
  line: number;
  when: string[];
};

/** A style rule, with its nesting resolved into one selector. */
export type Rule = Site & {
  /** As written in the file. */
  source: string;
  /** Nesting folded in, so `element.matches(selector)` can test it. */
  selector: string;
  /** The at-rules it sits inside, outermost first: `@layer components`. */
  context: string[];
  /** Custom properties the rule's own declarations read. */
  reads: string[];
  /** Its own declarations, and those of the at-rules nested in it. */
  properties: Property[];
  /** Utilities it pulls in with `@apply`. */
  applies: string[];
};

export type Utility = Site & {
  name: string;
  reads: string[];
  properties: Property[];
  applies: string[];
};

/** A custom property registered with `@property`. */
export type Registered = Site & {
  name: string;
  inherits: boolean;
  initial?: string;
};

export type Stylesheets = {
  root: string;
  files: string[];
  declarations: Declaration[];
  rules: Rule[];
  utilities: Utility[];
  registered: Registered[];
};

/** The stylesheets index.css imports, in cascade order, relative to `root`. */
function importedStylesheets(root: string) {
  const entry = join(root, 'app/styles/index.css');
  return [...readFileSync(entry, 'utf8').matchAll(/^@import '(\.[^']+)';$/gm)]
    .map(([, path]) => join(dirname(entry), path!))
    .map((path) => relative(root, path));
}

const readsOf = (text: string) => [
  ...new Set(
    [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name!),
  ),
];

/* `&` stands for the parent; without one, the block is a descendant of it. */
function nest(parent: string | null, prelude: string) {
  if (parent === null) return prelude;
  return prelude.includes('&')
    ? prelude.replaceAll('&', `:is(${parent})`)
    : `:is(${parent}) :is(${prelude})`;
}

/* Blank out comments -- and strings, unless they are asked to stay -- keeping
   every offset, and so every line number, where it was. */
const blank = (match: string) => match.replace(/[^\n]/g, ' ');
function mask(css: string, keepStrings = false) {
  return keepStrings
    ? css.replace(/\/\*[\s\S]*?\*\//g, blank)
    : css.replace(/\/\*[\s\S]*?\*\/|"[^"]*"|'[^']*'/g, blank);
}

/* Tailwind's reset, which `@import 'tailwindcss'` brings in ahead of them. */
const PREFLIGHT = 'node_modules/tailwindcss/preflight.css';

/**
 * `preflight` reads Tailwind's reset too, for the inspector, which has to
 * explain every declaration an element gets; the token checks leave it out.
 */
export function readStylesheets(
  root: string,
  { preflight = false } = {},
): Stylesheets {
  const files = [
    ...(preflight ? [PREFLIGHT] : []),
    ...importedStylesheets(root),
  ];
  const declarations: Declaration[] = [];
  const rules: Rule[] = [];
  const utilities: Utility[] = [];
  const registered: Registered[] = [];

  for (const file of files) {
    const css = readFileSync(join(root, file), 'utf8');
    // Structure is read with strings blanked, so a brace inside `content: '{'`
    // cannot open a block; preludes are read with strings kept, so
    // `[data-neutral='steel']` keeps its value.
    const text = mask(css);
    const written = mask(css, true);
    const lineAt = (offset: number) => text.slice(0, offset).split('\n').length;
    type Open = {
      prelude: string;
      at: number;
      start: number;
      selector: string | null;
      properties: Property[];
      applies: string[];
    };
    const stack: Open[] = [];
    let boundary = 0;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') {
        const raw = written.slice(boundary, index);
        const prelude = raw.trim().replace(/\s+/g, ' ');
        const at = boundary + raw.length - raw.trimStart().length;
        const parent =
          stack.findLast((open) => open.selector !== null)?.selector ?? null;
        const selector = prelude.startsWith('@') ? null : nest(parent, prelude);
        stack.push({
          prelude,
          at,
          start: index,
          selector,
          properties: [],
          applies: [],
        });
        boundary = index + 1;
      } else if (char === '}') {
        // A last declaration may have no semicolon of its own.
        statement(index);
        const open = stack.pop();
        boundary = index + 1;
        if (!open) continue;
        const inUtility = stack.some((outer) =>
          outer.prelude.startsWith('@utility '),
        );
        const property = /^@property (--[\w-]+)$/.exec(open.prelude);
        if (property) {
          const of = (name: string) =>
            open.properties.find((entry) => entry.property === name)?.value;
          registered.push({
            name: property[1]!,
            inherits: of('inherits') !== 'false',
            initial: of('initial-value'),
            file,
            line: lineAt(open.at),
          });
          continue;
        }
        const body = css.slice(open.start + 1, index);
        const utility = /^@utility ([\w-]+(?:-\*)?)$/.exec(open.prelude);
        if (utility) {
          utilities.push({
            name: utility[1]!,
            file,
            line: lineAt(open.at),
            reads: readsOf(mask(body)),
            properties: open.properties,
            applies: open.applies,
          });
        } else if (open.selector === null || inUtility) {
          // A state or condition inside a utility, or an at-rule inside a
          // rule: its declarations belong to the block around it, under it.
          const outer = stack.at(-1);
          if (outer) {
            for (const entry of open.properties) {
              outer.properties.push({
                ...entry,
                when: [open.prelude, ...entry.when],
              });
            }
            outer.applies.push(...open.applies);
          }
        } else {
          // Only the rule's own declarations: a nested block is its own rule.
          let own = mask(body);
          while (/\{[^{}]*\}/.test(own)) own = own.replace(/\{[^{}]*\}/g, '');
          rules.push({
            source: open.prelude,
            selector: open.selector,
            // Preflight's layer is declared in tailwindcss's own index.css.
            context: [
              ...(file === PREFLIGHT ? ['@layer base'] : []),
              ...stack
                .filter((outer) => outer.selector === null)
                .map((outer) => outer.prelude),
            ],
            file,
            line: lineAt(open.at),
            reads: readsOf(own),
            properties: open.properties,
            applies: open.applies,
          });
        }
      } else if (char === ';') {
        statement(index);
        boundary = index + 1;
      }
    }

    /* The statement from the last boundary to `end`: a declaration, recorded
       on the block it is in, or an @apply. */
    function statement(end: number) {
      const open = stack.at(-1);
      const written = text.slice(boundary, end);
      if (!open || !written.trim()) return;
      const apply = /^\s*@apply\s+([^;]+)$/.exec(written);
      if (apply) {
        open.applies.push(...apply[1]!.trim().split(/\s+/));
        return;
      }
      const match = /^\s*(-?-?[\w-]+)\s*:([\s\S]*)$/.exec(written);
      if (!match) return;
      const offset = boundary + written.indexOf(match[1]!);
      // From the original text, so a value keeps any string it holds.
      const value = css
        .slice(offset + match[1]!.length, end)
        .replace(/^\s*:/, '')
        .replace(/\s+/g, ' ')
        .trim();
      const line = lineAt(offset);
      open.properties.push({ property: match[1]!, value, line, when: [] });
      if (match[1]!.startsWith('--')) {
        declarations.push({
          name: match[1]!,
          value,
          selector: open.prelude,
          file,
          line,
        });
      }
    }
  }

  return { root, files, declarations, rules, utilities, registered };
}

/* Split at a character outside brackets and parentheses. */
function splitTopLevel(text: string, at: (char: string) => boolean) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && at(char)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, text.slice(start)];
}

/**
 * The classes a selector styles: those in the last compound of each of its
 * branches. `.sheet-seg > .value` styles `value`; `.sheet-seg` is only where.
 * A class inside :not() or :has() is a condition, not a subject.
 */
export function subjectClasses(selector: string) {
  const subjects = new Set<string>();
  for (const branch of splitTopLevel(selector, (char) => char === ',')) {
    const compounds = splitTopLevel(branch.trim(), (char) =>
      /[\s>+~]/.test(char),
    ).filter(Boolean);
    let last = compounds.at(-1) ?? '';
    // Drop conditions, innermost first, until none are left.
    while (/:(?:not|has)\([^()]*\)/.test(last)) {
      last = last.replace(/:(?:not|has)\([^()]*\)/g, '');
    }
    for (const inner of last.matchAll(/:(?:is|where)\(([^()]*)\)/g)) {
      for (const name of subjectClasses(inner[1]!)) subjects.add(name);
    }
    for (const [, name] of last
      .replace(/:(?:is|where)\([^()]*\)/g, '')
      .matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      subjects.add(name!);
    }
  }
  return [...subjects];
}
