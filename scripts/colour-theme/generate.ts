import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Color from 'colorjs.io';
import { parse, type AtRule, type Container, type Document } from 'postcss';
import { format, resolveConfig } from 'prettier';

import {
  COLOUR_STEPS,
  CONTRAST_CONTRACTS,
  CURVES,
  ROLE_ASSIGNMENTS,
  THEME_CONFIG,
  THEMES,
  VISUAL_CONTRACTS,
  type CurveAnchor,
  type Theme,
  NEUTRAL_FAMILIES,
  DEFAULT_NEUTRAL_FAMILY,
  curvesFor,
} from './config.ts';

const CSS_OUTPUT = new URL(
  '../../app/styles/generated/ramp.css',
  import.meta.url,
);
const REPORT_OUTPUT = new URL(
  '../../docs/generated/colour-theme-report.json',
  import.meta.url,
);
/* Every stylesheet in import order, so "last declaration wins" matches the
   cascade. Read from the entry's @import list rather than restated here, so
   a component stylesheet is validated the moment it is imported. */
const STYLE_ENTRY = new URL('../../app/styles/index.css', import.meta.url);
const ROLE_SOURCES = [
  ...readFileSync(STYLE_ENTRY, 'utf8').matchAll(/^@import '(\.[^']+)';$/gm),
].map(([, path]) => new URL(path!, STYLE_ENTRY));

const SERIALIZED_PRECISION = 3;
/* Warning criteria. Absolute bands cannot distinguish a curve that is merely
   uneven from one that is unusable, so the ramp is judged on its own shape:
   how abruptly the spacing changes, how far the widest gap is from the
   narrowest, and whether the two themes express a relationship alike. */
const MAX_NEIGHBOURING_GAP_RATIO = 1.6;
const MAX_THEME_GAP_SPREAD = 3;
const MAX_CROSS_THEME_DELTA_E_RATIO = 2.5;
const MAX_CROSS_THEME_CONTRAST_RATIO = 1.75;
const MAX_CROSS_THEME_CHROMA_RATIO = 2;

type GeneratedStep = {
  step: number;
  css: string;
  /* What an 8-bit display actually receives. Two steps that differ only below
     this resolution are one colour on screen, however far apart they serialize. */
  quantized: string;
  hex: string;
  lightness: number;
  chroma: number;
  hue: number;
  relativeLuminance: number;
  deltaEFromPrevious: number | null;
  gamutMapped: boolean;
  gamutMappingDeltaE: number;
};

type GeneratedTheme = {
  steps: GeneratedStep[];
  colours: Map<number, Color>;
};

export type GeneratedArtifacts = {
  css: string;
  report: string;
  failures: string[];
  warnings: string[];
};

function round(value: number, precision = 6) {
  return Number(value.toFixed(precision));
}

function validateAnchors(theme: Theme, anchors: readonly CurveAnchor[]) {
  if (anchors.length < 2) {
    throw new Error(`${theme}: a curve needs at least two anchors.`);
  }
  if (anchors[0]?.step !== 0 || anchors.at(-1)?.step !== 1000) {
    throw new Error(`${theme}: curve anchors must cover steps 0 through 1000.`);
  }
  for (const [index, anchor] of anchors.entries()) {
    if (!COLOUR_STEPS.includes(anchor.step)) {
      throw new Error(
        `${theme}: anchor ${anchor.step} is not a 25-point step.`,
      );
    }
    if (anchor.lightness < 0 || anchor.lightness > 1) {
      throw new Error(`${theme}: lightness at ${anchor.step} is out of range.`);
    }
    if (anchor.chroma < 0 || anchor.chroma > 0.4) {
      throw new Error(`${theme}: chroma at ${anchor.step} is out of range.`);
    }
    if (anchor.hue < 0 || anchor.hue >= 360) {
      throw new Error(`${theme}: hue at ${anchor.step} is out of range.`);
    }
    const previous = anchors[index - 1];
    if (previous && anchor.step <= previous.step) {
      throw new Error(`${theme}: curve anchors must have increasing steps.`);
    }
    if (previous && anchor.lightness >= previous.lightness) {
      throw new Error(
        `${theme}: lightness must decrease as step numbers rise.`,
      );
    }
  }
}

function interpolateHue(start: number, end: number, amount: number) {
  const difference = ((end - start + 540) % 360) - 180;
  return (start + difference * amount + 360) % 360;
}

function interpolateAnchor(
  anchors: readonly CurveAnchor[],
  step: number,
): CurveAnchor {
  const exact = anchors.find((anchor) => anchor.step === step);
  if (exact) return exact;

  const upperIndex = anchors.findIndex((anchor) => anchor.step > step);
  const upper = anchors[upperIndex];
  const lower = anchors[upperIndex - 1];
  if (!lower || !upper) throw new Error(`Step ${step} lies outside the curve.`);
  const amount = (step - lower.step) / (upper.step - lower.step);
  return {
    step,
    lightness: lower.lightness + (upper.lightness - lower.lightness) * amount,
    chroma: lower.chroma + (upper.chroma - lower.chroma) * amount,
    hue: interpolateHue(lower.hue, upper.hue, amount),
  };
}

function serializeSrgb(color: Color) {
  const srgb = color.to('srgb');
  const channels = srgb.coords.map((coordinate) => {
    if (coordinate === null || !Number.isFinite(coordinate)) {
      throw new Error('Color.js returned an invalid sRGB coordinate.');
    }
    const channel = Math.min(1, Math.max(0, coordinate)) * 255;
    const value = Number(channel.toFixed(SERIALIZED_PRECISION));
    return Object.is(value, -0) ? 0 : value;
  });
  return `rgb(${channels.join(' ')})`;
}

function generateTheme(
  theme: Theme,
  anchors: readonly CurveAnchor[],
): GeneratedTheme {
  validateAnchors(theme, anchors);
  const colours = new Map<number, Color>();
  const generated: GeneratedStep[] = [];
  let previous: Color | undefined;

  for (const step of COLOUR_STEPS) {
    const sampled = interpolateAnchor(anchors, step);
    const source = new Color('oklch', [
      sampled.lightness,
      sampled.chroma,
      sampled.hue,
    ]);
    const gamutMapped = !source.inGamut('srgb');
    const mapped = source
      .clone()
      .toGamut({ space: 'srgb', method: 'css' })
      .to('srgb');
    const css = serializeSrgb(mapped);
    const reparsed = new Color(css);
    const realized = reparsed.to('oklch');
    const [lightness, chroma, rawHue] = realized.coords;
    if (
      lightness === null ||
      chroma === null ||
      ![lightness, chroma].every(Number.isFinite)
    ) {
      throw new Error(`${theme} ${step}: serialized colour did not reparse.`);
    }
    /* A grey has no hue: OKLCH reports it as none once chroma reaches zero, so
       an achromatic family records the hue it was asked for rather than NaN. */
    const hue =
      rawHue === null || !Number.isFinite(rawHue) ? (sampled.hue ?? 0) : rawHue;
    const channels = reparsed.to('srgb').coords.map((coordinate) => {
      const value = Math.round(Math.min(1, Math.max(0, coordinate ?? 0)) * 255);
      return value;
    });
    colours.set(step, reparsed);
    generated.push({
      step,
      css,
      quantized: channels.join(' '),
      hex: `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`,
      lightness: round(lightness),
      chroma: round(chroma),
      hue: round(hue),
      relativeLuminance: round(reparsed.luminance),
      deltaEFromPrevious: previous
        ? round(Color.deltaEOK(previous, reparsed))
        : null,
      gamutMapped,
      gamutMappingDeltaE: round(Color.deltaEOK(source, mapped)),
    });
    previous = reparsed;
  }

  return { steps: generated, colours };
}

type RoleMap = Record<keyof typeof ROLE_ASSIGNMENTS, Record<Theme, number>>;

const ACTIVE_ROLE_MAP = Object.fromEntries(
  Object.entries(ROLE_ASSIGNMENTS).map(([id, assignment]) => [
    id,
    { light: assignment.light, dark: assignment.dark },
  ]),
) as RoleMap;

function colourAt(
  generated: Record<Theme, GeneratedTheme>,
  theme: Theme,
  role: keyof typeof ROLE_ASSIGNMENTS,
  roleMap: RoleMap,
) {
  const step = roleMap[role][theme];
  const colour = generated[theme].colours.get(step);
  if (!colour)
    throw new Error(`${theme}: role ${role} uses missing step ${step}.`);
  return { colour, step };
}

/* A rule inside @media or @supports paints only under that condition --
   forced colours restate all three tooltip roles as system keywords -- so it
   is not the baseline this contract describes. @layer is unconditional. */
const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container']);

function isConditional(node: Container | Document | undefined): boolean {
  if (!node) return false;
  if (
    node.type === 'atrule' &&
    CONDITIONAL_AT_RULES.has((node as AtRule).name)
  ) {
    return true;
  }
  return isConditional(node.parent as Container | undefined);
}

function validateRoleAssignments() {
  const declarations = new Map<string, string>();
  for (const source of ROLE_SOURCES) {
    const root = parse(readFileSync(source, 'utf8'), {
      from: fileURLToPath(source),
    });
    root.walkDecls(/^--/, (declaration) => {
      /* Only real rules resolve against an element. A declaration written
         straight into @utility or @property is a template or a registration,
         and `--control-face-top` alone is declared in fifteen of them. */
      if (declaration.parent?.type !== 'rule') return;
      if (isConditional(declaration.parent)) return;
      /* Last in source order wins, as the cascade resolves it. Taking the
         first silently validated a superseded value. */
      declarations.set(declaration.prop, declaration.value);
    });
  }

  function resolveStep(
    variable: string,
    theme: Theme,
    seen = new Set<string>(),
  ): number {
    if (seen.has(variable))
      throw new Error(`Circular role alias at ${variable}.`);
    const ramp = /^--sp-neutral-(\d+)$/.exec(variable);
    if (ramp?.[1]) return Number(ramp[1]);
    const value = declarations.get(variable);
    if (!value) throw new Error(`No CSS declaration found for ${variable}.`);
    const nextSeen = new Set(seen).add(variable);
    const alias = /^var\((--[\w-]+)\)$/.exec(value.trim());
    if (alias?.[1]) return resolveStep(alias[1], theme, nextSeen);
    const themed =
      /^light-dark\(\s*var\((--[\w-]+)\)\s*,\s*var\((--[\w-]+)\)\s*\)$/s.exec(
        value.trim(),
      );
    const selected = theme === 'light' ? themed?.[1] : themed?.[2];
    if (selected) return resolveStep(selected, theme, nextSeen);
    throw new Error(
      `${variable}: unsupported role value ${JSON.stringify(value)}.`,
    );
  }

  return Object.entries(ROLE_ASSIGNMENTS).flatMap(([id, assignment]) =>
    THEMES.map((theme) => {
      const actual = resolveStep(assignment.cssVariable, theme);
      const expected = assignment[theme];
      return {
        id,
        cssVariable: assignment.cssVariable,
        theme,
        expected,
        actual,
        passed: actual === expected,
      };
    }),
  );
}

function renderCss(families: Map<string, Record<Theme, GeneratedTheme>>) {
  /* One list per family, not one per theme: both themes read the same ramp, so
     a step is a colour. Which step each theme picks is stated in the role
     assignments. The default family binds on :root, so data-neutral is only
     needed to leave it. The steps are written as values, not as aliases of a
     per-family name, so DevTools shows a colour one read away from a role. */
  const blocks = NEUTRAL_FAMILIES.map((family) => {
    const steps = families
      .get(family.id)!
      .light.steps.map(({ step, css }) => `  --sp-neutral-${step}: ${css};`)
      .join('\n');
    const selector =
      family.id === DEFAULT_NEUTRAL_FAMILY
        ? ':root'
        : `:root[data-neutral='${family.id}']`;
    return `/* ${family.name}: ${family.note} */
${selector} {
${steps}
}
`;
  }).join('\n');

  return `/*
  Generated by scripts/colour-theme/generate.ts -- do not edit by hand.
  Run \`pnpm colors:custom\` after changing the source configuration.
*/
${blocks}`;
}

/* One family's ramp, measured end to end. Both themes sample the same curve,
   so the two GeneratedThemes hold identical colours; they stay separate
   because every contract below is asked per theme. */
function measureRevision(
  roleMap: RoleMap,
  sink: { failures: string[]; warnings: string[] },
  curves: Record<Theme, readonly CurveAnchor[]> = CURVES,
) {
  const generated = Object.fromEntries(
    THEMES.map((theme) => [theme, generateTheme(theme, curves[theme])]),
  ) as Record<Theme, GeneratedTheme>;

  const spacing = Object.fromEntries(
    THEMES.map((theme) => {
      const values = generated[theme].steps;
      if (values.length !== COLOUR_STEPS.length) {
        sink.failures.push(`${theme}: expected ${COLOUR_STEPS.length} steps.`);
      }
      /* Quantized, not serialized: comparing rgb() strings at three decimals
         of a 0-255 channel can never collide once lightness is required to
         decrease, so that check proved nothing about what a display shows. */
      const painted = new Set(values.map(({ quantized }) => quantized));
      if (painted.size !== values.length) {
        sink.failures.push(
          `${theme}: steps collapse to the same 8-bit colour (${values.length - painted.size} collisions).`,
        );
      }
      for (const [index, value] of values.entries()) {
        const previous = values[index - 1];
        if (previous && value.lightness >= previous.lightness) {
          sink.failures.push(
            `${theme} ${value.step}: serialized lightness is not strictly decreasing.`,
          );
        }
      }

      const gaps = values.slice(1).map((value, index) => ({
        from: values[index]!.step,
        to: value.step,
        deltaE: value.deltaEFromPrevious ?? 0,
      }));
      const widest = Math.max(...gaps.map(({ deltaE }) => deltaE));
      const narrowest = Math.min(...gaps.map(({ deltaE }) => deltaE));
      const spread = round(widest / narrowest, 3);
      if (spread > MAX_THEME_GAP_SPREAD) {
        sink.warnings.push(
          `${theme}: the widest adjacent gap is ${spread}x the narrowest (${widest} vs ${narrowest}); the ramp means different things in different regions.`,
        );
      }
      /* Where one region's spacing is chosen, its neighbour's is implied. An
         abrupt change is what makes an edge recipe that works at one face
         invisible or heavy at the next. */
      const neighbouringGapRatios = gaps.slice(1).map((gap, index) => {
        const previous = gaps[index]!;
        const ratio = round(
          Math.max(gap.deltaE, previous.deltaE) /
            Math.min(gap.deltaE, previous.deltaE),
          3,
        );
        return { at: previous.to, ratio };
      });
      for (const change of neighbouringGapRatios) {
        if (change.ratio > MAX_NEIGHBOURING_GAP_RATIO) {
          sink.warnings.push(
            `${theme} ${change.at}: spacing changes ${change.ratio}x between neighbouring gaps.`,
          );
        }
      }

      return [
        theme,
        {
          widestGapDeltaE: widest,
          narrowestGapDeltaE: narrowest,
          gapSpread: spread,
          medianGapDeltaE: round(
            [...gaps.map(({ deltaE }) => deltaE)].sort((a, b) => a - b)[
              Math.floor(gaps.length / 2)
            ]!,
          ),
          gaps,
          neighbouringGapRatios,
        },
      ];
    }),
  );

  const contrastResults = THEMES.flatMap((theme) =>
    CONTRAST_CONTRACTS.map((contract) => {
      const foreground = colourAt(
        generated,
        theme,
        contract.foreground,
        roleMap,
      );
      const background = colourAt(
        generated,
        theme,
        contract.background,
        roleMap,
      );
      const ratio = round(
        Color.contrastWCAG21(foreground.colour, background.colour),
        3,
      );
      const passed = ratio >= contract.minimum;
      const metTarget =
        contract.target === undefined || ratio >= contract.target;
      if (!passed && contract.classification === 'required') {
        sink.failures.push(
          `${theme} ${contract.id}: ${ratio}:1 is below ${contract.minimum}:1.`,
        );
      } else if (!passed || !metTarget) {
        sink.warnings.push(
          `${theme} ${contract.id}: ${ratio}:1 is below ${!passed ? 'minimum' : 'target'} ${!passed ? contract.minimum : contract.target}:1.`,
        );
      }
      return {
        theme,
        ...contract,
        foregroundStep: foreground.step,
        backgroundStep: background.step,
        ratio,
        passed,
        metTarget,
      };
    }),
  );

  const visualResults = THEMES.flatMap((theme) =>
    VISUAL_CONTRACTS.map((contract) => {
      const first = colourAt(generated, theme, contract.first, roleMap);
      const second = colourAt(generated, theme, contract.second, roleMap);
      const deltaE = round(Color.deltaEOK(first.colour, second.colour));
      const metTarget = deltaE >= contract.targetDeltaE;
      if (!metTarget) {
        sink.warnings.push(
          `${theme} ${contract.id}: deltaE ${deltaE} is below visual target ${contract.targetDeltaE}.`,
        );
      }
      return {
        theme,
        ...contract,
        firstStep: first.step,
        secondStep: second.step,
        deltaE,
        metTarget,
      };
    }),
  );

  /* Every contract above judges one theme against an absolute. A theme can
     pass all of them and still say something different from its counterpart:
     the same role pair carrying twice the separation, or a text hierarchy
     half as deep. These compare the two themes to each other. */
  const crossTheme = {
    contrast: CONTRAST_CONTRACTS.map((contract) => {
      const ratios = THEMES.map(
        (theme) =>
          contrastResults.find(
            (result) => result.theme === theme && result.id === contract.id,
          )!.ratio,
      );
      const ratio = round(Math.max(...ratios) / Math.min(...ratios), 3);
      if (ratio > MAX_CROSS_THEME_CONTRAST_RATIO) {
        sink.warnings.push(
          `${contract.id}: light and dark differ ${ratio}x in contrast (${ratios[0]}:1 vs ${ratios[1]}:1); the hierarchy is not the same in both themes.`,
        );
      }
      return { id: contract.id, light: ratios[0], dark: ratios[1], ratio };
    }),
    separation: VISUAL_CONTRACTS.map((contract) => {
      const deltas = THEMES.map(
        (theme) =>
          visualResults.find(
            (result) => result.theme === theme && result.id === contract.id,
          )!.deltaE,
      );
      const ratio = round(Math.max(...deltas) / Math.min(...deltas), 3);
      if (ratio > MAX_CROSS_THEME_DELTA_E_RATIO) {
        sink.warnings.push(
          `${contract.id}: light and dark differ ${ratio}x in separation (${deltas[0]} vs ${deltas[1]}).`,
        );
      }
      return { id: contract.id, light: deltas[0], dark: deltas[1], ratio };
    }),
    /* The theme's warmth should read alike on both canvases. Absolute OKLCH
       chroma is the comparison: it is already perceptual, so dividing it by
       lightness would overstate the dark half. */
    surfaceChroma: (() => {
      const surfaces = (
        Object.keys(ROLE_ASSIGNMENTS) as (keyof typeof ROLE_ASSIGNMENTS)[]
      ).filter((role) => role.startsWith('surface') || role === 'canvas');
      const means = THEMES.map((theme) =>
        round(
          surfaces.reduce((total, role) => {
            const step = roleMap[role][theme];
            return (
              total +
              generated[theme].steps.find((value) => value.step === step)!
                .chroma
            );
          }, 0) / surfaces.length,
        ),
      );
      const ratio = round(Math.max(...means) / Math.min(...means), 3);
      if (ratio > MAX_CROSS_THEME_CHROMA_RATIO) {
        sink.warnings.push(
          `surface-chroma: dark surfaces average ${ratio}x the chroma of light surfaces (${means[0]} vs ${means[1]}).`,
        );
      }
      return { roles: surfaces, light: means[0], dark: means[1], ratio };
    })(),
  };

  return { generated, spacing, contrastResults, visualResults, crossTheme };
}

export async function buildArtifacts(): Promise<GeneratedArtifacts> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const roleAssignmentResults = validateRoleAssignments();
  for (const result of roleAssignmentResults) {
    if (!result.passed) {
      failures.push(
        `${result.theme} ${result.cssVariable}: config expects step ${result.expected}, CSS resolves to ${result.actual}.`,
      );
    }
  }

  const generatedFamilies = new Map<string, Record<Theme, GeneratedTheme>>();
  const familyReports = NEUTRAL_FAMILIES.map((family) => {
    /* Every family is measured against the same role assignments, because the
       roles are the same colours at different hues. A family that cannot hold
       a contract is a failure like any other. */
    const sink = { failures: [] as string[], warnings: [] as string[] };
    const measured = measureRevision(ACTIVE_ROLE_MAP, sink, curvesFor(family));
    generatedFamilies.set(family.id, measured.generated);
    failures.push(...sink.failures.map((entry) => `${family.id}: ${entry}`));
    warnings.push(...sink.warnings.map((entry) => `${family.id}: ${entry}`));
    return { family, measured, ...sink };
  });
  const active = familyReports.find(
    ({ family }) => family.id === DEFAULT_NEUTRAL_FAMILY,
  )!.measured;

  const report = {
    schemaVersion: 3,
    theme: {
      name: THEME_CONFIG.name,
      direction: THEME_CONFIG.direction,
      colourSpace: THEME_CONFIG.colourSpace,
      outputGamut: THEME_CONFIG.outputGamut,
      serialization: THEME_CONFIG.serialization,
    },
    thresholds: {
      maxNeighbouringGapRatio: MAX_NEIGHBOURING_GAP_RATIO,
      maxThemeGapSpread: MAX_THEME_GAP_SPREAD,
      maxCrossThemeDeltaERatio: MAX_CROSS_THEME_DELTA_E_RATIO,
      maxCrossThemeContrastRatio: MAX_CROSS_THEME_CONTRAST_RATIO,
      maxCrossThemeChromaRatio: MAX_CROSS_THEME_CHROMA_RATIO,
    },
    defaultFamily: DEFAULT_NEUTRAL_FAMILY,
    families: familyReports.map(({ family, measured, failures, warnings }) => ({
      ...family,
      failures,
      warnings,
      ramp: measured.generated.light.steps,
      crossTheme: measured.crossTheme,
      contrastContracts: measured.contrastResults,
    })),
    spacing: active.spacing,
    crossTheme: active.crossTheme,
    curves: CURVES,
    roles: ROLE_ASSIGNMENTS,
    roleAssignmentValidation: roleAssignmentResults,
    ramps: Object.fromEntries(
      THEMES.map((theme) => [theme, active.generated[theme].steps]),
    ),
    contrastContracts: active.contrastResults,
    visualContracts: active.visualResults,
    failures,
    warnings,
  };
  const cssPath = fileURLToPath(CSS_OUTPUT);
  const reportPath = fileURLToPath(REPORT_OUTPUT);
  const [cssFormatConfig, reportFormatConfig] = await Promise.all([
    resolveConfig(cssPath),
    resolveConfig(reportPath),
  ]);

  return {
    css: await format(renderCss(generatedFamilies), {
      ...cssFormatConfig,
      filepath: cssPath,
    }),
    report: await format(JSON.stringify(report), {
      ...reportFormatConfig,
      filepath: reportPath,
    }),
    failures,
    warnings,
  };
}
function assertContracts(artifacts: GeneratedArtifacts) {
  if (artifacts.failures.length > 0) {
    throw new Error(
      `Custom colour contracts failed:\n${artifacts.failures.map((failure) => `- ${failure}`).join('\n')}`,
    );
  }
}

export async function writeArtifacts() {
  const artifacts = await buildArtifacts();
  assertContracts(artifacts);
  mkdirSync(new URL('../../docs/generated/', import.meta.url), {
    recursive: true,
  });
  writeFileSync(CSS_OUTPUT, artifacts.css);
  writeFileSync(REPORT_OUTPUT, artifacts.report);
  return artifacts;
}

export async function checkArtifacts() {
  const artifacts = await buildArtifacts();
  assertContracts(artifacts);
  const stale = [
    [CSS_OUTPUT, artifacts.css],
    [REPORT_OUTPUT, artifacts.report],
  ]
    .filter(([url, expected]) => readFileSync(url as URL, 'utf8') !== expected)
    .map(([url]) => fileURLToPath(url as URL));
  if (stale.length > 0) {
    throw new Error(
      `Generated custom colour output is stale:\n${stale.map((path) => `- ${path}`).join('\n')}`,
    );
  }
  return artifacts;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const checking = process.argv.includes('--check');
  const artifacts = checking ? await checkArtifacts() : await writeArtifacts();
  const verb = checking ? 'checked' : 'wrote';
  process.stdout.write(
    `${verb} custom colour theme: ${THEMES.length} themes x ${COLOUR_STEPS.length} steps; ${artifacts.warnings.length} warnings\n`,
  );
  for (const warning of artifacts.warnings)
    process.stdout.write(`warning: ${warning}\n`);
}
