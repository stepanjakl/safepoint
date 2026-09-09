'use client';

import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { Button } from '@/components/ui/button';
import type { ProcessSummary } from '@/lib/process/placeholder-process';

// A slide-over rather than a centred dialog: the instructions are reference
// material read alongside the run, not a decision that should block it.
// react-aria drives the transition through data-entering / data-exiting.
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
      <ModalOverlay className="drawer-overlay" isDismissable>
        <Modal className="drawer-modal">
          <Dialog className="drawer-dialog">
            <header className="drawer-header">
              <div>
                <Heading slot="title" className="drawer-title">
                  Instructions
                </Heading>
                <p className="text-meta text-muted">
                  <span className="value">{instructions.version}</span> ·{' '}
                  {instructions.updatedAt}
                </p>
              </div>
              <AriaButton slot="close" className="drawer-close">
                <span aria-hidden="true">×</span>
                <span className="sr-only">Close instructions</span>
              </AriaButton>
            </header>
            <div className="drawer-body">
              <ol>
                {instructions.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className="drawer-note">
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
