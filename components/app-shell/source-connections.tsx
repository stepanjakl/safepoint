'use client';

import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import type { SourceDetail } from '@/lib/process/source-details';
import type { SystemLink } from '@/lib/process/system-links';
import { SystemDisc } from './system-parts';

/*
  Connecting and removing read systems. Adding is a side panel, a list to
  browse next to the one it adds to. Removing stays a centred dialog over both
  panels: it is the one step here that should stop everything until it is
  decided.

  A mock. The choices are saved in this browser and change what the process
  shows; the recorded run and the review cite what they cite.
*/

const NOTE = 'border-rule-faint text-muted text-meta border-t pt-3';

// Where connections would come from in a real process. Listed so the panel
// shows the shape of the feature; none has an adapter in this demo.
const INTEGRATIONS = [
  'Google Sheets',
  'SAP S/4HANA',
  'Salesforce',
  'Snowflake',
];

function joinChecks(checks: string[]): string {
  if (checks.length < 2) return checks.join('');
  return `${checks.slice(0, -1).join(', ')} and ${checks.at(-1)}`;
}

export function AddReadSystemPanel({
  available,
  details,
  onConnect,
}: {
  available: SystemLink[];
  details: Record<string, SourceDetail>;
  onConnect: (id: string) => void;
}) {
  return (
    <div className="grid gap-6 p-5">
      <section aria-labelledby="add-scenario-files">
        <div className="flex items-baseline justify-between gap-3 pb-1.5">
          <h3 id="add-scenario-files" className="readout text-muted">
            Scenario files
          </h3>
          <p className="text-meta text-muted">
            Only these can be connected in this demo
          </p>
        </div>
        {available.length === 0 ? (
          <p className="text-dense text-muted py-2">
            Every source in this scenario is already connected. Remove one to
            see it here.
          </p>
        ) : (
          <ul>
            {available.map((link) => {
              const detail = details[link.id];
              return (
                <li
                  key={link.id}
                  className="border-rule-faint flex min-h-13 items-center gap-3 border-b py-2 last:border-b-0"
                >
                  <SystemDisc link={link} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-dense text-primary truncate">
                      {link.label}
                    </span>
                    {detail ? (
                      <span className="text-meta text-muted">
                        <span className="value">{detail.file}</span> ·{' '}
                        {detail.records.length}{' '}
                        {detail.records.length === 1 ? 'record' : 'records'}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    onPress={() => onConnect(link.id)}
                    aria-label={`Connect ${link.label}`}
                  >
                    Connect
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-integrations">
        <h3 id="add-integrations" className="readout text-muted pb-1.5">
          Integrations
        </h3>
        <ul>
          {INTEGRATIONS.map((name) => (
            <li
              key={name}
              className="border-rule-faint flex min-h-10 items-center justify-between gap-3 border-b py-2 last:border-b-0"
            >
              <span className="text-dense text-muted">{name}</span>
              <span className="text-meta text-muted">Not in this demo</span>
            </li>
          ))}
        </ul>
      </section>

      <p className={NOTE}>
        Mock. Saved in this browser only; the recorded run and its review don’t
        change.
      </p>
    </div>
  );
}

export function RemoveSourceDialog({
  isOpen,
  onOpenChange,
  detail,
  onRemove,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  detail: SourceDetail;
  onRemove: () => void;
}) {
  const cited = detail.records.filter(
    (record) => record.citedBy.length > 0,
  ).length;
  const items = `${detail.citedByCount} ${detail.citedByCount === 1 ? 'review item' : 'review items'}`;

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      // The drawer's scrim, over both panels, with the dialog centred on it.
      className="drawer-overlay p-shell-inset fixed inset-0 z-50 grid place-items-center"
    >
      <Modal className="control-face surface-floating rounded-shell relative max-h-full w-[min(28rem,100%)] overflow-y-auto">
        <Dialog role="alertdialog" className="grid gap-4 p-5 outline-none">
          {({ close }) => (
            <>
              <Heading slot="title" className="text-title [font-weight:550]">
                Remove {detail.label}?
              </Heading>
              <div className="text-dense grid gap-2 leading-relaxed">
                <p>
                  This run cited {cited} of its {detail.records.length}{' '}
                  {detail.records.length === 1 ? 'record' : 'records'} across{' '}
                  {items}
                  {detail.checks.length > 0
                    ? `, for the ${joinChecks(detail.checks)} ${detail.checks.length === 1 ? 'check' : 'checks'}`
                    : ''}
                  .
                </p>
                <p>
                  Without it the next run could not read that evidence
                  {detail.checks.length > 0
                    ? ', and a line whose required check depends on it would be blocked'
                    : ''}
                  .
                </p>
                <p className="text-muted">
                  The recorded run, its review and the evidence it cites stay as
                  they are.
                </p>
              </div>
              <p className={NOTE}>
                Mock. Saved in this browser only; connect it again from Add a
                read system.
              </p>
              <div className="flex justify-end gap-2">
                <Button onPress={close} autoFocus>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={() => {
                    close();
                    onRemove();
                  }}
                >
                  Remove
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
