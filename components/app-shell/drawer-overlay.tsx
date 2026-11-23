'use client';

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import X from 'blode-icons-react/icons/x';
import { cx } from '@/lib/ui/cx';
import { CLOSE_BUTTON, PANEL } from './drawer-aside';

/*
  A panel over the sheet, with a second that opens to its left. The first
  holds a list and stays put; the second is a `DrawerAside` holding whatever was
  chosen from it, so the list stays in view and choosing another item swaps the
  detail without a trip back.

  The scrim and the slide are `drawer-overlay` and `drawer-modal` in
  app/styles/drawer.css; the second panel's own motion is `drawer-aside` there.
  Escape closes the second panel before the first -- the caller's
  `onKeyDownCapture` answers it, since the caller knows what the second panel
  is showing -- and the scrim closes both.
*/

// Both panels are sized against the viewport rather than each other: the modal
// hugs them, so a click beside them lands on the scrim and dismisses. The
// first is as wide as what it says it needs, from a floor up to the viewport;
// content that should not widen it opts out with an inline-size containment.
const MAIN_WIDTH =
  'w-fit min-w-[min(420px,calc(100vw_-_2_*_var(--spacing-shell-inset)))] max-w-[calc(100vw_-_2_*_var(--spacing-shell-inset))]';
export const DRAWER_ASIDE_WIDTH =
  'w-[min(35rem,calc(100vw_-_2_*_var(--spacing-shell-inset)))]';

export function DrawerOverlay({
  isOpen,
  onOpenChange,
  children,
  side = 'right',
  id,
}: {
  side?: 'left' | 'right';
  id?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // `DrawerPanels`. Separate so what is in the panels can be keyed on each
  // opening while the overlay stays mounted to animate out.
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      // Inset by the shell's own padding so the panels line up with the panes.
      className={cx(
        'drawer-overlay p-shell-inset fixed inset-0 z-40 flex',
        side === 'left' ? 'justify-start' : 'justify-end',
      )}
    >
      <Modal className="drawer-modal flex h-full max-w-full" data-side={side}>
        <Dialog
          id={id}
          className="h-full outline-none"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }}
        >
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function DrawerPanels({
  title,
  closeLabel,
  aside,
  onKeyDownCapture,
  width = 'content',
  resizable = false,
  mainWidth,
  onMainWidthChange,
  className,
  children,
}: {
  // The first panel's title, which names the dialog.
  title: ReactNode;
  closeLabel: string;
  // The second panel, while it is showing or leaving. Given the aside width.
  aside: ReactElement | null;
  onKeyDownCapture?: (event: KeyboardEvent) => void;
  width?: 'content' | 'fixed';
  // A single panel that can be resized from its left edge.
  resizable?: boolean;
  mainWidth?: number | null;
  onMainWidthChange?: (width: number, commit: boolean) => void;
  // A hook for the list inside the first panel.
  className?: string;
  // The first panel's body, under its header.
  children: ReactNode;
}) {
  const mainPanel = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    width: number;
  } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [limits, setLimits] = useState<{
    min: number;
    max: number;
    current: number;
  } | null>(null);
  const controlsId = useId();

  useLayoutEffect(() => {
    if (!resizable) return;
    const panel = mainPanel.current;
    if (!panel) return;
    const update = () => {
      const style = getComputedStyle(panel);
      const min = Number.parseFloat(style.minWidth) || 0;
      const max =
        Number.parseFloat(style.maxWidth) ||
        panel.parentElement?.clientWidth ||
        min;
      setLimits({ min, max, current: panel.getBoundingClientRect().width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [resizable]);

  function resizeFromPointer(
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const panel = mainPanel.current;
    if (!panel) return;
    const style = getComputedStyle(panel);
    const min = Number.parseFloat(style.minWidth) || 0;
    const max =
      Number.parseFloat(style.maxWidth) ||
      panel.parentElement?.clientWidth ||
      Infinity;
    const next = Math.max(
      min,
      Math.min(max, session.width + session.startX - event.clientX),
    );
    onMainWidthChange?.(next, commit);
    if (commit) {
      drag.current = null;
      setIsResizing(false);
    }
  }

  return (
    <div
      className="gap-shell-inset flex h-full justify-end"
      onKeyDownCapture={onKeyDownCapture}
    >
      {aside}
      <div
        className={cx('drawer-resize-frame', aside ? 'max-lg:hidden' : null)}
        data-resizable={resizable || undefined}
      >
        <div
          ref={mainPanel}
          id={resizable ? controlsId : undefined}
          data-drawer-main
          data-resizing={isResizing || undefined}
          className={cx(
            PANEL,
            resizable
              ? 'drawer-resizable-panel'
              : width === 'fixed'
                ? DRAWER_ASIDE_WIDTH
                : MAIN_WIDTH,
            'flex flex-col',
            // Where both do not fit, the second panel takes this one's place
            // rather than squeezing beside it.
            aside ? 'max-lg:hidden' : null,
            className,
          )}
          style={
            resizable && mainWidth !== null && mainWidth !== undefined
              ? ({ '--drawer-width': `${mainWidth}px` } as CSSProperties)
              : undefined
          }
        >
          <header className="drawer-panel-header flex shrink-0 items-center justify-between gap-4 px-5 pt-3">
            <Heading
              slot="title"
              className="text-title min-w-0 [font-weight:550]"
            >
              {title}
            </Heading>
            <AriaButton slot="close" className={CLOSE_BUTTON}>
              <X
                aria-hidden
                size={18}
                strokeWidth={2.2}
                className="size-3.5 flex-none"
              />
              <span className="sr-only">{closeLabel}</span>
            </AriaButton>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        {resizable ? (
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize sheet data drawer"
            aria-orientation="vertical"
            aria-controls={controlsId}
            aria-valuemin={limits?.min ?? 0}
            aria-valuemax={limits?.max}
            aria-valuenow={Math.round(mainWidth ?? limits?.current ?? 0)}
            aria-valuetext={`${Math.round(mainWidth ?? limits?.current ?? 0)} pixels wide`}
            className="drawer-resize-handle"
            data-resizing={isResizing || undefined}
            onPointerDown={(event) => {
              if (event.button !== 0 || !mainPanel.current) return;
              event.preventDefault();
              const panel = mainPanel.current;
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                width: panel.getBoundingClientRect().width,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsResizing(true);
            }}
            onPointerMove={(event) => resizeFromPointer(event, false)}
            onPointerUp={(event) => resizeFromPointer(event, true)}
            onPointerCancel={(event) => {
              const session = drag.current;
              if (!session || session.pointerId !== event.pointerId) return;
              onMainWidthChange?.(session.width, true);
              drag.current = null;
              setIsResizing(false);
            }}
            onLostPointerCapture={() => {
              const session = drag.current;
              if (session) onMainWidthChange?.(session.width, true);
              drag.current = null;
              setIsResizing(false);
            }}
            onKeyDown={(event) => {
              if (!mainPanel.current) return;
              const panel = mainPanel.current;
              const style = getComputedStyle(panel);
              const min = Number.parseFloat(style.minWidth) || 0;
              const max =
                Number.parseFloat(style.maxWidth) ||
                panel.parentElement?.clientWidth ||
                Infinity;
              const current = panel.getBoundingClientRect().width;
              const next =
                event.key === 'Home'
                  ? min
                  : event.key === 'End'
                    ? max
                    : event.key === 'ArrowLeft'
                      ? Math.min(max, current + 16)
                      : event.key === 'ArrowRight'
                        ? Math.max(min, current - 16)
                        : null;
              if (next === null) return;
              event.preventDefault();
              onMainWidthChange?.(next, true);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
