'use client';

import {
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type Placement,
} from '@floating-ui/react-dom';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import X from 'blode-icons-react/icons/x';
import { TooltipArrowShape } from './tooltip';

export function WalkthroughDismiss({ onPress }: Pick<ButtonProps, 'onPress'>) {
  return (
    <AriaButton
      aria-label="Dismiss walkthrough hint"
      className="walkthrough-dismiss"
      onPress={onPress}
    >
      <X aria-hidden size={12} />
    </AriaButton>
  );
}

type WalkthroughPlacement = 'right-start' | 'bottom' | 'bottom-start';

type TargetBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

function hasAnchorPositioning() {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('anchor-name: --a') &&
    CSS.supports('top: anchor(bottom)')
  );
}

function isFullyInView(target: HTMLElement, rect: DOMRect) {
  if (rect.width <= 0 || rect.height <= 0) return false;
  let top = 0;
  let bottom = window.innerHeight;
  let left = 0;
  let right = window.innerWidth;
  for (let node = target.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipY =
      style.overflowY === 'auto' ||
      style.overflowY === 'scroll' ||
      style.overflowY === 'hidden' ||
      style.overflowY === 'clip';
    const clipX =
      style.overflowX === 'auto' ||
      style.overflowX === 'scroll' ||
      style.overflowX === 'hidden' ||
      style.overflowX === 'clip';
    if (clipY || clipX) {
      const box = node.getBoundingClientRect();
      if (clipY) {
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }
      if (clipX) {
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
    }
  }
  const tolerance = 0.5;
  return (
    rect.top >= top - tolerance &&
    rect.bottom <= bottom + tolerance &&
    rect.left >= left - tolerance &&
    rect.right <= right + tolerance
  );
}

function applyCutout(cutout: SVGRectElement, box: TargetBox) {
  cutout.setAttribute('x', String(box.x));
  cutout.setAttribute('y', String(box.y));
  cutout.setAttribute('width', String(box.width));
  cutout.setAttribute('height', String(box.height));
  cutout.setAttribute('rx', String(box.radius));
  cutout.setAttribute('ry', String(box.radius));
}

export function WalkthroughHint({
  isOpen,
  targetRef,
  focusRef,
  descriptionId,
  onDismiss,
  onInteractOutside,
  title,
  preferredPlacement = 'responsive',
  step,
  children,
}: {
  isOpen: boolean;
  targetRef: RefObject<HTMLElement | null>;
  focusRef?: RefObject<HTMLElement | null>;
  descriptionId: string;
  onDismiss: () => void;
  onInteractOutside?: () => void;
  title: string;
  preferredPlacement?: 'responsive' | WalkthroughPlacement;
  step?: string;
  children: ReactNode;
}) {
  const [supportsAnchor] = useState(hasAnchorPositioning);
  const [visible, setVisible] = useState(false);
  const [responsivePlacement, setResponsivePlacement] =
    useState<WalkthroughPlacement | null>(null);
  const [arrowEl, setArrowEl] = useState<HTMLDivElement | null>(null);
  const [titleCenter, setTitleCenter] = useState(24);
  const [targetRadius, setTargetRadius] = useState(0);
  const floatingNodeRef = useRef<HTMLDivElement | null>(null);
  const cutoutRef = useRef<SVGRectElement | null>(null);
  const lastBoxRef = useRef<TargetBox | null>(null);
  const reduceMotion = useReducedMotion();
  const open = isOpen && visible;
  const [present, setPresent] = useState(false);
  const [entering, setEntering] = useState(false);
  const [backdropPresent, setBackdropPresent] = useState(false);
  if (open && !present) {
    setPresent(true);
    if (!reduceMotion) setEntering(true);
  }
  if (open && !backdropPresent) setBackdropPresent(true);
  if (!open && reduceMotion && present) {
    setPresent(false);
    setEntering(false);
  }
  if (!open && reduceMotion && backdropPresent) setBackdropPresent(false);
  const rawId = useId();
  const anchorName = `--walkthrough-target-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [initialBox, setInitialBox] = useState<TargetBox | null>(null);

  const syncTarget = useCallback(() => {
    const target = targetRef.current;
    if (!target) {
      setVisible(false);
      return;
    }
    const rect = target.getBoundingClientRect();
    const available =
      target.checkVisibility() &&
      !target.closest('[inert], [aria-hidden="true"]') &&
      isFullyInView(target, rect);
    if (available) {
      const parsedRadius =
        parseFloat(getComputedStyle(target).borderRadius) || 0;
      const radius = Math.min(parsedRadius, rect.width / 2, rect.height / 2);
      setTargetRadius((current) => (current === radius ? current : radius));
      if (!supportsAnchor) {
        const next: TargetBox = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          radius,
        };
        lastBoxRef.current = next;
        if (cutoutRef.current) applyCutout(cutoutRef.current, next);
        setInitialBox((current) => current ?? next);
      }
    }
    setVisible(available);
  }, [supportsAnchor, targetRef]);

  const placement: Placement =
    preferredPlacement === 'responsive'
      ? (responsivePlacement ?? 'bottom')
      : preferredPlacement;
  const placementReady =
    preferredPlacement !== 'responsive' || responsivePlacement !== null;

  const {
    refs,
    floatingStyles,
    placement: resolvedPlacement,
    middlewareData,
    isPositioned,
    update,
  } = useFloating({
    open: open && !supportsAnchor,
    placement,
    strategy: 'fixed',
    middleware: [
      offset(({ placement: currentPlacement, rects, elements }) => {
        const currentSide = currentPlacement.split('-')[0];
        if (currentSide !== 'right' && currentSide !== 'left') {
          return { mainAxis: 16, crossAxis: 0 };
        }
        const heading = elements.floating.querySelector('h2');
        const crossAxis = heading
          ? rects.reference.height / 2 -
            (heading.offsetTop + heading.offsetHeight / 2)
          : 0;
        return { mainAxis: 16, crossAxis };
      }),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      ...(arrowEl ? [arrow({ element: arrowEl, padding: 14 })] : []),
    ],
    whileElementsMounted: (reference, floating, recompute) =>
      autoUpdate(reference, floating, () => {
        syncTarget();
        recompute();
      }),
  });

  // Attach an explicit CSS anchor-name on the target while the anchored hint or
  // backdrop is mounted, so both track scroll on the compositor thread.
  useLayoutEffect(() => {
    if (!supportsAnchor || (!isOpen && !present && !backdropPresent)) return;
    const target = targetRef.current;
    if (!target) return;
    target.style.setProperty('anchor-name', anchorName);
    return () => {
      if (target.style.getPropertyValue('anchor-name') === anchorName) {
        target.style.removeProperty('anchor-name');
      }
    };
  }, [anchorName, backdropPresent, isOpen, present, supportsAnchor, targetRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const target = targetRef.current;
    if (!target) return;
    if (!supportsAnchor) refs.setReference(target);
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    for (let node: Element | null = target; node; node = node.parentElement) {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['inert', 'aria-hidden', 'hidden', 'class', 'style'],
      });
    }
    const resize = new ResizeObserver(syncTarget);
    resize.observe(target);
    const intersection = new IntersectionObserver(syncTarget, {
      threshold: [0, 0.5, 1],
    });
    intersection.observe(target);
    window.addEventListener('resize', syncTarget);
    window.addEventListener('scroll', syncTarget, true);
    return () => {
      observer.disconnect();
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener('resize', syncTarget);
      window.removeEventListener('scroll', syncTarget, true);
    };
  }, [isOpen, refs, supportsAnchor, syncTarget, targetRef]);

  useLayoutEffect(() => {
    if (!open) return;
    const floating = floatingNodeRef.current;
    if (!floating) return;
    function readMetrics() {
      const node = floatingNodeRef.current;
      if (!node) return;
      if (preferredPlacement === 'responsive') {
        const next: WalkthroughPlacement =
          getComputedStyle(node)
            .getPropertyValue('--walkthrough-placement')
            .trim() === 'right'
            ? 'right-start'
            : 'bottom';
        setResponsivePlacement((current) =>
          current === next ? current : next,
        );
      }
      const heading = node.querySelector('h2');
      if (heading) {
        const center = heading.offsetTop + heading.offsetHeight / 2;
        setTitleCenter((current) => (current === center ? current : center));
      }
      if (!supportsAnchor) update();
    }
    readMetrics();
    const resize = new ResizeObserver(readMetrics);
    resize.observe(floating);
    window.addEventListener('resize', readMetrics);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', readMetrics);
    };
  }, [open, preferredPlacement, supportsAnchor, update]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (floatingNodeRef.current?.contains(document.activeElement)) {
        (focusRef ?? targetRef).current?.focus({ preventScroll: true });
      }
      onDismiss();
    }
    function onPointerDown(event: PointerEvent) {
      const clicked = event.target as Node | null;
      if (!clicked) return;
      if (floatingNodeRef.current?.contains(clicked)) return;
      if (targetRef.current?.contains(clicked)) return;
      (onInteractOutside ?? onDismiss)();
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [focusRef, onDismiss, onInteractOutside, open, targetRef]);

  const activePlacement = supportsAnchor ? placement : resolvedPlacement;
  const side = activePlacement.split('-')[0] as
    'top' | 'bottom' | 'left' | 'right';
  const align = activePlacement.includes('-start') ? 'start' : undefined;
  const arrowX = middlewareData.arrow?.x ?? 0;
  const arrowY = middlewareData.arrow?.y ?? 0;
  const fallbackArrowStyle: CSSProperties = {
    position: 'absolute',
    ...(side === 'bottom'
      ? { bottom: '100%', left: arrowX }
      : side === 'top'
        ? { top: '100%', left: arrowX }
        : side === 'right'
          ? { right: '100%', top: arrowY }
          : { left: '100%', top: arrowY }),
  };
  const anchorOrigin = supportsAnchor
    ? side === 'right'
      ? `0% ${titleCenter}px`
      : side === 'bottom' && align === 'start'
        ? '24px 0%'
        : '50% 0%'
    : side === 'bottom'
      ? `${arrowX + 8}px 0%`
      : side === 'top'
        ? `${arrowX + 8}px 100%`
        : side === 'right'
          ? `0% ${arrowY + 8}px`
          : `100% ${arrowY + 8}px`;
  const readyToShow = placementReady && (supportsAnchor || isPositioned);
  const hintStyle: CSSProperties = supportsAnchor
    ? ({
        '--walkthrough-anchor': anchorName,
        '--walkthrough-title-center': `${titleCenter}px`,
        '--trigger-anchor-point': anchorOrigin,
        visibility: readyToShow ? undefined : 'hidden',
      } as CSSProperties)
    : ({
        ...floatingStyles,
        zIndex: 100000,
        visibility: readyToShow ? undefined : 'hidden',
        '--trigger-anchor-point': anchorOrigin,
      } as CSSProperties);

  return (
    <>
      {isOpen && (
        <span id={descriptionId} className="sr-only">
          {children}
        </span>
      )}
      {backdropPresent &&
        (supportsAnchor
          ? createPortal(
              <div
                className="walkthrough-backdrop walkthrough-backdrop-anchor walkthrough-cutout"
                data-state={open ? 'open' : 'closing'}
                style={
                  {
                    '--walkthrough-anchor': anchorName,
                    '--walkthrough-radius': `${targetRadius}px`,
                  } as CSSProperties
                }
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget && !open)
                    setBackdropPresent(false);
                }}
                aria-hidden="true"
              />,
              document.body,
            )
          : initialBox &&
            createPortal(
              <svg
                className="walkthrough-backdrop"
                data-state={open ? 'open' : 'closing'}
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget && !open)
                    setBackdropPresent(false);
                }}
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <mask id={rawId} maskUnits="userSpaceOnUse">
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      ref={(node) => {
                        cutoutRef.current = node;
                        if (node && lastBoxRef.current)
                          applyCutout(node, lastBoxRef.current);
                      }}
                      className="walkthrough-cutout"
                      x={initialBox.x}
                      y={initialBox.y}
                      width={initialBox.width}
                      height={initialBox.height}
                      rx={initialBox.radius}
                      ry={initialBox.radius}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" mask={`url(#${rawId})`} />
              </svg>,
              document.body,
            ))}
      {present &&
        createPortal(
          <div
            ref={(node) => {
              floatingNodeRef.current = node;
              if (!supportsAnchor) refs.setFloating(node);
            }}
            role="dialog"
            aria-label={title}
            inert={!open}
            aria-hidden={!open || undefined}
            style={hintStyle}
            className="app-tooltip ground-tooltip walkthrough-hint"
            data-rich
            data-anchored={supportsAnchor ? 'true' : undefined}
            data-placement={side}
            data-align={align}
            data-entering={open && entering && readyToShow ? 'true' : undefined}
            data-exiting={!open ? 'true' : undefined}
            data-walkthrough-step={step}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (open) {
                setEntering(false);
              } else {
                setPresent(false);
                setEntering(false);
              }
            }}
          >
            <div
              ref={supportsAnchor ? undefined : setArrowEl}
              className="app-tooltip-arrow walkthrough-arrow"
              data-placement={side}
              style={supportsAnchor ? undefined : fallbackArrowStyle}
            >
              <TooltipArrowShape />
            </div>
            <h2 className="text-body font-semibold">{title}</h2>
            <WalkthroughDismiss
              onPress={() => {
                (focusRef ?? targetRef).current?.focus({ preventScroll: true });
                onDismiss();
              }}
            />
            <p className="text-dense font-book text-muted mt-1.5 leading-normal text-pretty">
              {children}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
