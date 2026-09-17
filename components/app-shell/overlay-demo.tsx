'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import X from 'blode-icons-react/icons/x';
import { Button, ICON_QUIET, ICON_SHAPE } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import {
  CLOSE_BUTTON,
  DrawerAside,
  PANEL,
  type AsideLayer,
} from './drawer-aside';

/*
  A demonstration, not a feature. The tabs took the setup panels out of the
  overlay, but the overlay pattern itself -- a panel over the sheet, with a
  second panel that opens to its left -- is worth keeping to hand while we
  decide what the review surface should be.

  Everything here is the drawer's own machinery at the drawer's own
  proportions: the same scrim and slide (`drawer-overlay` and `drawer-modal` in
  app/components.css), the same two widths, the same `DrawerAside` the Inputs
  and Instructions tabs use, the same close control, and the same rule that
  Escape closes the second panel before the first.
*/

// Both panels are sized against the viewport rather than each other: the modal
// hugs them, so a click beside them lands on the scrim and dismisses.
const MAIN_WIDTH =
  'w-[min(420px,calc(100vw_-_2_*_var(--spacing-shell-inset)))]';
const ASIDE_WIDTH =
  'w-[min(35rem,calc(100vw_-_2_*_var(--spacing-shell-inset)))]';

const DETAIL: AsideLayer = {
  key: 'demo-detail',
  eyebrow: 'Second panel',
  title: 'Detail',
  announce: 'Detail panel',
  meta: 'Opens to the left of the panel that opened it.',
  body: (
    <div className="text-dense grid gap-3 p-5 leading-relaxed">
      <p>
        This is the panel the setup drawer used for an input’s records and for
        what changed in a version. It arrives from the left, swaps its content
        in place when another item is chosen, and hands focus back to whatever
        opened it.
      </p>
      <p className="text-muted">
        Escape closes this one first, and the panel behind it second.
      </p>
    </div>
  ),
};

export function OverlayDemo() {
  const [open, setOpen] = useState(false);
  // The second panel, and the moment it spends leaving.
  const [detail, setDetail] = useState(false);
  const [exiting, setExiting] = useState(false);
  // What opened the second panel, so closing it puts focus back there.
  const opener = useRef<HTMLButtonElement>(null);

  const showDetail = () => {
    setExiting(false);
    setDetail(true);
  };
  const hideDetail = () => {
    // Focus goes back as the close begins, as it does in the drawer: the panel
    // holds focus, and unmounting it would drop focus to the body.
    requestAnimationFrame(() => opener.current?.focus());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDetail(false);
      return;
    }
    setExiting(true);
  };
  const finishExit = () => {
    setDetail(false);
    setExiting(false);
  };
  const showing = detail && !exiting;

  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !showing) return;
    // The second panel answers Escape before the overlay behind it does.
    event.stopPropagation();
    hideDetail();
  };

  return (
    <>
      <AriaButton
        onPress={() => setOpen(true)}
        aria-label="Overlay demo"
        aria-expanded={open}
        className={cx(ICON_SHAPE, ICON_QUIET, 'size-8')}
      >
        {/* Two panels side by side, the smaller one leading. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          className="size-4"
        >
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10 5v14" />
        </svg>
      </AriaButton>

      <ModalOverlay
        isOpen={open}
        onOpenChange={(value) => {
          // The overlay takes the second panel with it rather than leaving it
          // mounted for the next opening.
          if (!value) {
            setDetail(false);
            setExiting(false);
          }
          setOpen(value);
        }}
        isDismissable
        // Inset by the shell's own padding so the panels line up with the panes.
        className="drawer-overlay p-shell-inset fixed inset-0 z-40 flex justify-end"
      >
        <Modal className="drawer-modal flex h-full max-w-full">
          <Dialog className="h-full outline-none">
            <div
              className="gap-shell-inset flex h-full justify-end"
              onKeyDownCapture={onKeyDownCapture}
            >
              {detail ? (
                <DrawerAside
                  current={DETAIL}
                  leaving={null}
                  direction="down"
                  exiting={exiting}
                  onExited={finishExit}
                  onLeft={() => undefined}
                  className={ASIDE_WIDTH}
                />
              ) : null}
              <div
                className={cx(
                  PANEL,
                  MAIN_WIDTH,
                  // Where both do not fit, the second panel takes this one's
                  // place rather than squeezing beside it.
                  detail ? 'max-lg:hidden' : null,
                )}
              >
                <header className="border-rule-faint grid gap-4 border-b p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Heading
                        slot="title"
                        className="text-title [font-weight:550]"
                      >
                        Overlay demo
                      </Heading>
                      <p className="text-meta text-muted">
                        The panel pattern, kept for the review surface
                      </p>
                    </div>
                    <AriaButton slot="close" className={CLOSE_BUTTON}>
                      <X
                        aria-hidden
                        size={18}
                        strokeWidth={2.2}
                        className="size-3.5 flex-none"
                      />
                      <span className="sr-only">Close overlay demo</span>
                    </AriaButton>
                  </div>
                </header>
                <div className="text-dense grid gap-4 p-5 leading-relaxed">
                  <p>
                    One panel over the sheet, and a second that opens beside it.
                    The control that opens the second closes it again, and focus
                    comes back here when it goes.
                  </p>
                  <Button
                    ref={opener}
                    onPress={() => (showing ? hideDetail() : showDetail())}
                    aria-expanded={showing}
                    className="justify-self-start"
                  >
                    {showing
                      ? 'Hide the second panel'
                      : 'Show the second panel'}
                  </Button>
                </div>
              </div>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
