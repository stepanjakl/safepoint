// When a process runs on its own. A structure rather than a sentence, because
// the schedule is now something a person can change, and a sentence cannot be
// edited one part at a time. Placeholder: nothing reads it to start a run.

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type ProcessSchedule = {
  // Off means manual only: the process runs when a person starts it.
  enabled: boolean;
  cadence: 'daily' | 'weekly';
  // Read only when the cadence is weekly, and kept when it is not, so
  // switching to daily and back does not lose the day.
  day: Weekday;
  // 24-hour HH:MM, in `timezone`.
  time: string;
  timezone: string;
};

// The short form, where the schedule sits beside the runs: when the next one
// is, not how the schedule is built.
export function scheduleShortLabel(schedule: ProcessSchedule): string {
  if (!schedule.enabled) return 'Manual only';
  return schedule.cadence === 'daily'
    ? `Daily ${schedule.time}`
    : `${schedule.day.slice(0, 3)} ${schedule.time}`;
}

// The long form, for a tooltip or a screen reader.
export function scheduleLabel(schedule: ProcessSchedule): string {
  if (!schedule.enabled) return 'Manual only. Runs when a person starts it.';
  const when =
    schedule.cadence === 'daily'
      ? `Daily · ${schedule.time}`
      : `Weekly · ${schedule.day} ${schedule.time}`;
  return `${when} · ${schedule.timezone}`;
}
