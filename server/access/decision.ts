import 'server-only';

import { gateApplies } from '@/lib/dev/dev-route';

import { accessConfig, NOT_CONFIGURED_MESSAGE, publicAccess } from './config';
import { GATE_PATH, gateLocation } from './return-path';
import { readSession } from './session';

/*
  What the request proxy does with a request, apart from how it is answered:
  kept here so a test can ask it with a constructed Request.
*/
export type AccessDecision =
  | { kind: 'pass' }
  // A page, sent to the gate page with where it was going.
  | { kind: 'sign-in'; location: string }
  // An API call, told so as JSON rather than redirected.
  | { kind: 'unauthorized' }
  | { kind: 'unconfigured'; message: string };

/*
  The paths the gate lets through, and why. The proxy's matcher (/proxy.ts)
  names the same ones, so most of these never reach it; this is the
  authority, and a direct call to the proxy is held to it.

  - /_next/: the build's scripts, styles, fonts and images. They hold no data,
    and the gate page needs them to render at all.
  - /icon.svg: the tab icon, which a browser asks for before anyone signs in.
  - /.well-known/workflow/: Vercel Workflow's internal queue routes. They carry
    their own authentication and break if a proxy intercepts their POST
    bodies.
*/
const OPEN_PREFIXES = ['/_next/', '/.well-known/workflow/'];
const OPEN_PATHS = ['/icon.svg'];

export const isOpen = (pathname: string) =>
  OPEN_PATHS.includes(pathname) ||
  OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const isApi = (pathname: string) =>
  pathname === '/api' || pathname.startsWith('/api/');

export async function decideAccess(request: Request): Promise<AccessDecision> {
  const url = new URL(request.url);
  if (!gateApplies(url) || isOpen(url.pathname)) return { kind: 'pass' };

  // A public deployment lets every page through; its procedures ask for the
  // visitor cookie themselves.
  const open = publicAccess();
  if (open === 'public') return { kind: 'pass' };
  if (open === 'unconfigured')
    return { kind: 'unconfigured', message: NOT_CONFIGURED_MESSAGE };

  // Before anything else is read: a deployment without both values answers
  // nothing, the gate page included, rather than let anyone in.
  const config = accessConfig();
  if (config === null)
    return { kind: 'unconfigured', message: NOT_CONFIGURED_MESSAGE };

  // The gate page and its action, which sign a person in.
  if (url.pathname === GATE_PATH || url.pathname.startsWith(`${GATE_PATH}/`))
    return { kind: 'pass' };

  if (await readSession(request, config.cookieSecret)) return { kind: 'pass' };

  return isApi(url.pathname)
    ? { kind: 'unauthorized' }
    : { kind: 'sign-in', location: gateLocation(url.pathname + url.search) };
}
