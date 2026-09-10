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

/** Native elements and ref-forwarding links share the same hover/focus behavior. */
export function Tooltip({
  children,
  label,
  description,
  content,
  placement = 'top',
  isDisabled = false,
}: {
  children: ComponentProps<typeof Focusable>['children'];
  label: string;
  description?: string;
  content?: ReactNode;
  placement?: TooltipProps['placement'];
  isDisabled?: boolean;
}) {
  return (
    <TooltipTrigger delay={350} closeDelay={150} isDisabled={isDisabled}>
      <Focusable>{children}</Focusable>
      <AriaTooltip
        className="app-tooltip group"
        offset={10}
        placement={placement}
        data-rich={content ? true : undefined}
      >
        <OverlayArrow className="app-tooltip-arrow flex">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              className="tooltip-arrow-fill"
              d="M0 1C4 1 5 2 7.5 5.5Q10 9 12.5 5.5C15 2 16 1 20 1V-3H0Z"
            />
            <path
              className="tooltip-arrow-edge"
              d="M0 1C4 1 5 2 7.5 5.5Q10 9 12.5 5.5C15 2 16 1 20 1"
            />
            <path
              className="tooltip-arrow-highlight"
              d="M0 0C4.5 0 5.8 1.7 8.2 4.8Q10 7.4 11.8 4.8C14.2 1.7 15.5 0 20 0"
            />
          </svg>
        </OverlayArrow>
        <span className="group-data-[rich]:text-dense font-medium text-zinc-700 group-data-[rich]:[font-weight:650]">
          {label}
        </span>
        {description ? <span className="text-muted">{description}</span> : null}
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
