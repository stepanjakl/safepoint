'use client';

import { useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { pacedDuration } from '@/lib/motion';
import { motionTime } from '@/lib/motion-time';

/*
  The sheet's frame -- each section's head band and the divider between its
  columns -- holding still through a tab swap and moving to where the next
  section has them, rather than fading out and back in with the content.

  The old content fades out with the frame held. The next section is then
  shown but unseen, its entrances paused, so its frame can be read as laid
  out. The frame moves in one step: the line and the bands beside it to their
  places, while a band the next section adds drops in from above and one it
  has no place for rises away. Then the section comes in -- its list, and its
  detail a beat after (--detail-after).

  Drawn for the swap only, on an overlay under the sections (.sheet-chrome),
  from what the sections themselves lay out: no width is restated here, so a
  breakpoint or a token moving cannot leave it behind. While it is drawn the
  sections' own frame is transparent; it is handed back once the overlay has
  landed on it, so the two never differ.
*/
type Box = { left: number; top: number; width: number; height: number };
// A band's paint, copied as it is computed: the bands differ by place -- the
// one at the pane's edge takes the notch's corner, the narrow runs strip has
// no face -- and the overlay must match each exactly to hand back unseen. The
// lit line is not copied: the overlay band always draws it (runs-list.css).
const PAINT = [
  'background-color',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'border-top-left-radius',
  'border-top-right-radius',
] as const;
const TITLE_PAINT = [
  'font-family',
  'font-size',
  'font-weight',
  'font-feature-settings',
  'letter-spacing',
  'line-height',
  'text-transform',
  'color',
] as const;
type Title = {
  text: string;
  left: number;
  top: number;
  paint: Record<string, string>;
};
type TitleView = { host: HTMLElement; text: string };
type Band = Box & {
  paint: Record<(typeof PAINT)[number], string>;
  title: Title | null;
};
type Frame = { bands: Band[]; dividers: number[] };

// The overlay's own transitions normally end it; this covers a missed end.
// Timers here run at the motion's pace (motionTime), as slowed playback does.
const END_FALLBACK_MS = 3000;
// The most the next section stays unseen should the frame never report
// landing: it then comes in regardless.
const SHOW_CEILING_MS = 1000;

const LAYERS = ':scope > .process-sheet-swap';

function visibleLayer(frame: HTMLElement): HTMLElement | null {
  return (
    [...frame.querySelectorAll<HTMLElement>(LAYERS)].find(
      (layer) => getComputedStyle(layer).display !== 'none',
    ) ?? null
  );
}

// The bands across the top of a section, left to right, and the divider
// beside its list where the list has a column of its own. Read with the
// section's own frame showing: while it is lent out it paints nothing.
function measure(frame: HTMLElement, layer: HTMLElement): Frame {
  const lent = 'chromeBorrowed' in frame.dataset;
  if (lent) {
    // Without its transitions, so the brief return animates nothing.
    frame.dataset.chromeReturning = '';
    delete frame.dataset.chromeBorrowed;
  }
  const origin = frame.getBoundingClientRect();
  const top = layer.getBoundingClientRect();
  const bands = [...layer.querySelectorAll<HTMLElement>('.sheet-head')]
    .map((band) => ({ box: band.getBoundingClientRect(), band }))
    // A detail may still be rising into place: its band counts, and is aimed
    // at where it settles, the section's top.
    .filter(
      ({ box }) =>
        box.width > 0 && Math.abs(box.top - top.top) < box.height / 2,
    )
    .map(({ box, band }) => {
      const style = getComputedStyle(band);
      const label = band.querySelector<HTMLElement>('[data-section-title]');
      const labelBox = label?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      return {
        left: box.left - origin.left,
        top: top.top - origin.top,
        width: box.width,
        height: box.height,
        paint: Object.fromEntries(
          PAINT.map((name) => [name, style.getPropertyValue(name)]),
        ) as Band['paint'],
        title:
          label && labelBox && labelStyle
            ? {
                text: label.dataset.sectionTitle ?? label.textContent ?? '',
                left: labelBox.left - box.left,
                top: labelBox.top - box.top,
                paint: Object.fromEntries(
                  TITLE_PAINT.map((name) => [
                    name,
                    labelStyle.getPropertyValue(name),
                  ]),
                ),
              }
            : null,
      };
    })
    .sort((a, b) => a.left - b.left);
  const list = [
    ...layer.querySelectorAll<HTMLElement>(
      '.process-runs-list, .process-panel-list',
    ),
  ]
    .map((column) => column.getBoundingClientRect())
    .find((box) => box.width > 0);
  const dividers =
    list && list.right < top.right - 2 && Math.abs(list.top - top.top) < 2
      ? [list.right - 1 - origin.left]
      : [];
  if (lent) {
    frame.dataset.chromeBorrowed = '';
    requestAnimationFrame(() => delete frame.dataset.chromeReturning);
  }
  return { bands, dividers };
}

/*
  A band's paint as it sets off. A corner it is losing -- leaving the pane's
  edge and the notch's curve -- goes at once, or it would cut into the band
  on the way; one it is gaining waits until it is there (after the move), or
  it would cut in mid-width.
*/
function setOff({ paint }: Band): Band['paint'] {
  return Object.fromEntries(
    Object.entries(paint).filter(
      ([name, value]) => !name.endsWith('-radius') || parseFloat(value) === 0,
    ),
  ) as Band['paint'];
}

function place(element: HTMLElement, box: Partial<Band>, opacity: number) {
  for (const side of ['left', 'top', 'width', 'height'] as const) {
    const value = box[side];
    if (value !== undefined) element.style.setProperty(side, `${value}px`);
  }
  for (const [name, value] of Object.entries(box.paint ?? {}))
    element.style.setProperty(name, value);
  element.style.opacity = String(opacity);
}

function band(box: Band) {
  const element = document.createElement('div');
  element.className = 'sheet-chrome-band';
  place(element, box, 1);
  return element;
}

function divider(left: number) {
  const element = document.createElement('div');
  element.className = 'sheet-chrome-divider';
  place(element, { left }, 1);
  return element;
}

// What is still on the overlay: a part rising away or fading out is on its
// way off. Not data-leaving: a global rule (draft-progress.css) animates that.
const staying = (host: HTMLElement, kind: string) => [
  ...host.querySelectorAll<HTMLElement>(`.${kind}:not([data-chrome-leaving])`),
];
const lines = (host: HTMLElement) => staying(host, 'sheet-chrome-divider');

// Where a band sits out of sight: its own height above where it is.
const above = (top: number, height: number) => top - height;

/* One overlay's swap (see above). */
class SheetChrome {
  // The key whose frame was taken, and how far the swap has come.
  swap: { of: string; revealed: boolean } | null = null;
  private overlayLanded = false;
  private sectionLanded = false;
  private timers: number[] = [];
  private frames: number[] = [];
  private titles = new Map<HTMLElement, TitleView>();

  constructor(
    private host: HTMLElement,
    private frame: HTMLElement,
    private onTitles: (titles: TitleView[]) => void,
  ) {}

  private title(element: HTMLElement, title: Title | null) {
    if (!title) {
      this.titles.get(element)?.host.remove();
      this.titles.delete(element);
      return;
    }
    let view = this.titles.get(element);
    if (!view) {
      const host = document.createElement('span');
      host.className = 'sheet-chrome-title';
      element.append(host);
      view = { host, text: title.text };
      this.titles.set(element, view);
    }
    view.text = title.text;
    view.host.style.left = `${title.left}px`;
    view.host.style.top = `${title.top}px`;
    for (const [name, value] of Object.entries(title.paint))
      view.host.style.setProperty(name, value);
  }

  // The old section starts to go: its frame is taken onto the overlay.
  hold(of: string) {
    if (this.swap) this.release();
    const layer = visibleLayer(this.frame);
    const drawn = layer ? measure(this.frame, layer) : null;
    if (!drawn || (!drawn.bands.length && !drawn.dividers.length)) return;
    this.swap = { of, revealed: false };
    // Lines under bands, which are opaque: a band beside the line covers its
    // lit side where it lies, as the detail's own band covers the column
    // edge (.sheet-column-edge), and the rest of the line stays lit.
    this.host.replaceChildren(
      ...drawn.dividers.map((left) => divider(left)),
      ...drawn.bands.map((box) => band(box)),
    );
    staying(this.host, 'sheet-chrome-band').forEach((element, index) =>
      this.title(element, drawn.bands[index]!.title),
    );
    this.onTitles([...this.titles.values()].map((view) => ({ ...view })));
    this.frame.dataset.chromeBorrowed = '';
  }

  /*
    The next section is shown, unseen and paused: once its frame has been
    read and the overlay has moved onto it, `show` lets it come in. Returns
    whether there is a swap to answer for; where there is not, the caller
    shows the section itself.
  */
  reveal(shown: string, show: () => void) {
    const swap = this.swap;
    if (!swap || swap.of === shown) return false;
    if (swap.revealed) return true;
    swap.revealed = true;
    this.frame.dataset.chromeStaging = '';
    let shownYet = false;
    const go = () => {
      if (shownYet) return;
      shownYet = true;
      delete this.frame.dataset.chromeStaging;
      show();
    };
    this.timers.push(window.setTimeout(go, motionTime(SHOW_CEILING_MS)));
    this.timers.push(
      window.setTimeout(() => this.release(), motionTime(END_FALLBACK_MS)),
    );
    // A detail opened as the section lands is laid out by the next frame.
    this.frames.push(
      requestAnimationFrame(async () => {
        const layer = visibleLayer(this.frame);
        if (this.swap !== swap || !layer) return go();
        await this.move(measure(this.frame, layer));
        if (this.swap !== swap) return;
        go();
        this.overlayLanded = true;
        void this.handBack();
      }),
    );
    return true;
  }

  // The section now shown has finished coming in.
  landed() {
    if (!this.swap?.revealed) return;
    this.sectionLanded = true;
    void this.handBack();
  }

  // A quick return to the section still on screen: its own frame is back.
  cancel(shown: string) {
    if (this.swap?.of === shown && !this.swap.revealed) this.release();
  }

  // The overlay goes once the section's own frame shows in full: its list
  // has landed, and so has its detail, which holds the band beside the line.
  private async handBack() {
    const swap = this.swap;
    if (!swap || !this.overlayLanded || !this.sectionLanded) return;
    const details = visibleLayer(this.frame)?.querySelectorAll(
      '[data-detail-held]',
    );
    await Promise.allSettled(
      [
        ...this.host.getAnimations({ subtree: true }),
        ...[...(details ?? [])].flatMap((detail) => detail.getAnimations()),
      ].map((motion) => motion.finished),
    );
    if (this.swap === swap) this.release();
  }

  /*
    The frame's one step. The bands it keeps move and size to the next
    frame's, and the line goes where that frame has it -- in from the far
    edge where there was none, out to it where there will be none. At the
    same time a band past the next frame's count rises away, and one the
    next frame adds drops in, at a band's own pace (data-chrome-pace) -- or,
    where a band already lies there, the line divides it or joins it up and
    nothing rises or drops. A band beside the line keeps its edge on the line
    all the way, as the first band does on its other side.
  */
  private async move(to: Frame) {
    const { host, frame } = this;
    const { width } = frame.getBoundingClientRect();
    const bands = staying(host, 'sheet-chrome-band');
    const dividers = lines(host);
    const kept = bands.slice(0, to.bands.length);
    const going = bands.slice(to.bands.length);
    // Where the line is and will be; the far edge where there is none.
    const lineFrom = dividers[0] ? parseFloat(dividers[0].style.left) : width;
    const lineTo = to.dividers[0] ?? width;
    // A band whose edge is on the line, from that edge to a fixed far end.
    const fromLine = (line: number, end: number) => {
      const left = Math.min(line + 1, end);
      return { left, width: end - left };
    };
    const arrivingLines = to.dividers.slice(dividers.length).map((left) => {
      const element = divider(width);
      place(element, { left: width }, 0);
      host.prepend(element);
      return [element, left] as const;
    });
    // Where a band already lies, one that arrives or goes there is not a band
    // coming or going but the same face divided or joined by the line: it
    // stays level and only its edge moves, with the line.
    const spans = (
      from: { left: number; width: number }[],
      left: number,
      end: number,
    ) =>
      from.some(
        (box) => box.left <= left + 2 && box.left + box.width >= end - 2,
      );
    const before = bands.map((element) => ({
      left: parseFloat(element.style.left),
      width: parseFloat(element.style.width),
    }));
    const added = to.bands.slice(bands.length).map((box) => {
      const element = band(box);
      const onLine = Math.abs(box.left - (lineTo + 1)) < 2;
      const split = spans(before, box.left, box.left + box.width);
      if (!split) element.dataset.chromePace = 'band';
      place(
        element,
        {
          top: split ? box.top : above(box.top, box.height),
          ...(onLine ? fromLine(lineFrom, box.left + box.width) : {}),
        },
        1,
      );
      host.append(element);
      return [element, box] as const;
    });
    const joined = new Set(
      going.filter((element) => {
        const left = parseFloat(element.style.left);
        return spans(to.bands, left, left + parseFloat(element.style.width));
      }),
    );
    for (const element of going)
      if (!joined.has(element)) element.dataset.chromePace = 'band';

    // The line crosses at a pace set by how far it goes, and every edge on
    // it with it (--chrome-travel).
    host.style.setProperty(
      '--chrome-travel',
      `${Math.round(pacedDuration(host, 'travel', lineTo - lineFrom))}ms`,
    );
    // Everything is in its starting place before the transitions apply.
    void host.offsetWidth;
    host.dataset.moving = '';
    kept.forEach((element, index) => {
      const box = to.bands[index]!;
      this.title(element, box.title);
      place(element, { ...box, paint: setOff(box) }, 1);
    });
    for (const element of going) {
      const top = parseFloat(element.style.top);
      const left = parseFloat(element.style.left);
      const end = left + parseFloat(element.style.width);
      const onLine = Math.abs(left - (lineFrom + 1)) < 2;
      place(
        element,
        {
          top: joined.has(element)
            ? top
            : above(top, parseFloat(element.style.height)),
          ...(onLine ? fromLine(lineTo, end) : {}),
        },
        1,
      );
      element.dataset.chromeLeaving = '';
    }
    for (const [element, box] of added) {
      this.title(element, box.title);
      place(element, box, 1);
    }
    this.onTitles([...this.titles.values()].map((view) => ({ ...view })));
    dividers.forEach((element, index) => {
      const left = to.dividers[index];
      place(element, { left: left ?? width }, left === undefined ? 0 : 1);
      if (left === undefined) element.dataset.chromeLeaving = '';
    });
    for (const [element, left] of arrivingLines) place(element, { left }, 1);

    // Its own transitions only: anything else running in there is not this
    // step's to wait for.
    await Promise.allSettled(
      host
        .getAnimations({ subtree: true })
        .filter((motion) => motion instanceof CSSTransition)
        .map((motion) => motion.finished),
    );
    for (const element of host.querySelectorAll<HTMLElement>(
      '[data-chrome-leaving]',
    )) {
      this.titles.delete(element);
      element.remove();
    }
    this.onTitles([...this.titles.values()].map((view) => ({ ...view })));
    // A corner the band gains comes now it has landed (setOff).
    kept.forEach((element, index) =>
      place(element, { paint: to.bands[index]!.paint }, 1),
    );
  }

  release() {
    const { host, frame } = this;
    this.swap = null;
    this.overlayLanded = false;
    this.sectionLanded = false;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.frames.forEach((id) => cancelAnimationFrame(id));
    this.timers = [];
    this.frames = [];
    this.titles.clear();
    this.onTitles([]);
    host.replaceChildren();
    delete host.dataset.moving;
    delete frame.dataset.chromeStaging;
    if (!('chromeBorrowed' in frame.dataset)) return;
    // The sections' own frame comes back as it is, without its transitions.
    frame.dataset.chromeReturning = '';
    delete frame.dataset.chromeBorrowed;
    requestAnimationFrame(() => delete frame.dataset.chromeReturning);
  }
}

/*
  Drives the swap's gate: `onShow` names the section shown once its frame is
  in place, so it may come in -- at once where there is no frame to move.
*/
export function useSheetChrome<K extends string>(
  overlay: RefObject<HTMLDivElement | null>,
  {
    shown,
    incoming,
    settled,
    onShow,
  }: {
    shown: K;
    incoming: K | null;
    // The section shown has finished its own entrance.
    settled: boolean;
    onShow: (key: K) => void;
  },
) {
  const reduceMotion = useReducedMotion();
  const chrome = useRef<SheetChrome | null>(null);
  const [titles, setTitles] = useState<TitleView[]>([]);

  useLayoutEffect(() => {
    const host = overlay.current;
    const frame = host?.parentElement;
    if (!host || !frame || reduceMotion) return;
    chrome.current ??= new SheetChrome(host, frame, setTitles);
    if (incoming !== null) chrome.current.hold(shown);
    else chrome.current.cancel(shown);
    // Once per swap, as it starts: `shown` is the section going.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming, overlay, reduceMotion]);

  useLayoutEffect(() => {
    if (!chrome.current?.reveal(shown, () => onShow(shown))) onShow(shown);
    // Each section shown is revealed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useLayoutEffect(() => {
    if (settled) chrome.current?.landed();
  }, [settled]);

  // Leaving the process mid-swap leaves nothing lent out.
  useLayoutEffect(() => () => chrome.current?.release(), []);
  return titles;
}
