'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  Focusable,
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger,
  type TooltipProps,
} from 'react-aria-components';

/**
 * The arrow tip's radius, in px: lower is sharper. The flanks never move -- the
 * tip narrows along their tangents -- so 1.43, where it meets them at their own
 * ends, is the roundest it goes.
 */
const ARROW_TIP_RADIUS = 1.43;

/*
  The arrow, drawn for a 16px span. A flank curves in from the edge, then runs
  straight on along its tangent (slope 1.4, and 1.444 for the highlight just
  inside it) into a quadratic tip. That tip's radius is its half-width over the
  slope, which is how ARROW_TIP_RADIUS becomes coordinates.
*/
function arrowPaths(tipRadius: number) {
  const round = (value: number) => Number(value.toFixed(3));
  const edgeHalf = Math.min(tipRadius * 1.4, 2);
  const edgeY = round(7.4 - 1.4 * edgeHalf);
  const highlightHalf = edgeHalf * 0.72;
  const highlightY = round(5.92 - 1.444 * highlightHalf);
  const edge = `M0 1C3.2 1 4 1.8 6 4.6L${round(8 - edgeHalf)} ${edgeY}Q8 7.4 ${round(8 + edgeHalf)} ${edgeY}L10 4.6C12 1.8 12.8 1 16 1`;
  return {
    fill: `${edge}V-3H0Z`,
    edge,
    highlight: `M0 0C3.6 0 4.64 1.36 6.56 3.84L${round(8 - highlightHalf)} ${highlightY}Q8 5.92 ${round(8 + highlightHalf)} ${highlightY}L9.44 3.84C11.36 1.36 12.4 0 16 0`,
  };
}

const ARROW = arrowPaths(ARROW_TIP_RADIUS);

/** Native elements and ref-forwarding links share the same hover/focus behavior. */
export function Tooltip({
  children,
  label,
  description,
  content,
  placement = 'top',
  offset = 8,
  containerPadding,
  anchor,
  triggerRef,
  isDisabled = false,
  isOpen,
  onOpenChange,
}: {
  children: ComponentProps<typeof Focusable>['children'];
  label: string;
  description?: ReactNode;
  content?: ReactNode;
  placement?: TooltipProps['placement'];
  offset?: TooltipProps['offset'];
  /** Closest the box may come to the viewport's edge; react-aria's is 12px. */
  containerPadding?: TooltipProps['containerPadding'];
  /**
   * What the box is measured to, when not the trigger's own edge. `notch`
   * lands it on the notch's floor: pass `offset={0}` with it, and see
   * `.app-tooltip[data-anchor]` in app/components.css.
   */
  anchor?: 'notch';
  /**
   * The element the tooltip is placed against, when that is not the trigger
   * itself -- a badge inside a row that should keep its gap from the row.
   */
  triggerRef?: TooltipProps['triggerRef'];
  isDisabled?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  return (
    <TooltipTrigger
      delay={0}
      closeDelay={0}
      isDisabled={isDisabled}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Focusable>{children}</Focusable>
      <AriaTooltip
        className="app-tooltip group"
        offset={offset}
        containerPadding={containerPadding}
        triggerRef={triggerRef}
        placement={placement}
        data-rich={content ? true : undefined}
        data-anchor={anchor}
      >
        <OverlayArrow className="app-tooltip-arrow flex">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path className="tooltip-arrow-fill" d={ARROW.fill} />
            <path className="tooltip-arrow-edge" d={ARROW.edge} />
            <path className="tooltip-arrow-highlight" d={ARROW.highlight} />
          </svg>
        </OverlayArrow>
        <span className="group-data-[rich]:text-dense text-primary font-medium group-data-[rich]:[font-weight:650]">
          {label}
        </span>
        {description ? (
          <span className="text-micro group-data-[rich]:text-meta text-muted">
            {description}
          </span>
        ) : null}
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/** Observe the rendered width, including font changes and sidebar resizing. */
export function OverflowTooltip({
  label,
  children,
}: {
  label: string;
  children: ComponentProps<typeof Focusable>['children'];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current?.firstElementChild;
    if (!(element instanceof HTMLElement)) return;
    const measure = () =>
      setOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener('loadingdone', measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [label]);
  return (
    <span ref={ref} className="block min-w-0 flex-1">
      <Tooltip label={label} isDisabled={!overflowing}>
        {children}
      </Tooltip>
    </span>
  );
}
