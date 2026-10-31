import { APICallError } from 'ai';

// What Google says about a refused request: which limit, and when to retry.
export type Quota = {
  limit: string | null;
  retryAfterMs: number | null;
  // How long the limit runs over, when Google says.
  window: 'minute' | 'day' | null;
  // How many requests it allows; null when it limits something else, tokens.
  requests: number | null;
  // The model the limit is counted on, which may not be the one asked.
  model: string | null;
};

const NOTHING: Quota = {
  limit: null,
  retryAfterMs: null,
  window: null,
  requests: null,
  model: null,
};

export function quotaOf(cause: unknown): Quota {
  if (!APICallError.isInstance(cause) || !cause.responseBody) return NOTHING;
  try {
    const body = JSON.parse(cause.responseBody) as {
      error?: {
        details?: {
          retryDelay?: string;
          violations?: {
            quotaId?: string;
            quotaValue?: string;
            quotaDimensions?: { model?: string };
          }[];
        }[];
      };
    };
    const details = body.error?.details ?? [];
    const violation = details.flatMap((d) => d.violations ?? [])[0];
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    const seconds = delay ? Number.parseFloat(delay) : Number.NaN;
    const id = violation?.quotaId ?? '';
    const value = Number(violation?.quotaValue);
    return {
      limit: violation?.quotaId
        ? `${violation.quotaId
            .replace(/-FreeTier$/, ' (free tier)')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase()}${violation.quotaValue ? `, limit ${Number(violation.quotaValue).toLocaleString('en-GB')}` : ''}`
        : null,
      retryAfterMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null,
      window: /PerMinute/.test(id)
        ? 'minute'
        : /PerDay/.test(id)
          ? 'day'
          : null,
      requests: /Requests/.test(id) && Number.isFinite(value) ? value : null,
      model: violation?.quotaDimensions?.model ?? null,
    };
  } catch {
    return NOTHING;
  }
}
