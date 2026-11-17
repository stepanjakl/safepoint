import { describe, expect, it } from 'vitest';

import { buildPlan } from './plan.ts';

const URLS = {
  DATABASE_URL: 'postgres://pooled/db',
  DATABASE_URL_UNPOOLED: 'postgres://direct/db',
};

describe('the Vercel build plan', () => {
  it('migrates, then builds, only for production', () => {
    expect(buildPlan({ VERCEL_ENV: 'production', ...URLS })).toEqual({
      kind: 'migrate-then-build',
    });
  });

  it.each(['preview', 'development', undefined])(
    'does not touch the database for %s',
    (target) => {
      expect(buildPlan({ VERCEL_ENV: target, ...URLS }).kind).toBe('build');
    },
  );

  it('does not migrate a local build, whatever URLs are set', () => {
    expect(buildPlan({ ...URLS, NODE_ENV: 'production' }).kind).toBe('build');
  });

  it('refuses a production build with no direct URL rather than use the pooled one', () => {
    expect(
      buildPlan({ VERCEL_ENV: 'production', DATABASE_URL: URLS.DATABASE_URL }),
    ).toMatchObject({ kind: 'refuse' });
    expect(buildPlan({ VERCEL_ENV: 'production' }).kind).toBe('refuse');
  });

  it('refuses a production build the deployed app could not open a database for', () => {
    expect(
      buildPlan({
        VERCEL_ENV: 'production',
        DATABASE_URL_UNPOOLED: URLS.DATABASE_URL_UNPOOLED,
      }).kind,
    ).toBe('refuse');
  });
});
