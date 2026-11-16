import 'server-only';

/*
  Where the gate page is, and where a person goes once they are through. The
  target arrives in a query string anyone can write, so it is only ever a path
  on this site: anything that parses to another origin, however it is dressed,
  becomes the home page.
*/
export const GATE_PATH = '/access';
export const RETURN_PARAM = 'next';

const HOME = '/';
const MAX_LENGTH = 2048;
// Never read as a place: a base only to resolve a path against.
const BASE = 'http://safepoint.invalid';

export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH)
    return HOME;
  // A path, not "//host" (protocol-relative) or "/\host", which browsers read
  // as the same; and no control characters, which URL parsing strips from
  // inside a scheme or a slash pair and so can rebuild either.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\'))
    return HOME;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return HOME;
  let parsed: URL;
  try {
    parsed = new URL(raw, BASE);
  } catch {
    return HOME;
  }
  if (parsed.origin !== BASE) return HOME;
  // Back to the gate would be a loop with nothing in it.
  if (
    parsed.pathname === GATE_PATH ||
    parsed.pathname.startsWith(`${GATE_PATH}/`)
  )
    return HOME;
  return `${parsed.pathname}${parsed.search}`;
}

// The gate page, asking to be returned to `target` afterwards.
export function gateLocation(target: string): string {
  const safe = safeReturnPath(target);
  return safe === HOME
    ? GATE_PATH
    : `${GATE_PATH}?${RETURN_PARAM}=${encodeURIComponent(safe)}`;
}
