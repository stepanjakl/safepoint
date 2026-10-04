import { describe, expect, it } from 'vitest';

import { TRIAL_RULES } from '@/lib/processes/avocado-toast/rule-trial';

import { ENGINES, sameValue } from './cel-engines';

/*
  cel-js runs the rules; Buf CEL is a second, independent implementation used
  only to check it (docs/archive/2026-10-03-cel-spike.md). Every rule example
  must pass cel-js's type check, give the expected answer, and give the same
  answer in both libraries. A disagreement after an upgrade fails here.
  The rule list becomes the approved rulebook once Phase 1 exists.
*/
const [celJs, buf] = ENGINES;

describe.each(TRIAL_RULES)('$id cross-check', (rule) => {
  it('type-checks as a yes/no rule before it runs', () => {
    expect(celJs.check(rule.formula, rule.variables)).toEqual({
      status: 'valid',
      type: 'bool',
    });
  });

  it.each(rule.examples)('$label', (example) => {
    const primary = celJs.evaluate(rule.formula, rule.variables, example.given);
    const second = buf.evaluate(rule.formula, rule.variables, example.given);
    expect(primary).toMatchObject({ ok: true, value: example.expect });
    expect(
      second.ok && primary.ok && sameValue(second.value, primary.value),
    ).toBe(true);
  });
});
