'use client';

import { useId } from 'react';
// Deep import: Blode's barrel is the whole icon library.
import Robot from 'blode-icons-react/icons/cute-robot-filled';

/*
  The assistant's robot, the glyph itself, coloured by where each part sits
  in it. The gradient runs top to bottom in the glyph's own 25×24 frame, so
  its stops land on the parts: the antenna above y 3, then one fade from the
  head down through the arms and body. A second copy, clipped to the eyes' boxes, gives them
  a colour of their own. Colours in assistant-panel.css.
*/
export function AssistantMark({ size = 28 }: { size?: number }) {
  const id = useId();
  const fill = `${id}-fill`;
  const eyes = `${id}-eyes`;
  return (
    <span className="assistant-mark relative grid">
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <linearGradient
            id={fill}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="1"
            x2="0"
            y2="22"
          >
            {/* y 1–3: the antenna. */}
            <stop offset="0" className="assistant-mark-antenna" />
            <stop offset="0.09" className="assistant-mark-antenna" />
            {/* y 3–22: one fade from the head's violet, through the neck,
                into the body's cyan, so no band marks where they meet. */}
            <stop offset="0.1" className="assistant-mark-head-top" />
            <stop offset="0.45" className="assistant-mark-head-bottom" />
            <stop offset="1" className="assistant-mark-body-bottom" />
          </linearGradient>
          {/* The eyes' boxes, a little past each, in the glyph's frame. */}
          <clipPath id={eyes} clipPathUnits="objectBoundingBox">
            <rect x="0.33" y="0.27" width="0.12" height="0.17" />
            <rect x="0.57" y="0.27" width="0.12" height="0.17" />
          </clipPath>
        </defs>
      </svg>
      <Robot
        aria-hidden
        size={size}
        style={{ fill: `url(#${fill})` }}
        className="assistant-mark-glyph col-start-1 row-start-1"
      />
      <Robot
        aria-hidden
        size={size}
        style={{ clipPath: `url(#${eyes})` }}
        className="assistant-mark-glyph assistant-mark-eyes col-start-1 row-start-1"
      />
    </span>
  );
}
