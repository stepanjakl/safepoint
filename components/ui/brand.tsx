/** The check follows app/icon.svg; the wordmark is independent of UI themes. */
export function Brand() {
  return (
    <span className="safepoint-brand" aria-label="Safepoint">
      <svg aria-hidden="true" viewBox="0 0 32 32" fill="none">
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
