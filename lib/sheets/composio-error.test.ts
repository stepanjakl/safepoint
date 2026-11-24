import { describe, expect, it } from 'vitest';

import { errorText, READS_SPENT } from './composio';

// Composio hands on Google's error as its JSON body, over many lines.
describe('what a failed sheet request says', () => {
  it('is the message inside the JSON, not its first line', () => {
    const body = JSON.stringify(
      {
        error: {
          code: 429,
          message:
            "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute'.",
          status: 'RESOURCE_EXHAUSTED',
        },
      },
      null,
      2,
    );
    // Its per-minute limit, in a person's words.
    expect(errorText(body)).toBe(READS_SPENT);
    expect(
      errorText(
        "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute' of service 'sheets.googleapis.com'.",
      ),
    ).toBe(READS_SPENT);
    expect(errorText(JSON.stringify({ message: 'Not found.' }))).toBe(
      'Not found.',
    );
  });

  it('is the text as it came when it is not JSON', () => {
    expect(errorText('The connection was refused.')).toBe(
      'The connection was refused.',
    );
    expect(errorText(undefined)).toBe('Unknown error');
  });
});
