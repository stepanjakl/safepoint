import { describe, expect, it } from 'vitest';

import { VISITOR_ADJECTIVES, VISITOR_NOUNS } from './visitor-name';
import { visitorPalette } from './visitor-orb';

describe('visitorPalette', () => {
  it('paints every name the list can give', () => {
    for (const adjective of VISITOR_ADJECTIVES) {
      for (const noun of VISITOR_NOUNS) {
        const palette = visitorPalette(`${adjective} ${noun}`);
        expect(palette?.length).toBeGreaterThanOrEqual(3);
        for (const stop of palette!) expect(stop).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('lets the adjective change the colours of one food', () => {
    expect(visitorPalette('Calm Blueberry')).not.toEqual(
      visitorPalette('Zesty Blueberry'),
    );
  });

  it('leaves a name it did not give to the brand palette', () => {
    expect(visitorPalette('Maya')).toBeNull();
    expect(visitorPalette('Jane Smith')).toBeNull();
  });
});
