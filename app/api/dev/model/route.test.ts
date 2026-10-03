import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { POST } from './route';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/model-workbench/run', () => ({ runModelWorkbench: run }));

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic-key');
  run.mockResolvedValue({
    issues: [],
    review: null,
    durationMs: 1,
    usage: null,
  });
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  run.mockReset();
});

it('accepts a same-origin IPv6 loopback model request', async () => {
  const response = await POST(
    new Request('http://[::1]:3000/api/dev/model', {
      method: 'POST',
      headers: { origin: 'http://[::1]:3000' },
      body: JSON.stringify({
        model: 'gemini-3.7-flash',
        sku: 'ALD-0002',
        reviewAt: '2030-01-01T12:00:00.000Z',
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(run).toHaveBeenCalledOnce();
});

it('still rejects cross-origin requests before invoking the provider', async () => {
  const response = await POST(
    new Request('http://[::1]:3000/api/dev/model', {
      method: 'POST',
      headers: { origin: 'http://outside.example' },
    }),
  );
  expect(response.status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
