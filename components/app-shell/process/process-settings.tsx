'use client';

import { styleDebug } from '@/lib/style-debug';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ProcessSummary } from '@/lib/process/model';
import { PROCESS_NAME_MAX, useProcessName } from './process-names-store';
import { ScheduleFields } from './schedule-control';
import { useProcessSchedule } from './schedule-store';

const NOTE = 'border-rule-faint text-muted text-meta border-t pt-3';

// A form field on the field tokens: the border is its focus indicator, and
// focus is emitted after hover, so a resting pointer never repaints it.
const FIELD =
  'control-wash text-dense text-primary bg-field-face border-field-edge hover:border-field-edge-hover focus:border-field-edge-active rounded-control min-h-9 w-full border-(length:--spacing-field-edge) px-3 outline-none forced-colors:focus:outline-2 forced-colors:focus:outline-offset-2 forced-colors:focus:outline-solid';

/*
  The setup drawer's Settings tab: what applies to the process as a whole
  rather than to its instructions or its systems, in the order it is most
  often reached for -- what it is called, when it runs, who hears about it,
  and last, ending it.

  The name and the schedule are live, on the same stores as the header title
  and the runs rail's schedule, so a change here is already there. The rest
  are placeholders, shown where they will live.

  Archive before delete. A process that has run owns a record of what it
  changed, and Safepoint's point is that the record survives: archiving stops
  the schedule and hides the process but keeps its runs and reviews, while
  deleting -- which takes the record with it -- is only for a process that has
  never run.
*/
export function ProcessSettings({ process }: { process: ProcessSummary }) {
  const [schedule, update] = useProcessSchedule(process.id, process.schedule);
  const runs = process.runs.length;
  const runCount = `${runs} ${runs === 1 ? 'run' : 'runs'}`;

  return (
    <div
      {...styleDebug({ component: 'ProcessSettings' })}
      className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5"
    >
      <Section id="settings-name" title="Name">
        <NameField processId={process.id} fallback={process.name} />
      </Section>

      <Section id="settings-schedule">
        <div className="grid gap-4">
          <ScheduleFields
            schedule={schedule}
            update={update}
            title={
              <h3 id="settings-schedule" className="readout text-muted">
                Schedule
              </h3>
            }
          />
        </div>
      </Section>

      <Section id="settings-notifications" title="Notifications">
        <ul>
          <ToggleRow
            title="A review is waiting"
            description="Tell the reviewers when a run has lines to decide."
          />
          <ToggleRow
            title="A run is blocked or fails"
            description="Tell the process owner when a run cannot finish."
          />
        </ul>
      </Section>

      <Section id="settings-lifecycle" title="Archive or delete">
        <ul>
          <ActionRow
            title="Archive process"
            description={`Stops its schedule and hides it from the sidebar. Its ${runCount} and their reviews are kept, and it can be restored.`}
            action="Archive…"
          />
          <ActionRow
            title="Delete permanently"
            description={
              runs > 0
                ? `Removes the process and the record of what its runs changed, so it is only for a process that has never run. This one has ${runCount}.`
                : 'Removes the process for good. It has never run, so there is no record to lose.'
            }
            action="Delete…"
          />
        </ul>
      </Section>

      <p className={NOTE}>
        The name and schedule are saved in this browser. Notifications,
        archiving and deleting are placeholders.
      </p>
    </div>
  );
}

// A settings group: a rule above every one but the first, and its heading --
// given here, or drawn by the content when it has to share a row.
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-rule-faint grid gap-2 border-t pt-5 first:border-t-0 first:pt-0"
    >
      {title ? (
        <h3 id={id} className="readout text-muted">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/*
  The name, as a plain field. Enter keeps the change and stays in the field;
  so does leaving it. Escape puts back a name that was being changed, and
  otherwise is left to close the drawer. A blank name keeps the old one.
*/
function NameField({
  processId,
  fallback,
}: {
  processId: string;
  fallback: string;
}) {
  const { name, rename } = useProcessName(processId, fallback);
  const [draft, setDraft] = useState<string | null>(null);

  const keep = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) {
      rename(draft);
    }
    setDraft(null);
  };

  return (
    <div className="grid gap-1.5">
      <input
        value={draft ?? name}
        maxLength={PROCESS_NAME_MAX}
        aria-labelledby="settings-name"
        aria-describedby="settings-name-hint"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={keep}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            keep();
          } else if (
            event.key === 'Escape' &&
            draft !== null &&
            draft !== name
          ) {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        {...styleDebug({ component: 'ProcessSettings', part: 'name-field' })}
        className={FIELD}
      />
      <p id="settings-name-hint" className="text-meta text-muted">
        Shown in the header and the sidebar. The title in the header renames it
        too.
      </p>
    </div>
  );
}

// A placeholder switch, the whole row its label.
function ToggleRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <li className="border-rule-faint border-b last:border-b-0">
      <Switch
        isDisabled
        className="flex w-full items-start justify-between gap-4 py-3"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-dense text-primary [font-weight:550]">
            {title}
          </span>
          <span className="text-meta text-muted">{description}</span>
        </span>
      </Switch>
    </li>
  );
}

function ActionRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: string;
}) {
  return (
    <li className="border-rule-faint flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="grid min-w-0 gap-0.5">
        <p className="text-dense [font-weight:550]">{title}</p>
        <p className="text-meta text-muted">{description}</p>
      </div>
      <Button isDisabled className="flex-none">
        {action}
      </Button>
    </li>
  );
}
