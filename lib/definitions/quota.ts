import { APICallError } from 'ai';

// What Google says about a refused request: which limit, and when to retry.
export type Quota = { limit: string | null; retryAfterMs: number | null };

export function quotaOf(cause: unknown): Quota {
  if (!APICallError.isInstance(cause) || !cause.responseBody)
    return { limit: null, retryAfterMs: null };
  try {
    const body = JSON.parse(cause.responseBody) as {
      error?: {
        details?: {
          retryDelay?: string;
          violations?: { quotaId?: string; quotaValue?: string }[];
        }[];
      };
    };
    const details = body.error?.details ?? [];
    const violation = details.flatMap((d) => d.violations ?? [])[0];
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    const seconds = delay ? Number.parseFloat(delay) : Number.NaN;
    return {
      limit: violation?.quotaId
        ? `${violation.quotaId
            .replace(/-FreeTier$/, ' (free tier)')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase()}${violation.quotaValue ? `, limit ${Number(violation.quotaValue).toLocaleString('en-GB')}` : ''}`
        : null,
      retryAfterMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null,
    };
  } catch {
    return { limit: null, retryAfterMs: null };
  }
}
