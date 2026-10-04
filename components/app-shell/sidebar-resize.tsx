'use client';

import { useLayoutEffect } from 'react';
import { Dialog, Popover } from 'react-aria-components';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { DURATION_STATE } from '@/lib/motion';
import type { SidebarController } from './use-resizable-sidebar';

export function SidebarResizeHandle({
  controller,
  disabled = false,
}: {
  controller: SidebarController;
  disabled?: boolean;
}) {
  const {
    side,
    label,
    bounds,
    preview,
    gripPressed,
    optionsOpen,
    setOptionsOpen,
    hovered,
    gripHovered,
    setGripHovered,
    keyboardFocused,
    setKeyboardFocused,
    reduceMotion,
    handle,
    grip,
    navigationId,
    helpId,
    collapsed,
    width,
    willClose,
    willSnapOpen,
    gripPath,
    cancelDrag,
    toggle,
    resize,
    startDrag,
    moveDrag,
    endDrag,
    updateHover,
    leaveHover,
    drag,
  } = controller;
  // One handle serves both panels; every word it says names the one it moves.
  const panel = side === 'left' ? 'sidebar' : 'assistant';
  const Panel = side === 'left' ? 'Sidebar' : 'Assistant';
  // The tooltip is measured against the grip, not the edge, and react-aria
  // re-measures that anchor whenever it resizes. CSS takes the whole handle out
  // of layout below the shell breakpoint, and the assistant's handle leaves
  // with its panel; neither fires a pointer leave, so hover state outlives the
  // box it points at and an open tooltip re-anchors to a zero rect at the
  // viewport's origin -- the corner. Hover ends with the box instead.
  useLayoutEffect(() => {
    const element = grip.current;
    if (!element) return;
    const end = () => {
      leaveHover();
      setGripHovered(false);
      setKeyboardFocused(false);
    };
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) end();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      end();
    };
  }, [grip, leaveHover, setGripHovered, setKeyboardFocused]);
  return (
    <>
      <Tooltip
        label={`Click to ${collapsed ? 'show' : 'hide'} ${panel}`}
        description={
          <>
            <span className="block">
              {collapsed ? 'Drag right to open' : 'Drag to resize'}
            </span>
            <span className="block">Alt-click to reset</span>
          </>
        }
        placement={side === 'left' ? 'right' : 'left'}
        triggerRef={grip}
        offset={4}
        isDisabled={disabled || preview !== null || optionsOpen}
        isOpen={
          !disabled &&
          ((hovered && gripHovered) || keyboardFocused) &&
          preview === null &&
          !optionsOpen
        }
        onOpenChange={(open) => {
          if (!open) {
            leaveHover();
            setKeyboardFocused(false);
          }
        }}
      >
        <div
          ref={handle}
          role="separator"
          tabIndex={disabled ? -1 : 0}
          inert={disabled}
          aria-hidden={disabled || undefined}
          aria-label={label}
          aria-orientation="vertical"
          aria-controls={navigationId}
          aria-describedby={helpId}
          aria-valuemin={0}
          aria-valuemax={Math.round(bounds?.max ?? 0)}
          aria-valuenow={
            preview === null
              ? collapsed
                ? 0
                : Math.round(width)
              : Math.round(preview)
          }
          aria-valuetext={
            willClose
              ? `Release to hide ${panel}`
              : willSnapOpen
                ? 'Release to open at minimum width'
                : collapsed && preview === null
                  ? 'Hidden'
                  : `${Math.round(preview ?? width)} pixels wide`
          }
          className="sidebar-handle max-shell:hidden"
          data-side={side}
          data-collapsed={collapsed || undefined}
          data-resizing={preview !== null || undefined}
          data-hovered={hovered || undefined}
          data-grip-pressed={gripPressed || undefined}
          onPointerEnter={disabled ? undefined : updateHover}
          onPointerLeave={leaveHover}
          onFocus={(event) =>
            setKeyboardFocused(event.currentTarget.matches(':focus-visible'))
          }
          onBlur={() => {
            setKeyboardFocused(false);
          }}
          onPointerDown={disabled ? undefined : startDrag}
          onPointerMove={disabled ? undefined : moveDrag}
          onPointerUp={disabled ? undefined : endDrag}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={() => {
            // Capture loss after release must not cancel a completed gesture.
            if (drag.current) cancelDrag();
          }}
          onClick={(event) => {
            if (disabled) return;
            // Pointer gestures activate on release. Keep virtual activation
            // for assistive technology, which has no preceding pointer pair.
            if (
              event.detail === 0 &&
              !(
                event.nativeEvent instanceof globalThis.PointerEvent &&
                event.nativeEvent.pointerType
              )
            ) {
              if (event.altKey) resize(null);
              else toggle();
            }
          }}
          onContextMenu={(event) => {
            if (disabled) return;
            event.preventDefault();
            cancelDrag();
            event.currentTarget.focus();
            setOptionsOpen(true);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'Escape') {
              if (preview !== null) {
                event.preventDefault();
                event.stopPropagation();
                cancelDrag();
              }
              return;
            }
            if (
              event.key === 'ContextMenu' ||
              (event.shiftKey && event.key === 'F10')
            ) {
              event.preventDefault();
              setOptionsOpen(true);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (!event.repeat) {
                if (event.altKey && event.key === 'Enter') resize(null);
                else toggle();
              }
            } else if (
              bounds &&
              ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
            ) {
              event.preventDefault();
              const step = bounds.unit * (event.shiftKey ? 2 : 0.5);
              resize(
                event.key === 'Home'
                  ? bounds.min
                  : event.key === 'End'
                    ? bounds.max
                    : width +
                      (event.key === 'ArrowLeft' ? -step : step) *
                        (side === 'left' ? 1 : -1),
              );
            }
          }}
        >
          <span
            ref={grip}
            className="sidebar-handle-mark"
            aria-hidden="true"
            onPointerEnter={(event) =>
              setGripHovered(event.pointerType !== 'touch')
            }
            onPointerLeave={() => setGripHovered(false)}
          >
            <svg className="h-11 w-6" viewBox="0 0 24 44" fill="none">
              <motion.path
                className="sidebar-handle-stroke"
                transform={
                  side === 'right' ? 'translate(24 0) scale(-1 1)' : undefined
                }
                initial={false}
                animate={{ d: gripPath }}
                transition={{
                  duration: reduceMotion ? 0 : DURATION_STATE,
                  ease: 'easeOut',
                }}
              />
            </svg>
          </span>
        </div>
      </Tooltip>
      <span id={helpId} className="sr-only">
        Left and right arrows resize. Home selects the minimum width; End the
        maximum. Enter or Space hides or restores the {panel}. Escape cancels a
        drag. Right-click, touch and hold, or Shift F10 opens width presets.
        Drag toward the outside edge past halfway and release to hide. A partial
        opening snaps to the minimum width. Alt-click or Alt+Enter resets to the
        default width; choose Default in the width presets for the same action.
      </span>{' '}
      <Popover
        isOpen={!disabled && optionsOpen && bounds !== null}
        onOpenChange={setOptionsOpen}
        triggerRef={handle}
        placement={side === 'left' ? 'right' : 'left'}
        offset={8}
        className="control-face surface-floating rounded-shell p-2"
      >
        <Dialog
          aria-label={`${Panel} width`}
          className="grid gap-1 outline-none"
        >
          <p className="text-muted text-meta px-2 py-1">{Panel} width</p>
          {(['Compact', 'Default', 'Wide'] as const).map((label) => (
            <Button
              key={label}
              variant="secondary"
              onPress={() => {
                if (!bounds) return;
                resize(
                  label === 'Default'
                    ? null
                    : label === 'Compact'
                      ? bounds.min
                      : bounds.max,
                );
                setOptionsOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
        </Dialog>
      </Popover>
    </>
  );
}

export function SidebarSizeProbes({
  controller,
}: {
  controller: SidebarController;
}) {
  const { probes, side } = controller;
  return (
    <div
      ref={probes}
      aria-hidden="true"
      className={
        side === 'left'
          ? 'max-shell:hidden pointer-events-none invisible absolute h-0 overflow-hidden'
          : 'pointer-events-none invisible absolute h-0 overflow-hidden'
      }
    >
      <div className={side === 'left' ? 'w-sidebar-min' : 'w-assistant-min'} />
      <div
        className={
          side === 'left' ? 'w-sidebar-default' : 'w-assistant-default'
        }
      />
      <div
        className={side === 'left' ? 'w-sidebar-max' : 'w-assistant-limit'}
      />
      <div className="w-4" />
      <div className={side === 'left' ? 'w-sidebar-closed' : 'w-0'} />
    </div>
  );
}
