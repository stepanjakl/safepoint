'use client';

import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import {
  Button as AriaButton,
  OverlayArrow,
  Popover,
  type ButtonProps,
} from 'react-aria-components';
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

export function WalkthroughHint({
  isOpen,
  targetRef,
  descriptionId,
  onDismiss,
  title,
  children,
}: {
  isOpen: boolean;
  targetRef: RefObject<HTMLButtonElement | null>;
  descriptionId: string;
  onDismiss: () => void;
  title: string;
  children: string;
}) {
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<'right top' | 'bottom'>('bottom');
  const [crossOffset, setCrossOffset] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reduceMotion = useReducedMotion();
  const open = isOpen && visible;
  const [backdropPresent, setBackdropPresent] = useState(false);
  if (open && !backdropPresent) setBackdropPresent(true);
  if (!open && reduceMotion && backdropPresent) setBackdropPresent(false);
  const popoverRef = useRef<HTMLElement>(null);
  const maskId = useId();
  const [targetBox, setTargetBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const target = targetRef.current;
    if (!target) return;
    function update() {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const available =
        target.checkVisibility() &&
        !target.closest('[inert], [aria-hidden="true"]') &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (available)
        setTargetBox({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          radius: parseFloat(getComputedStyle(target).borderRadius) || 0,
        });
      setVisible(available);
    }
    update();
    const observer = new MutationObserver(update);
    for (let node: Element | null = target; node; node = node.parentElement) {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['inert', 'aria-hidden', 'hidden', 'class', 'style'],
      });
    }
    const resize = new ResizeObserver(update);
    resize.observe(target);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [targetRef, isOpen]);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePlacement() {
      if (!popoverRef.current) return;
      setPlacement(
        getComputedStyle(popoverRef.current)
          .getPropertyValue('--walkthrough-placement')
          .trim() === 'right'
          ? 'right top'
          : 'bottom',
      );
      const heading = titleRef.current;
      const target = targetRef.current;
      if (heading && target) {
        setCrossOffset(
          target.getBoundingClientRect().height / 2 -
            (heading.offsetTop + heading.offsetHeight / 2),
        );
      }
    }
    updatePlacement();
    const resize = new ResizeObserver(updatePlacement);
    if (popoverRef.current) resize.observe(popoverRef.current);
    window.addEventListener('resize', updatePlacement);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', updatePlacement);
    };
  }, [open, targetRef]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (popoverRef.current?.contains(document.activeElement)) {
        targetRef.current?.focus({ preventScroll: true });
      }
      onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss, targetRef]);

  return (
    <>
      {isOpen && (
        <span id={descriptionId} className="sr-only">
          {children}
        </span>
      )}
      {backdropPresent &&
        targetBox &&
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
              <mask id={maskId} maskUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  className="walkthrough-cutout"
                  x={targetBox.x}
                  y={targetBox.y}
                  width={targetBox.width}
                  height={targetBox.height}
                  rx={targetBox.radius}
                  fill="black"
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" mask={`url(#${maskId})`} />
          </svg>,
          document.body,
        )}
      <Popover
        ref={popoverRef}
        isOpen={open}
        inert={!open}
        aria-hidden={!open || undefined}
        isNonModal
        isKeyboardDismissDisabled
        triggerRef={targetRef}
        placement={placement}
        crossOffset={placement === 'right top' ? crossOffset : 0}
        offset={16}
        shouldCloseOnInteractOutside={() => false}
        onOpenChange={(open) => {
          if (!open) onDismiss();
        }}
        className="app-tooltip ground-tooltip walkthrough-hint"
        data-rich
      >
        <OverlayArrow className="app-tooltip-arrow">
          <TooltipArrowShape />
        </OverlayArrow>
        <h2 ref={titleRef} className="text-dense font-semibold">
          {title}
        </h2>
        <WalkthroughDismiss
          onPress={() => {
            targetRef.current?.focus({ preventScroll: true });
            onDismiss();
          }}
        />
        <p className="text-meta text-muted mt-2 leading-relaxed">{children}</p>
      </Popover>
    </>
  );
}
