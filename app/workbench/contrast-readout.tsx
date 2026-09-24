'use client';

import { useEffect, useRef, useState } from 'react';

/* The tokens each readout measures, in the order they are shown. */
const STOPS = [
  ['top', 'face-top'],
  ['bottom', 'face-bottom'],
  ['hover', 'face-top-hover'],
] as const;

/* The painted sRGB colour of any CSS colour string, via a 1px canvas, so
   oklab(), color(display-p3 …) and color-mix() all measure alike. */
function srgb(context: CanvasRenderingContext2D, colour: string) {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

function luminance([r, g, b]: number[]) {
  const [lr, lg, lb] = [r!, g!, b!].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

/** White-label contrast on a family's face stops, read from the page. */
export function ContrastReadout({ family }: { family: 'accent' | 'commit' }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [ratios, setRatios] = useState<string[]>([]);

  useEffect(() => {
    const element = probe.current;
    const context = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true });
    if (!element || !context) return;
    setRatios(
      STOPS.map(([, token]) => {
        element.style.color = `var(--sp-${family}-${token})`;
        const colour = getComputedStyle(element).color;
        return (1.05 / (luminance(srgb(context, colour)) + 0.05)).toFixed(2);
      }),
    );
  }, [family]);

  return (
    <span className="value">
      <span ref={probe} hidden />
      {ratios.length === 0
        ? '…'
        : STOPS.map(([label], index) => `${label} ${ratios[index]}`).join(
            ' · ',
          )}
    </span>
  );
}
