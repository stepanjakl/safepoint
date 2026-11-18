const AGENTATION_SELECTOR =
  'agentation-toolbar, [data-agentation-root], [data-feedback-toolbar], [data-annotation-popup], [data-annotation-marker], [data-agentation-portal]';

/**
 * Lets a React Aria Popover stay open and clickable when the developer
 * interacts with the Agentation toolbar or annotation popup in development.
 */
export function agentationPopoverProps(): {
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
      !element.closest(AGENTATION_SELECTOR),
  };
}
