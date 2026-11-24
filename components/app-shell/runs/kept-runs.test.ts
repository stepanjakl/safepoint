import { describe, expect, it } from 'vitest';

import { runsTally, type KeptRun } from './kept-runs';

// Only the fields the tally reads; the rest of a kept run does not matter.
const run = (status: string, activity?: KeptRun['activity']) =>
  ({ status, ...(activity ? { activity } : {}) }) as KeptRun;

describe('runsTally', () => {
  it('counts runs awaiting review and runs stopped at a step for a person', () => {
    expect(
      runsTally([
        run('awaiting_review'),
        run('running', { working: false, at: 'propose' }),
        run('completed'),
      ]),
    ).toEqual({ waiting: 2, working: false });
  });

  it('says a job is working, without counting that run as waiting', () => {
    expect(runsTally([run('running', { working: true })])).toEqual({
      waiting: 0,
      working: true,
    });
  });

  it('does not count a run a job stopped, or one with nothing known', () => {
    expect(
      runsTally([
        run('running', { working: false, at: 'rules', stopped: true }),
        run('running'),
        run('failed'),
      ]),
    ).toEqual({ waiting: 0, working: false });
  });
});
