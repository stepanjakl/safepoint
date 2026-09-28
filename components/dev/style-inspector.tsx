'use client';

import { useEffect, useReducer, useRef, useState } from 'react';

import type { Site, Stylesheets, Utility } from '@/lib/dev/stylesheets';

import { hex, paint } from './paint';
import {
  INSPECT_EVENT,
  arbitraryProperty,
  arbitraryReads,
  buildLookup,
  inScheme,
  isStep,
  matchable,
  readsOf,
  rulesNaming,
  shorten,
  splitVariants,
  themeFor,
  themeProperty,
  utilityFor,
  type Lookup,
} from './style-lookup';

/*
  Development only: point at an element and see where its styles are written.

  Hold ⌥ Option (Alt) to inspect what is under the pointer; ⌥-click pins it, so
  the panel stays once the key is up and its links can be followed straight
  into the editor. Ctrl+Shift+` (or Debug → Inspect styles in the design pane)
  keeps it on without holding anything, every click pinning. Escape unpins,
  then closes. ⌥⇧ stays LocatorJS's, and ⌥-click on the sidebar handle still
  resets its width.

  Each of the app's own utilities, @theme entries and matching rules is listed
  where it is written, with its declarations. Every var() in one unfolds into
  the chain that paints it -- the class that set it, here or on an ancestor,
  then the role, down to the step -- and a property a class sets names what
  reads it. Tailwind's own utilities, which only the markup explains, are
  listed last. The index is read fresh from the stylesheets each
  time the inspector opens, so an edit shows without a restart.
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
  chains: Chain[];
  readBy: string[];
};

type Row = {
  kind: 'rule' | 'utility' | 'theme';
  label: string;
  note?: string;
  site?: Site;
  /** False when a variant or selector says it is not applying now. */
  applies: boolean;
  lines: Line[];
};

type RawLine = Omit<Line, 'chains' | 'readBy'>;
type RawRow = Omit<Row, 'lines'> & { lines: RawLine[] };

type Report = {
  tag: string;
  component?: string;
  jsx?: { file: string; line: string; column: string };
  paints: {
    label: string;
    value: string;
    painted?: string;
    from?: string;
  }[];
  own: Row[];
  rules: Row[];
  idle: Row[];
  tailwind: string[];
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
    ? [
        {
          property: themeProperty(name, theme),
          value: `var(${theme.name})`,
          site: theme,
          when: [],
          active: true,
          via,
        },
      ]
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
  for (const rule of rulesNaming([...node.classList], lookup.sheets.rules)) {
    let matches = false;
    try {
      matches = node.matches(matchable(rule.selector));
    } catch {
      // A selector the browser cannot test; list it as not applying.
    }
    const pseudo = PSEUDO_ELEMENT.exec(rule.source);
    rules.push({
      kind: 'rule',
      label: rule.source,
      note: [...rule.context, pseudo ? `::${pseudo[1]}` : '']
        .filter(Boolean)
        .join(' '),
      site: rule,
      applies: matches && !pseudo && whenActive(node, rule.context),
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
    const theme = themeFor(base, lookup);
    if (theme) {
      into.push({
        kind: 'theme',
        label: base,
        note,
        site: theme,
        applies,
        lines: [
          {
            property: themeProperty(base, theme),
            value: `var(${theme.name})`,
            when: [],
            active: true,
          },
        ],
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
  return [...rules, ...plain, ...varied];
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

/* The winning declaration of `property` on `node`, if any. */
function winner(property: string, rows: RawRow[]) {
  let hit: { row: RawRow; line: RawLine } | undefined;
  for (const row of rows) {
    if (!row.applies) continue;
    for (const line of row.lines) {
      if (line.active && line.property === property) hit = { row, line };
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
  const finish = (row: RawRow): Row => ({
    kind: row.kind,
    label: row.label,
    note: row.note,
    site: row.site,
    applies: row.applies,
    lines: row.lines.map((line) => ({
      ...line,
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

  const own = raw.filter((row) => row.kind !== 'rule').map(finish);
  const rules = raw.filter((row) => row.kind === 'rule');
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

  const identity = element.closest('[data-component]');
  const located = element.getAttribute('data-locatorjs');
  const jsx = located && /^(.*):(\d+):(\d+)$/.exec(located);
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
    component: identity
      ? [
          identity.getAttribute('data-component'),
          (element.closest('[data-part]') ?? identity).getAttribute(
            'data-part',
          ),
        ]
          .filter(Boolean)
          .join(' › ')
      : undefined,
    jsx: jsx ? { file: jsx[1]!, line: jsx[2]!, column: jsx[3]! } : undefined,
    paints,
    own,
    rules: rules.filter((row) => row.applies).map(finish),
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
  const [pinned, setPinned] = useState(false);
  // Kept while moving between elements, so one filter follows the pointer.
  const [query, setQuery] = useState('');
  const [, remeasure] = useReducer((count: number) => count + 1, 0);

  function close() {
    setMode('off');
    setTarget(null);
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
    }
    function toggle() {
      setMode((was) => (was === 'on' ? 'off' : 'on'));
      setTarget(null);
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
        const under = x < 0 ? null : document.elementFromPoint(x, y);
        if (under && !under.closest(`[${ROOT}]`)) setTarget(under);
        return;
      }
      // Anything joining ⌥ is another gesture: ⌥⇧ is LocatorJS's, ⌥ and a
      // letter is a character being typed.
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
    function onMove(event: PointerEvent) {
      if (pinned || !outside(event.target)) return;
      const element = event.target;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTarget(element));
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
  const scheme = editor();
  const open = (file: string, line: number | string, column?: string) =>
    `${scheme}://file${file.startsWith('/') ? '' : `${lookup?.root.replace(/\/$/, '')}/`}${file}:${line}${column ? `:${column}` : ''}`;
  const onLeft = rect
    ? rect.left + rect.width / 2 > window.innerWidth / 2
    : false;

  return (
    <div {...{ [ROOT]: '' }}>
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
          <strong>
            {report ? `<${report.tag}>` : 'Style inspector'}
            {report?.component ? (
              <span className="spi-dim"> {report.component}</span>
            ) : null}
          </strong>
          <span className="spi-actions">
            {report?.jsx ? (
              <a
                href={open(report.jsx.file, report.jsx.line, report.jsx.column)}
              >
                JSX
              </a>
            ) : null}
            {target?.parentElement && target.parentElement !== document.body ? (
              <button
                type="button"
                onClick={() => {
                  setTarget(target.parentElement);
                  setPinned(true);
                }}
              >
                Parent
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Close style inspector"
              onClick={close}
            >
              ×
            </button>
          </span>
        </header>
        {!report ? (
          <p className="spi-dim">
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
                <span className="spi-dim">
                  {countLines(
                    filterRows(
                      [...report.own, ...report.rules, ...report.idle],
                      needle,
                    ),
                  )}{' '}
                  of{' '}
                  {countLines([...report.own, ...report.rules, ...report.idle])}
                </span>
              ) : null}
            </label>
            <ul className="spi-paints">
              {report.paints.map((entry) => (
                <li key={entry.label} title={entry.value}>
                  {entry.painted ? (
                    <i style={{ background: entry.painted }} />
                  ) : null}
                  {entry.label}{' '}
                  <span className="spi-dim">
                    {entry.painted ?? entry.value.slice(0, 40)}
                  </span>
                  {entry.from ? (
                    <span className="spi-from"> ← {entry.from}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Rows
              title="Utilities and theme"
              rows={filterRows(report.own, needle)}
              open={open}
              expand={Boolean(needle)}
            />
            <Rows
              title="Rules"
              rows={filterRows(report.rules, needle)}
              open={open}
              expand={Boolean(needle)}
            />
            {filterRows(report.idle, needle).length > 0 ? (
              <details open={Boolean(needle)}>
                <summary className="spi-dim">
                  {filterRows(report.idle, needle).length} more for these
                  classes, not matching now
                </summary>
                <Rows rows={filterRows(report.idle, needle)} open={open} />
              </details>
            ) : null}
            {report.tailwind.length > 0 ? (
              <p className="spi-tailwind">
                <span className="spi-dim">Tailwind </span>
                {report.tailwind.join(' ')}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

type Open = (file: string, line: number) => string;

const siteLink = (site: Site | undefined, open: Open) =>
  site ? (
    <a href={open(site.file, site.line)}>
      {site.file.split('/').at(-1)}:{site.line}
    </a>
  ) : null;

function Rows({
  title,
  rows,
  open,
  expand = false,
}: {
  title?: string;
  rows: Row[];
  open: Open;
  /** Open every row, as a filter does. */
  expand?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="spi-group">
      {title ? <h3>{title}</h3> : null}
      {rows.map((row, index) => (
        <details
          key={`${row.label}${index}`}
          className="spi-row"
          data-idle={row.applies ? undefined : true}
          open={row.applies || expand}
        >
          <summary className="spi-line">
            {row.kind === 'rule' ? (
              <code>
                {row.label}
                {row.note ? (
                  <span className="spi-when"> {row.note}</span>
                ) : null}
              </code>
            ) : (
              <code>
                {row.note ? <span className="spi-dim">{row.note}</span> : null}
                {row.label}
              </code>
            )}
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
    <div className="spi-prop" data-idle={line.active ? undefined : true}>
      <div className="spi-decl">
        <span>
          <code>{line.property}</code>
          <span className="spi-dim">: {shorten(line.value)}</span>
          {line.when.length > 0 ? (
            <span className="spi-when"> {line.when.join(' ')}</span>
          ) : null}
          {line.via ? <span className="spi-when"> {line.via}</span> : null}
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
          <code>{chain.name}</code>
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
        <div className="spi-dim spi-value">{shorten(source.value)}</div>
      ) : null}
      {chain.children.map((child) => (
        <ChainView key={child.name} chain={child} open={open} />
      ))}
    </div>
  );
}

/* Its own look, not the app's tokens: it has to read the same over any theme
   it is inspecting. */
const CSS = `
html[${INSPECTING}] body *:not([${ROOT}] *) { cursor: crosshair !important; }
.spi-box {
  position: fixed; z-index: 2147483100; pointer-events: none;
  outline: 1px dashed #f472b6; outline-offset: -1px;
  background: rgb(244 114 182 / 0.08);
}
.spi-box[data-pinned] { outline-style: solid; outline-width: 2px; }
.spi-panel {
  position: fixed; z-index: 2147483200; top: 12px;
  width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
  overflow: auto; padding: 10px 12px 12px;
  background: #18181b; color: #e4e4e7; color-scheme: dark;
  border: 1px solid #3f3f46; border-radius: 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
  font: 11.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.spi-panel[data-side='right'] { right: 12px; }
.spi-panel[data-side='left'] { left: 12px; }
.spi-panel a { color: #7dd3fc; text-decoration: none; white-space: nowrap; }
.spi-panel a:hover { text-decoration: underline; }
.spi-panel code { font: inherit; color: #fafafa; }
.spi-panel :focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
.spi-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.spi-actions { display: flex; gap: 8px; align-items: center; }
.spi-actions button {
  font: inherit; color: inherit; background: #27272a;
  border: 1px solid #3f3f46; border-radius: 4px; padding: 0 6px; cursor: pointer;
}
.spi-dim { color: #a1a1aa; }
.spi-paints { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 8px; padding: 0; list-style: none; }
.spi-panel i {
  display: inline-block; width: 10px; height: 10px; margin-right: 4px;
  vertical-align: -1px; border: 1px solid #52525b; border-radius: 2px;
}
.spi-group h3 { margin: 10px 0 4px; font: inherit; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; }
.spi-row { padding: 4px 0; border-top: 1px solid #27272a; }
.spi-row[data-idle] { opacity: 0.55; }
.spi-line { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; list-style: none; }
.spi-line::-webkit-details-marker { display: none; }
.spi-prop { padding: 2px 0 2px 10px; }
.spi-prop[data-idle] { opacity: 0.5; }
.spi-decl { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.spi-decl > span { overflow-wrap: anywhere; }
.spi-chain { padding-left: 12px; border-left: 1px solid #3f3f46; margin-left: 3px; }
.spi-value { padding-left: 14px; overflow-wrap: anywhere; }
.spi-from { color: #fbbf24; }
.spi-when { color: #c4b5fd; }
.spi-tailwind { margin: 10px 0 0; overflow-wrap: anywhere; }
.spi-search { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
.spi-search input {
  flex: 1; min-width: 0; font: inherit; color: inherit; background: #27272a;
  border: 1px solid #3f3f46; border-radius: 4px; padding: 3px 6px;
}
.spi-search input::placeholder { color: #71717a; }
.spi-panel details { margin-top: 6px; }
.spi-panel summary { cursor: pointer; }
`;
