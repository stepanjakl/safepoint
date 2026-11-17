import 'server-only';

/*
  What every signed cookie here shares: base64url(JSON body) "."
  base64url(HMAC-SHA-256 of that text). Web Crypto only, so it runs wherever
  the proxy does; verification goes through crypto.subtle.verify, which
  compares in constant time. Nothing here throws on a bad value: it is simply
  not a cookie of ours. What the body means -- fields, version, lifetime -- is
  for each cookie to check.
*/

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

const importKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );

export async function signBody(
  body: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(body)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(secret, 'sign'),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

// The body of a value whose signature holds, or null.
export async function verifiedBody(
  value: string | null | undefined,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts as [string, string];
    const given = fromBase64Url(signature);
    if (given === null) return null;
    const signed = await crypto.subtle.verify(
      'HMAC',
      await importKey(secret, 'verify'),
      given,
      encoder.encode(payload),
    );
    if (!signed) return null;
    const bytes = fromBase64Url(payload);
    if (bytes === null) return null;
    const body: unknown = JSON.parse(decoder.decode(bytes));
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// The value of one cookie in a Cookie header, or null.
export function cookieValue(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at !== -1 && part.slice(0, at).trim() === name)
      return part.slice(at + 1).trim();
  }
  return null;
}
