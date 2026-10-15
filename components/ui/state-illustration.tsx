import type { ReactElement, SVGProps } from 'react';

import {
  drawExtrusion,
  Extrusion,
  ISOMETRIC,
  loopsFromPath,
  mapLoop,
  type Solid,
} from '@/components/ui/extrusion';

/*
  Line illustrations for a page with nothing on it. Every number is derived
  here, from the lockup's own geometry, so a figure can be checked by reading
  its constants rather than by measuring a drawing:

  - the box is 96 x 96 with its centre at (48, 48);
  - the lockup's three lobes turn about (503, 590) in its own 1152-unit frame,
    and its tip lies 515 from that point, so SCALE puts the tip 40 from the
    centre, 8 inside the box, and the lobes stand at multiples of 120°.

  Drawn at 96px, one unit to the pixel, so the stroke is a true 1px. The lobes are transformed in their path data
  rather than by a transform attribute, which would scale the stroke with them.
  Ink is currentColor; the one accented part takes the mark's colour.
*/
const BOX = 96;
const C = BOX / 2;
const R = 40;
const STROKE = 1;
const LOBE_PATH =
  'M503 75C532 75 550 88 574 105L687 183C723 208 741 238 741 279V360C741 392 732 411 706 428L590 503C572 515 559 518 549 512C538 506 535 496 535 479V290C535 269 524 256 503 256C482 256 471 269 471 290V479C471 496 468 506 457 512C447 518 434 515 416 503L300 428C274 411 265 392 265 360V279C265 238 283 208 319 183L432 105C456 88 474 75 503 75Z';
const LOBE_TURN = { x: 503, y: 590, tip: 515 } as const;

const round = (n: number) => Math.round(n * 1000) / 1000;
const rad = (deg: number) => (deg * Math.PI) / 180;
const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: STROKE,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Frame(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={BOX}
      height={BOX}
      {...props}
    />
  );
}

/*
  The lobe's path, turned by `deg` about the lockup's turning point and scaled
  into the box. The path is absolute and uses only M, C, L, V, H and Z, so each
  point maps on its own; V and H become L, because a turned axis line is not
  axis-aligned.
*/
function lobePath(deg: number, scale: number) {
  const cos = Math.cos(rad(deg));
  const sin = Math.sin(rad(deg));
  const at = (x: number, y: number) => {
    const dx = x - LOBE_TURN.x;
    const dy = y - LOBE_TURN.y;
    return `${round(C + scale * (dx * cos - dy * sin))} ${round(C + scale * (dx * sin + dy * cos))}`;
  };
  let x = 0;
  let y = 0;
  let out = '';
  for (const [, cmd = '', args = ''] of LOBE_PATH.matchAll(
    /([MCLVHZ])([^MCLVHZ]*)/g,
  )) {
    const n = (args.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    if (cmd === 'Z') {
      out += 'Z';
      continue;
    }
    if (cmd === 'V') y = n[0] ?? y;
    else if (cmd === 'H') x = n[0] ?? x;
    else {
      x = n[n.length - 2] ?? x;
      y = n[n.length - 1] ?? y;
    }
    if (cmd === 'V' || cmd === 'H') {
      out += `L${at(x, y)}`;
      continue;
    }
    out += cmd;
    for (let i = 0; i + 1 < n.length; i += 2)
      out += `${i ? ' ' : ''}${at(n[i] ?? 0, n[i + 1] ?? 0)}`;
  }
  return out;
}

/* The three lobes, outlined and turned to the lockup's own angles. */
function Lobes({ scale = R / LOBE_TURN.tip }: { scale?: number }) {
  return (
    <>
      {[0, 120, 240].map((deg) => (
        <path key={deg} d={lobePath(deg, scale)} {...line} />
      ))}
    </>
  );
}

/* A. The lockup undone to its outline, a point at its turning centre. */
function Outline(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <Lobes />
      <circle
        cx={C}
        cy={C}
        r={2}
        fill="currentColor"
        className="text-brand-mark"
      />
    </Frame>
  );
}

/*
  B. The outline laid on the ground of the isometric figures and given depth,
  as thick as its slot is wide. Drawn by the extrusion generator, which keeps
  the curves exact and removes hidden lines; /workbench/states turns it.
*/
const SLOT = 535 - 471;
export const LOCKUP: Solid = {
  loops: [0, 120, 240].flatMap((deg) => {
    const cos = Math.cos(rad(deg));
    const sin = Math.sin(rad(deg));
    return loopsFromPath(LOBE_PATH).map((loop) =>
      mapLoop(loop, ([x, y]) => {
        const dx = x - LOBE_TURN.x;
        const dy = y - LOBE_TURN.y;
        return [dx * cos - dy * sin, dx * sin + dy * cos];
      }),
    );
  }),
  height: SLOT,
  // The lobes' turning point, so the solid spins about its symmetry.
  axis: [0, 0],
};
// It lies flat, so it fills the slot's width, its line just inside, and its
// box is cut to its height: a square box would leave the same gap above and
// below it again.
const ISOMETRIC_LAYERS = drawExtrusion(LOCKUP, ISOMETRIC, 'view', BOX - STROKE);

function Isometric(props: SVGProps<SVGSVGElement>) {
  return <Extrusion layers={ISOMETRIC_LAYERS} crop {...props} />;
}

/*
  C. The isometric solid with the drawing turned 30° anticlockwise. Its box
  centre sits 3.9px left of where its area balances, so it is centred on the
  balance, to stand centred over the text below it.
*/
const ROLLED_LAYERS = drawExtrusion(
  LOCKUP,
  { ...ISOMETRIC, roll: -30 },
  'balance',
);

function Rolled(props: SVGProps<SVGSVGElement>) {
  return (
    <Extrusion layers={ROLLED_LAYERS} width={BOX} height={BOX} {...props} />
  );
}

export const STATE_ILLUSTRATIONS = {
  outline: Outline,
  isometric: Isometric,
  rolled: Rolled,
} satisfies Record<string, (props: SVGProps<SVGSVGElement>) => ReactElement>;

export type StateIllustrationName = keyof typeof STATE_ILLUSTRATIONS;

export function StateIllustration({
  name,
  ...props
}: { name: StateIllustrationName } & SVGProps<SVGSVGElement>) {
  const Figure = STATE_ILLUSTRATIONS[name];
  return <Figure {...props} />;
}
