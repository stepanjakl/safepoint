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
  const body = `${id}-body`;
  return (
    <span className="assistant-mark relative grid">
      <svg aria-hidden width={size} height={size} viewBox="0 0 25 24">
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
          <clipPath id={eyes} clipPathUnits="userSpaceOnUse">
            <rect x="8" y="6" width="4" height="5" />
            <rect x="14" y="6" width="4" height="5" />
          </clipPath>
          {/* Hide the original eyes so only the blinking copy paints them. */}
          <mask
            id={body}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="25"
            height="24"
          >
            <rect width="25" height="24" fill="white" />
            <rect x="8" y="6" width="4" height="5" fill="black" />
            <rect x="14" y="6" width="4" height="5" fill="black" />
          </mask>
        </defs>
        <g mask={`url(#${body})`}>
          <Robot
            width={25}
            height={24}
            style={{ fill: `url(#${fill})` }}
            className="assistant-mark-glyph"
          />
        </g>
        <g className="assistant-mark-eyes">
          <g clipPath={`url(#${eyes})`}>
            <Robot
              width={25}
              height={24}
              style={{ fill: 'inherit' }}
              className="assistant-mark-glyph"
            />
          </g>
        </g>
      </svg>
    </span>
  );
}
