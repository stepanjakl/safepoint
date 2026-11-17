import 'server-only';

import { isLocalDevelopment } from '@/lib/dev/dev-route';

import { isApi, isOpen } from './decision';
import {
  VISITOR_COOKIE,
  newVisitor,
  readVisitor,
  signVisitor,
  visitorCookieOptions,
  visitorSecret,
} from './visitor';

export type IssuedVisitor = {
  name: string;
  value: string;
  options: ReturnType<typeof visitorCookieOptions>;
};

// A file, not a page: no page here has an extension.
const isAsset = (pathname: string) => /\.[A-Za-z0-9]+$/.test(pathname);

/*
  A visitor cookie to set on this request's response, or null when it needs
  none: not a page (an API call, a static asset, a path the gate leaves open),
  one already carried and valid, or no key to sign with. It answers nothing
  about access; the proxy adds it to whatever response the gate gave.
*/
export async function visitorToIssue(
  request: Request,
): Promise<IssuedVisitor | null> {
  const url = new URL(request.url);
  if (isOpen(url.pathname) || isApi(url.pathname) || isAsset(url.pathname))
    return null;
  const local = isLocalDevelopment(url);
  const secret = visitorSecret(local);
  if (secret === null || (await readVisitor(request, secret)) !== null)
    return null;
  return {
    name: VISITOR_COOKIE,
    value: await signVisitor(newVisitor(), secret),
    options: visitorCookieOptions(!local),
  };
}
