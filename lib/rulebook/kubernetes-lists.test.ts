import { Environment } from '@marcbachmann/cel-js';
import { describe, expect, it } from 'vitest';

import { registerKubernetesSum } from './kubernetes-lists';

// The examples in the pinned Kubernetes source, lists.go, with its answers.
function environment() {
  const env = registerKubernetesSum(
    new Environment({ unlistedVariablesAreDyn: false }),
  );
  env.registerVariable('emptyIntList', 'list<int>');
  env.registerVariable('emptyDoubleList', 'list<double>');
  return env;
}
const run = (expression: string) =>
  environment().evaluate(expression, {
    emptyIntList: [],
    emptyDoubleList: [],
  });

describe('kubernetes.lists sum(), as the Kubernetes source documents it', () => {
  it.each([
    ['[1, 3].sum()', 4n],
    ['[1.0, 3.0].sum()', 4],
    ['emptyIntList.sum()', 0n],
    ['emptyDoubleList.sum()', 0],
    ['[].sum()', 0n],
  ])('%s', (expression, expected) => {
    expect(run(expression)).toBe(expected);
  });

  it("[duration('1m'), duration('1s')].sum() is 1m1s", () => {
    expect(String(run("[duration('1m'), duration('1s')].sum()"))).toBe('61s');
  });

  it('keeps the element type, so int and double still never mix', () => {
    const env = environment();
    expect(env.check('[1, 3].sum()').type).toBe('int');
    expect(env.check('[1.0, 3.0].sum()').type).toBe('double');
    expect(env.check('[1, 3].sum() + 1.5').valid).toBe(false);
  });

  it('overflows like CEL addition does', () => {
    expect(() => run('[9223372036854775807, 1].sum()')).toThrow(/overflow/);
  });
});
