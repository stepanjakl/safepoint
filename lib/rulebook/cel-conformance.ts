import { getConformanceSuite } from '@bufbuild/cel-spec/testdata/tests.js';

import { sameValue, type CelEngine } from './cel-engines';

/*
  Runs part of CEL's official conformance suite against an engine. Only the
  sections our rules lean on are included, and only tests that need nothing
  outside the expression (no variables, protobuf types or containers) and
  expect a plain value or an error. Everything else is counted as skipped, with
  the reason, rather than quietly left out.
*/
export const CONFORMANCE_SECTIONS = [
  'basic',
  'comparisons',
  'integer_math',
  'fp_math',
  'logic',
  'macros',
  'lists',
  'string',
] as const;

type Expected = { kind: 'value'; value: unknown } | { kind: 'error' };

type Case = {
  section: string;
  name: string;
  expression: string;
  expected: Expected;
};

export type ConformanceFailure = {
  section: string;
  name: string;
  expression: string;
  expected: string;
  actual: string;
};

export type ConformanceReport = {
  engine: CelEngine['id'];
  source: string;
  sections: { name: string; passed: number; failed: number }[];
  passed: number;
  failed: number;
  skipped: { reason: string; count: number }[];
  failures: ConformanceFailure[];
};

type Value = { kind: { case: string | undefined; value?: unknown } };

// cel.expr.Value → a plain JS value, or a reason it is not compared.
function fromProto(
  value: Value,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const { kind } = value;
  switch (kind.case) {
    case 'int64Value':
      return { ok: true, value: kind.value };
    case 'doubleValue':
    case 'stringValue':
    case 'boolValue':
      return { ok: true, value: kind.value };
    case 'nullValue':
      return { ok: true, value: null };
    case 'uint64Value':
      return { ok: false, reason: 'Unsigned integers: not used by our rules.' };
    case 'listValue': {
      const items = (kind.value as { values: Value[] }).values.map(fromProto);
      const bad = items.find((item) => !item.ok);
      if (bad && !bad.ok) return bad;
      return {
        ok: true,
        value: items.map((item) => (item.ok ? item.value : null)),
      };
    }
    default:
      return {
        ok: false,
        reason: 'Maps, bytes, types and messages: not compared.',
      };
  }
}

function collect(): { cases: Case[]; skipped: Map<string, number> } {
  const suite = getConformanceSuite() as unknown as {
    suites: { name: string; suites: unknown[] }[];
  };
  const cases: Case[] = [];
  const skipped = new Map<string, number>();
  const skip = (reason: string) =>
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  type Node = {
    name: string;
    suites?: Node[];
    tests?: { original: Record<string, unknown> }[];
  };
  const walk = (node: Node, section: string) => {
    for (const child of node.suites ?? []) walk(child, section);
    for (const test of node.tests ?? []) {
      const t = test.original as {
        name: string;
        expr: string;
        bindings: Record<string, unknown>;
        typeEnv: unknown[];
        container: string;
        checkOnly: boolean;
        resultMatcher: { case: string | undefined; value?: unknown };
      };
      if (
        Object.keys(t.bindings).length ||
        t.typeEnv.length ||
        t.container ||
        t.checkOnly
      ) {
        skip(
          'Needs variables, types or a container from outside the expression.',
        );
        continue;
      }
      if (t.resultMatcher.case === 'evalError') {
        cases.push({
          section,
          name: t.name,
          expression: t.expr,
          expected: { kind: 'error' },
        });
        continue;
      }
      if (t.resultMatcher.case !== 'value') {
        skip('Expects something other than a value or an error.');
        continue;
      }
      const expected = fromProto(t.resultMatcher.value as Value);
      if (!expected.ok) {
        skip(expected.reason);
        continue;
      }
      cases.push({
        section,
        name: t.name,
        expression: t.expr,
        expected: { kind: 'value', value: expected.value },
      });
    }
  };
  for (const node of suite.suites as Node[])
    if ((CONFORMANCE_SECTIONS as readonly string[]).includes(node.name))
      walk(node, node.name);
  return { cases, skipped };
}

const show = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}n` : v)) ??
  String(value);

export function runConformance(
  engine: CelEngine,
  failureLimit = 40,
): ConformanceReport {
  const { cases, skipped } = collect();
  const sections = new Map<string, { passed: number; failed: number }>();
  const failures: ConformanceFailure[] = [];
  for (const test of cases) {
    const result = engine.evaluate(test.expression, {}, {});
    const passed =
      test.expected.kind === 'error'
        ? !result.ok
        : result.ok && sameValue(result.value, test.expected.value);
    const tally = sections.get(test.section) ?? { passed: 0, failed: 0 };
    tally[passed ? 'passed' : 'failed'] += 1;
    sections.set(test.section, tally);
    if (!passed && failures.length < failureLimit)
      failures.push({
        section: test.section,
        name: test.name,
        expression: test.expression,
        expected:
          test.expected.kind === 'error'
            ? 'an error'
            : show(test.expected.value),
        actual: result.ok
          ? show(result.value)
          : `error (${result.stage}): ${result.error}`,
      });
  }
  const list = [...sections.entries()].map(([name, tally]) => ({
    name,
    ...tally,
  }));
  return {
    engine: engine.id,
    source: 'CEL specification conformance tests, via @bufbuild/cel-spec',
    sections: list,
    passed: list.reduce((sum, s) => sum + s.passed, 0),
    failed: list.reduce((sum, s) => sum + s.failed, 0),
    skipped: [...skipped.entries()].map(([reason, count]) => ({
      reason,
      count,
    })),
    failures,
  };
}
