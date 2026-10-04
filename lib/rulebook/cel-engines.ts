import { Environment } from '@marcbachmann/cel-js';
import {
  CelScalar,
  celEnv,
  celFunc,
  isCelError,
  isCelList,
  isCelMap,
  isCelUint,
  listType,
  mapType,
  parse,
  plan,
  type CelType as BufType,
} from '@bufbuild/cel';

import pkg from '@/package.json' with { type: 'json' };

import { TOOLBOX, type CelType } from './toolbox';

/*
  The two CEL libraries under trial, behind one interface, so the trial asks
  both exactly the same questions. Whole numbers go in and come out as bigint.
*/

export type Variables = Record<string, CelType>;
export type Bindings = Record<string, unknown>;

export type CheckResult =
  | { status: 'valid'; type: string }
  | { status: 'invalid'; error: string }
  | { status: 'unsupported'; note: string };

export type EvalResult =
  | { ok: true; value: unknown; display: string }
  | { ok: false; stage: 'parse' | 'check' | 'evaluate'; error: string };

export type CelEngine = {
  id: 'cel-js' | 'buf';
  name: string;
  packageName: string;
  version: string;
  license: string;
  staticCheck: boolean;
  limits: string;
  check(expression: string, variables: Variables): CheckResult;
  evaluate(
    expression: string,
    variables: Variables,
    bindings: Bindings,
  ): EvalResult;
};

export const AST_NODE_LIMIT = 500;

const versionOf = (name: keyof typeof pkg.dependencies) =>
  pkg.dependencies[name];
const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

// ── @marcbachmann/cel-js ───────────────────────────────────────────────────

function celJsEnvironment(variables: Variables) {
  const env = new Environment({
    unlistedVariablesAreDyn: false,
    limits: { maxAstNodes: AST_NODE_LIMIT },
  });
  for (const [name, type] of Object.entries(variables))
    env.registerVariable(name, type);
  for (const fn of TOOLBOX)
    env.registerFunction(
      `${fn.name}(${fn.params.join(', ')}): ${fn.result}`,
      fn.impl,
    );
  return env;
}

const celJs: CelEngine = {
  id: 'cel-js',
  name: 'cel-js',
  packageName: '@marcbachmann/cel-js',
  version: versionOf('@marcbachmann/cel-js'),
  license: 'MIT',
  staticCheck: true,
  limits: `Structural limits enforced; this trial sets at most ${AST_NODE_LIMIT} syntax-tree nodes per formula.`,
  check(expression, variables) {
    try {
      const result = celJsEnvironment(variables).check(expression);
      return result.valid
        ? { status: 'valid', type: result.type ?? 'unknown' }
        : { status: 'invalid', error: firstLine(result.error) };
    } catch (error) {
      return { status: 'invalid', error: firstLine(error) };
    }
  },
  evaluate(expression, variables, bindings) {
    try {
      const value = celJsEnvironment(variables).evaluate(expression, bindings);
      return { ok: true, value: normalise(value), display: display(value) };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return {
        ok: false,
        stage:
          name === 'ParseError'
            ? 'parse'
            : name === 'TypeError'
              ? 'check'
              : 'evaluate',
        error: firstLine(error),
      };
    }
  },
};

// ── @bufbuild/cel ──────────────────────────────────────────────────────────

const bufTypes: Record<CelType, BufType> = {
  int: CelScalar.INT,
  double: CelScalar.DOUBLE,
  bool: CelScalar.BOOL,
  string: CelScalar.STRING,
  'list<int>': listType(CelScalar.INT),
  'list<map<string, int>>': listType(mapType(CelScalar.STRING, CelScalar.INT)),
};

function bufEnvironment(variables: Variables) {
  return celEnv({
    variables: Object.fromEntries(
      Object.entries(variables).map(([name, type]) => [name, bufTypes[type]]),
    ),
    funcs: TOOLBOX.map((fn) =>
      celFunc(
        fn.name,
        fn.params.map((type) => bufTypes[type]),
        bufTypes[fn.result],
        fn.impl as never,
      ),
    ),
  });
}

// Buf reads a CEL map from a JS Map, not a plain object.
function toBufInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toBufInput);
  if (value && typeof value === 'object' && !(value instanceof Map))
    return new Map(Object.entries(value).map(([k, v]) => [k, toBufInput(v)]));
  return value;
}

const buf: CelEngine = {
  id: 'buf',
  name: 'Buf CEL',
  packageName: '@bufbuild/cel',
  version: versionOf('@bufbuild/cel'),
  license: 'Apache-2.0',
  staticCheck: false,
  limits: 'No structural limits exposed.',
  check() {
    return {
      status: 'unsupported',
      note: 'The package has a type checker internally but does not export it, so types are only found when a formula runs.',
    };
  },
  evaluate(expression, variables, bindings) {
    let parsed;
    try {
      parsed = parse(expression);
    } catch (error) {
      return { ok: false, stage: 'parse', error: firstLine(error) };
    }
    try {
      const run = plan(bufEnvironment(variables), parsed);
      const input = Object.fromEntries(
        Object.entries(bindings).map(([name, value]) => [
          name,
          toBufInput(value),
        ]),
      );
      const value = (run as (ctx: Record<string, unknown>) => unknown)(input);
      if (isCelError(value))
        return { ok: false, stage: 'evaluate', error: firstLine(value) };
      return { ok: true, value: normalise(value), display: display(value) };
    } catch (error) {
      return { ok: false, stage: 'evaluate', error: firstLine(error) };
    }
  },
};

export const ENGINES = [celJs, buf] as const;

// ── values ─────────────────────────────────────────────────────────────────

// Lists and maps from either library become plain arrays and objects, so two
// results can be compared and shown the same way.
function normalise(value: unknown): unknown {
  if (isCelUint(value)) return { uint: (value as { value: bigint }).value };
  if (isCelList(value) || Array.isArray(value))
    return [...(value as Iterable<unknown>)].map(normalise);
  if (isCelMap(value) || value instanceof Map) {
    const entries =
      value instanceof Map
        ? [...value.entries()]
        : [...(value as Iterable<[unknown, unknown]>)];
    return Object.fromEntries(
      entries.map(([k, v]) => [String(k), normalise(v)]),
    );
  }
  return value;
}

function display(value: unknown): string {
  const plain = normalise(value);
  if (typeof plain === 'bigint') return `${plain} (int)`;
  if (typeof plain === 'number')
    return `${Number.isInteger(plain) ? plain.toFixed(1) : plain} (double)`;
  if (typeof plain === 'string') return JSON.stringify(plain);
  return (
    JSON.stringify(plain, (_, v) => (typeof v === 'bigint' ? `${v}` : v)) ??
    String(plain)
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return (Number.isNaN(a) && Number.isNaN(b)) || a === b;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every((k) => sameValue((a as never)[k], (b as never)[k]))
    );
  }
  return a === b;
}
