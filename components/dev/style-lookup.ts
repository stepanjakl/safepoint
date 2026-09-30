import type {
  Declaration,
  Registered,
  Rule,
  Site,
  Stylesheets,
  Utility,
} from '@/lib/dev/stylesheets';

/*
  From a class on an element to where it is written: the style inspector's
  lookups, kept free of the DOM so they can be tested.
*/

/** Dispatched on window to toggle the style inspector. */
export const INSPECT_EVENT = 'safepoint:inspect-styles';

/** `data-[hovered]:max-sm:bg-canvas/50!` → base `bg-canvas/50`, two variants. */
export function splitVariants(token: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0) {
      parts.push(token.slice(start, index));
      start = index + 1;
    }
  }
  const base = token.slice(start).replace(/^!|!$/g, '');
  return { base, variants: parts };
}

/* Where Tailwind looks a utility's value up, most likely first: `text-meta`
   is a size, `text-primary` a colour, and only one of them exists. */
const NAMESPACES = [
  'color',
  'shadow',
  'inset-shadow',
  'drop-shadow',
  'text',
  'font',
  'font-weight',
  'radius',
  'spacing',
  'tracking',
  'leading',
  'ease',
  'animate',
  'blur',
];

export type Lookup = ReturnType<typeof buildLookup>;

export function buildLookup(sheets: Stylesheets) {
  const utilities = new Map<string, Utility>();
  const functional: Utility[] = [];
  for (const utility of sheets.utilities) {
    if (utility.name.endsWith('-*')) functional.push(utility);
    else utilities.set(utility.name, utility);
  }
  // What Tailwind publishes, for tracing a utility to its theme entry.
  const theme = new Map<string, Declaration>();
  for (const declaration of sheets.declarations) {
    if (
      declaration.selector.startsWith('@theme') &&
      declaration.value !== 'initial'
    ) {
      theme.set(declaration.name, declaration);
    }
  }
  // Every declaration of a name, in cascade order, for the selectors that
  // reach <html> -- :root, and the ones the preferences switch on it.
  const byName = new Map<string, Declaration[]>();
  for (const declaration of sheets.declarations) {
    byName.set(declaration.name, [
      ...(byName.get(declaration.name) ?? []),
      declaration,
    ]);
  }
  const registered = new Map<string, Registered>(
    sheets.registered.map((entry) => [entry.name, entry]),
  );
  // Cascade order among utilities is the order they are written in.
  const order = new Map(sheets.utilities.map((utility, i) => [utility, i]));
  return {
    root: sheets.root,
    utilities,
    functional,
    theme,
    registered,
    order,
    byName,
    sheets,
  };
}

/** The app's own @utility a class names, fixed or functional. */
export function utilityFor(base: string, lookup: Lookup) {
  return (
    lookup.utilities.get(base) ??
    lookup.functional.find((utility) =>
      base.startsWith(utility.name.slice(0, -1)),
    )
  );
}

/** The @theme entry a Tailwind utility reads: `bg-canvas` → --color-canvas. */
export function themeFor(base: string, lookup: Lookup) {
  const name = base.replace(/\/[\w.[\]()-]+$/, '');
  for (let index = name.indexOf('-'); index !== -1;) {
    const rest = name.slice(index + 1);
    for (const namespace of NAMESPACES) {
      const found = lookup.theme.get(`--${namespace}-${rest}`);
      if (found) return found;
    }
    index = name.indexOf('-', index + 1);
  }
  return undefined;
}

/** Properties an arbitrary value reads: `bg-(--sp-x)`, `p-[var(--y)]`. */
export const arbitraryReads = (base: string) => [
  ...new Set(
    [...base.matchAll(/(?:\(|var\()(--[\w-]+)/g)].map(([, name]) => name!),
  ),
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rules whose selector names any of these classes. */
export function rulesNaming(classes: string[], rules: Rule[]) {
  const pattern = new RegExp(
    `\\.(?:${classes.map(escape).join('|')})(?![\\w-])`,
  );
  return classes.length === 0
    ? []
    : rules.filter((rule) => pattern.test(rule.source));
}

const PSEUDO_ELEMENT =
  /::?(before|after|placeholder|marker|backdrop|selection|file-selector-button|first-line|first-letter)\b/g;

/* A selector list's branches, split at commas outside brackets. */
function branchesOf(selector: string) {
  const branches: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      branches.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  return [...branches, selector.slice(start)].map((branch) => branch.trim());
}

/**
 * A selector's specificity as one comparable number: ids × 1e6, classes,
 * attributes and pseudo-classes × 1e3, types and pseudo-elements × 1.
 * `:is`, `:not` and `:has` count their most specific argument; `:where`
 * counts nothing.
 */
export function specificityOf(selector: string): number {
  let total = 0;
  let rest = '';
  for (let index = 0; index < selector.length; index += 1) {
    const functional = /^:(is|not|has|where|matches)\(/.exec(
      selector.slice(index),
    );
    if (!functional) {
      rest += selector[index];
      continue;
    }
    let depth = 0;
    let end = index + functional[0].length - 1;
    for (; end < selector.length; end += 1) {
      if (selector[end] === '(') depth += 1;
      else if (selector[end] === ')' && --depth === 0) break;
    }
    const inner = selector.slice(index + functional[0].length, end);
    if (functional[1] !== 'where') {
      total += Math.max(0, ...branchesOf(inner).map(specificityOf));
    }
    rest += ' ';
    index = end;
  }
  rest = rest.replace(/\[[^\]]*\]/g, () => {
    total += 1e3;
    return ' ';
  });
  total += (rest.match(/#(?:\\.|[\w-])+/g) ?? []).length * 1e6;
  total += (rest.match(/\.(?:\\.|[\w-])+/g) ?? []).length * 1e3;
  // Escaped `\:` inside a class name is not a pseudo-class: drop names first.
  rest = rest.replace(/[.#](?:\\.|[\w-])+/g, ' ');
  total += (rest.match(/::[\w-]+/g) ?? []).length;
  rest = rest.replace(/::[\w-]+/g, ' ');
  total += (rest.match(/:[\w-]+/g) ?? []).length * 1e3;
  rest = rest.replace(/:[\w-]+/g, ' ');
  total += (rest.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return total;
}

/**
 * What a selector reaches on `node`: the element itself, and the
 * pseudo-elements it styles. Each branch is tested alone, since
 * `element.matches` takes no pseudo-element and `*, ::before` would otherwise
 * fail as a whole.
 */
export function matchOn(node: Element, selector: string) {
  let element = false;
  let specificity = 0;
  const pseudos = new Set<string>();
  for (const branch of branchesOf(selector)) {
    const names = [...branch.matchAll(PSEUDO_ELEMENT)].map((hit) => hit[1]!);
    let test = branch.replace(PSEUDO_ELEMENT, '').trim();
    // `::after` alone, or after a combinator, is on any element.
    if (!test || /[\s>+~]$/.test(test)) test += '*';
    try {
      if (!node.matches(test)) continue;
    } catch {
      continue; // A selector this browser cannot test.
    }
    if (names.length === 0) {
      element = true;
      specificity = Math.max(specificity, specificityOf(branch));
    }
    for (const name of names) pseudos.add(`::${name}`);
  }
  return { element, pseudos: [...pseudos], specificity };
}

/** `light-dark(var(--sp-neutral-75), var(--sp-neutral-900))` → `light-dark(neutral-75, neutral-900)`. */
export const shorten = (value: string) =>
  value
    .replace(/var\(\s*--(?:sp-)?([\w-]+)\s*\)/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');

/** The custom properties a value reads, in order. */
export const readsOf = (value: string) => [
  ...new Set(
    [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name!),
  ),
];

/** A ramp or Radix step: where a colour chain ends. */
export const isStep = (name: string) =>
  /^--(sp-neutral-\d+|radix-[a-z]+(-dark)?-\d+)$/.test(name);

/* The CSS property a Tailwind colour utility sets, by its prefix. */
const COLOUR_PROPERTY: [RegExp, string][] = [
  [/^bg-/, 'background-color'],
  [/^text-/, 'color'],
  [/^border-([trblxyse])-/, 'border-$1-color'],
  [/^border-/, 'border-color'],
  [/^divide-/, 'border-color (children)'],
  [/^outline-/, 'outline-color'],
  [/^ring-/, '--tw-ring-color'],
  [/^inset-ring-/, '--tw-inset-ring-color'],
  [/^shadow-/, '--tw-shadow-color'],
  [/^fill-/, 'fill'],
  [/^stroke-/, 'stroke'],
  [/^decoration-/, 'text-decoration-color'],
  [/^accent-/, 'accent-color'],
  [/^caret-/, 'caret-color'],
  [/^(from|via|to)-/, '--tw-gradient-$1'],
];
const NAMESPACE_PROPERTY: Record<string, string> = {
  text: 'font-size',
  font: 'font-family',
  'font-weight': 'font-weight',
  radius: 'border-radius',
  shadow: 'box-shadow',
  'inset-shadow': 'box-shadow',
  'drop-shadow': 'filter',
  tracking: 'letter-spacing',
  leading: 'line-height',
  ease: 'transition-timing-function',
  animate: 'animation',
  blur: 'filter',
};

/** What a Tailwind utility traced to `theme` sets: `bg-canvas` → background-color. */
function themeProperty(base: string, theme: Declaration) {
  const namespace = /^--([a-z-]+?)-/.exec(theme.name)?.[1] ?? '';
  if (namespace === 'color') {
    for (const [prefix, property] of COLOUR_PROPERTY) {
      const match = prefix.exec(base);
      if (match) return property.replace('$1', match[1] ?? '');
    }
  }
  if (namespace === 'spacing') return base.replace(/-.*$/, '');
  return NAMESPACE_PROPERTY[namespace] ?? namespace;
}

/* What a `text-*` size utility writes besides font-size, when the theme
   gives the size a companion: `--text-meta--line-height`. */
const COMPANIONS: [string, string][] = [
  ['--line-height', 'line-height'],
  ['--letter-spacing', 'letter-spacing'],
  ['--font-weight', 'font-weight'],
];

/** Every declaration a theme utility writes: `text-meta` is font-size, line-height and letter-spacing. */
export function themeDeclarations(
  base: string,
  theme: Declaration,
  lookup: Lookup,
) {
  const property = themeProperty(base, theme);
  const own = { property, value: `var(${theme.name})`, site: theme as Site };
  if (property !== 'font-size') return [own];
  return [
    own,
    ...COMPANIONS.flatMap(([suffix, companion]) => {
      const found = lookup.theme.get(`${theme.name}${suffix}`);
      return found
        ? [
            {
              property: companion,
              value: `var(${found.name})`,
              site: found as Site,
            },
          ]
        : [];
    }),
  ];
}

/** An arbitrary property class, `[--x:1px]`, as the declaration it writes. */
export function arbitraryProperty(base: string) {
  const match = /^\[(-?-?[\w-]+):(.+)\]$/.exec(base);
  return match
    ? { property: match[1]!, value: match[2]!.replace(/_/g, ' ') }
    : undefined;
}

/* The two top-level arguments of the light-dark() starting at `open`, and
   where it ends. */
function lightDarkAt(value: string, open: number) {
  let depth = 0;
  let comma = -1;
  for (let index = open; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return comma === -1
          ? undefined
          : {
              light: value.slice(open + 1, comma).trim(),
              dark: value.slice(comma + 1, index).trim(),
              end: index + 1,
            };
      }
    } else if (char === ',' && depth === 1) comma = index;
  }
  return undefined;
}

/** `value` with every light-dark() reduced to the branch `scheme` paints. */
export function inScheme(value: string, scheme: 'light' | 'dark'): string {
  const start = value.indexOf('light-dark(');
  if (start === -1) return value;
  const found = lightDarkAt(value, start + 'light-dark'.length);
  if (!found) return value;
  return (
    value.slice(0, start) +
    inScheme(scheme === 'light' ? found.light : found.dark, scheme) +
    inScheme(value.slice(found.end), scheme)
  );
}
