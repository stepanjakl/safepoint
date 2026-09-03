import type { SVGProps } from 'react';

export type GlyphName =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'struck'
  | 'dash'
  | 'diamond'
  | 'dotted'
  | 'check'
  | 'cross'
  | 'minus';

/*
  Small state glyphs drawn in currentColor. Shape carries meaning so that
  colour is never the only signal.
*/
export function Glyph({
  name,
  size = 12,
  ...props
}: { name: GlyphName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}

const shapes: Record<GlyphName, React.ReactNode> = {
  circle: <circle cx="6" cy="6" r="4" fill="currentColor" stroke="none" />,
  triangle: (
    <path d="M6 1.75 10.75 10.25H1.25Z" fill="currentColor" stroke="none" />
  ),
  square: (
    <rect x="2" y="2" width="8" height="8" fill="currentColor" stroke="none" />
  ),
  struck: (
    <>
      <circle cx="6" cy="6" r="4.25" />
      <path d="M3 9 9 3" />
    </>
  ),
  dash: <path d="M2 6h8" strokeWidth="2" />,
  diamond: <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" />,
  dotted: <circle cx="6" cy="6" r="4.25" strokeDasharray="1.6 1.6" />,
  check: <path d="M2.5 6.5 5 9l4.5-6" />,
  cross: <path d="M3 3l6 6M9 3l-6 6" />,
  minus: <path d="M3 6h6" />,
};
