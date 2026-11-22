import { expect, test } from '@playwright/test';

import {
  capturePlaywright,
  type Capture,
} from '../../scripts/checks/line-geometry/capture';
import {
  compareReadings,
  gated,
  readSpecimen,
  type SpecimenReading,
} from '../../scripts/checks/line-geometry/evaluate';

/*
  The edge lab's border and layered specimens are even all round, of the
  thickness they declare, and -- on macOS, where WebKit paints as Safari does
  -- alike in WebKit and Chromium. The same readings `pnpm check:lines` prints;
  use the CLI to read the table and to reach Safari itself.
*/

async function readLab(
  engine: 'chromium' | 'webkit',
  baseURL: string,
  theme: 'light' | 'dark',
) {
  const capture: Capture = await capturePlaywright(engine, {
    url: `${baseURL}/workbench/edge-lab?edges=retina`,
    theme,
    edges: 'retina',
    scale: 2,
    width: 1440,
    height: 900,
    fullPage: true,
  });
  expect(capture.page.edges).toBe('retina');
  return new Map(
    capture.specimens.map((sp) => [sp.id, readSpecimen(capture, sp)]),
  );
}

const failures = (readings: Map<string, SpecimenReading>) =>
  [...readings.values()]
    .filter((r) => gated(r.approach) && r.problems.length)
    .map((r) => `${r.id}: ${r.problems.join('; ')}`);

for (const theme of ['light', 'dark'] as const) {
  test(`border and layered lines are even and as thick as declared (${theme})`, async ({
    baseURL,
    colorScheme,
  }) => {
    test.skip(
      colorScheme === 'dark',
      'The theme is chosen here, not by the project.',
    );
    const readings = await readLab('chromium', baseURL!, theme);
    expect(readings.size).toBeGreaterThan(100);
    expect(failures(readings)).toEqual([]);
  });

  test(`WebKit draws border and layered lines as Chromium does (${theme}) @local-baseline`, async ({
    baseURL,
    colorScheme,
  }) => {
    test.skip(
      colorScheme === 'dark',
      'The theme is chosen here, not by the project.',
    );
    test.skip(
      process.platform !== 'darwin',
      'Only macOS WebKit paints with the graphics stack Safari uses.',
    );
    test.setTimeout(120_000);
    const chromium = await readLab('chromium', baseURL!, theme);
    const webkit = await readLab('webkit', baseURL!, theme);
    expect(failures(webkit)).toEqual([]);
    const differences = [...chromium]
      .filter(([, r]) => gated(r.approach))
      .map(([id, r]) => {
        const other = webkit.get(id);
        return other ? compareReadings(r, other, 'chromium') : 'not captured';
      })
      .filter(Boolean);
    expect(differences).toEqual([]);
  });
}
