'use client';

import { useEffect } from 'react';

/*
  The mark's three petals let go and light again one after another, clockwise
  from the top, so the light travels round without ever resetting. It starts
  whole, as the resting icon is, and empties from there. Each frame lists
  which petals are lit, in the order the mark draws them.
*/
const FRAMES = [
  [true, true, true],
  [false, true, true],
  [false, false, true],
  [false, false, false],
  [true, false, false],
  [true, true, false],
];
const FRAME_MS = 280;
// An unlit petal is still there, faintly, so the mark keeps its shape.
const RESTING = 0.3;

/*
  While a run is working, the tab's icon lights its petals in turn, so a run
  left playing in another tab still shows it is alive. Browsers do not
  animate an SVG favicon, so each frame is drawn and swapped in; a hidden
  tab's timers slow this to about a frame a second, which still reads. The
  original icon is put back when the run stops, and nothing moves under
  reduced motion.
*/
export function useWorkingFavicon(working: boolean) {
  useEffect(() => {
    if (!working || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;
    const original = link.href;
    let timer = 0;
    let stopped = false;
    void fetch(original)
      .then((response) => response.text())
      .then((svg) => {
        if (stopped) return;
        const petals = svg.match(/<path\b[\s\S]*?\/>/g);
        if (!petals || petals.length !== 3) return;
        const head = svg.slice(0, svg.indexOf(petals[0]!));
        const tail = svg.slice(svg.lastIndexOf(petals[2]!) + petals[2]!.length);
        let frame = 0;
        const draw = () => {
          const lit = FRAMES[frame % FRAMES.length]!;
          frame += 1;
          const body = petals
            .map((petal, index) =>
              petal.replace(
                '<path',
                `<path fill-opacity="${lit[index] ? 1 : RESTING}"`,
              ),
            )
            .join('');
          link.href = `data:image/svg+xml,${encodeURIComponent(head + body + tail)}`;
        };
        draw();
        timer = window.setInterval(draw, FRAME_MS);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      clearInterval(timer);
      link.href = original;
    };
  }, [working]);
}
