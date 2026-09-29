import Link from 'next/link';
import { notFound } from 'next/navigation';

import report from '@/docs/generated/colour-theme-report.json';

import { Pair, Swatch } from './measure';

/*
  Development only: the colour system as the page paints it. Every swatch and
  every ratio is read live, so switching theme or neutral family in the design
  pane updates the page in place. Step numbers come from the generated colour
  report, which `pnpm check:colours` keeps in step with the stylesheets.
*/

type Role = { cssVariable: string; light: number; dark: number };
const roles = report.roles as Record<string, Role>;
const stepsOf = (variable: string) => {
  const role = Object.values(roles).find(
    (entry) => entry.cssVariable === variable,
  );
  return role ? `${role.light} / ${role.dark}` : undefined;
};

const SURFACES = [
  ['--sp-surface-floating', 'Floating'],
  ['--sp-surface-primary', 'Primary (panes)'],
  ['--sp-canvas', 'Canvas'],
  ['--sp-surface-inset', 'Inset'],
  ['--sp-surface-control', 'Control'],
  ['--sp-surface-selected', 'Selected'],
  ['--sp-surface-hover', 'Hover'],
  ['--sp-surface-disabled', 'Disabled'],
] as const;

const INKS = [
  ['--sp-text-primary', 'Primary', 4.5],
  ['--sp-text-muted-strong', 'Muted strong', 4.5],
  ['--sp-text-muted', 'Muted', 4.5],
] as const;

const TEXT_GROUNDS = [
  '--sp-surface-floating',
  '--sp-surface-primary',
  '--sp-canvas',
  '--sp-surface-inset',
] as const;

const STATES = [
  'advisory',
  'verified',
  'caution',
  'decision',
  'blocked',
] as const;
const STATE_STEPS = [1, 3, 4, 5, 6, 7, 9, 10, 11, 12] as const;

/* Each structural edge on the face it is drawn over. */
/* Sheens are one ramp step above their face by design -- present, not
   prominent -- so they are held to a step's worth, not to a divider's floor. */
const SHEENS = [
  ['--sp-raised-edge', '--sp-surface-primary', 'Pane sheen and dividers'],
  ['--sp-floating-edge', '--sp-surface-floating', 'Floating sheen'],
  ['--sp-recessed-edge', '--sp-surface-inset', 'Recess sheen (on the canvas)'],
  ['--sp-divider-etch', '--sp-canvas', 'Canvas rule etch'],
] as const;

const EDGES = [
  ['--sp-raised-ring', '--sp-surface-primary', 'Pane ring'],
  ['--sp-floating-ring', '--sp-surface-floating', 'Floating ring'],
  ['--sp-recessed-ring', '--sp-surface-inset', 'Recess ring (on the canvas)'],
  ['--sp-rule-faint', '--sp-surface-primary', 'Faint rule on a pane'],
  ['--sp-rule-default', '--sp-surface-primary', 'Default rule on a pane'],
  ['--sp-field-edge', '--sp-field-face', 'Field edge'],
  ['--sp-field-edge-active', '--sp-field-face', 'Field edge, focused'],
] as const;

const RAMP = Array.from({ length: 41 }, (_, index) => index * 25);

/* A recess cut into each surface, built as the app builds them: the recess
   takes its steps from the ground-* its surface hands down. */
function RecessStack({
  label,
  on,
}: {
  label: string;
  on: 'canvas' | 'pane' | 'floating';
}) {
  const recess = (
    <div className="control-face surface-recessed rounded-control h-24" />
  );
  return (
    <figure className="grid content-start gap-2">
      <figcaption className="text-meta text-muted">{label}</figcaption>
      <div className="bg-canvas p-6">
        {on === 'canvas' ? (
          recess
        ) : (
          <div className="control-face surface-raised rounded-shell p-6">
            {on === 'floating' ? (
              <div className="control-face surface-floating rounded-shell p-6">
                {recess}
              </div>
            ) : (
              recess
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/* The surface-following roles as they paint inside each surface: every
   value here comes from the ground-* utility the surface applies. */
type Ground = 'canvas' | 'pane' | 'floating' | 'recess';

function FollowingSamples() {
  return (
    <div className="grid gap-3">
      <div className="bg-surface-hover rounded-control text-meta px-2 py-1">
        hover
      </div>
      <div className="bg-surface-selected rounded-control text-meta px-2 py-1">
        selected
      </div>
      <div className="border-rule-faint text-meta text-muted border-t pt-1">
        faint rule
      </div>
      <div className="flex items-center gap-3">
        <div className="control-face control-quiet rounded-control text-meta px-3 py-1">
          quiet
        </div>
        <div className="bg-menu-chip text-meta rounded-full px-2">chip</div>
      </div>
    </div>
  );
}

function RelativeSample({ ground }: { ground: Ground }) {
  const samples = <FollowingSamples />;
  if (ground === 'canvas')
    return <div className="bg-canvas p-4">{samples}</div>;
  const inner =
    ground === 'floating' ? (
      <div className="control-face surface-floating rounded-shell p-4">
        {samples}
      </div>
    ) : ground === 'recess' ? (
      <div className="control-face surface-recessed rounded-control p-4">
        {samples}
      </div>
    ) : (
      samples
    );
  return (
    <div className="bg-canvas p-4">
      <div className="control-face surface-raised rounded-shell p-4">
        {inner}
      </div>
    </div>
  );
}

const GROUND_LABEL: Record<Ground, string> = {
  canvas: 'On the canvas',
  pane: 'In a pane',
  floating: 'In floating',
  recess: 'In a recess, in a pane',
};

const SECTION = 'grid gap-3';
const HEADING = 'text-title font-semibold';
const NOTE = 'text-meta text-muted max-w-3xl';

export default function WorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-10 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Colour reference</h1>
        <p className={NOTE}>
          The colour system as this page paints it. Switch theme and neutral
          family from the design pane: every swatch and ratio re-reads. Steps
          are light / dark on the one neutral ramp.{' '}
          <Link
            className="underline underline-offset-4"
            href="/workbench/review"
          >
            Stage 1B review workspace
          </Link>
          {' · '}
          <Link
            className="underline underline-offset-4"
            href="/workbench/controls"
          >
            Control states
          </Link>
          {' · '}
          <Link className="underline underline-offset-4" href="/workbench/run">
            Run lifecycle
          </Link>
        </p>
      </header>

      <section className={SECTION} aria-labelledby="surfaces">
        <h2 id="surfaces" className={HEADING}>
          Surfaces
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
          {SURFACES.map(([token, name]) => (
            <Swatch
              key={token}
              token={token}
              label={`${name}${stepsOf(token) ? ` · ${stepsOf(token)}` : ''}`}
            />
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="stack">
        <h2 id="stack" className={HEADING}>
          Surface stack
        </h2>
        <p className={NOTE}>
          Canvas, pane and floating, each a layer apart, and a recess one layer
          below whichever surface it is cut into -- all from LAYER_STEP and
          SURFACE_THEMES in scripts/colour-theme/config.ts. Every ring clears
          both its face and its ground; every surface has a highlight.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-6">
          <RecessStack label="Recess on the canvas" on="canvas" />
          <RecessStack label="Recess in a pane" on="pane" />
          <RecessStack label="Recess in floating" on="floating" />
        </div>
      </section>

      <section className={SECTION} aria-labelledby="relative">
        <h2 id="relative" className={HEADING}>
          Surface-following roles
        </h2>
        <p className={NOTE}>
          Hover, selected, rules, the quiet control and the menu chip, inside
          each surface. Each is a fixed step distance from the face it sits on
          (FOLLOWING_ROLES in scripts/colour-theme/config.ts), so it holds the
          same perceived difference wherever it is drawn.
        </p>
        <div className="grid gap-6 sm:grid-cols-4">
          {(Object.keys(GROUND_LABEL) as Ground[]).map((ground) => (
            <figure key={ground} className="grid content-start gap-2">
              <figcaption className="text-meta text-muted">
                {GROUND_LABEL[ground]}
              </figcaption>
              <RelativeSample ground={ground} />
            </figure>
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="text">
        <h2 id="text" className={HEADING}>
          Text on surfaces
        </h2>
        <p className={NOTE}>
          Neutral ink and state text on every ground they sit on, against the AA
          floor for body text.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {TEXT_GROUNDS.flatMap((ground) => [
            ...INKS.map(([ink, name, floor]) => (
              <Pair
                key={`${ink}${ground}`}
                fg={ink}
                bg={ground}
                floor={floor}
                label={`${name} on ${ground.replace('--sp-', '')}`}
              />
            )),
            ...STATES.map((state) => (
              <Pair
                key={`${state}${ground}`}
                fg={`--sp-state-${state}`}
                bg={ground}
                floor={4.5}
                label={`${state} on ${ground.replace('--sp-', '')}`}
              />
            )),
          ])}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="edges">
        <h2 id="edges" className={HEADING}>
          Edges and rules
        </h2>
        <p className={NOTE}>
          Each structural line on the face it is drawn over. Sheens sit one ramp
          step above their face, about 1.06:1 by design; dividers are decorative
          and hold 1.2:1; a field&rsquo;s focused edge is its focus indicator
          and holds 3:1.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {SHEENS.map(([edge, face, name]) => (
            <Pair
              key={`${edge}${face}`}
              fg={edge}
              bg={face}
              floor={1.04}
              kind="line"
              label={`${name} · one step`}
            />
          ))}
          {EDGES.map(([edge, face, name]) => (
            <Pair
              key={`${edge}${face}`}
              fg={edge}
              bg={face}
              floor={edge === '--sp-field-edge-active' ? 3 : 1.2}
              kind="line"
              label={name}
            />
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="states">
        <h2 id="states" className={HEADING}>
          State scales
        </h2>
        <div className="grid gap-2">
          {STATES.map((state) => (
            <div
              key={state}
              className="grid grid-cols-[6rem_repeat(10,minmax(0,1fr))] items-end gap-2"
            >
              <span className="text-meta text-muted pb-5">{state}</span>
              {STATE_STEPS.map((step) => (
                <Swatch
                  key={step}
                  token={`--sp-state-${state}-${step}`}
                  label={String(step)}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="ramp">
        <h2 id="ramp" className={HEADING}>
          Neutral ramp
        </h2>
        <p className={NOTE}>
          All 41 steps of the active family. Lightness falls by the same amount
          at every step, so one step is the same difference anywhere on it.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
          {RAMP.map((step) => (
            <Swatch
              key={step}
              token={`--sp-neutral-${step}`}
              label={String(step)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
