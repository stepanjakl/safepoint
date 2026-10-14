import { describe, expect, it } from 'vitest';

import { extentOf, ISOMETRIC_FIGURES } from './isometric-illustration';

// A figure is centred in a 128 frame; this much is kept clear on every side.
const MARGIN = 8;

describe('isometric figures', () => {
  it.each(Object.entries(ISOMETRIC_FIGURES))(
    '%s fits the frame with its margin',
    (_name, build) => {
      const [width, height] = extentOf(build());
      expect(width).toBeLessThanOrEqual(128 - 2 * MARGIN);
      expect(height).toBeLessThanOrEqual(128 - 2 * MARGIN);
    },
  );
});
