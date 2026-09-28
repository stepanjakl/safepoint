import type {
  Declaration,
  Registered,
  Rule,
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

/** A selector `element.matches` accepts: pseudo-elements name no element. */
export const matchable = (selector: string) =>
  selector.replace(
    /::?(?:before|after|placeholder|marker|backdrop|selection|file-selector-button)\b/g,
    '',
  );

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
export function themeProperty(base: string, theme: Declaration) {
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
