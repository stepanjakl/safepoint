const ROTATIONAL_PATHS = {
  'balanced-radial':
    'M503 75C522 75 537 81 553 92L700 194C729 214 744 241 744 275V373C744 398 735 416 714 430L579 517C567 525 556 526 546 521C533 515 527 504 527 489V282C527 267 517 258 503 258C489 258 479 267 479 282V489C479 504 473 515 460 521C450 526 439 525 427 517L292 430C271 416 262 398 262 373V275C262 241 277 214 306 194L453 92C469 81 484 75 503 75Z',
  'soft-radial':
    'M503 75C532 75 550 88 574 105L687 183C723 208 741 238 741 279V360C741 392 732 411 706 428L590 503C572 515 559 518 549 512C538 506 535 496 535 479V290C535 269 524 256 503 256C482 256 471 269 471 290V479C471 496 468 506 457 512C447 518 434 515 416 503L300 428C274 411 265 392 265 360V279C265 238 283 208 319 183L432 105C456 88 474 75 503 75Z',
};

export type BiomorphicVariant = keyof typeof ROTATIONAL_PATHS;

export function BiomorphicSymbol({
  variant,
  className,
}: {
  variant: BiomorphicVariant;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      focusable="false"
      viewBox="-73 14 1152 1152"
    >
      {/* The square frame shares the rotation centre; 590 keeps the lobes apart. */}
      {[0, 120, 240].map((rotation) => (
        <path
          key={rotation}
          d={ROTATIONAL_PATHS[variant]}
          transform={`rotate(${rotation} 503 590)`}
        />
      ))}
    </svg>
  );
}
