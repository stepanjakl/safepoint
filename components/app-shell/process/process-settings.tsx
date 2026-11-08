'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import CircleQuestionmark from 'blode-icons-react/icons/circle-questionmark';
import Archive from 'blode-icons-react/icons/archive';
import TrashCanSimple from 'blode-icons-react/icons/trash-can-simple';
import { MenuIcon } from '@/components/app-shell/sidebar/menu-parts';
import {
  EVALUATION_DESCRIPTIONS,
  type ProcessSummary,
} from '@/lib/process/model';
import { PROCESS_NAME_MAX, useProcessName } from './process-names-store';
import { ScheduleFields } from './schedule-control';
import { useProcessSchedule } from './schedule-store';

const FIELD = 'field text-dense text-primary min-h-9 w-full px-3';

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
  return (
    <div className="grid w-full max-w-xl grid-cols-[minmax(0,1fr)] gap-5 p-5">
      <Section id="settings-general" title="General">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label
              htmlFor="settings-name"
              className="text-dense text-primary flex min-h-6 items-center font-medium"
            >
              Name
            </label>
            <NameField processId={process.id} fallback={process.name} />
          </div>
          <div className="grid gap-1.5">
            <p className="text-dense text-primary flex min-h-6 items-center font-medium">
              Evaluation
            </p>
            <div className="text-dense text-primary flex items-center gap-1">
              <div className="flex items-center gap-2">
                <MenuIcon
                  name={`${process.evaluation}Filled`}
                  className="flex-none"
                />
                <span>
                  {process.evaluation === 'rules'
                    ? 'Checked by rules'
                    : 'Model’s judgement'}
                </span>
              </div>
              <Tooltip
                label="How evaluation works"
                description={EVALUATION_DESCRIPTIONS[process.evaluation]}
              >
                <button
                  type="button"
                  aria-label="How evaluation works"
                  className="text-muted-strong hover:text-muted focus-visible:text-primary focus-visible:outline-field-edge-active inline-grid size-6 flex-none cursor-help place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <CircleQuestionmark aria-hidden size={18} strokeWidth={1.8} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </Section>

      <Section id="settings-schedule">
        <div className="grid gap-3">
          <ScheduleFields
            schedule={schedule}
            update={update}
            title={
              <h3
                id="settings-schedule"
                className="readout text-muted flex min-h-6 items-center"
              >
                Schedule
              </h3>
            }
          />
        </div>
      </Section>

      <Section id="settings-notifications" title="Notifications">
        <ul className="grid gap-4">
          <ToggleRow title="Review needed" description="Notify reviewers." />
          <ToggleRow
            title="Run blocked or failed"
            description="Notify the process owner."
          />
        </ul>
      </Section>

      <Section id="settings-lifecycle" title="Archive or delete">
        <ul className="grid gap-4">
          <ActionRow
            title="Archive process"
            description="Hide this process and stop its schedule. History is kept."
            action="Archive"
            icon={<Archive aria-hidden size={14} />}
          />
          <ActionRow
            title="Delete permanently"
            description={
              process.runs.length > 0
                ? 'Only processes with no runs can be deleted.'
                : 'Remove this process permanently.'
            }
            action="Delete"
            icon={<TrashCanSimple aria-hidden size={14} />}
          />
        </ul>
      </Section>
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
      className="border-rule-faint grid gap-3 border-t pt-5 first:border-t-0 first:pt-0"
    >
      {title ? (
        <h3 id={id} className="readout text-muted flex min-h-6 items-center">
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
        id="settings-name"
        value={draft ?? name}
        maxLength={PROCESS_NAME_MAX}
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
        className={FIELD}
      />
    </div>
  );
}

// Keep the switch beside its label; recipient guidance sits underneath.
function ToggleRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <li className="grid justify-items-start gap-1.5">
      <Switch isDisabled>
        <span className="text-dense text-primary font-medium">{title}</span>
      </Switch>
      <p className="text-meta text-muted">{description}</p>
    </li>
  );
}

function ActionRow({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action: string;
  icon: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-1.5">
        <p className="text-dense flex min-h-6 items-center font-medium">
          {title}
        </p>
        <p className="text-meta text-muted">{description}</p>
      </div>
      <Button isDisabled className="flex-none">
        {icon}
        {action}
      </Button>
    </li>
  );
}
