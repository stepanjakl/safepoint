import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';
import { MOVED_ROUTES } from './moved-routes';
import { PROCESS_ROUTES } from './routes';

// The configuration Next reads, whichever form `withWorkflow` gives it.
async function config() {
  const given = nextConfig as unknown;
  return typeof given === 'function'
    ? await (given as (phase: string, ctx: object) => unknown)(
        'phase-production-build',
        { defaultConfig: {} },
      )
    : given;
}

describe('the pages that moved', () => {
  it('are redirected permanently by the Next configuration', async () => {
    const { redirects } = (await config()) as {
      redirects: () => Promise<
        { source: string; destination: string; permanent: boolean }[]
      >;
    };
    const given = await redirects();
    expect(given).toEqual(MOVED_ROUTES.map((route) => ({ ...route })));
    expect(given.every((route) => route.permanent)).toBe(true);
  });

  it('send each old address to where its process lives now', () => {
    for (const { process, href } of PROCESS_ROUTES) {
      const old = MOVED_ROUTES.find(
        (route) => route.source === `/examples/${process.id}`,
      );
      expect(old?.destination).toBe(href);
    }
  });

  it('name literal paths, so a query string is left to Next to pass on', () => {
    for (const route of MOVED_ROUTES)
      expect(route.source).toMatch(/^\/[a-z-]+\/[a-z-]+$/);
  });
});
