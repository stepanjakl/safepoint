import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedReviewRules } from '@/lib/promotion-release/review-rules';
import { POST } from './route';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/model-workbench/review-lab-run', () => ({ runReviewLab: run }));
const body = {
  stage: 'extract',
  model: 'gemini-3.7-flash',
  sku: 'ALD-0001',
  reviewAt: '2030-01-01T12:00:00.000Z',
  input: { instructions: '', role: 'case_evidence', text: 'Funding pending.' },
  rules: seedReviewRules,
  confirmedFacts: {},
};
const request = (data: unknown = body, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/dev/review-lab', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic-test-key');
  run.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('development review route boundaries', () => {
  it('rejects production, external hosts and cross-origin calls before model work', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      (
        await POST(
          new Request('https://example.com/api/dev/review-lab', {
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(404);
    expect((await POST(request(body, 'https://example.com'))).status).toBe(403);
    expect(
      (
        await POST(
          new Request('http://[::1]:3000/api/dev/review-lab', {
            method: 'POST',
            headers: {
              origin: 'http://[::1]:3000',
              'Content-Type': 'application/json',
            },
            body: 'null',
          }),
        )
      ).status,
    ).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects invalid rules, inappropriate text and overlays without accepted evidence', async () => {
    expect(
      (
        await POST(
          request({
            ...body,
            rules: { ...seedReviewRules, executable: 'alert(1)' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            ...body,
            input: { ...body.input, role: 'background_context' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ ...body, confirmedFacts: { fundingStatus: 'confirmed' } }),
        )
      ).status,
    ).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it('redacts provider secrets and correlates failed calls by run ID', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    run.mockRejectedValue(new Error('Provider failed: synthetic-test-key'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const result = await response.json();
    expect(result.message).toBe('Provider failed: [redacted]');
    expect(result.runId).toBeTypeOf('string');
    expect(run.mock.calls[0]?.[1]).toBe(result.runId);
    log.mockRestore();
  });
});
