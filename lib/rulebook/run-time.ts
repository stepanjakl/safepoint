import { z } from 'zod';

import { describeInstant, inWeek, mondayOf, zonedInstant } from './cycle';
import { WEEKDAYS } from './field-types';

// How a person picks a run time on the page: now, a weekday this week, or an exact moment.
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const runRequestSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('now') }),
  z.strictObject({
    mode: z.literal('weekday'),
    day: z.enum(WEEKDAYS),
    time: hhmm,
  }),
  z.strictObject({
    mode: z.literal('exact'),
    local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  }),
]);
export type RunRequest = z.infer<typeof runRequestSchema>;

const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function resolveRunRequest(
  run: RunRequest,
  timeZone: string,
  now: number,
) {
  if (run.mode === 'now')
    return { runAt: now, chosen: 'The moment the button was pressed.' };
  if (run.mode === 'weekday')
    return {
      runAt: inWeek(
        mondayOf(now, timeZone),
        { day: run.day, minutes: minutesOf(run.time) },
        timeZone,
      ),
      chosen: `${run.day} ${run.time} in the current week (the week containing ${describeInstant(now, timeZone)}).`,
    };
  return {
    runAt: zonedInstant(
      {
        year: Number(run.local.slice(0, 4)),
        month: Number(run.local.slice(5, 7)),
        day: Number(run.local.slice(8, 10)),
      },
      minutesOf(run.local.slice(11)),
      timeZone,
    ),
    chosen: `${run.local.replace('T', ' ')}, read in ${timeZone}.`,
  };
}
