/*
  The wordmark is fixed to one family and one accent in both themes: it is a
  mark rather than interface text, so it does not follow the typeface roles or
  the surface tokens. `font-brand` is its own theme entry for that reason, and
  the feature settings inherited from body are switched off because those tags
  name different alternates in Nunito than in the interface sans.
*/
const WORDMARK = 'font-brand font-extrabold [font-feature-settings:normal]';

/** The check follows app/icon.svg; the wordmark is independent of UI themes. */
export function Brand() {
  return (
    <span
      className={`${WORDMARK} text-meta inline-flex flex-none items-center gap-0.75 rounded-full bg-teal-600 py-0.75 pr-3.75 pl-1.25 leading-6.5 tracking-[0.125em] whitespace-nowrap text-white uppercase forced-colors:border forced-colors:border-[CanvasText]`}
      aria-label="Safepoint"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        fill="none"
        className="size-6.5 flex-none"
      >
        <path
          d="M10 16.5l4 4 8-8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span aria-hidden="true">Safepoint</span>
    </span>
  );
}

/** Alternative lockup: the same check set in a rounded square, wordmark beside it. */
export function BrandSquare() {
  return (
    <span
      className={`${WORDMARK} text-primary inline-flex flex-none items-center gap-2.25 text-[15px] leading-none tracking-[0.02em] whitespace-nowrap`}
      aria-label="Safepoint"
    >
      <span
        className="grid size-6.5 flex-none place-items-center rounded-lg bg-teal-600 text-white forced-colors:border forced-colors:border-[CanvasText]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 32" fill="none" className="size-6">
          <path
            d="M10 16.5l4 4 8-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span aria-hidden="true" className="text-teal-950">
        Safepoint
      </span>
    </span>
  );
}
