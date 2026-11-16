import { describe, expect, it } from 'vitest';

import { gateLocation, safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeReturnPath('/workspace')).toBe('/workspace');
    expect(safeReturnPath('/workspace/brunch?tab=rules&a=b')).toBe(
      '/workspace/brunch?tab=rules&a=b',
    );
  });

  it.each([
    'https://evil.example/',
    'http://evil.example',
    '//evil.example/path',
    '///evil.example',
    '/\\evil.example',
    '/\\/evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\u0000/evil.example',
    'javascript:alert(1)',
    'evil.example',
    'workspace',
    ' /workspace',
    '/%2F/evil.example/../..',
    '',
  ])('sends %j home', (raw) => {
    const safe = safeReturnPath(raw);
    // Whatever it was dressed as, the answer is a path on this site.
    expect(safe.startsWith('/')).toBe(true);
    expect(safe.startsWith('//')).toBe(false);
    expect(new URL(safe, 'https://safepoint.example').origin).toBe(
      'https://safepoint.example',
    );
  });

  it.each([
    'https://evil.example/',
    '//evil.example/path',
    '/\\evil.example',
    '/\t/evil.example',
    'javascript:alert(1)',
    '',
  ])('answers the home page for %j', (raw) => {
    expect(safeReturnPath(raw)).toBe('/');
  });

  it('answers the home page for nothing, or for the gate page itself', () => {
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath('/access')).toBe('/');
    expect(safeReturnPath('/access?next=%2Fworkspace')).toBe('/');
  });

  it('is never longer than a request line should be', () => {
    expect(safeReturnPath(`/${'a'.repeat(3000)}`)).toBe('/');
  });
});

describe('gateLocation', () => {
  it('asks to come back, encoding the target as a value', () => {
    expect(gateLocation('/workspace?tab=rules')).toBe(
      '/access?next=%2Fworkspace%3Ftab%3Drules',
    );
  });

  it('asks for nothing when there is nowhere to come back to', () => {
    expect(gateLocation('/')).toBe('/access');
    expect(gateLocation('//evil.example')).toBe('/access');
  });
});
