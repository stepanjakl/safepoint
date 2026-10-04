import { describe, expect, it } from 'vitest';

import { runRuleTrial } from './rule-trial';

/*
  The same trial the Rules step runs on screen. These pin what the decision
  rests on, so a library update that changes any of it fails here first.
*/
describe('formula engine trial', () => {
  const report = runRuleTrial();
  const summary = (id: string) => report.summary.find((s) => s.engine === id)!;

  it('gets every rule example and calculated fact right in both libraries', () => {
    for (const id of ['cel-js', 'buf'])
      expect(summary(id).examplesPassed).toBe(summary(id).examplesTotal);
  });

  it('records which traps each library catches, and when', () => {
    const trap = (trapId: string, engine: string) =>
      report.traps.find((t) => t.id === trapId)!.outcomes[engine]!;
    expect(trap('unknown_field', 'cel-js').caught).toBe('check');
    expect(trap('unknown_field', 'buf').caught).toBe('run');
    expect(trap('oversized', 'cel-js').passed).toBe(true);
    // Buf exposes no size limit, so an oversized formula simply runs.
    expect(trap('oversized', 'buf').passed).toBe(false);
  });

  it('runs a meaningful share of the official conformance suite', () => {
    for (const c of report.conformance)
      expect(c.passed + c.failed).toBeGreaterThan(500);
    expect(report.conformance.find((c) => c.engine === 'buf')!.failed).toBe(0);
  });

  it('shows the floating-point error the integer toolbox avoids', () => {
    expect(report.floatingPoint).toMatchObject({
      naiveResult: 56,
      integerResult: '55',
    });
  });
});
