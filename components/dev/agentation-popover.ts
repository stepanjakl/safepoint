import { useEffect, type RefObject } from 'react';

const AGENTATION_SELECTOR =
  'agentation-toolbar, [data-agentation-root], [data-feedback-toolbar], [data-annotation-popup], [data-annotation-marker], [data-agentation-portal]';

/**
 * Lets a React Aria Popover stay open and clickable when the developer
 * interacts with the Agentation toolbar or annotation popup in development.
 */
export function useAgentationPopoverProps(
  triggerRef?: RefObject<HTMLElement | null>,
): {
  isNonModal?: boolean;
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
} {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.NEXT_PUBLIC_AGENTATION !== 'on'
  ) {
    return {};
  }
  return {
    isNonModal: true,
    shouldCloseOnInteractOutside: (element) =>
      !element.closest(AGENTATION_SELECTOR) &&
      !triggerRef?.current?.contains(element),
  };
}

/**
 * React Aria's `usePopover` disables outside-click dismissal when `isNonModal`
 * is true, falling back to `shouldCloseOnBlur` (which ignores clicks on
 * non-focusable elements). This restores outside-click dismissal in
 * development while still ignoring clicks on the Agentation UI.
 */
export function useAgentationPopoverDismiss(
  isOpen: boolean,
  onClose: () => void,
  popoverRef: RefObject<HTMLElement | null>,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (
      !isOpen ||
      process.env.NODE_ENV !== 'development' ||
      process.env.NEXT_PUBLIC_AGENTATION !== 'on'
    ) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest(AGENTATION_SELECTOR)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose, popoverRef, triggerRef]);
}
