'use client';

import { type ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import Clock from 'blode-icons-react/icons/clock';
import { Switch } from '@/components/ui/switch';
import { ChoiceGroup } from '@/components/ui/choice-group';
import { Fold } from '@/components/ui/fold';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import {
  WEEKDAYS,
  scheduleLabel,
  type ProcessSchedule,
} from '@/lib/process/schedule';
import { useProcessSchedule } from './schedule-store';

const CADENCES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] satisfies { value: ProcessSchedule['cadence']; label: string }[];

const DAYS = WEEKDAYS.map((day) => ({
  value: day,
  label: day.slice(0, 1),
  ariaLabel: day,
}));

/*
  The schedule, beside the runs it produces: an icon in the runs header, next
  to start. It answers "when does the next one of these appear", a question
  about this list, and a schedule a person can change or switch off needs a
  control, not a line of text. It carries a dot while a schedule is on and none while runs
  start only by hand; the tooltip says which, and when.

  Placeholder: the change is saved in this browser and nothing starts a run
  from it.
*/
export function ScheduleControl({
  processId,
  schedule: initial,
}: {
  processId: string;
  schedule: ProcessSchedule;
}) {
  const [schedule, update] = useProcessSchedule(processId, initial);
  return (
    <DialogTrigger>
      <HeadIconButton
        label={`Schedule: ${scheduleLabel(schedule)}`}
        tooltip={{
          label: 'Schedule',
          description: scheduleLabel(schedule),
          placement: 'bottom',
        }}
        size="alone"
        wash="rest"
        active={schedule.enabled}
        mark={schedule.enabled}
      >
        <Clock aria-hidden size={14} strokeWidth={1.8} />
      </HeadIconButton>
      <Popover
        // Opens over the thread, not back over the sidebar the rail sits beside.
        placement="bottom start"
        offset={6}
        className="popover-motion control-face surface-popover rounded-shell w-[min(18rem,calc(100vw-2rem))]"
      >
        <Dialog className="grid gap-3 p-4 outline-none">
          <ScheduleFields
            schedule={schedule}
            update={update}
            title={
              <Heading
                slot="title"
                className="text-dense flex min-h-6 items-center font-medium"
              >
                Schedule
              </Heading>
            }
          />
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/*
  The schedule's fields, for both places it is set: the popover on the runs
  rail and the Settings tab of the setup drawer. The two read and write one
  store, so a change in either is already in the other.
*/
export function ScheduleFields({
  schedule,
  update,
  title,
}: {
  schedule: ProcessSchedule;
  update: ReturnType<typeof useProcessSchedule>[1];
  // The heading, which is the popover's dialog title in one place and a
  // section heading in the other.
  title: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        {title}
        <Switch
          aria-label="Scheduled runs"
          isSelected={schedule.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </div>

      <div className="grid">
        {/* One cell keeps the two transitioning heights from adding together. */}
        <div
          className="col-start-1 row-start-1 min-w-0"
          inert={!schedule.enabled}
        >
          <Fold open={schedule.enabled}>
            <ChoiceGroup
              label="Repeats"
              options={CADENCES}
              value={schedule.cadence}
              onChange={(cadence) => update({ cadence })}
            />
            <Fold open={schedule.cadence === 'weekly'} className="pt-4">
              <ChoiceGroup
                label="Day"
                options={DAYS}
                value={schedule.day}
                onChange={(day) => update({ day })}
              />
            </Fold>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="text-meta text-muted flex items-center gap-3">
                Time
                <input
                  type="time"
                  value={schedule.time}
                  required
                  onChange={(event) => {
                    if (event.target.value)
                      update({ time: event.target.value });
                  }}
                  className="value field text-primary min-h-8 px-2 [color-scheme:inherit]"
                />
              </label>
              <p className="text-meta text-muted">{schedule.timezone}</p>
            </div>
          </Fold>
        </div>
        <div
          className="col-start-1 row-start-1 min-w-0"
          inert={schedule.enabled}
        >
          <Fold open={!schedule.enabled}>
            <p className="text-meta text-muted leading-normal">
              Start runs manually.
            </p>
          </Fold>
        </div>
      </div>
    </>
  );
}
