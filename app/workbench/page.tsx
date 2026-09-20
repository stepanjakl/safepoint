import Link from 'next/link';
import { notFound } from 'next/navigation';

import report from '@/docs/generated/colour-theme-report.json';
import {
  RampWorkbench,
  type WorkbenchRevision,
  type WorkbenchRole,
  type WorkbenchTheme,
} from '@/components/dev/ramp-workbench';

const THEMES = ['light', 'dark'] as const;

type Theme = (typeof THEMES)[number];
type Ramps = Record<Theme, WorkbenchTheme['steps']>;
type Spacing = Record<
  Theme,
  Pick<
    WorkbenchTheme,
    'gapSpread' | 'medianGapDeltaE' | 'narrowestGapDeltaE' | 'widestGapDeltaE'
  >
>;

function scales(ramps: Ramps, spacing: Spacing, roles: WorkbenchRole[]) {
  return Object.fromEntries(
    THEMES.map((theme) => [
      theme,
      {
        steps: ramps[theme],
        ...spacing[theme],
        canvasStep: roles.find((role) => role.id === 'canvas')![theme].step,
        textStep: roles.find((role) => role.id === 'textPrimary')![theme].step,
      },
    ]),
  ) as Record<Theme, WorkbenchTheme>;
}

export default function WorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const activeRoles: WorkbenchRole[] = Object.entries(report.roles).map(
    ([id, assignment]) => ({
      id,
      light: { step: assignment.light },
      dark: { step: assignment.dark },
    }),
  );

  const rolesByRevision: Record<string, WorkbenchRole[]> = {};

  /* Every family shares one ramp shape and one set of role assignments, so
     they are the same page five times over at different hues. */
  const revisions: WorkbenchRevision[] = report.families.map((family) => {
    rolesByRevision[family.id] = activeRoles;
    const ramp = family.ramp as WorkbenchTheme['steps'];
    return {
      id: family.id,
      name: family.name,
      summary: `${family.note} Hue ${family.hue}, chroma x${family.chromaScale}.`,
      active: family.id === report.defaultFamily,
      ...scales(
        { light: ramp, dark: ramp } as Ramps,
        report.spacing as Spacing,
        activeRoles,
      ),
      chromaRatio: family.crossTheme.surfaceChroma.ratio ?? 0,
      crossThemeContrast: family.crossTheme.contrast,
      warnings: family.warnings,
    };
  });

  return (
    <main className="bg-canvas text-primary min-h-dvh p-6 sm:p-10">
      <header className="border-rule-default mx-auto max-w-screen-2xl border-b pb-6">
        <p className="readout text-muted">Generated colour systems</p>
        <h1 className="text-display mt-2 font-semibold">41-step workbench</h1>
        <p className="text-body text-muted mt-3 max-w-3xl">
          Every generated step of the shared ramp shape and every neutral
          family, with the measurements behind them. All values are read from{' '}
          <code>docs/generated/colour-theme-report.json</code>; nothing here
          computes a colour.
        </p>
        <Link
          href="/"
          className="text-dense text-muted-strong mt-4 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Return to the application
        </Link>
      </header>

      <div className="mx-auto max-w-screen-2xl">
        <section className="border-rule-default border-b py-6">
          <h2 className="text-title font-semibold">How a ramp is computed</h2>
          <ol className="text-dense text-muted mt-3 grid max-w-3xl gap-2">
            <li>
              <strong className="text-primary">1. Anchors.</strong> A curve is a
              short list of OKLCH anchors — step, lightness, chroma, hue — in{' '}
              <code>scripts/colour-theme/config.ts</code>. Lightness must
              decrease as the step number rises.
            </li>
            <li>
              <strong className="text-primary">2. Sampling.</strong> All 41
              steps are interpolated piecewise-linearly between anchors, with
              hue taken over the shorter arc. Linear rather than spline, so a
              curve cannot overshoot between two anchors.
            </li>
            <li>
              <strong className="text-primary">3. Gamut.</strong> Each sample is
              mapped into sRGB with the CSS algorithm before anything is
              measured, so contrast is calculated on the colour that will
              actually paint rather than on one the browser would clip.
            </li>
            <li>
              <strong className="text-primary">4. Serialization.</strong>{' '}
              Written as <code>rgb()</code> with three decimals, then parsed
              back and re-measured. Every figure below describes the reparsed
              value, not the sampled one.
            </li>
            <li>
              <strong className="text-primary">5. Contracts.</strong> Roles map
              names to steps. Contrast contracts are WCAG 2.x ratios with a
              required minimum and sometimes a higher design target; visual
              contracts are ΔEOK separations. Spacing and cross-theme criteria
              judge the ramp&rsquo;s own shape.
            </li>
          </ol>
          <p className="text-meta text-muted mt-4 max-w-3xl">
            ΔEOK is perceptual distance in OKLab; roughly 0.01 is near the
            threshold of noticing on large areas and 0.02 is comfortably
            visible. Step numbers express ordering only — equal index distances
            are not equal contrast, and never equal across themes.
          </p>
        </section>

        <div className="mt-8">
          <RampWorkbench
            revisions={revisions}
            rolesByRevision={rolesByRevision}
          />
        </div>
      </div>
    </main>
  );
}
