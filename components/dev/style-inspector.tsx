'use client';

import {
  createContext,
  use,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Site, Stylesheets, Utility } from '@/lib/dev/stylesheets';

import { componentsOf, type Written } from './component-source';
import { hex, paint } from './paint';
import {
  INSPECT_EVENT,
  arbitraryProperty,
  arbitraryReads,
  buildLookup,
  inScheme,
  isStep,
  matchOn,
  readsOf,
  rulesNaming,
  shorten,
  splitVariants,
  themeFor,
  themeDeclarations,
  utilityFor,
  type Lookup,
} from './style-lookup';

/*
  Development only: point at an element and see where its styles are written.

  Hold ⌥ Option (Alt) to inspect what is under the pointer; ⌥-click pins it, so
  the panel stays once the key is up and its links can be followed straight
  into the editor. Ctrl+Shift+` (or Debug → Inspect styles in the design pane)
  keeps it on without holding anything, every click pinning. Escape unpins,
  then closes. ⌥ with another key is not a peek, and ⌥-click on the sidebar
  handle still resets its width.

  Every declaration that reaches the element is listed, with where it is
  written: the app's utilities, @theme entries and every rule that matches,
  by class or by structure (`.pill > *`, `svg`); Tailwind's generated
  utilities and packages' injected rules, read from the page; the style
  attribute; Tailwind's reset, folded; and, for inherited properties it does
  not set, the ancestor each comes from. Every var() unfolds into the chain
  that paints it -- the class that set it, here or on an ancestor, then the
  role, down to the step -- and a property a class sets names what reads it.
  The index is read fresh each time the inspector opens, so an edit shows
  without a restart.
*/

/* Marks the inspector's own elements, which it never inspects. */
const ROOT = 'data-style-inspector';
/* Set on <html> while inspecting, for the crosshair. */
const INSPECTING = 'data-style-inspecting';
/* ⌥-clicks the page keeps while peeking. */
const OWN_ALT_CLICK = '.sidebar-handle';

/* Off; peeking while ⌥ is held; or on until closed. */
type Mode = 'off' | 'peek' | 'on';

const onlyOption = (event: KeyboardEvent | MouseEvent) =>
  event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;

/* ⌥ types characters on a Mac: never peek from inside a field. */
const typing = () =>
  document.activeElement instanceof HTMLElement &&
  (document.activeElement.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));

/** `vscode` by default; set localStorage `safepoint.dev.editor` to `cursor`. */
function editor() {
  try {
    return window.localStorage.getItem('safepoint.dev.editor') ?? 'vscode';
  } catch {
    return 'vscode';
  }
}

let probe: HTMLSpanElement | null = null;
function colourOf(value: string) {
  if (!value || value === 'none') return undefined;
  if (!probe) {
    probe = document.createElement('span');
    probe.hidden = true;
    probe.setAttribute(ROOT, '');
    document.body.append(probe);
  }
  const channels = paint(probe, value);
  return channels ? hex(channels) : undefined;
}

/* Who declares a custom property that reaches the element, and where its own
   var() reads resolve: on that element, or on :root for a role. */
type Source = {
  label: string;
  where: 'element' | 'ancestor' | 'root' | 'initial';
  node?: string;
  site?: Site;
  value: string;
  context: Element;
};

/* A custom property, what it paints, who set it, and the ones it reads. */
type Chain = {
  name: string;
  painted?: string;
  source?: Source;
  children: Chain[];
};

/* One declaration of a rule or utility, as it applies to this element. */
type Line = {
  property: string;
  value: string;
  site?: Site;
  when: string[];
  active: boolean;
  via?: string;
  /** Applies, but another declaration of the property wins the cascade. */
  overridden?: boolean;
  /** What the winning declaration computes to, where that says more. */
  computed?: string;
  chains: Chain[];
  readBy: string[];
};

type Row = {
  /** `inline` is the style attribute; a `rule` with no site is a package's. */
  kind: 'rule' | 'utility' | 'theme' | 'inline';
  label: string;
  note?: string;
  site?: Site;
  /** False when a variant or selector says it is not applying now. */
  applies: boolean;
  /** Only a pseudo-element matches: none of it is this element's own. */
  pseudo?: boolean;
  /** Cascade layer rank: base 1, components 2, utilities 3, unlayered 4, inline 5. */
  layer?: number;
  /** From `specificityOf`. */
  specificity?: number;
  lines: Line[];
};

type RawLine = Omit<Line, 'chains' | 'readBy' | 'overridden' | 'computed'>;
type RawRow = Omit<Row, 'lines'> & { lines: RawLine[] };

type Report = {
  tag: string;
  box: string;
  paints: {
    label: string;
    value: string;
    painted?: string;
    from?: string;
  }[];
  own: Row[];
  rules: Row[];
  inline: Row[];
  inherited: Inherited[];
  packages: Row[];
  reset: Row[];
  idle: Row[];
  tailwind: string[];
};

/* An inherited property this element does not set, and the nearest ancestor
   declaration it comes from. */
type Inherited = {
  property: string;
  value: string;
  from: string;
  site?: Site;
};

/* A variant this can test on the element itself, or null when it cannot. */
function variantApplies(element: Element, variant: string) {
  const data = /^(data|aria)-\[([\w-]+)(?:=(.+))?\]$/.exec(variant);
  const selector = data
    ? `[${data[1]}-${data[2]}${data[3] ? `="${data[3].replace(/^['"]|['"]$/g, '')}"` : ''}]`
    : (
        {
          interact: ':is([data-hovered], [data-focus-visible], [data-pressed])',
          hover: ':hover',
          focus: ':focus',
          'focus-visible': ':focus-visible',
          'focus-within': ':focus-within',
          active: ':active',
          disabled: ':disabled',
        } as Record<string, string>
      )[variant];
  if (!selector) return null;
  try {
    return element.matches(selector);
  } catch {
    return null;
  }
}

const PSEUDO_ELEMENT = /::?(before|after|placeholder|marker|backdrop)\b/;

/* Whether the blocks a declaration is nested in hold for this element: a
   state (`&[data-x]`) it is in, a media query that matches. A nested
   descendant or pseudo-element paints something else. */
function whenActive(node: Element, when: string[]) {
  return when.every((block) => {
    if (block.startsWith('@media')) {
      try {
        return window.matchMedia(block.slice(6).trim()).matches;
      } catch {
        return true;
      }
    }
    if (block.startsWith('@')) return true;
    if (!block.includes('&') || PSEUDO_ELEMENT.test(block)) return false;
    try {
      return node.matches(block.replaceAll('&', ':scope'));
    } catch {
      return false;
    }
  });
}

/* What `@apply name` brings in: an app utility's declarations, or the one a
   Tailwind theme utility writes -- `shadow-control-highlight` is box-shadow
   reading --shadow-control-highlight. */
function appliedLines(
  name: string,
  node: Element,
  lookup: Lookup,
  via: string,
  seen: Set<string>,
): RawLine[] {
  const applied = utilityFor(name, lookup);
  if (applied) return utilityLines(applied, node, lookup, via, seen);
  const theme = themeFor(name, lookup);
  return theme
    ? themeDeclarations(name, theme, lookup).map((line) => ({
        ...line,
        when: [],
        active: true,
        via,
      }))
    : [];
}

/* A utility's declarations on `node`, and those it pulls in with @apply. */
function utilityLines(
  utility: Utility,
  node: Element,
  lookup: Lookup,
  via?: string,
  seen = new Set<string>(),
): RawLine[] {
  if (seen.has(utility.name)) return [];
  seen.add(utility.name);
  return [
    ...utility.applies.flatMap((name) =>
      appliedLines(name, node, lookup, via ?? `@apply ${name}`, seen),
    ),
    ...utility.properties.map((entry) => ({
      property: entry.property,
      value: entry.value,
      site: { file: utility.file, line: entry.line },
      when: entry.when,
      active: whenActive(node, entry.when),
      via,
    })),
  ];
}

/* Everything the app's stylesheets and theme apply to `node`, in cascade
   order -- components-layer rules, then utilities, variants last -- so the
   last declaration of a property is the one that wins. */
function rowsOf(node: Element, lookup: Lookup): RawRow[] {
  const rules: RawRow[] = [];
  // Every rule that reaches the element, by its classes or by structure
  // (`.pill > *`, `svg`, `[data-severity]`), and those naming its classes
  // that do not match now.
  const named = new Set(rulesNaming([...node.classList], lookup.sheets.rules));
  for (const rule of lookup.sheets.rules) {
    const on = matchOn(node, rule.selector);
    const matches = on.element || on.pseudos.length > 0;
    if (!matches && !named.has(rule)) continue;
    const pseudo = matches
      ? on.element
        ? ''
        : on.pseudos.join(' ')
      : (PSEUDO_ELEMENT.exec(rule.source)?.[0] ?? '');
    rules.push({
      kind: 'rule',
      label: rule.source,
      note: [...rule.context, pseudo].filter(Boolean).join(' '),
      site: rule,
      applies: matches && whenActive(node, rule.context),
      pseudo: matches && !on.element,
      layer: layerRank(rule.context),
      specificity: on.specificity,
      lines: [
        ...rule.applies.flatMap((name) =>
          appliedLines(name, node, lookup, `@apply ${name}`, new Set()),
        ),
        ...rule.properties.map((entry) => ({
          property: entry.property,
          value: entry.value,
          site: { file: rule.file, line: entry.line },
          when: entry.when,
          active: whenActive(node, entry.when),
        })),
      ],
    });
  }
  const plain: RawRow[] = [];
  const varied: RawRow[] = [];
  for (const token of node.classList) {
    const { base, variants } = splitVariants(token);
    const applies = variants.every(
      (variant) => variantApplies(node, variant) !== false,
    );
    const note = variants.length > 0 ? `${variants.join(':')}:` : undefined;
    const into = variants.length > 0 ? varied : plain;
    const utility = utilityFor(base, lookup);
    if (utility) {
      into.push({
        kind: 'utility',
        label: base,
        note,
        site: utility,
        applies,
        lines: utilityLines(utility, node, lookup),
      });
      continue;
    }
    // What Tailwind compiled is exact; the theme entry says where the value
    // is named. A guess from the class name can land on another entry, and
    // an @theme inline value is copied in, so it is checked both ways.
    // A class the app's stylesheets write is listed as their rule already.
    const generated = appClasses(lookup).has(base)
      ? []
      : generatedLines(token, node);
    const guess = themeFor(base, lookup);
    const theme =
      guess &&
      (generated.length === 0 ||
        generated.some(
          (line) =>
            line.value.includes(guess.name) || line.value.includes(guess.value),
        ))
        ? guess
        : undefined;
    if (theme) {
      const named = themeDeclarations(base, theme, lookup).map((line) => ({
        ...line,
        when: [],
        active: true,
      }));
      const compiled = new Set(generated.map((line) => line.property));
      const confirmed =
        generated.length === 0 ||
        named.every((line) => compiled.has(line.property));
      const covered = new Set(named.map((line) => line.property));
      into.push({
        kind: 'theme',
        label: base,
        note,
        site: theme,
        applies,
        lines: confirmed
          ? [
              ...named,
              ...generated.filter((line) => !covered.has(line.property)),
            ]
          : generated,
      });
      continue;
    }
    if (generated.length > 0) {
      into.push({
        kind: 'utility',
        label: base,
        note: note ?? 'Tailwind ',
        applies: generated.some((line) => line.active),
        lines: generated,
      });
      continue;
    }
    const arbitrary = arbitraryProperty(base);
    const reads = arbitraryReads(base);
    if (arbitrary || reads.length > 0) {
      into.push({
        kind: 'theme',
        label: base,
        note,
        applies,
        lines: arbitrary
          ? [{ ...arbitrary, when: [], active: true }]
          : reads.map((name) => ({
              property: base.replace(/-\(.*$|-\[.*$/, ''),
              value: `var(${name})`,
              when: [],
              active: true,
            })),
      });
    }
  }
  const byOrder = (row: RawRow) =>
    row.kind === 'utility'
      ? (lookup.order.get(utilityFor(row.label, lookup)!) ?? 0)
      : -1;
  plain.sort((x, y) => byOrder(x) - byOrder(y));
  varied.sort((x, y) => byOrder(x) - byOrder(y));
  // Every utility sits in Tailwind's utilities layer; a variant adds its
  // own selector to the class's.
  for (const row of [...plain, ...varied]) {
    const variants = row.note ? row.note.split(':').length - 1 : 0;
    row.layer ??= 3;
    row.specificity ??= 1e3 * (1 + variants);
  }
  const injected = injectedRows(node);
  const inline = inlineRow(node);
  // Cascade order: layered package rules, the app's layers, unlayered
  // package rules, then the style attribute.
  return [
    ...injected.layered,
    ...rules,
    ...plain,
    ...varied,
    ...injected.unlayered,
    ...(inline ? [inline] : []),
  ];
}

/* Every class the app's own stylesheets name, once per index. */
const namedClasses = new WeakMap<Lookup, Set<string>>();
function appClasses(lookup: Lookup) {
  let names = namedClasses.get(lookup);
  if (!names) {
    names = new Set<string>();
    for (const rule of lookup.sheets.rules) {
      for (const [, name] of rule.source.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        names.add(name!);
      }
    }
    namedClasses.set(lookup, names);
  }
  return names;
}

/* A declaration block as written: its serialised text keeps shorthands
   (`flex`, `white-space`) that indexing it expands into longhands. */
function declarationsOf(style: CSSStyleDeclaration) {
  const found: { property: string; value: string }[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const text = style.cssText;
  const take = (end: number) => {
    const part = text.slice(start, end);
    const colon = part.indexOf(':');
    if (colon > 0) {
      found.push({
        property: part.slice(0, colon).trim(),
        value: part.slice(colon + 1).trim(),
      });
    }
    start = end + 1;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ';' && depth === 0) take(index);
  }
  take(text.length);
  return found;
}

/* The app's compiled stylesheet, by class: every rule whose selector names
   it, with its nesting resolved. Read once per stylesheet version. */
type Compiled = {
  selector: string;
  style: CSSStyleDeclaration;
  when: string[];
};
let compiled: {
  sheet: CSSStyleSheet;
  size: number;
  byClass: Map<string, Compiled[]>;
} | null = null;
function compiledByClass() {
  const sheet = [...document.styleSheets].find(
    (entry) => entry.ownerNode instanceof HTMLLinkElement,
  );
  if (!sheet) return new Map<string, Compiled[]>();
  let size = 0;
  try {
    size = sheet.cssRules.length;
  } catch {
    return new Map<string, Compiled[]>();
  }
  if (compiled?.sheet === sheet && compiled.size === size) {
    return compiled.byClass;
  }
  const byClass = new Map<string, Compiled[]>();
  const add = (
    selector: string,
    style: CSSStyleDeclaration,
    when: string[],
  ) => {
    for (const [, escaped] of selector.matchAll(/\.((?:\\.|[\w-])+)/g)) {
      const name = escaped!.replace(/\\(.)/g, '$1');
      byClass.set(name, [
        ...(byClass.get(name) ?? []),
        { selector, style, when },
      ]);
    }
  };
  const walk = (rules: CSSRuleList, parent: string | null, when: string[]) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const selector =
          parent === null
            ? rule.selectorText
            : rule.selectorText.includes('&')
              ? rule.selectorText.replaceAll('&', `:is(${parent})`)
              : `:is(${parent}) ${rule.selectorText}`;
        if (rule.style.length > 0) add(selector, rule.style, when);
        walk(rule.cssRules, selector, when);
      } else if (
        typeof CSSNestedDeclarations !== 'undefined' &&
        rule instanceof CSSNestedDeclarations &&
        parent !== null
      ) {
        add(parent, rule.style, when);
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, parent, [...when, `@media ${rule.conditionText}`]);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, parent, [
          ...when,
          `@supports ${rule.conditionText}`,
        ]);
      } else if (rule instanceof CSSGroupingRule) {
        walk(rule.cssRules, parent, when);
      }
    }
  };
  walk(sheet.cssRules, null, []);
  compiled = { sheet, size, byClass };
  return byClass;
}

/* What Tailwind generated for a class the app's stylesheets do not write:
   `px-2` is `padding-inline: calc(var(--spacing) * 2)`. */
function generatedLines(token: string, node: Element): RawLine[] {
  return (compiledByClass().get(token) ?? []).flatMap((entry) => {
    const on = matchOn(node, entry.selector);
    const active = on.element && whenActive(node, entry.when);
    return declarationsOf(entry.style).map((declaration) => ({
      ...declaration,
      when: entry.when,
      active,
    }));
  });
}

/* Rules a package adds in its own <style> (React Aria, torph), read from the
   page, since no stylesheet the app writes holds them. */
function injectedRows(node: Element) {
  const layered: RawRow[] = [];
  const unlayered: RawRow[] = [];
  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode;
    if (!(owner instanceof HTMLStyleElement) || owner.closest(`[${ROOT}]`)) {
      continue;
    }
    const origin =
      owner.id ||
      [...owner.attributes].find((entry) => entry.name.startsWith('data-'))
        ?.name ||
      'injected <style>';
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    const walk = (rules: CSSRuleList, when: string[], inLayer: boolean) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          const on = matchOn(node, rule.selectorText);
          if (!on.element && on.pseudos.length === 0) continue;
          const active = whenActive(node, when);
          (inLayer ? layered : unlayered).push({
            kind: 'rule',
            label: rule.selectorText,
            note: [origin, ...on.pseudos].join(' '),
            applies: active,
            pseudo: !on.element,
            // An anonymous layer injected ahead of the app's sorts first.
            layer: inLayer ? -1 : 4,
            specificity: on.specificity,
            lines: declarationsOf(rule.style).map((declaration) => ({
              ...declaration,
              when,
              active,
            })),
          });
        } else if (rule instanceof CSSMediaRule) {
          walk(
            rule.cssRules,
            [...when, `@media ${rule.conditionText}`],
            inLayer,
          );
        } else if (rule instanceof CSSSupportsRule) {
          walk(
            rule.cssRules,
            [...when, `@supports ${rule.conditionText}`],
            inLayer,
          );
        } else if (rule instanceof CSSLayerBlockRule) {
          walk(rule.cssRules, when, true);
        }
      }
    };
    walk(list, [], false);
  }
  return { layered, unlayered };
}

/* The style attribute: React's style prop, and what motion writes. */
function inlineRow(node: Element): RawRow | undefined {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
  if (node.style.length === 0) return;
  return {
    kind: 'inline',
    label: 'style attribute',
    applies: true,
    layer: 5,
    lines: declarationsOf(node.style).map((declaration) => ({
      ...declaration,
      when: [],
      active: true,
    })),
  };
}

/* The inherited properties worth tracing, each with the shorthands that
   also set it. */
const INHERITED: Record<string, string[]> = {
  color: [],
  'font-family': ['font'],
  'font-size': ['font'],
  'font-weight': ['font'],
  'font-style': ['font'],
  'line-height': ['font'],
  'letter-spacing': [],
  'font-variant-numeric': [],
  'font-feature-settings': [],
  'text-align': [],
  'text-transform': [],
  'text-wrap': [],
  'white-space': [],
  'overflow-wrap': [],
  'word-break': [],
  'list-style-type': ['list-style'],
  cursor: [],
  visibility: [],
  '-webkit-font-smoothing': [],
};

/* Each inherited property the element does not set itself, from the nearest
   ancestor declaration that does (skipping an explicit `inherit`). */
function inheritedOf(
  element: Element,
  rowsFor: (node: Element) => RawRow[],
): Inherited[] {
  const style = getComputedStyle(element);
  const setBy = (node: Element, property: string) => {
    for (const name of [property, ...INHERITED[property]!]) {
      const hit = winner(name, rowsFor(node));
      if (hit && hit.line.value !== 'inherit') return hit;
    }
    return undefined;
  };
  const found: Inherited[] = [];
  for (const property of Object.keys(INHERITED)) {
    if (setBy(element, property)) continue;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const hit = setBy(node, property);
      if (!hit) continue;
      found.push({
        property,
        // The inspector's crosshair overrides cursor while it is open.
        value:
          property === 'cursor'
            ? hit.line.value
            : style.getPropertyValue(property).trim(),
        from: `${nameOf(hit.row)} on ${describe(node)}`,
        site: hit.line.site,
      });
      break;
    }
  }
  return found;
}

/* A rule is named by its selector; a utility by its variants and name. */
const nameOf = (row: RawRow) =>
  row.kind === 'rule' ? row.label : `${row.note ?? ''}${row.label}`;

/* The scheme light-dark() paints on `node`: its color-scheme, or the
   system's where it allows both. */
function schemeOf(node: Element): 'light' | 'dark' {
  const scheme = getComputedStyle(node).colorScheme;
  const light = /\blight\b/.test(scheme);
  const dark = /\bdark\b/.test(scheme);
  if (dark && !light) return 'dark';
  if (light && !dark) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/* The custom properties a value reads where it is used: light-dark()
   reduced to the branch that paints. */
const liveReads = (value: string, at: Element) =>
  readsOf(inScheme(value, schemeOf(at)));

/* The declaration of `name` that reaches <html>: the last whose selector
   matches it -- :root, or a preference such as [data-typescale='sharp'] --
   else the @theme entry. */
function rootDeclaration(name: string, lookup: Lookup) {
  let hit: (typeof lookup.sheets.declarations)[number] | undefined;
  let theme: typeof hit;
  for (const declaration of lookup.byName.get(name) ?? []) {
    if (declaration.selector.startsWith('@theme')) {
      if (declaration.value !== 'initial') theme = declaration;
      continue;
    }
    try {
      if (document.documentElement.matches(declaration.selector)) {
        hit = declaration;
      }
    } catch {
      // A selector this cannot test, such as a nested one.
    }
  }
  return hit ?? theme;
}

const describe = (node: Element) =>
  `<${node.tagName.toLowerCase()}${[...node.classList]
    .slice(0, 2)
    .map((name) => `.${name}`)
    .join('')}>`;

/* Tailwind's layer order, as its stylesheet declares it. */
const LAYERS = ['theme', 'base', 'components', 'utilities'];
function layerRank(context: string[]) {
  const layer = context.findLast((block) => block.startsWith('@layer'));
  if (!layer) return 4;
  const rank = LAYERS.indexOf(layer.slice(6).trim());
  return rank === -1 ? 2 : rank;
}

/* Where a declaration stands in the cascade: importance and layer (an
   important one reverses the layers), then specificity. Source order breaks
   a tie, so a later one of equal rank wins. */
function cascadeRank(row: RawRow, line: RawLine) {
  const layer = row.layer ?? 4;
  const important = /!important\s*$/.test(line.value);
  const rank = important ? (row.kind === 'inline' ? 30 : 20 - layer) : layer;
  return [rank, row.specificity ?? 0] as const;
}

/* The winning declaration of `property` on `node`, if any. */
function winner(property: string, rows: RawRow[]) {
  let hit: { row: RawRow; line: RawLine } | undefined;
  let best: readonly [number, number] = [-Infinity, -Infinity];
  for (const row of rows) {
    if (!row.applies || row.pseudo) continue;
    for (const line of row.lines) {
      if (!line.active || line.property !== property) continue;
      const rank = cascadeRank(row, line);
      if (rank[0] > best[0] || (rank[0] === best[0] && rank[1] >= best[1])) {
        hit = { row, line };
        best = rank;
      }
    }
  }
  return hit;
}

/* Where the value of `name` that reaches `element` is declared: the element
   itself, the nearest ancestor that sets it (a custom property inherits,
   unless @property says it does not), or :root and @theme. */
function sourceOf(
  name: string,
  element: Element,
  lookup: Lookup,
  rowsFor: (node: Element) => RawRow[],
): Source | undefined {
  const registered = lookup.registered.get(name);
  for (
    let node: Element | null = element;
    node && node !== document.documentElement;
    node = node.parentElement
  ) {
    // An inline style outranks every stylesheet rule.
    const inline =
      node instanceof HTMLElement ? node.style.getPropertyValue(name) : '';
    if (inline) {
      return {
        label: 'inline style',
        where: node === element ? 'element' : 'ancestor',
        node: node === element ? undefined : describe(node),
        value: inline.trim(),
        context: node,
      };
    }
    const hit = winner(name, rowsFor(node));
    if (hit) {
      return {
        label: hit.line.via
          ? `${nameOf(hit.row)} (${hit.line.via})`
          : nameOf(hit.row),
        where: node === element ? 'element' : 'ancestor',
        node: node === element ? undefined : describe(node),
        site: hit.line.site,
        value: hit.line.value,
        context: node,
      };
    }
    if (registered && !registered.inherits) break;
  }
  if (registered && !registered.inherits) {
    return {
      label: '@property initial-value',
      where: 'initial',
      site: registered,
      value: registered.initial ?? '',
      context: element,
    };
  }
  const declared = rootDeclaration(name, lookup);
  // Set, but by nothing the app writes: Tailwind's own theme (--spacing).
  const computed = getComputedStyle(element).getPropertyValue(name).trim();
  if (!declared && computed) {
    return {
      label: 'Tailwind theme',
      where: 'root',
      value: computed,
      context: document.documentElement,
    };
  }
  if (!declared) return undefined;
  // @theme inline is copied into the utility that uses it, so what it reads
  // resolves on that element; anything else was computed on <html>.
  const inline = declared.selector.startsWith('@theme inline');
  return {
    label: declared.selector,
    where: 'root',
    site: declared,
    value: declared.value,
    context: inline ? element : document.documentElement,
  };
}

/* `name` as read on `at`, followed down to a step or a literal. */
function explain(
  name: string,
  at: Element,
  lookup: Lookup,
  rowsFor: (node: Element) => RawRow[],
  depth = 0,
  seen = new Set<string>(),
): Chain {
  const painted = colourOf(getComputedStyle(at).getPropertyValue(name).trim());
  if (depth > 6 || seen.has(name)) return { name, painted, children: [] };
  const source = sourceOf(name, at, lookup, rowsFor);
  const next = new Set(seen).add(name);
  return {
    name,
    painted,
    source,
    children:
      source && !isStep(name)
        ? liveReads(source.value, source.context).map((child) =>
            explain(child, source.context, lookup, rowsFor, depth + 1, next),
          )
        : [],
  };
}

/* The properties each paint swatch comes from, most specific first. */
const PAINT_PROPERTIES: Record<string, string[]> = {
  background: ['background-color', 'background'],
  image: ['background-image', 'background'],
  text: ['color'],
  border: ['border-top-color', 'border-color', 'border-top', 'border'],
  shadow: ['box-shadow'],
};

/* Shorthands whose computed form is empty or longer than what was written. */
// cursor: the inspector's crosshair is what computes while it is open.
const NO_COMPUTED = new Set([
  'cursor',

  'font',
  'background',
  'transition',
  'animation',
  'all',
]);

/* What a winning declaration computes to on the element, when that differs
   from what is written: `calc(var(--spacing) * 2)` is 8px. Colours as hex. */
function computedOf(line: RawLine, style: CSSStyleDeclaration) {
  if (line.property.startsWith('--') || NO_COMPUTED.has(line.property)) return;
  const value = style.getPropertyValue(line.property).trim();
  if (!value || value.length > 64) return;
  const written = line.value.replace(/\s*!important\s*$/, '').trim();
  const shown = /^(?:rgba?|oklch|oklab|color|hsla?)\(/.test(value)
    ? (colourOf(value) ?? value)
    : value;
  // `0` and `0px` say the same thing.
  const zeroes = (text: string) =>
    text.replace(/(^|[\s(,])0(?:px|r?em|%)(?=$|[\s),])/g, '$10');
  return zeroes(shown) === zeroes(written) || zeroes(value) === zeroes(written)
    ? undefined
    : shown;
}

const px = (value: string) => {
  const number = parseFloat(value) || 0;
  return String(Math.round(number * 100) / 100);
};
/* `0 6 0 2`, or one number when all four sides match. */
const sides = (style: CSSStyleDeclaration, prefix: string, suffix = '') => {
  const values = ['top', 'right', 'bottom', 'left'].map((side) =>
    px(style.getPropertyValue(`${prefix}-${side}${suffix}`)),
  );
  return values.every((value) => value === values[0])
    ? values[0]!
    : values.join(' ');
};

/* Size, padding, border and margin on one line, in CSS pixels. */
function boxOf(element: Element, style: CSSStyleDeclaration) {
  const rect = element.getBoundingClientRect();
  return [
    `${px(String(rect.width))}×${px(String(rect.height))}`,
    `pad ${sides(style, 'padding')}`,
    `border ${sides(style, 'border', '-width')}`,
    `margin ${sides(style, 'margin')}`,
  ].join(' · ');
}

function inspect(element: Element, lookup: Lookup): Report {
  const style = getComputedStyle(element);
  const cache = new Map<Element, RawRow[]>();
  const rowsFor = (node: Element) => {
    let rows = cache.get(node);
    if (!rows) cache.set(node, (rows = rowsOf(node, lookup)));
    return rows;
  };
  const raw = rowsFor(element);

  // Which of this element's declarations read each custom property it sets.
  const readers = new Map<string, string[]>();
  for (const row of raw) {
    for (const line of row.lines) {
      if (!line.active) continue;
      for (const name of readsOf(line.value)) {
        readers.set(name, [
          ...(readers.get(name) ?? []),
          `${row.label} · ${line.property}`,
        ]);
      }
    }
  }
  // The declaration of each property that wins; the others it overrides.
  const winners = new Map<string, RawLine | undefined>();
  const wins = (property: string) => {
    if (!winners.has(property)) {
      winners.set(property, winner(property, raw)?.line);
    }
    return winners.get(property);
  };
  const finish = (row: RawRow): Row => ({
    kind: row.kind,
    label: row.label,
    note: row.note,
    site: row.site,
    applies: row.applies,
    lines: row.lines.map((line) => ({
      ...line,
      overridden:
        row.applies &&
        !row.pseudo &&
        line.active &&
        wins(line.property) !== line,
      computed:
        row.applies && !row.pseudo && wins(line.property) === line
          ? computedOf(line, style)
          : undefined,
      chains:
        row.applies && line.active
          ? liveReads(line.value, element).map((name) =>
              explain(name, element, lookup, rowsFor),
            )
          : [],
      readBy: line.property.startsWith('--')
        ? (readers.get(line.property) ?? [])
        : [],
    })),
  });

  const own = raw
    .filter((row) => row.kind === 'utility' || row.kind === 'theme')
    .map(finish);
  const rules = raw.filter((row) => row.kind === 'rule');
  const applying = rules.filter((row) => row.applies);
  const isReset = (row: RawRow) =>
    Boolean(row.site?.file.endsWith('tailwindcss/preflight.css'));
  const handled = new Set(raw.map((row) => row.label));
  const tailwind = [...element.classList].filter(
    (token) => !handled.has(splitVariants(token).base),
  );

  // Name the class each swatch comes from; text colour may be inherited.
  const paintSource = (label: string) => {
    const properties = PAINT_PROPERTIES[label] ?? [];
    for (
      let node: Element | null = element;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      for (const property of properties) {
        const hit = winner(property, rowsFor(node));
        if (hit) {
          const from = nameOf(hit.row);
          return node === element ? from : `${from} on ${describe(node)}`;
        }
      }
      if (label !== 'text') break;
    }
    return undefined;
  };

  const paints = [
    ['background', style.backgroundColor],
    ['text', style.color],
    ...(parseFloat(style.borderTopWidth) > 0
      ? [['border', style.borderTopColor]]
      : []),
    ...(style.backgroundImage !== 'none'
      ? [['image', style.backgroundImage]]
      : []),
    ...(style.boxShadow !== 'none' ? [['shadow', style.boxShadow]] : []),
  ].map(([label, value]) => ({
    label: label!,
    value: value!,
    painted: colourOf(value!),
    from: paintSource(label!),
  }));

  return {
    tag: element.tagName.toLowerCase(),
    box: boxOf(element, style),
    paints,
    own,
    rules: applying.filter((row) => row.site && !isReset(row)).map(finish),
    inline: raw.filter((row) => row.kind === 'inline').map(finish),
    inherited: inheritedOf(element, rowsFor),
    packages: applying.filter((row) => !row.site).map(finish),
    reset: applying.filter(isReset).map(finish),
    idle: rules.filter((row) => !row.applies).map(finish),
    tailwind,
  };
}

/* The filter: a declaration matches by property, value, or any custom
   property in the chain beneath it; a row by name keeps all its own. */
const chainMatches = (chain: Chain, query: string): boolean =>
  chain.name.toLowerCase().includes(query) ||
  chain.children.some((child) => chainMatches(child, query));

const lineMatches = (line: Line, query: string) =>
  line.property.toLowerCase().includes(query) ||
  line.value.toLowerCase().includes(query) ||
  line.chains.some((chain) => chainMatches(chain, query));

function filterRows(rows: Row[], query: string) {
  if (!query) return rows;
  return rows.flatMap((row) => {
    if (row.label.toLowerCase().includes(query)) return [row];
    const lines = row.lines.filter((line) => lineMatches(line, query));
    return lines.length > 0 ? [{ ...row, lines }] : [];
  });
}

const countLines = (rows: Row[]) =>
  rows.reduce((total, row) => total + row.lines.length, 0);

const allRows = (report: Report) => [
  ...report.own,
  ...report.rules,
  ...report.inline,
  ...report.packages,
  ...report.reset,
  ...report.idle,
];

const filterInherited = (entries: Inherited[], query: string) =>
  query
    ? entries.filter((entry) =>
        `${entry.property} ${entry.value} ${entry.from}`
          .toLowerCase()
          .includes(query),
      )
    : entries;

export function StyleInspector() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Inspector />;
}

function Inspector() {
  const [mode, setMode] = useState<Mode>('off');
  const active = mode !== 'off';
  // The key handlers outlive renders; they read the mode through this.
  const modeRef = useRef<Mode>('off');
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  // The children Parent stepped out of, nearest last, for Child to step back
  // into; any other choice of element discards them.
  const [trail, setTrail] = useState<Element[]>([]);
  // Which half of the window the pointer is in, while nothing is pinned.
  const [pointerRight, setPointerRight] = useState(false);
  const [pinned, setPinned] = useState(false);
  // Kept while moving between elements, so one filter follows the pointer.
  const [query, setQuery] = useState('');
  const [, remeasure] = useReducer((count: number) => count + 1, 0);
  // Which component wrote the target, once the dev server has mapped it.
  const [written, setWritten] = useState<{
    of: Element;
    by: Written[];
  } | null>(null);

  function close() {
    setMode('off');
    setTarget(null);
    setTrail([]);
    setPinned(false);
  }

  // The toggle, and ⌥ held down to peek.
  useEffect(() => {
    // Where the pointer last was, so a peek starts on what is under it
    // without waiting for it to move.
    let x = -1;
    let y = -1;
    function track(event: PointerEvent) {
      x = event.clientX;
      y = event.clientY;
    }
    function endPeek() {
      if (modeRef.current !== 'peek') return;
      modeRef.current = 'off';
      setMode('off');
      setTarget(null);
      setTrail([]);
    }
    function toggle() {
      setMode((was) => (was === 'on' ? 'off' : 'on'));
      setTarget(null);
      setTrail([]);
      setPinned(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      // By character as well as by key: an ISO Mac keyboard reports the key
      // left of 1 under another code.
      if (
        event.ctrlKey &&
        event.shiftKey &&
        (event.code === 'Backquote' || event.key === '`' || event.key === '~')
      ) {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key === 'Alt' && onlyOption(event) && !typing()) {
        if (modeRef.current !== 'off') return;
        modeRef.current = 'peek';
        setMode('peek');
        setPointerRight(x > window.innerWidth / 2);
        const under = x < 0 ? null : document.elementFromPoint(x, y);
        setTrail([]);
        if (under && !under.closest(`[${ROOT}]`)) setTarget(under);
        return;
      }
      // Anything joining ⌥ is another gesture, or a character being typed.
      endPeek();
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'Alt') endPeek();
    }
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', endPeek);
    window.addEventListener(INSPECT_EVENT, toggle);
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', endPeek);
      window.removeEventListener(INSPECT_EVENT, toggle);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let current = true;
    void componentsOf(target).then((by) => {
      if (current) setWritten({ of: target, by });
    });
    return () => {
      current = false;
    };
  }, [target]);

  // Read the stylesheets afresh every time the inspector opens.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetch('/api/dev/stylesheets')
      .then((response) => response.json() as Promise<Stylesheets>)
      .then((sheets) => {
        if (!cancelled) setLookup(buildLookup(sheets));
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute(INSPECTING, '');
    const outside = (node: EventTarget | null): node is Element =>
      node instanceof Element && !node.closest(`[${ROOT}]`);
    let frame = 0;
    // Unpinned, the panel keeps to the half the pointer is not in, so it
    // is never over what the pointer is reaching for.
    function onMove(event: PointerEvent) {
      if (pinned) return;
      const right = event.clientX > window.innerWidth / 2;
      // What is under the pointer beneath the panel, too: the panel moves
      // aside, and what it covered is what the pointer came for.
      const element = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((node) => outside(node));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setPointerRight(right);
        if (!element) return;
        setTarget(element);
        setTrail([]);
      });
    }
    // The page never sees a press while inspecting: a click pins instead,
    // and a pin outlasts the ⌥ that made it.
    function hold(event: Event) {
      if (!outside(event.target)) return;
      if (mode === 'peek' && event.target.closest(OWN_ALT_CLICK)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') {
        setTarget(event.target);
        setTrail([]);
        setPinned(true);
        setMode('on');
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      // In a filled filter, Escape clears it before it unpins anything.
      const field = event.target;
      if (
        field instanceof HTMLInputElement &&
        field.closest(`[${ROOT}]`) &&
        field.value
      ) {
        setQuery('');
        return;
      }
      if (pinned) setPinned(false);
      else close();
    }
    const held = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];
    window.addEventListener('pointermove', onMove, true);
    for (const type of held) window.addEventListener(type, hold, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);
    return () => {
      cancelAnimationFrame(frame);
      root.removeAttribute(INSPECTING);
      window.removeEventListener('pointermove', onMove, true);
      for (const type of held) window.removeEventListener(type, hold, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
    };
  }, [active, mode, pinned]);

  if (!active) return null;

  const report = target && lookup ? inspect(target, lookup) : null;
  const needle = query.trim().toLowerCase();
  const rect = target?.getBoundingClientRect();
  const child = trail.at(-1);
  const canParent = Boolean(
    target?.parentElement && target.parentElement !== document.body,
  );
  const by = written?.of === target ? written.by : [];
  const writer = by.find((step) => !step.library && step.file);
  const scheme = editor();
  const open = (file: string, line: number | string, column?: string) =>
    `${scheme}://file${file.startsWith('/') ? '' : `${lookup?.root.replace(/\/$/, '')}/`}${file}:${line}${column ? `:${column}` : ''}`;
  // Pinned, it keeps clear of what it describes; unpinned, of the pointer.
  const onLeft = pinned
    ? rect
      ? rect.left + rect.width / 2 > window.innerWidth / 2
      : false
    : pointerRight;

  return (
    // React Aria's top layer: an open modal neither makes this inert, nor
    // closes when it is clicked, nor pulls focus back out of its filter.
    <div {...{ [ROOT]: '' }} data-react-aria-top-layer="true">
      <style>{CSS}</style>
      {rect ? (
        <div
          className="spi-box"
          data-pinned={pinned || undefined}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}
      <section
        className="spi-panel"
        data-side={onLeft ? 'left' : 'right'}
        aria-label="Style inspector"
      >
        <header className="spi-head">
          <strong>{report ? `<${report.tag}>` : 'Style inspector'}</strong>
          <button
            type="button"
            className="spi-close"
            aria-label="Close style inspector"
            onClick={close}
          >
            ×
          </button>
        </header>
        <Needle value={needle}>
          <div className="spi-body">
            {writer ? <Writers by={by} writer={writer} open={open} /> : null}
            {target && (canParent || child?.isConnected) ? (
              <div className="spi-buttons">
                {canParent ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTrail([...trail, target]);
                      setTarget(target.parentElement);
                      setPinned(true);
                    }}
                  >
                    Parent
                  </button>
                ) : null}
                {child?.isConnected ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTrail(trail.slice(0, -1));
                      setTarget(child);
                      setPinned(true);
                    }}
                  >
                    Child
                  </button>
                ) : null}
              </div>
            ) : null}
            {!report ? (
              <p className="spi-hint">
                {lookup
                  ? mode === 'peek'
                    ? 'Point at an element; ⌥-click to pin it.'
                    : 'Point at an element; click to pin it.'
                  : 'Reading stylesheets…'}
              </p>
            ) : (
              <>
                <label className="spi-search">
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter: property or token, e.g. shadow"
                    aria-label="Filter declarations by property or token"
                  />
                  {needle ? (
                    <span className="spi-count">
                      {countLines(filterRows(allRows(report), needle)) +
                        filterInherited(report.inherited, needle).length}
                      {' of '}
                      {countLines(allRows(report)) + report.inherited.length}
                    </span>
                  ) : null}
                </label>
                <dl className="spi-fields">
                  <div className="spi-field">
                    <dt>box</dt>
                    <dd>
                      <span>{report.box}</span>
                    </dd>
                  </div>
                  {report.paints.map((entry) => (
                    <div
                      key={entry.label}
                      className="spi-field"
                      title={entry.value}
                    >
                      <dt>{entry.label}</dt>
                      <dd>
                        {entry.painted ? (
                          <i style={{ background: entry.painted }} />
                        ) : null}
                        <span>{entry.painted ?? entry.value.slice(0, 40)}</span>
                        {entry.from ? (
                          <span className="spi-from"> ← {entry.from}</span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Folder
                  title="Utilities and theme"
                  count={filterRows(report.own, needle).length}
                  open
                >
                  <Rows
                    rows={filterRows(report.own, needle)}
                    open={open}
                    expand={Boolean(needle)}
                  />
                </Folder>
                <Folder
                  title="Rules"
                  count={filterRows(report.rules, needle).length}
                  open
                >
                  <Rows
                    rows={filterRows(report.rules, needle)}
                    open={open}
                    expand={Boolean(needle)}
                  />
                </Folder>
                <Folder
                  title="Inline style"
                  count={countLines(filterRows(report.inline, needle))}
                  open
                >
                  <Rows
                    rows={filterRows(report.inline, needle)}
                    open={open}
                    expand
                  />
                </Folder>
                <Folder
                  title="Inherited"
                  count={filterInherited(report.inherited, needle).length}
                  open
                >
                  <InheritedView
                    entries={filterInherited(report.inherited, needle)}
                    open={open}
                  />
                </Folder>
                <Folder
                  title="From packages"
                  count={filterRows(report.packages, needle).length}
                  open
                >
                  <Rows
                    rows={filterRows(report.packages, needle)}
                    open={open}
                    expand={Boolean(needle)}
                  />
                </Folder>
                <Folder
                  title="Tailwind reset"
                  count={filterRows(report.reset, needle).length}
                  open={Boolean(needle)}
                >
                  <Rows rows={filterRows(report.reset, needle)} open={open} />
                </Folder>
                <Folder
                  title="Not matching now"
                  count={filterRows(report.idle, needle).length}
                  open={Boolean(needle)}
                >
                  <Rows rows={filterRows(report.idle, needle)} open={open} />
                </Folder>
                {report.tailwind.length > 0 ? (
                  <p className="spi-hint">
                    Unresolved classes: {report.tailwind.join(' ')}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Needle>
      </section>
    </div>
  );
}

type Open = (file: string, line: number, column?: string) => string;

/* The component whose JSX wrote the element, linked to that line; then each
   one out from it, linked to where it renders the next one in. */
function Writers({
  by,
  writer,
  open,
}: {
  by: Written[];
  writer: Written;
  open: Open;
}) {
  const at = by.indexOf(writer);
  const link = (step: Written) =>
    open(step.file!, step.line!, step.column ? String(step.column) : undefined);
  const outer = by.slice(at + 1).filter((step) => step.file);
  const via = by
    .slice(0, at)
    .map((step) => step.name)
    .filter((name, index, names) => name !== names[index - 1]);
  return (
    <dl className="spi-fields spi-source">
      <div className="spi-field">
        <dt>Component</dt>
        <dd>
          <span className="spi-value">
            <code>{writer.name}</code>
            {via.length > 0 ? (
              <span className="spi-dim"> via {via.join(' › ')}</span>
            ) : null}
          </span>
          <a href={link(writer)} title={`${writer.file}:${writer.line}`}>
            {writer.file!.split('/').at(-1)}:{writer.line}
          </a>
        </dd>
      </div>
      {outer.length > 0 ? (
        <div className="spi-field">
          <dt>Rendered in</dt>
          <dd>
            <span className="spi-value">
              {outer.map((step, index) => (
                <span key={`${step.name}${index}`}>
                  {index > 0 ? <span className="spi-dim"> ‹ </span> : null}
                  <a href={link(step)} title={`${step.file}:${step.line}`}>
                    {step.name}
                  </a>
                </span>
              ))}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/* The filter's text, for marking where each line matches it. */
const Needle = createContext('');

function Hl({ text }: { text: string }) {
  const needle = use(Needle);
  if (!needle) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (
    let at = lower.indexOf(needle);
    at !== -1;
    at = lower.indexOf(needle, from)
  ) {
    parts.push(
      text.slice(from, at),
      <mark key={at}>{text.slice(at, at + needle.length)}</mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

const siteLink = (site: Site | undefined, open: Open) =>
  site ? (
    <a className="spi-site" href={open(site.file, site.line)}>
      {site.file.split('/').at(-1)}:{site.line}
    </a>
  ) : null;

/* A section, drawn as a Tweakpane folder: a title bar that folds it, and a
   groove down its content. Empty sections are left out. */
function Folder({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className="spi-folder" open={open}>
      <summary>
        <h3>{title}</h3>
        <span className="spi-count">{count}</span>
      </summary>
      <div className="spi-folder-body">{children}</div>
    </details>
  );
}

/* Inherited properties, each from the nearest ancestor that sets it. */
function InheritedView({
  entries,
  open,
}: {
  entries: Inherited[];
  open: Open;
}) {
  return (
    <div className="spi-group">
      {entries.map((entry) => (
        <div key={entry.property} className="spi-prop">
          <div className="spi-decl">
            <span>
              <code>
                <Hl text={entry.property} />
              </code>
              <span className="spi-dim">: </span>
              <span className="spi-val">
                <Hl text={entry.value} />
              </span>
            </span>
            {siteLink(entry.site, open)}
          </div>
          <div className="spi-from">
            ← <Hl text={entry.from} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* A note that says where a row comes from (Tailwind, a package), not when
   it applies. */
const isOrigin = (row: Row) =>
  row.note?.trim() === 'Tailwind' || (row.kind === 'rule' && !row.site);

function Rows({
  rows,
  open,
  expand = false,
}: {
  rows: Row[];
  open: Open;
  /** Open every row, as a filter does. */
  expand?: boolean;
}) {
  return (
    <div className="spi-group">
      {rows.map((row, index) => (
        <details
          key={`${row.label}${index}`}
          className="spi-row"
          data-idle={row.applies ? undefined : true}
          open={row.applies || expand}
        >
          <summary className="spi-line">
            <span className="spi-name">
              <code>
                <Hl text={row.label} />
              </code>
              {row.note ? (
                <span
                  className={isOrigin(row) ? 'spi-when spi-origin' : 'spi-when'}
                >
                  {row.note.trim()}
                </span>
              ) : null}
            </span>
            {siteLink(row.site, open)}
          </summary>
          {row.lines.map((line, at) => (
            <LineView key={`${line.property}${at}`} line={line} open={open} />
          ))}
        </details>
      ))}
    </div>
  );
}

/* A declaration, and for each custom property it reads, where that comes
   from, down to the step. A custom property it sets says what reads it. */
function LineView({ line, open }: { line: Line; open: Open }) {
  return (
    <div
      className="spi-prop"
      data-idle={line.active ? undefined : true}
      data-overridden={line.overridden || undefined}
      title={
        line.overridden
          ? 'Overridden by a declaration that wins the cascade'
          : undefined
      }
    >
      <div className="spi-decl">
        <span>
          <code
            className={line.property.startsWith('--') ? 'spi-token' : undefined}
          >
            <Hl text={line.property} />
          </code>
          <span className="spi-dim">: </span>
          <span className="spi-val">
            <Hl text={shorten(line.value)} />
          </span>
          {line.computed ? (
            <span className="spi-computed">
              {' = '}
              <Hl text={line.computed} />
            </span>
          ) : null}
          {line.when.map((block) => (
            <span key={block} className="spi-when">
              {block}
            </span>
          ))}
          {line.via ? (
            <span className="spi-when spi-origin">{line.via}</span>
          ) : null}
        </span>
        {siteLink(line.site, open)}
      </div>
      {line.readBy.length > 0 ? (
        <div className="spi-from">→ read by {line.readBy.join(', ')}</div>
      ) : null}
      {line.chains.map((chain) => (
        <ChainView key={chain.name} chain={chain} open={open} />
      ))}
    </div>
  );
}

function ChainView({ chain, open }: { chain: Chain; open: Open }) {
  const { source } = chain;
  return (
    <div className="spi-chain">
      <div className="spi-decl">
        <span>
          {chain.painted ? <i style={{ background: chain.painted }} /> : null}
          <code className="spi-token">
            <Hl text={chain.name} />
          </code>
          {chain.painted ? (
            <span className="spi-dim"> = {chain.painted}</span>
          ) : null}
          <span className="spi-from">
            {' ← '}
            {source
              ? `${source.label}${source.node ? ` on ${source.node}` : ''}`
              : 'unset'}
          </span>
        </span>
        {siteLink(source?.site, open)}
      </div>
      {source && chain.children.length > 0 ? (
        <div className="spi-dim spi-raw">{shorten(source.value)}</div>
      ) : null}
      {chain.children.map((child) => (
        <ChainView key={child.name} chain={child} open={open} />
      ))}
    </div>
  );
}

/* Tweakpane's look, from its own theme variables and defaults, so the
   inspector and the design pane read as one set of tools over any theme. */
const CSS = `
html[${INSPECTING}] body *:not([${ROOT}] *) { cursor: crosshair !important; }
.spi-box {
  position: fixed; z-index: 2147483100; pointer-events: none;
  outline: 1px dashed #f472b6; outline-offset: -1px;
  background: rgb(244 114 182 / 0.08);
}
.spi-box[data-pinned] { outline-style: solid; outline-width: 2px; }
.spi-panel {
  --bg: var(--tp-base-background-color, hsl(230, 7%, 17%));
  --radius: var(--tp-base-border-radius, 6px);
  --shadow: var(--tp-base-shadow-color, rgba(0, 0, 0, 0.2));
  --blade-radius: var(--tp-blade-border-radius, 2px);
  --unit: var(--tp-container-unit-size, 20px);
  --gap: var(--tp-container-unit-spacing, 4px);
  --pad: var(--tp-container-horizontal-padding, 4px);
  --cnt-bg: var(--tp-container-background-color, rgba(187, 188, 196, 0.1));
  --cnt-bg-hover: var(--tp-container-background-color-hover, rgba(187, 188, 196, 0.15));
  --cnt-bg-active: var(--tp-container-background-color-active, rgba(187, 188, 196, 0.25));
  --cnt-fg: var(--tp-container-foreground-color, hsl(230, 7%, 75%));
  --in-bg: var(--tp-input-background-color, rgba(187, 188, 196, 0.1));
  --in-bg-hover: var(--tp-input-background-color-hover, rgba(187, 188, 196, 0.15));
  --in-bg-focus: var(--tp-input-background-color-focus, rgba(187, 188, 196, 0.2));
  --in-fg: var(--tp-input-foreground-color, hsl(230, 7%, 75%));
  --lbl-fg: var(--sp-neutral-325);
  --mo-bg: var(--tp-monitor-background-color, rgba(0, 0, 0, 0.2));
  --mo-fg: var(--sp-neutral-325);
  --btn-bg: var(--tp-button-background-color, hsl(230, 7%, 70%));
  --btn-bg-hover: var(--tp-button-background-color-hover, #bbbcc4);
  --btn-bg-active: var(--tp-button-background-color-active, #d6d7db);
  --btn-fg: var(--tp-button-foreground-color, hsl(230, 7%, 17%));
  --groove: var(--tp-groove-foreground-color, rgba(187, 188, 196, 0.1));
  /* Three accents, each one meaning, at the lightness of Tweakpane's text:
     where a value comes from, when it applies, and a custom property. */
  --spi-provenance: oklch(0.8 0.1 75);
  --spi-condition: oklch(0.78 0.09 300);
  --spi-token: oklch(0.8 0.08 215);
  position: fixed; z-index: 2147483200; top: 12px;
  display: flex; flex-direction: column;
  width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
  overflow: hidden;
  background: var(--bg); color: var(--in-fg); color-scheme: dark;
  border-radius: var(--radius);
  box-shadow: 0 2px 4px var(--shadow);
  font-family: var(--tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace);
  font-size: 11px; font-weight: 500; line-height: 1.5; text-align: left;
}
.spi-panel *, .spi-panel *::before, .spi-panel *::after { box-sizing: border-box; }
.spi-panel[data-side='right'] { right: 12px; }
.spi-panel[data-side='left'] { left: 12px; }
.spi-panel code { font: inherit; color: var(--in-fg); }
.spi-panel a { color: var(--in-fg); text-decoration: underline dotted var(--lbl-fg); text-underline-offset: 2px; }
.spi-panel a:hover { text-decoration-style: solid; }
.spi-panel a.spi-site { color: var(--lbl-fg); text-decoration: none; white-space: nowrap; flex: none; }
.spi-panel a.spi-site:hover { color: var(--in-fg); text-decoration: underline; }
.spi-panel :focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
.spi-panel button { font: inherit; border: 0; cursor: pointer; }

/* The title bar: Tweakpane's root button. */
.spi-head {
  flex: none; position: relative;
  display: flex; align-items: center; justify-content: center;
  height: calc(var(--unit) + 4px); padding: 0 calc(var(--unit) + 8px);
  background: var(--cnt-bg); color: var(--cnt-fg);
  border-radius: var(--radius) var(--radius) 0 0;
}
.spi-head strong { font-weight: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spi-close {
  position: absolute; right: var(--pad); top: 2px;
  width: var(--unit); height: var(--unit); padding: 0;
  background: transparent; color: var(--cnt-fg); border-radius: var(--blade-radius);
  font-size: 14px; line-height: var(--unit);
}
.spi-close:hover { background: var(--cnt-bg-hover); }
.spi-close:active { background: var(--cnt-bg-active); }

.spi-body {
  flex: 1; min-height: 0; overflow: auto;
  padding: var(--gap) var(--pad) calc(var(--gap) * 2);
  display: flex; flex-direction: column; gap: var(--gap);
}
.spi-hint { margin: 0; padding: 2px var(--pad); color: var(--lbl-fg); overflow-wrap: anywhere; }
.spi-dim { color: var(--lbl-fg); }
.spi-count { color: var(--lbl-fg); flex: none; }

/* Label and value, as a Tweakpane binding. */
.spi-fields { margin: 0; display: flex; flex-direction: column; gap: 2px; }
.spi-field { display: flex; align-items: baseline; min-height: var(--unit); padding: 2px var(--pad); }
.spi-field dt { flex: none; width: 84px; padding-left: 4px; color: var(--lbl-fg); }
.spi-field dd {
  flex: 1; min-width: 0; margin: 0;
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  overflow-wrap: anywhere;
}
.spi-value { min-width: 0; }
.spi-panel i {
  display: inline-block; width: 10px; height: 10px; margin-right: 6px; flex: none;
  vertical-align: -1px; border-radius: var(--blade-radius);
  box-shadow: inset 0 0 0 1px rgba(187, 188, 196, 0.3);
}
.spi-fields:not(.spi-source) dd { justify-content: flex-start; }
.spi-fields:not(.spi-source) dd > span:first-of-type { flex: none; white-space: nowrap; }
.spi-fields .spi-from { min-width: 0; }

/* Buttons and the filter, as Tweakpane's. */
.spi-buttons { display: flex; gap: var(--gap); padding: 0 var(--pad); }
.spi-buttons button {
  flex: 1; height: var(--unit); line-height: var(--unit);
  background: var(--btn-bg); color: var(--btn-fg); font-weight: bold;
  border-radius: var(--blade-radius);
}
.spi-buttons button:hover { background: var(--btn-bg-hover); }
.spi-buttons button:active { background: var(--btn-bg-active); }
.spi-search { display: flex; align-items: center; gap: 8px; padding: 0 var(--pad); }
.spi-search input {
  flex: 1; min-width: 0; height: var(--unit); padding: 0 var(--pad);
  font: inherit; color: var(--in-fg); background: var(--in-bg);
  border: 0; border-radius: var(--blade-radius);
}
.spi-search input:hover { background: var(--in-bg-hover); }
.spi-search input:focus { background: var(--in-bg-focus); outline: none; }
.spi-search input::placeholder { color: var(--lbl-fg); }

/* A section, as a Tweakpane folder. */
.spi-folder { position: relative; }
.spi-folder > summary {
  position: relative; list-style: none; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  height: calc(var(--unit) + 4px);
  padding: 0 calc(var(--unit) + 8px) 0 calc(var(--pad) + 4px);
  background: var(--cnt-bg); color: var(--cnt-fg);
  border-radius: var(--blade-radius);
}
.spi-folder > summary::-webkit-details-marker { display: none; }
.spi-folder > summary:hover { background: var(--cnt-bg-hover); }
.spi-folder > summary:active { background: var(--cnt-bg-active); }
.spi-folder > summary h3 { flex: 1; margin: 0; font: inherit; color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spi-folder > summary::after {
  content: ''; position: absolute; right: calc(var(--pad) + 6px); top: 0; bottom: 0;
  width: 6px; height: 6px; margin: auto; border-radius: 2px;
  background: linear-gradient(to left, var(--lbl-fg), var(--lbl-fg) 2px, transparent 2px, transparent 4px, var(--lbl-fg) 4px);
  transform: rotate(90deg); transition: transform 0.2s ease-in-out;
}
.spi-folder[open] > summary { border-bottom-left-radius: 0; }
.spi-folder[open] > summary::after { transform: none; }
.spi-folder-body {
  padding: var(--gap) var(--pad) var(--gap) calc(var(--pad) + 4px);
  border-left: 4px solid var(--cnt-bg);
  border-bottom-left-radius: var(--blade-radius);
}

/* Rows: a selector or class, its declarations, and their chains. */
.spi-group { display: flex; flex-direction: column; }
.spi-row { padding: 3px 0; }
.spi-row + .spi-row { border-top: 1px solid var(--groove); }
.spi-row[data-idle] { color: var(--lbl-fg); }
.spi-row[data-idle] :is(.spi-name, .spi-val, .spi-computed, .spi-from, code) { color: var(--lbl-fg); }
.spi-line { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; cursor: pointer; list-style: none; }
.spi-line::-webkit-details-marker { display: none; }
.spi-name { min-width: 0; overflow-wrap: anywhere; }
.spi-when {
  display: inline-block; margin-left: 6px; padding: 0 4px;
  background: color-mix(in oklab, var(--spi-condition) 14%, transparent);
  color: var(--spi-condition);
  border-radius: var(--blade-radius); font-size: 10px; line-height: 16px;
  overflow-wrap: anywhere;
}
.spi-prop { padding: 1px 0 1px 10px; }
.spi-prop[data-idle] { color: var(--lbl-fg); }
.spi-prop[data-idle] :is(.spi-decl, .spi-val, .spi-computed, .spi-from, code) { color: var(--lbl-fg); }
.spi-prop code { color: var(--lbl-fg); }
.spi-decl { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.spi-decl > span { min-width: 0; overflow-wrap: anywhere; }
.spi-chain { margin-left: 3px; padding-left: 10px; border-left: 1px solid var(--groove); }
.spi-chain code { color: var(--in-fg); }
.spi-raw { padding-left: 16px; overflow-wrap: anywhere; }
.spi-from { color: var(--spi-provenance); overflow-wrap: anywhere; }
.spi-panel code.spi-token { color: var(--spi-token); }
.spi-when.spi-origin { background: var(--mo-bg); color: var(--mo-fg); }
.spi-val { font-weight: 400; color: var(--in-fg); }
.spi-computed { font-weight: 400; color: var(--lbl-fg); white-space: nowrap; }
.spi-prop[data-overridden] > .spi-decl > span { text-decoration: line-through; text-decoration-color: var(--lbl-fg); color: var(--lbl-fg); }
.spi-panel mark {
  color: inherit; border-radius: 1px;
  background: color-mix(in oklab, var(--spi-provenance) 32%, transparent);
}
`;
