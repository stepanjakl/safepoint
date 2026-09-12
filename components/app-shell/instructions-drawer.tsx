'use client';

import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { Button, ICON_QUIET, ICON_SHAPE } from '@/components/ui/button';
import { cx } from '@/lib/cx';
import type { ProcessSummary } from '@/lib/process/placeholder-process';

// A slide-over rather than a centred dialog: the instructions are reference
// material read alongside the run, not a decision that should block it.
// react-aria drives the transition through data-entering / data-exiting; the
// `drawer-overlay` and `drawer-modal` classes are the hooks for the scrim and
// the slide, both of which stay in CSS. Everything else is here.
export function InstructionsDrawer({
  instructions,
}: {
  instructions: ProcessSummary['instructions'];
}) {
  return (
    <DialogTrigger>
      <Button>
        Instructions <span className="value">{instructions.version}</span>
      </Button>
      {/* Inset by the shell's own padding so the panel lines up with the panes. */}
      <ModalOverlay
        className="drawer-overlay p-shell-inset fixed inset-0 z-40 flex justify-end"
        isDismissable
      >
        <Modal className="drawer-modal control-face surface-floating rounded-shell relative h-full w-[min(420px,100%)] overflow-clip max-sm:w-full">
          <Dialog className="grid h-full grid-rows-[auto_minmax(0,1fr)] outline-none">
            <header className="border-rule-faint flex items-start justify-between gap-4 border-b p-5">
              <div>
                <Heading slot="title" className="text-title [font-weight:550]">
                  Instructions
                </Heading>
                <p className="text-meta text-muted">
                  <span className="value">{instructions.version}</span> ·{' '}
                  {instructions.updatedAt}
                </p>
              </div>
              <AriaButton
                slot="close"
                // The same icon square the sidebar uses, at header size: the
                // shared shape and quiet face, so the wash and its timing are
                // one definition rather than a second one that drifted.
                className={cx(ICON_SHAPE, ICON_QUIET, 'text-title size-8')}
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Close instructions</span>
              </AriaButton>
            </header>
            <div className="overflow-y-auto p-5">
              <ol className="marker:text-muted text-dense grid list-decimal gap-3 pl-4.5 leading-relaxed">
                {instructions.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className="border-rule-faint text-muted text-meta mt-5 border-t pt-3">
                Placeholder text. The engine does not yet publish the
                instructions it ran under.
              </p>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
