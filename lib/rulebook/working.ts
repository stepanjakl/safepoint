/*
  A rule's working for one item, condition by condition. A formula is split
  where it joins conditions with && and ||, each condition is evaluated on its
  own, and CEL's order of evaluation says which were reached and which one
  settled the result. Each condition lists the values it read (its terms),
  where they came from, and the condition with those values written in.

  Everything is read from the parsed formula, never matched as text, so a
  value inside a list expression is shown as that expression's one value.
*/

type Node = { op: string; args: unknown; start: number; end: number };

export type Term = {
  expression: string;
  // As the formula computes with it: money in minor units, a percentage as a
  // fraction.
  value: string;
  // As a person writes it, when that differs (£0.70 for 70).
  display: string | null;
  label: string | null;
  // The sheet cell, or where else the value came from.
  source: string | null;
};

export type Condition = {
  part: 'when' | 'require';
  // How deep the condition sits in groups of && and ||.
  depth: number;
  // How it joins the condition before it.
  join: 'and' | 'or' | null;
  text: string;
  result: 'true' | 'false' | 'error' | 'not_reached';
  // The condition evaluated last before the rule's result was known.
  settled: boolean;
  // A comparison's two sides, computed.
  sides: { left: string; op: string; right: string } | null;
  // The condition with each value written in.
  filled: string | null;
  error: string | null;
  terms: Term[];
};

// What the engine knows about a value a formula reads.
export type TermInfo = {
  label: string | null;
  source: string | null;
  // Shown as a person writes it, or null when the value reads plainly.
  show: (value: unknown) => string | null;
  // Written into the formula as shown rather than as computed (dates).
  fillShown: boolean;
};

export type Path = { root: string; field: string | null; index: unknown[] };

export type WorkingTools = {
  parse: (text: string) => Node;
  evaluate: (text: string) => unknown;
  describe: (path: Path) => TermInfo | null;
  showRaw: (value: unknown) => string;
};

const COMPARISONS: Record<string, string> = {
  '==': '=',
  '!=': '≠',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
};
const COMPREHENSIONS = new Set([
  'map',
  'filter',
  'all',
  'exists',
  'exists_one',
]);
const MAX_TERMS = 12;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' &&
  value !== null &&
  'op' in value &&
  typeof (value as Node).op === 'string';

const children = (node: Node): Node[] => {
  const out: Node[] = [];
  const visit = (value: unknown) => {
    if (isNode(value)) out.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(node.args);
  return out;
};

// A node's source text. A node's span can leave out a bracket that groups it
// ("!(a && b" for !(a && b)), so unmatched brackets are closed or opened.
function sliceOf(text: string, node: Node) {
  let part = text.slice(node.start, node.end).trim();
  for (const [open, close] of [
    ['(', ')'],
    ['[', ']'],
  ] as const) {
    let depth = 0;
    let missingOpen = 0;
    for (const ch of part.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')) {
      if (ch === open) depth++;
      else if (ch === close) {
        if (depth) depth--;
        else missingOpen++;
      }
    }
    part = open.repeat(missingOpen) + part + close.repeat(depth);
  }
  return part;
}

// A node's span in its text, widened over the brackets its own span leaves
// out, so writing a value over it leaves no stray bracket behind.
function spanOf(text: string, node: Node) {
  const slice = text.slice(node.start, node.end);
  const added = sliceOf(text, node).length - slice.trim().length;
  let { start, end } = node;
  let opens = sliceOf(text, node).indexOf(slice.trim());
  let closes = added - opens;
  while (opens > 0 && start > 0 && /[\s([]/.test(text[start - 1]!)) {
    if (!/\s/.test(text[start - 1]!)) opens--;
    start--;
  }
  while (closes > 0 && end < text.length && /[\s)\]]/.test(text[end]!)) {
    if (!/\s/.test(text[end]!)) closes--;
    end++;
  }
  return { start, end };
}

// A value a person can read: not a whole table, row or record.
const readable = (value: unknown): boolean =>
  ['string', 'number', 'bigint', 'boolean'].includes(typeof value) ||
  value instanceof Date ||
  (typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    'nanos' in value) ||
  (Array.isArray(value) && value.every(readable));

// The member chain under a node: its root variable, its last field, and the
// keys it indexes by. Null for anything else.
function pathOf(
  node: Node,
): { root: Node; field: string | null; index: Node[] } | null {
  const index: Node[] = [];
  let field: string | null = null;
  let at: Node = node;
  for (;;) {
    if (at.op === 'id') return { root: at, field, index: index.reverse() };
    const [target, rest] = at.args as [Node, unknown];
    if (at.op === '.' || at.op === '.?') field ??= rest as string;
    else if (at.op === '[]' || at.op === '[?]') index.push(rest as Node);
    else return null;
    at = target;
  }
}

// The chain a call reads, to say where its value came from: the receiver of
// orValue() or sum(), the argument of has() or size(). Not a list expression.
function chainIn(node: Node): Node | null {
  if (['id', '.', '.?', '[]', '[?]'].includes(node.op)) return node;
  if (node.op === 'rcall') {
    const [method, receiver] = node.args as [string, Node];
    return COMPREHENSIONS.has(method) ? null : chainIn(receiver);
  }
  if (node.op === 'call') {
    const [name, args] = node.args as [string, Node[]];
    return ['has', 'size'].includes(name) && args[0] ? chainIn(args[0]) : null;
  }
  if (node.op === '!_') return chainIn(node.args as Node);
  return null;
}

const ASKS = {
  filled: ', filled in',
  defaulted: ', or its default when blank',
};
function askedOf(node: Node): string | null {
  if (node.op === 'call') {
    const [name] = node.args as [string];
    return name === 'has' ? ASKS.filled : null;
  }
  if (node.op === 'rcall') {
    const [method] = node.args as [string];
    return method === 'hasValue'
      ? ASKS.filled
      : method === 'orValue'
        ? ASKS.defaulted
        : null;
  }
  return null;
}

// The values a condition reads, outermost first: a variable or field path, a
// method call taken whole (a default, a sum over a list), has() and size().
function termNodes(node: Node, out: Node[]) {
  if (node.op === 'value') return;
  if (['id', '.', '.?', '[]', '[?]', 'rcall'].includes(node.op)) {
    out.push(node);
    return;
  }
  if (node.op === 'call') {
    const [name] = node.args as [string];
    if (name === 'has' || name === 'size') {
      out.push(node);
      return;
    }
  }
  for (const child of children(node)) termNodes(child, out);
}

type Leaf = { node: Node; depth: number; join: 'and' | 'or' | null };

// The conditions a formula joins with && and ||, in evaluation order.
function leaves(node: Node, depth: number, join: Leaf['join'], out: Leaf[]) {
  if (node.op !== '&&' && node.op !== '||') {
    out.push({ node, depth, join });
    return;
  }
  const word = node.op === '&&' ? 'and' : 'or';
  const flat: Node[] = [];
  const flatten = (n: Node) => {
    if (n.op === node.op) children(n).forEach(flatten);
    else flat.push(n);
  };
  flatten(node);
  flat.forEach((child, i) => {
    const nested = child.op === '&&' || child.op === '||';
    leaves(child, depth + (nested ? 1 : 0), i === 0 ? join : word, out);
  });
}

export function conditionsOf(
  part: Condition['part'],
  formula: string,
  reached: boolean,
  tools: WorkingTools,
): { conditions: Condition[]; value: unknown } {
  const root = tools.parse(formula);
  const found: Leaf[] = [];
  leaves(root, 0, null, found);
  const conditions: Condition[] = found.map(({ node, depth, join }) => ({
    part,
    depth,
    join,
    text: sliceOf(formula, node),
    result: 'not_reached',
    settled: false,
    sides: null,
    filled: null,
    error: null,
    terms: [],
  }));

  // Walk the formula as CEL evaluates it: && stops at a false condition, ||
  // at a true one. The last condition reached is the one that settled it.
  let index = 0;
  let last: Condition | null = null;
  const walk = (node: Node, on: boolean): unknown => {
    if (node.op !== '&&' && node.op !== '||') {
      const condition = conditions[index++]!;
      if (!on) return undefined;
      last = condition;
      return reach(condition);
    }
    const flat: Node[] = [];
    const flatten = (n: Node) => {
      if (n.op === node.op) children(n).forEach(flatten);
      else flat.push(n);
    };
    flatten(node);
    let stop = false;
    let result: unknown = node.op === '&&';
    for (const child of flat) {
      const value = walk(child, on && !stop);
      if (!on || stop) continue;
      if (node.op === '&&' ? value === false : value === true) {
        stop = true;
        result = value;
      } else if (value !== true && value !== false) result = undefined;
    }
    return result;
  };

  const reach = (condition: Condition): unknown => {
    const text = condition.text;
    let value: unknown;
    try {
      value = tools.evaluate(text);
      condition.result =
        value === true ? 'true' : value === false ? 'false' : 'error';
      if (condition.result === 'error')
        condition.error = `Gives ${tools.showRaw(value)}, not true or false`;
    } catch (error) {
      condition.result = 'error';
      condition.error = (error as Error).message.split('\n')[0]!;
    }
    // Re-read from the condition's own text, so positions are its own.
    const own = tools.parse(text);
    const op = COMPARISONS[own.op];
    if (op) {
      const [left, right] = children(own);
      try {
        condition.sides = {
          left: tools.showRaw(tools.evaluate(sliceOf(text, left!))),
          op,
          right: tools.showRaw(tools.evaluate(sliceOf(text, right!))),
        };
      } catch {
        condition.sides = null;
      }
    }
    const nodes: Node[] = [];
    termNodes(own, nodes);
    const fills: { start: number; end: number; text: string }[] = [];
    const written = new Map<string, string | null>();
    for (const term of nodes) {
      const expression = sliceOf(text, term);
      const span = spanOf(text, term);
      if (written.has(expression)) {
        const again = written.get(expression);
        if (again) fills.push({ ...span, text: again });
        continue;
      }
      if (condition.terms.length >= MAX_TERMS) continue;
      const chain = chainIn(term);
      const path = chain ? pathOf(chain) : null;
      let info: TermInfo | null = null;
      if (path)
        try {
          info = tools.describe({
            root: path.root.args as string,
            field: path.field,
            index: path.index.map((i) => tools.evaluate(sliceOf(text, i))),
          });
        } catch {
          info = null;
        }
      // A check for a value, or a value with a default, is not the value.
      const asks = askedOf(term);
      if (info && asks)
        info = {
          ...info,
          label: `${info.label ?? path?.field}${asks}`,
          show: asks === ASKS.filled ? () => null : info.show,
        };
      try {
        const raw = tools.evaluate(expression);
        if (!readable(raw)) {
          written.set(expression, null);
          continue;
        }
        const display = info?.show(raw) ?? null;
        const shown = tools.showRaw(raw);
        condition.terms.push({
          expression,
          value: shown,
          display: display === shown ? null : display,
          label: info?.label ?? null,
          source: info?.source ?? null,
        });
        const fill = info?.fillShown && display ? display : shown;
        written.set(expression, fill);
        fills.push({ ...span, text: fill });
      } catch (error) {
        written.set(expression, null);
        const blank = /No such key|absent|not present/i.test(
          (error as Error).message,
        );
        condition.terms.push({
          expression,
          value: blank ? 'blank' : 'cannot be read',
          display: null,
          label: info?.label ?? null,
          source: info?.source ?? null,
        });
      }
    }
    if (fills.length) {
      let filled = text;
      for (const fill of fills.sort((a, b) => b.start - a.start))
        filled =
          filled.slice(0, fill.start) + fill.text + filled.slice(fill.end);
      condition.filled = filled === text ? null : filled;
    }
    return value;
  };

  const value = walk(root, reached);
  if (last) (last as Condition).settled = true;
  return { conditions, value };
}
