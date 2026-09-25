'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/*
  Live readings of what the page paints. Every figure is taken from the
  rendered colour through a 1px canvas, so oklab(), color(display-p3 …) and
  color-mix() all measure alike, and every figure re-reads when the theme or
  the neutral family changes on <html>.
*/

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-neutral', 'style'],
  });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', onChange);
  };
}

/* A token that changes whenever the theme or family does. */
function useThemeKey() {
  return useSyncExternalStore(
    subscribeToTheme,
    () => {
      const root = document.documentElement;
      return `${root.dataset.theme ?? ''}|${root.dataset.neutral ?? ''}|${window.matchMedia('(prefers-color-scheme: dark)').matches}`;
    },
    () => 'server',
  );
}

let canvas: CanvasRenderingContext2D | null = null;
function rgb(element: Element, colour: string): [number, number, number] {
  canvas ??= document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true })!;
  const probe = element as HTMLElement;
  const before = probe.style.color;
  probe.style.color = colour;
  const resolved = getComputedStyle(probe).color;
  probe.style.color = before;
  canvas.clearRect(0, 0, 1, 1);
  canvas.fillStyle = resolved;
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

function luminance([r, g, b]: [number, number, number]) {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

const hex = (channels: [number, number, number]) =>
  `#${channels.map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const css = (token: string) =>
  token.startsWith('--') ? `var(${token})` : token;

/** A swatch of one token, labelled with its painted value. */
export function Swatch({ token, label }: { token: string; label?: string }) {
  const probe = useRef<HTMLSpanElement>(null);
  const key = useThemeKey();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (probe.current) setValue(hex(rgb(probe.current, css(token))));
  }, [token, key]);
  return (
    <figure className="grid gap-1">
      <span
        ref={probe}
        className="border-rule-faint rounded-section block h-10 border"
        style={{ background: css(token) }}
      />
      <figcaption className="text-micro grid">
        <span className="text-primary truncate">{label ?? token}</span>
        <span className="value text-muted">{value || '…'}</span>
      </figcaption>
    </figure>
  );
}

/**
 * A sample of `fg` on `bg`, with its contrast and whether it clears `floor`.
 * `kind` decides how the sample is drawn: text, or a line across the face.
 */
export function Pair({
  fg,
  bg,
  floor,
  kind = 'text',
  label,
}: {
  fg: string;
  bg: string;
  floor: number;
  kind?: 'text' | 'line';
  label?: string;
}) {
  const probe = useRef<HTMLSpanElement>(null);
  const key = useThemeKey();
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!probe.current) return;
    const a = luminance(rgb(probe.current, css(fg)));
    const b = luminance(rgb(probe.current, css(bg)));
    setRatio((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
  }, [fg, bg, key]);
  const passes = ratio !== null && ratio >= floor;
  return (
    <div
      className="rounded-section grid gap-1.5 p-2.5"
      style={{ background: css(bg) }}
    >
      <span ref={probe} hidden />
      {kind === 'text' ? (
        <span className="text-meta" style={{ color: css(fg) }}>
          {label ?? fg}
        </span>
      ) : (
        <span className="grid gap-1">
          <span className="block h-px" style={{ background: css(fg) }} />
          <span
            className="text-micro"
            style={{ color: 'var(--sp-text-muted)' }}
          >
            {label ?? fg}
          </span>
        </span>
      )}
      <span className="value text-micro flex items-center gap-1.5">
        <span
          className={
            ratio === null
              ? 'text-muted'
              : passes
                ? 'text-state-verified'
                : 'text-state-blocked'
          }
        >
          {ratio === null ? '…' : `${ratio.toFixed(2)}:1`}
        </span>
        <span className="text-muted">floor {floor}</span>
      </span>
    </div>
  );
}
