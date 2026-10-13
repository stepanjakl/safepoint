'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import Clock from 'blode-icons-react/icons/clock';
import { MorphingText } from '@/components/ui/morphing-text';
import { Switch } from '@/components/ui/switch';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import {
  WEEKDAYS,
  scheduleLabel,
  type ProcessSchedule,
} from '@/lib/process/schedule';
import { useProcessSchedule } from './schedule-store';

// The review panel's filter pill, at the size of a choice in a popover.
const CHOICE =
  'control-wash border-rule-default hover:bg-surface-hover focus-visible:bg-surface-hover aria-pressed:bg-surface-selected aria-pressed:border-rule-strong inline-flex min-h-8 items-center justify-center rounded-full border px-2.5 py-1 text-meta whitespace-nowrap';

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
        <Dialog className="grid gap-4 p-4 outline-none">
          <ScheduleFields
            schedule={schedule}
            update={update}
            title={
              <Heading slot="title" className="text-dense font-medium">
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
  // Which way the switch last moved, so the fields arrive the same way; none
  // until it moves, so opening shows them still.
  const [moved, setMoved] = useState<'on' | 'off' | null>(null);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        {title}
        <Switch
          isSelected={schedule.enabled}
          onChange={(enabled) => {
            setMoved(enabled ? 'on' : 'off');
            update({ enabled });
          }}
        >
          <MorphingText text={schedule.enabled ? 'On' : 'Off'} />
        </Switch>
      </div>

      <div
        key={schedule.enabled ? 'on' : 'off'}
        className="schedule-mode grid gap-4"
        data-moved={moved ?? undefined}
      >
        {schedule.enabled ? (
          <>
            <div
              role="group"
              aria-label="Repeats"
              className="grid grid-cols-2 gap-1.5"
            >
              {(['daily', 'weekly'] as const).map((cadence) => (
                <button
                  key={cadence}
                  type="button"
                  className={CHOICE}
                  aria-pressed={schedule.cadence === cadence}
                  onClick={() => update({ cadence })}
                >
                  {cadence === 'daily' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
            {schedule.cadence === 'weekly' ? (
              <div
                role="group"
                aria-label="Day"
                className="grid grid-cols-7 gap-1"
              >
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`${CHOICE} px-0`}
                    aria-pressed={schedule.day === day}
                    aria-label={day}
                    onClick={() => update({ day })}
                  >
                    {day.slice(0, 1)}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="text-meta text-muted flex items-center justify-between gap-3">
              Time
              <input
                type="time"
                value={schedule.time}
                required
                onChange={(event) => {
                  if (event.target.value) update({ time: event.target.value });
                }}
                className="value field text-primary min-h-8 px-2 [color-scheme:inherit]"
              />
            </label>
            <p className="text-meta text-muted -mt-2 text-right">
              {schedule.timezone}
            </p>
          </>
        ) : (
          <div className="grid gap-3">
            <p className="text-meta text-muted leading-normal">
              Runs only when someone starts one. Earlier runs are kept.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
