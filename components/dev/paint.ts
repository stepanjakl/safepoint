/*
  What a colour paints as, read back through a 1px canvas, so oklab(),
  color(display-p3 …), color-mix() and light-dark() all come out as the same
  8-bit sRGB the screen shows. Shared by /workbench and the style inspector.
*/

export type Channels = [r: number, g: number, b: number, a: number];

let canvas: CanvasRenderingContext2D | null = null;

/**
 * The channels `colour` paints as when set on `probe` -- which resolves
 * var(), currentColor and light-dark() in that element's context -- or null
 * when `colour` is not a colour at all.
 */
export function paint(probe: HTMLElement, colour: string): Channels | null {
  const before = probe.style.color;
  probe.style.color = '';
  probe.style.color = colour;
  if (!probe.style.color) {
    probe.style.color = before;
    return null;
  }
  const resolved = getComputedStyle(probe).color;
  probe.style.color = before;
  canvas ??= document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true })!;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = resolved;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!, a!];
}

/** `#rrggbb`, `#rrggbbaa` when the colour is not opaque, or `transparent`. */
export const hex = ([r, g, b, a]: Channels) =>
  a === 0
    ? 'transparent'
    : `#${(a === 255 ? [r, g, b] : [r, g, b, a])
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')}`;
