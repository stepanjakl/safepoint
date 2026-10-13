import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { summarise } from '../scripts/colour-theme/perceptual/contracts.ts';
import {
  openAt,
  setFamily,
} from '../scripts/colour-theme/perceptual/runner.ts';
import {
  FILTER_TABS,
  checkFilterTabs,
  readFilterTabs,
} from '../scripts/colour-theme/perceptual/recipes/filter-tabs.ts';
import type {
  Finding,
  Reading,
} from '../scripts/colour-theme/perceptual/types.ts';

/*
  Perceptual colour contracts (docs/interface/COLOUR-TESTING.md). The theme is a
  stored preference, so both themes run in one project; the dark project
  would only repeat the light one.
*/
const FAMILIES = ['graphite', 'steel', 'clay', 'moss', 'ash'] as const;
const THEMES = ['light', 'dark'] as const;

test('the filter strip keeps its colour contracts', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'dark', 'the themes run inside the test');
  test.setTimeout(240_000);
  const readings: Reading[] = [];
  for (const theme of THEMES) {
    await openAt(page, FILTER_TABS.path, { theme });
    for (const family of FAMILIES) {
      await setFamily(page, family);
      readings.push(...(await readFilterTabs(page, { theme, family })));
    }
  }
  const findings: Finding[] = checkFilterTabs(readings);
  await testInfo.attach('readings', {
    body: JSON.stringify(readings, null, 1),
    contentType: 'application/json',
  });
  await testInfo.attach('findings', {
    body: JSON.stringify(findings, null, 1),
    contentType: 'application/json',
  });
  const report = process.env.COLOUR_PERCEPTION_REPORT;
  if (report)
    writeFileSync(report, JSON.stringify({ readings, findings }, null, 1));
  const { blocking, advisory, total } = summarise(findings);
  for (const finding of advisory) {
    testInfo.annotations.push({
      type: 'colour-advisory',
      description: `${finding.id} ${finding.where}: ${finding.detail}`,
    });
  }
  const lines = blocking.map((f) => `${f.id} ${f.where}: ${f.detail}`);
  expect(lines, `${blocking.length} of ${total} contracts failed`).toEqual([]);
});
