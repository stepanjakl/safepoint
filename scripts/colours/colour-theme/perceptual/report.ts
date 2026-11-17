import { readFileSync, writeFileSync } from 'node:fs';

import {
  UI_VIEWING,
  lightnessModels,
  type LightnessModels,
} from './metrics.ts';
import type { Finding, Reading } from './types.ts';

/*
  The advisory side of the perceptual checks: what the blocking contracts do not
  decide. Reads the run's readings (COLOUR_PERCEPTION_REPORT) and prints
  - the ensemble table: the neutral's lightness against the tones' in every
    model, so a disagreement of sign is visible at a glance;
  - the advisory findings, counted by contract;
  and writes a summary beside the colour-theme report.
  Run it with pnpm check:perception:report.
*/
const [, , readingsPath, visionPath, out] = process.argv;
if (!readingsPath || !out) {
  console.error(
    'usage: report.ts <readings.json> <vision.json | -> <docs/generated/colour-perception-report.json>',
  );
  process.exit(2);
}

const { readings, findings } = JSON.parse(
  readFileSync(readingsPath, 'utf8'),
) as {
  readings: Reading[];
  findings: Finding[];
};
const vision =
  visionPath && visionPath !== '-'
    ? (JSON.parse(readFileSync(visionPath, 'utf8')) as { findings: Finding[] })
    : { findings: [] as Finding[] };

const MODELS: (keyof LightnessModels)[] = [
  'oklab',
  'cieLstar',
  'cam16J',
  'hellwigJ',
  'hellwigJHK',
  'helmlab',
];
const TONES = ['blocked', 'decision', 'ready'];
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

/* Graphite is the default family; the others are checked by the contracts. */
const ensemble: Record<string, Record<string, number>> = {};
for (const theme of ['light', 'dark']) {
  for (const state of [
    'rest-chip',
    'hover-chip',
    'pill-top',
    'pill-bottom',
    'chosen-chip',
  ]) {
    const pick = (group: string) =>
      readings.find(
        (r) =>
          r.theme === theme &&
          r.family === 'graphite' &&
          r.surface === 'canvas' &&
          r.strip === 'default' &&
          r.group === group &&
          r.state === state,
      );
    const neutral = pick('deferred');
    const tones = TONES.map(pick);
    if (!neutral || tones.some((t) => !t)) continue;
    const gaps: Record<string, number> = {};
    for (const model of MODELS) {
      gaps[model] =
        lightnessModels(neutral.colour, UI_VIEWING)[model] -
        mean(tones.map((t) => lightnessModels(t!.colour, UI_VIEWING)[model]));
    }
    ensemble[`${theme}/${state}`] = gaps;
  }
}

console.log(
  '\nEnsemble: Deferred minus the mean of the tones (positive = neutral lighter)',
);
console.log(
  ['state'.padEnd(24), ...MODELS.map((m) => m.padStart(11))].join(' '),
);
for (const [key, gaps] of Object.entries(ensemble)) {
  const signs = new Set(
    MODELS.map((m) => Math.sign(Math.round(gaps[m]! * 2) / 2)),
  );
  console.log(
    [
      key.padEnd(24),
      ...MODELS.map((m) => signed(gaps[m]!).padStart(11)),
      signs.has(1) && signs.has(-1)
        ? ' <- models disagree on sign: a person decides'
        : '',
    ].join(' '),
  );
}

const advisory = [...findings, ...vision.findings].filter(
  (f) => !f.pass && f.severity === 'advisory',
);
const counts: Record<string, number> = {};
for (const f of advisory) counts[f.id] = (counts[f.id] ?? 0) + 1;
console.log('\nAdvisory findings by contract');
for (const [id, count] of Object.entries(counts).sort())
  console.log(`${String(count).padStart(5)}  ${id}`);

const worst = (id: string) =>
  advisory
    .filter((f) => f.id === id)
    .slice(0, 3)
    .map((f) => `${f.where}: ${f.detail}`);
console.log(
  '\nDistances between the pills as another eye sees them (smallest first)',
);
for (const f of vision.findings.filter((x) => !x.pass).slice(0, 6))
  console.log(`  ${f.id} ${f.where}: ${f.detail}`);

writeFileSync(
  out,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      component: 'filter-tabs',
      checks: findings.length + vision.findings.length,
      blockingFailures: [...findings, ...vision.findings].filter(
        (f) => !f.pass && f.severity === 'blocking',
      ).length,
      advisoryByContract: Object.fromEntries(Object.entries(counts).sort()),
      ensemble: Object.fromEntries(
        Object.entries(ensemble).map(([key, gaps]) => [
          key,
          Object.fromEntries(
            Object.entries(gaps).map(([m, v]) => [m, Number(v.toFixed(2))]),
          ),
        ]),
      ),
      examples: Object.fromEntries(
        Object.keys(counts)
          .sort()
          .map((id) => [id, worst(id)]),
      ),
    },
    null,
    2,
  )}\n`,
);
