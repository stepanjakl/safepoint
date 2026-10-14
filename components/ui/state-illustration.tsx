import type { ReactElement, SVGProps } from 'react';

/*
  Line illustrations for a page with nothing on it. Every number is derived
  here, from the lockup's own geometry, so a figure can be checked by reading
  its constants rather than by measuring a drawing:

  - the box is 96 x 96 with its centre at (48, 48);
  - the lockup's three lobes turn about (503, 590) in its own 1152-unit frame,
    and its tip lies 515 from that point, so SCALE puts the tip 40 from the
    centre, 8 inside the box;
  - everything else sits on a circle of that radius, at multiples of 120°.

  Drawn at 96px, one unit to the pixel, so the stroke is a true 1px and the
  dashes divide the ring exactly. The lobes are transformed in their path data
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
/** A point on the circle of radius r about the centre; 0° is 12 o'clock, clockwise. */
const polar = (r: number, deg: number) => ({
  x: round(C + r * Math.sin(rad(deg))),
  y: round(C - r * Math.cos(rad(deg))),
});

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
  B. Three steps on a ring, joined by arcs. Nodes sit at 0°, 120°, 240° on the
  circle of radius R. Each arc stops GAP short of a node's edge: the chord
  that distance spans on a circle of radius R subtends 2·asin(d / 2R). The
  node at 12 o'clock is the one the agent has checked.
*/
const NODE = 7;
const GAP = 3;
const TRIM = round((2 * Math.asin((NODE + GAP) / (2 * R)) * 180) / Math.PI);
function Checkpoint(props: SVGProps<SVGSVGElement>) {
  const arcs = [0, 120, 240].map((from) => {
    const a = polar(R, from + TRIM);
    const b = polar(R, from + 120 - TRIM);
    return `M${a.x} ${a.y}A${R} ${R} 0 0 1 ${b.x} ${b.y}`;
  });
  const top = polar(R, 0);
  return (
    <Frame {...props}>
      {arcs.map((d) => (
        <path key={d} d={d} {...line} />
      ))}
      {[120, 240].map((deg) => {
        const { x, y } = polar(R, deg);
        return <circle key={deg} cx={x} cy={y} r={NODE} {...line} />;
      })}
      <circle
        cx={top.x}
        cy={top.y}
        r={NODE}
        {...line}
        className="text-brand-mark"
      />
      {/* A tick whose bounding box is centred on its node: x ±3.3, y ±2.4. */}
      <path
        d={`M${round(top.x - 3.3)} ${top.y}l2.4 2.4 4.2 -4.8`}
        {...line}
        className="text-brand-mark"
      />
    </Frame>
  );
}

/*
  C. The dashed ring this app already uses for "not yet", with the lobes inside.
  48 dashes divide the circumference exactly: 2πR / 96 is both the dash and the
  gap. The ring is turned so a dash, not a gap, is centred at 12 o'clock.
*/
const DASHES = 48;
const DASH = round((2 * Math.PI * R) / (DASHES * 2));
function Seal(props: SVGProps<SVGSVGElement>) {
  return (
    <Frame {...props}>
      <circle
        cx={C}
        cy={C}
        r={R}
        {...line}
        strokeLinecap="butt"
        strokeDasharray={`${DASH} ${DASH}`}
        transform={`rotate(${-90 - 180 / DASHES} ${C} ${C})`}
      />
      <Lobes scale={round((R * 0.5) / LOBE_TURN.tip)} />
    </Frame>
  );
}

export const STATE_ILLUSTRATIONS = {
  outline: Outline,
  checkpoint: Checkpoint,
  seal: Seal,
} satisfies Record<string, (props: SVGProps<SVGSVGElement>) => ReactElement>;

export type StateIllustrationName = keyof typeof STATE_ILLUSTRATIONS;

export function StateIllustration({
  name,
  ...props
}: { name: StateIllustrationName } & SVGProps<SVGSVGElement>) {
  const Figure = STATE_ILLUSTRATIONS[name];
  return <Figure {...props} />;
}
