'use client';

import type { RefObject } from 'react';
import { motion, type Transition } from 'motion/react';

import { cx } from '@/lib/cx';
import { MENU_RAIL, MENU_RULE, MenuIcon } from './menu-parts';

/*
  The search field's clear button, in place of the browser's own (hidden in
  process-search.css), which drew in its own colour and only in some browsers.
  A chip in the field's edge colours, with no colour of its own on the glyph:
  it inherits the field's text colour, so it steps with the magnifier at the
  other end -- muted at rest, stronger under the pointer, primary while the
  field is focused. Pointer and keyboard focus on the button itself step the
  chip and lift the glyph to primary alike.
*/
const SEARCH_CLEAR =
  'control-wash bg-search-clear hover:bg-search-clear-hover hover:text-primary focus-visible:bg-search-clear-hover focus-visible:text-primary grid size-4 place-items-center rounded-full';

/*
  The field and its rule, as one band the search button opens. Kept mounted and
  inert while closed rather than unmounted, so ⌘K has an element to focus in the
  same commit that opens it. The band animates its height and its opacity, so
  the field and the rule inside it arrive and leave together, and nothing in it
  slides.

  It clips for good, so nothing about its overflow changes at either end of the
  travel. That is what the rule's blink was: the rule's lit line is a shadow
  cast below the rule's own box, and a band that clipped only while travelling
  cut the line off as it started and let it pop back as it stopped. The band
  now carries a hairline of bottom padding, so the shadow is inside what it
  clips, and takes the same hairline back as a negative margin, so nothing below
  it moves.
*/
export function ProcessSearch({
  open,
  query,
  onQueryChange,
  transition,
  inputRef,
  onClose,
  onDismiss,
}: {
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  transition: Transition;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The field lost focus while empty. */
  onClose: () => void;
  /** Escape on an empty field: close, and hand focus back to the toggle. */
  onDismiss: () => void;
}) {
  return (
    <motion.div
      id="process-search"
      className="pb-control-highlight-hairline -mb-control-highlight-hairline overflow-hidden"
      inert={!open}
      initial={false}
      animate={{
        height: open ? 'auto' : 0,
        opacity: open ? 1 : 0,
      }}
      transition={transition}
      onAnimationComplete={(definition) => {
        if ((definition as { height?: unknown }).height === 0) {
          onQueryChange('');
        }
      }}
    >
      {/*
        A div rather than the label itself, because the clear button sits inside
        the field's edge and a label may not contain a second labelable element.
        No leading padding here: `.menu-search-field` derives it from the rail,
        the edge and the glyph's box, so the glyph stays on the axis whatever
        the edge is.
      */}
      <div className="menu-search-field flex h-9 items-center gap-2">
        <label className="flex h-full min-w-0 flex-1 cursor-text items-center gap-2">
          {/*
            An even-width box, though the glyph in it is 17px. A box of odd
            width centres on a half pixel wherever it is placed, so it can never
            sit on an integer axis -- which is the whole reason the rail cells
            elsewhere carry a width of their own rather than shrink-wrapping
            their glyph. The width is the field's own --menu-search-glyph, which
            its inset reads.
          */}
          <span className="rail-mark inline-grid w-(--menu-search-glyph) flex-none place-items-center">
            <MenuIcon
              name="search"
              className="control-wash size-4.25 flex-none"
              strokeWidth={2}
            />
          </span>
          <span className="sr-only">Search processes</span>
          <input
            ref={inputRef}
            type="search"
            className="text-primary text-meta min-h-menu-rail w-full min-w-0 border-none bg-transparent font-medium outline-none"
            placeholder="Search processes…"
            value={query}
            /* The shortcut belongs on the control it reaches, not in its name:
               the search button's tooltip is the sighted half. */
            aria-keyshortcuts="Meta+K Control+K"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // Also stops the browser's own clear, so the two steps below are
              // the only thing Escape does here.
              event.preventDefault();
              if (query !== '') {
                onQueryChange('');
                return;
              }
              onDismiss();
            }}
            onBlur={() => {
              // Leaving the window is not leaving the field.
              if (!document.hasFocus()) return;
              if (query === '') onClose();
            }}
          />
        </label>
        {/*
          In a rail cell, where the shortcut keycap used to sit, so it centres
          on the trailing axis the row badges share. Only while there is
          something to clear.
        */}
        {query !== '' ? (
          <span className={MENU_RAIL}>
            <button
              type="button"
              className={SEARCH_CLEAR}
              aria-label="Clear search"
              // Keeps the caret in the field through the press.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus({ preventScroll: true });
              }}
            >
              <MenuIcon
                name="clear"
                className="size-2.5 flex-none"
                strokeWidth={2.6}
              />
            </button>
          </span>
        ) : null}
      </div>
      <div className={cx(MENU_RULE, 'mt-3.5')} aria-hidden="true" />
    </motion.div>
  );
}
