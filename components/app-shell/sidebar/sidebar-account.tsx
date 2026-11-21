'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GradientAvatar } from '@outpacelabs/avatars';

import { signOut } from '@/app/access/actions';
import { cx } from '@/lib/ui/cx';
import { ProfileSettings } from './profile-settings';
import { visitorPalette } from '@/lib/shell/visitor-orb';
import { Tooltip } from '@/components/ui/tooltip';
import { ICON_BUTTON, MENU_RAIL, MenuIcon, RAIL_CELL } from './menu-parts';

const AVATAR_COLORS = ['#0d9488', '#22d3ee', '#0284c7', '#3f3f46', '#5eead4'];

function spinProfileOrb(
  orb: HTMLSpanElement,
  gradient: HTMLSpanElement,
  edge: HTMLSpanElement,
) {
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    orb.getAnimations().length > 0
  ) {
    return;
  }

  const spin = { duration: 6000, easing: 'cubic-bezier(0.92, 0.02, 0.53, 1)' };

  gradient.animate({ rotate: ['0turn', '24turn'] }, spin);
  orb.animate(
    {
      scale: [1, 1.12, 1],
      filter: ['brightness(1)', 'brightness(1.18)', 'brightness(1)'],
    },
    spin,
  );
  edge.animate(
    [
      { opacity: 0, easing: 'ease-out' },
      { opacity: 0.55, offset: 0.18 },
      { opacity: 0.55, offset: 0.85, easing: 'ease-in-out' },
      { opacity: 0 },
    ],
    { duration: spin.duration },
  );
}

// What the anonymous visitor cookie names; the id seeds the avatar.
export type AnonymousVisitor = { id: string; name: string; orb: number };

/*
  Both ends are rail cells, so the row states no offsets of its own: the avatar
  fills the leading cell and the settings button centres in the trailing one.
  The 2px that used to sit in `pr-0.5` was (rail - button) / 2 worked out by
  hand; the cell does that arithmetic itself.
*/
export function SidebarAccount({
  signedInAs = null,
  visitor = null,
}: {
  /** The name on the gate's cookie. Null where there is no gate: local development. */
  signedInAs?: string | null;
  /** The anonymous visitor, drawn as an orb when no one is signed in. */
  visitor?: AnonymousVisitor | null;
}) {
  const named = signedInAs ?? visitor?.name ?? null;
  // Every user gets a GradientAvatar: signed-in users keyed by their name,
  // visitors by their stable cookie id, and the fallback by a fixed seed.
  const avatarSeed = signedInAs
    ? `safepoint-${signedInAs}`
    : visitor
      ? `safepoint-visitor-${visitor.id}`
      : 'safepoint-maya';

  // Visitors get their own colour palette derived from their name (food hue
  // modulated by adjective). Signed-in users and the fallback share the brand
  // palette; the seed alone differentiates them.
  const avatarColors =
    (!signedInAs && visitor ? visitorPalette(visitor.name) : null) ??
    AVATAR_COLORS;

  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const orbRef = useRef<HTMLSpanElement>(null);
  const gradientRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // GradientAvatar renders to a <canvas> inside an effect. Fading the avatar
    // in after mount prevents the canvas from popping into view on load.
    const frame = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="shell-profile-row shell:h-shell-header flex items-center justify-between gap-2.5"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`Spin ${named ?? 'Maya'}’s profile orb`}
        className={cx(
          MENU_RAIL,
          'focus-visible:outline-field-edge-active cursor-pointer rounded-full focus-visible:outline-2',
        )}
        onClick={() => {
          if (orbRef.current && gradientRef.current && edgeRef.current) {
            spinProfileOrb(
              orbRef.current,
              gradientRef.current,
              edgeRef.current,
            );
          }
        }}
      >
        <span ref={orbRef} aria-hidden="true" className="grid">
          <span
            ref={gradientRef}
            className="relative grid overflow-hidden rounded-full"
          >
            <GradientAvatar
              seed={avatarSeed}
              size={RAIL_CELL}
              colors={avatarColors}
              className={cx(
                'transition-opacity duration-(--duration-pane) ease-out',
                ready ? 'opacity-100' : 'opacity-0',
              )}
            />
            <span
              ref={edgeRef}
              className="pointer-events-none absolute inset-0 opacity-0"
              style={{
                backgroundImage: `radial-gradient(circle closest-side, transparent 55%, ${avatarColors[0]} 100%)`,
              }}
            />
          </span>
        </span>
      </button>
      <ScrollingName hovered={hovered}>{named ?? 'Maya'}</ScrollingName>
      {signedInAs ? (
        // A form, so signing out works before the page has hydrated, and the
        // rail cell it sits in is the settings button's own.
        <form action={signOut} className="contents">
          <span className={MENU_RAIL}>
            <Tooltip label="Sign out">
              <button
                type="submit"
                className={ICON_BUTTON}
                aria-label="Sign out"
              >
                <MenuIcon name="signOut" />
              </button>
            </Tooltip>
          </span>
        </form>
      ) : null}
      <span className={MENU_RAIL}>
        <ProfileSettings />
      </span>
    </div>
  );
}

/*
  A name that truncates when it overflows, then smoothly scrolls to reveal the
  rest on hover. The overflow distance is measured with a ResizeObserver and
  applied as a translateX transition — the text slides exactly far enough and
  no further, then returns when the pointer leaves.
*/
function ScrollingName({
  children,
  hovered,
}: {
  children: string;
  hovered: boolean;
}) {
  const outerRef = useRef<HTMLParagraphElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const diff = inner.scrollWidth - outer.clientWidth;
    setOverflow(diff > 0 ? diff : 0);
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (outerRef.current) observer.observe(outerRef.current);
    return () => observer.disconnect();
  }, [measure, children]);

  const scrolled = hovered && overflow > 0;

  return (
    <p
      ref={outerRef}
      className="text-primary text-dense mr-auto min-w-0 overflow-hidden font-semibold"
    >
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap transition-transform duration-700 ease-in-out motion-reduce:transition-none"
        style={{
          transitionDelay: scrolled ? '300ms' : '0ms',
          transform: scrolled ? `translateX(-${overflow}px)` : 'none',
        }}
      >
        {children}
      </span>
    </p>
  );
}
