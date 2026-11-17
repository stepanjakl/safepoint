'use client';

import { useId, useState } from 'react';

export type WorkbenchStep = {
  step: number;
  hex: string;
  css: string;
  quantized: string;
  lightness: number;
  chroma: number;
  hue: number;
  relativeLuminance: number;
  deltaEFromPrevious: number | null;
  gamutMapped: boolean;
};

export type WorkbenchTheme = {
  steps: WorkbenchStep[];
  gapSpread: number;
  medianGapDeltaE: number;
  narrowestGapDeltaE: number;
  widestGapDeltaE: number;
  canvasStep: number;
  textStep: number;
};

export type WorkbenchRole = {
  id: string;
  light: { step: number };
  dark: { step: number };
};

export type WorkbenchRevision = {
  id: string;
  name: string;
  summary: string;
  active: boolean;
  light: WorkbenchTheme;
  dark: WorkbenchTheme;
  chromaRatio: number;
  crossThemeContrast: {
    id: string;
    light: number;
    dark: number;
    ratio: number;
  }[];
  warnings: string[];
};

type Selection = { revision: string; theme: 'light' | 'dark'; step: number };

/* WCAG 2.x contrast from two recorded relative luminances. Arithmetic on
   values the generator measured, not a second colour engine: the report is
   still the only place a colour is computed. */
function contrast(a: number, b: number) {
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Detail({
  revision,
  theme,
  step,
  roles,
}: {
  revision: WorkbenchRevision;
  theme: 'light' | 'dark';
  step: WorkbenchStep;
  roles: WorkbenchRole[];
}) {
  const scale = revision[theme];
  const canvas = scale.steps.find((entry) => entry.step === scale.canvasStep)!;
  const ink = scale.steps.find((entry) => entry.step === scale.textStep)!;
  const here = roles
    .filter((role) => role[theme].step === step.step)
    .map((role) => role.id);

  return (
    <div className="border-rule-faint grid gap-4 border-t p-4 sm:grid-cols-3">
      <div className="flex items-center gap-3">
        <span
          className="border-rule-default block size-12 shrink-0 rounded border"
          style={{ backgroundColor: step.css }}
        />
        <div>
          <p className="text-title font-semibold tabular-nums">{step.step}</p>
          <p className="readout text-muted">
            {revision.name} · {theme}
          </p>
        </div>
      </div>

      <dl className="text-meta grid content-start gap-1">
        <p className="readout text-muted-strong mb-1">Value</p>
        <Figure label="hex" value={step.hex} />
        <Figure label="8-bit" value={step.quantized} />
        <Figure
          label="serialized"
          value={step.css.replace(/^rgb\(|\)$/g, '')}
        />
        <Figure
          label="gamut"
          value={step.gamutMapped ? 'mapped into sRGB' : 'in sRGB'}
        />
      </dl>

      <dl className="text-meta grid content-start gap-1">
        <p className="readout text-muted-strong mb-1">Position</p>
        <Figure label="OKLCH L" value={step.lightness.toFixed(4)} />
        <Figure label="OKLCH C" value={step.chroma.toFixed(5)} />
        <Figure label="OKLCH h" value={`${step.hue.toFixed(2)}°`} />
        <Figure
          label="rel. luminance"
          value={step.relativeLuminance.toFixed(4)}
        />
      </dl>

      <dl className="text-meta grid content-start gap-1">
        <p className="readout text-muted-strong mb-1">Ramp</p>
        <Figure
          label="ΔEOK from previous"
          value={
            step.deltaEFromPrevious === null
              ? '—'
              : step.deltaEFromPrevious.toFixed(4)
          }
        />
        <Figure
          label="vs median gap"
          value={
            step.deltaEFromPrevious === null
              ? '—'
              : `${(step.deltaEFromPrevious / scale.medianGapDeltaE).toFixed(2)}×`
          }
        />
      </dl>

      <dl className="text-meta grid content-start gap-1">
        <p className="readout text-muted-strong mb-1">Contrast in this theme</p>
        <Figure
          label={`on canvas (${scale.canvasStep})`}
          value={`${contrast(step.relativeLuminance, canvas.relativeLuminance).toFixed(2)}:1`}
        />
        <Figure
          label={`against text (${scale.textStep})`}
          value={`${contrast(step.relativeLuminance, ink.relativeLuminance).toFixed(2)}:1`}
        />
      </dl>

      <dl className="text-meta grid content-start gap-1">
        <p className="readout text-muted-strong mb-1">Roles on this step</p>
        {here.length > 0 ? (
          <dd className="text-muted">{here.join(', ')}</dd>
        ) : (
          <dd className="text-muted">none</dd>
        )}
      </dl>
    </div>
  );
}

function Ramp({
  revision,
  theme,
  selection,
  onSelect,
  roles,
}: {
  revision: WorkbenchRevision;
  theme: 'light' | 'dark';
  selection: Selection | null;
  onSelect: (next: Selection | null) => void;
  roles: WorkbenchRole[];
}) {
  const scale = revision[theme];
  const roleSteps = new Set(roles.map((role) => role[theme].step));
  const active =
    selection && selection.revision === revision.id && selection.theme === theme
      ? selection.step
      : null;

  return (
    <div>
      <div className="border-rule-faint flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-2">
        <h4 className="readout text-muted-strong">{theme}</h4>
        <p className="text-meta text-muted tabular-nums">
          spread {scale.gapSpread.toFixed(2)}× · median gap{' '}
          {scale.medianGapDeltaE.toFixed(4)} · range{' '}
          {scale.narrowestGapDeltaE.toFixed(4)}–
          {scale.widestGapDeltaE.toFixed(4)}
        </p>
      </div>
      <ol
        className="flex px-4 pt-3"
        aria-label={`${revision.name}, ${theme}`}
        onMouseLeave={() => onSelect(null)}
      >
        {scale.steps.map((step) => (
          <li key={step.step} className="flex-1">
            <button
              type="button"
              aria-pressed={active === step.step}
              className="focus-visible:ring-rule-strong block h-24 w-full focus-visible:ring-2 focus-visible:outline-none"
              style={{ backgroundColor: step.css }}
              onMouseEnter={() =>
                onSelect({ revision: revision.id, theme, step: step.step })
              }
              onFocus={() =>
                onSelect({ revision: revision.id, theme, step: step.step })
              }
            >
              <span className="sr-only">
                Step {step.step}, {step.hex}
              </span>
            </button>
            {/* A tick under every step a role actually reads, so the gaps the
                numbers describe are visible without opening each one. */}
            <span
              aria-hidden
              className={`mt-1 block h-1 ${roleSteps.has(step.step) ? 'bg-rule-strong' : ''}`}
            />
          </li>
        ))}
      </ol>
      <div className="readout text-muted flex justify-between px-4 pb-3 tabular-nums">
        {scale.steps
          .filter((step) => step.step % 100 === 0)
          .map((step) => (
            <span key={step.step}>{step.step}</span>
          ))}
      </div>
    </div>
  );
}

export function RampWorkbench({
  revisions,
  rolesByRevision,
}: {
  revisions: WorkbenchRevision[];
  rolesByRevision: Record<string, WorkbenchRole[]>;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const headingId = useId();

  return (
    <div className="grid gap-10">
      {revisions.map((revision) => {
        const roles = rolesByRevision[revision.id] ?? [];
        const shown =
          selection && selection.revision === revision.id
            ? revision[selection.theme].steps.find(
                (step) => step.step === selection.step,
              )
            : undefined;

        return (
          <section
            key={revision.id}
            aria-labelledby={`${headingId}-${revision.id}`}
          >
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3
                id={`${headingId}-${revision.id}`}
                className="text-title font-semibold"
              >
                {revision.name}
              </h3>
              {revision.active ? (
                <span className="readout text-muted">default</span>
              ) : null}
            </div>
            <p className="text-dense text-muted mb-4 max-w-3xl">
              {revision.summary}
            </p>

            <div className="border-rule-default bg-surface-primary overflow-hidden border">
              <Ramp
                revision={revision}
                theme="light"
                selection={selection}
                onSelect={setSelection}
                roles={roles}
              />
              <Ramp
                revision={revision}
                theme="dark"
                selection={selection}
                onSelect={setSelection}
                roles={roles}
              />
              {shown && selection ? (
                <Detail
                  revision={revision}
                  theme={selection.theme}
                  step={shown}
                  roles={roles}
                />
              ) : (
                <p className="border-rule-faint text-meta text-muted border-t p-4">
                  Point at or tab to a step for its measured values.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="readout text-muted-strong mb-2">
                  Light against dark
                </h4>
                <table className="text-meta w-full">
                  <thead className="text-muted">
                    <tr>
                      <th className="text-left font-normal">contract</th>
                      <th className="text-right font-normal">light</th>
                      <th className="text-right font-normal">dark</th>
                      <th className="text-right font-normal">ratio</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {revision.crossThemeContrast.map((row) => (
                      <tr key={row.id}>
                        <td className="truncate">{row.id}</td>
                        <td className="text-right">{row.light.toFixed(2)}</td>
                        <td className="text-right">{row.dark.toFixed(2)}</td>
                        <td
                          className={`text-right ${row.ratio > 1.75 ? 'text-primary font-semibold' : 'text-muted'}`}
                        >
                          {row.ratio.toFixed(2)}×
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>surface chroma</td>
                      <td className="text-right" colSpan={2}>
                        —
                      </td>
                      <td
                        className={`text-right ${revision.chromaRatio > 2 ? 'text-primary font-semibold' : 'text-muted'}`}
                      >
                        {revision.chromaRatio.toFixed(2)}×
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="readout text-muted-strong mb-2">
                  Role assignments
                </h4>
                <table className="text-meta w-full">
                  <thead className="text-muted">
                    <tr>
                      <th className="text-left font-normal">role</th>
                      <th className="text-right font-normal">light</th>
                      <th className="text-right font-normal">dark</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {roles.map((role) => (
                      <tr key={role.id}>
                        <td className="truncate">{role.id}</td>
                        <td className="text-right">{role.light.step}</td>
                        <td className="text-right">{role.dark.step}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {revision.warnings.length > 0 ? (
              <details className="mt-4">
                <summary className="readout text-muted-strong cursor-pointer">
                  {revision.warnings.length} warnings
                </summary>
                <ul className="text-meta text-muted mt-2 grid gap-1">
                  {revision.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
