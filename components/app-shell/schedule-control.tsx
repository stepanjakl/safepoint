'use client';

import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
  Switch,
} from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import CalendarClock from 'blode-icons-react/icons/calendar-clock';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  WEEKDAYS,
  scheduleLabel,
  scheduleShortLabel,
  type ProcessSchedule,
} from '@/lib/process/schedule';
import { useProcessSchedule } from './schedule-store';

// The review panel's filter pill, at the size of a choice in a popover.
const CHOICE =
  'control-wash border-rule-default hover:bg-surface-inset focus-visible:bg-surface-inset aria-pressed:bg-surface-selected aria-pressed:border-rule-strong inline-flex min-h-8 items-center justify-center rounded-full border px-2.5 py-1 text-meta whitespace-nowrap';

/*
  The schedule, beside the runs it produces. It moved here from under the
  process name because it answers "when does the next one of these appear",
  which is a question about this list, and because a schedule a person can
  change or switch off needs a control, not a line of text.

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
      <Tooltip label="Schedule" description={scheduleLabel(schedule)}>
        <AriaButton
          aria-label={`Schedule: ${scheduleLabel(schedule)}`}
          className="control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary data-[pressed]:bg-surface-selected rounded-control text-meta -my-1 inline-flex min-h-7 items-center gap-1.5 px-1.5 whitespace-nowrap"
          data-off={schedule.enabled ? undefined : ''}
        >
          <CalendarClock
            aria-hidden
            size={14}
            strokeWidth={1.8}
            className="flex-none"
          />
          <span className="value">{scheduleShortLabel(schedule)}</span>
        </AriaButton>
      </Tooltip>
      <Popover
        // Opens over the thread, not back over the sidebar the rail sits beside.
        placement="bottom start"
        offset={6}
        className="control-face surface-floating rounded-shell w-[min(18rem,calc(100vw-2rem))]"
      >
        <Dialog className="grid gap-4 p-4 outline-none">
          <div className="flex items-center justify-between gap-3">
            <Heading slot="title" className="text-dense font-medium">
              Schedule
            </Heading>
            <Switch
              isSelected={schedule.enabled}
              onChange={(enabled) => update({ enabled })}
              className="group text-meta text-muted inline-flex cursor-pointer items-center gap-2"
            >
              {schedule.enabled ? 'On' : 'Off'}
              {/* control-face owns its timing, so the track swaps faces and
                  animates nothing itself; only the thumb travels. */}
              <span
                aria-hidden="true"
                className="control-face control-quiet group-data-[selected]:control-accent relative h-5 w-8.5 rounded-full"
              >
                <span className="absolute top-1/2 left-0.75 size-3.5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-(--duration-state) ease-out group-data-[selected]:translate-x-3.5 motion-reduce:transition-none" />
              </span>
            </Switch>
          </div>

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
                    if (event.target.value)
                      update({ time: event.target.value });
                  }}
                  className="value text-primary border-rule-default bg-surface-inset rounded-control min-h-8 border px-2 [color-scheme:inherit]"
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
              <Tooltip
                label="Run now"
                description="Starts a run under the current instructions. Coming soon."
              >
                <Button aria-disabled="true">Run now</Button>
              </Tooltip>
            </div>
          )}

          <p className="border-rule-faint text-muted text-micro border-t pt-3 leading-normal">
            Placeholder. Saved in this browser; nothing starts a run from it.
          </p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
