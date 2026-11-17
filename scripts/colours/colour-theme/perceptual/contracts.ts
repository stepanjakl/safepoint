import {
  apca,
  deltaE2000,
  lightnessModels,
  oklabL,
  UI_VIEWING,
  wcag,
  type Viewing,
} from './metrics.ts';
import type { Finding, Reading, Severity } from './types.ts';

/*
  A contract is a plain function over readings that returns findings. Each
  finding carries the numbers behind it, so a red check says what moved.
  The builders here are the catalogue; docs/interface/COLOUR-TESTING.md says
  when to reach for which.
*/

const where = (r: Reading) =>
  `${r.theme}/${r.family}/${r.surface}/${r.strip}/${r.group}/${r.state}`;
const signed = (value: number, digits = 3) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
const select = (
  readings: Reading[],
  state: string,
  groups?: readonly string[],
) =>
  readings.filter(
    (r) => r.state === state && (!groups || groups.includes(r.group)),
  );

type Options = { severity?: Severity };

/* Two floors: under `minimum` the contract fails the build; between it and
   `target` it is reported as advice. A value that only just clears the build
   floor is a warning to move the design, not a pass. */
const graded = (
  value: number,
  minimum: number,
  target: number | undefined,
  higherIsBetter = true,
): { pass: boolean; severity: Severity } => {
  const ok = (limit: number) =>
    higherIsBetter ? value >= limit : value <= limit;
  if (!ok(minimum)) return { pass: false, severity: 'blocking' };
  if (target !== undefined && !ok(target))
    return { pass: false, severity: 'advisory' };
  return { pass: true, severity: 'blocking' };
};

/* Distance from the part's ground never drifts: between surfaces (the
   construction the surface lift promises) or between neutral families. Checked
   in OKLab lightness against the first of the set: canvas, graphite. */
export function constantDistance(
  readings: Reading[],
  options: {
    across: 'surface' | 'family';
    state: string;
    groups?: readonly string[];
    tolerance: number;
  } & Options,
): Finding[] {
  const rows = select(readings, options.state, options.groups);
  const findings: Finding[] = [];
  const other = (r: Reading) =>
    options.across === 'surface'
      ? `${r.theme}|${r.family}|${r.strip}|${r.group}`
      : `${r.theme}|${r.surface}|${r.strip}|${r.group}`;
  const value = (r: Reading) =>
    options.across === 'surface' ? r.surface : r.family;
  const base = options.across === 'surface' ? 'canvas' : 'graphite';
  const distance = (r: Reading) => oklabL(r.colour) - oklabL(r.ref);
  for (const key of new Set(rows.map(other))) {
    const same = rows.filter((r) => other(r) === key);
    const reference = same.find((r) => value(r) === base);
    if (!reference) continue;
    for (const r of same) {
      const drift = distance(r) - distance(reference);
      findings.push({
        id: `constant-${options.across}:${options.state}`,
        severity: options.severity ?? 'blocking',
        pass: Math.abs(drift) <= options.tolerance,
        where: where(r),
        detail: `ΔL ${signed(distance(r))} against ${base} ${signed(distance(reference))} (drift ${signed(drift)}, limit ±${options.tolerance})`,
      });
    }
  }
  return findings;
}

/* Parts of the same kind in different tones carry the same lightness, and the
   neutral one sits where a person would put it. The gap is measured with the
   H-K-aware lightness (the one model of the three that sees saturated colours
   as brighter), as a band across viewing conditions; `offset` is the
   calibrated perceptual correction for the neutral (calibration page). */
export function toneMatch(
  readings: Reading[],
  options: {
    state: string;
    tones: readonly string[];
    neutral: string;
    tolerance: number;
    target?: number;
    spread?: { tolerance: number; target: number };
    offset?: Partial<Record<'light' | 'dark', number>>;
    viewings?: Viewing[];
  } & Options,
): Finding[] {
  const viewings =
    options.viewings ??
    [4, 16, 64].map((adaptingLuminance) => ({
      ...UI_VIEWING,
      adaptingLuminance,
    }));
  const findings: Finding[] = [];
  const rows = select(readings, options.state);
  const keys = new Set(
    rows.map((r) => `${r.theme}|${r.family}|${r.surface}|${r.strip}`),
  );
  for (const key of keys) {
    const same = rows.filter(
      (r) => `${r.theme}|${r.family}|${r.surface}|${r.strip}` === key,
    );
    const tones = same.filter((r) => options.tones.includes(r.group));
    const neutral = same.find((r) => r.group === options.neutral);
    if (tones.length !== options.tones.length || !neutral) continue;
    const spread =
      Math.max(...tones.map((r) => oklabL(r.colour))) -
      Math.min(...tones.map((r) => oklabL(r.colour)));
    const spreadLimit = options.spread ?? { tolerance: 0.04, target: 0.02 };
    findings.push({
      id: `tone-spread:${options.state}`,
      ...graded(spread, spreadLimit.tolerance, spreadLimit.target, false),
      where: where(neutral).replace(`/${options.neutral}`, '/tones'),
      detail: `OKLab lightness spread across ${options.tones.join(', ')}: ${spread.toFixed(3)} (target ${spreadLimit.target}, limit ${spreadLimit.tolerance})`,
    });
    const gaps = viewings.map((viewing) => {
      const mean =
        tones.reduce(
          (sum, r) => sum + lightnessModels(r.colour, viewing).hellwigJHK,
          0,
        ) / tones.length;
      return (
        lightnessModels(neutral.colour, viewing).hellwigJHK -
        mean -
        (options.offset?.[neutral.theme] ?? 0)
      );
    });
    const worst = gaps.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
    findings.push({
      id: `tone-match:${options.state}`,
      ...graded(Math.abs(worst), options.tolerance, options.target, false),
      where: where(neutral),
      detail: `${options.neutral} against the tones' H-K lightness: ${gaps.map((g) => signed(g, 1)).join(' / ')} J across adapting luminances 4/16/64 cd/m² (target ±${options.target ?? '-'}, limit ±${options.tolerance})`,
    });
  }
  return findings;
}

/* A part is far enough from what it sits on to be seen: CIEDE2000, including
   chroma, with a floor chosen above the just-noticeable difference for marks
   this small. */
export function visibleAgainst(
  readings: Reading[],
  options: {
    state: string;
    minimum: number;
    target?: number;
    groups?: readonly string[];
  },
): Finding[] {
  return select(readings, options.state, options.groups).map((r) => {
    const distance = deltaE2000(r.colour, r.ref);
    return {
      id: `visible:${options.state}`,
      ...graded(distance, options.minimum, options.target),
      where: where(r),
      detail: `ΔE2000 ${distance.toFixed(1)} (target ${options.target ?? '-'}, floor ${options.minimum})`,
    };
  });
}

/* A state answers the one before it: the later part is at least as far from
   its ground as the earlier one. `later` may name two readings (the pill's two
   ends); the stronger of them counts, since which end is stronger flips
   between themes. */
export function strongerThan(
  readings: Reading[],
  options: {
    later: string[];
    earlier: string;
    groups?: readonly string[];
  } & Options,
): Finding[] {
  const findings: Finding[] = [];
  const distance = (r: Reading) => Math.abs(oklabL(r.colour) - oklabL(r.ref));
  const same = (a: Reading, b: Reading) =>
    a.theme === b.theme &&
    a.family === b.family &&
    a.surface === b.surface &&
    a.strip === b.strip &&
    a.group === b.group;
  for (const earlier of select(readings, options.earlier, options.groups)) {
    const later = readings.filter(
      (r) => options.later.includes(r.state) && same(r, earlier),
    );
    if (!later.length) continue;
    const reached = Math.max(...later.map(distance));
    findings.push({
      id: `order:${options.earlier}<${options.later.join('|')}`,
      severity: options.severity ?? 'blocking',
      pass: reached >= distance(earlier) - 0.002,
      where: where(earlier),
      detail: `|ΔL| ${options.earlier} ${distance(earlier).toFixed(3)}, ${options.later.join('/')} up to ${reached.toFixed(3)}`,
    });
  }
  return findings;
}

/* Text on a part: the WCAG 2 ratio is the floor; APCA is reported beside it. */
export function readable(
  readings: Reading[],
  options: {
    state: string;
    minimum?: number;
    lc?: number;
    groups?: readonly string[];
  },
): Finding[] {
  const minimum = options.minimum ?? 4.5;
  const lc = options.lc ?? 60;
  return select(readings, options.state, options.groups).flatMap((r) => {
    const ratio = wcag(r.colour, r.ref);
    const lightness = Math.abs(apca(r.colour, r.ref));
    return [
      {
        id: `wcag:${options.state}`,
        severity: 'blocking' as const,
        pass: ratio >= minimum,
        where: where(r),
        detail: `WCAG ${ratio.toFixed(2)}:1 (floor ${minimum})`,
      },
      {
        id: `apca:${options.state}`,
        severity: 'advisory' as const,
        pass: lightness >= lc,
        where: where(r),
        detail: `APCA |Lc| ${lightness.toFixed(0)} (guide ${lc})`,
      },
    ];
  });
}

/* Two readings of the same kind in different tones stay apart, by colour or by
   lightness, so colour is not the only cue (the labels are the rest). */
export function distinguishable(
  readings: Reading[],
  options: {
    id: string;
    minimumDeltaE: number;
    minimumLightness: number;
  } & Options,
): Finding[] {
  const findings: Finding[] = [];
  const keys = new Set(
    readings.map((r) => `${r.theme}|${r.family}|${r.surface}`),
  );
  for (const key of keys) {
    const same = readings.filter(
      (r) => `${r.theme}|${r.family}|${r.surface}` === key,
    );
    for (let i = 0; i < same.length; i += 1) {
      for (let j = i + 1; j < same.length; j += 1) {
        const a = same[i]!;
        const b = same[j]!;
        const distance = deltaE2000(a.colour, b.colour);
        const lightness = Math.abs(oklabL(a.colour) - oklabL(b.colour));
        findings.push({
          id: options.id,
          severity: options.severity ?? 'advisory',
          pass:
            distance >= options.minimumDeltaE ||
            lightness >= options.minimumLightness,
          where: `${a.theme}/${a.family}/${a.surface}/${a.group} vs ${b.group}`,
          detail: `ΔE2000 ${distance.toFixed(1)} (floor ${options.minimumDeltaE}), ΔL ${lightness.toFixed(3)} (floor ${options.minimumLightness})`,
        });
      }
    }
  }
  return findings;
}

export function summarise(findings: Finding[]) {
  const failures = findings.filter((f) => !f.pass);
  return {
    total: findings.length,
    blocking: failures.filter((f) => f.severity === 'blocking'),
    advisory: failures.filter((f) => f.severity === 'advisory'),
  };
}
