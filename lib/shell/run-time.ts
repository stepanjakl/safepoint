/*
  When a run happened, in the three shapes the interface asks for it.

  Every format is pinned to one zone rather than the reader's. A run is an
  event in the process's own working day -- the schedule is set in a named
  timezone and the rail sits beside that schedule -- and a reader in another
  zone reading "Yesterday" about a run that has not happened in their day yet
  is worse served than one reading the process's own clock. It also makes the
  server's answer and the browser's the same, which a locale-relative format
  cannot promise.
*/

// The zone the placeholder processes are scheduled in. Real processes carry
// their own; this is where that would be read from.
const ZONE = 'Europe/London';

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: ZONE,
});

const FULL = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: ZONE,
});

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONE,
});

// The calendar day an instant falls on in ZONE, as a sortable string. Built
// from the formatter rather than from the Date's own fields, which are the
// reader's zone and not this one.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: ZONE,
});

function dayKey(at: Date): string {
  return DAY_KEY.format(at);
}

// The day before a day key, counted on the calendar rather than by subtracting
// 24 hours from an instant: either clock change makes one ZONE day 23 or 25.
function previousDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! - 1))
    .toISOString()
    .slice(0, 10);
}

/*
  The day, named where a name is more use than a date. `now` is a parameter so
  that a caller can render a fixed instant -- a gallery of states, a test --
  without waiting for the calendar to agree.
*/
export function runDay(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const key = dayKey(at);
  if (key === dayKey(now)) return 'Today';
  if (key === previousDayKey(dayKey(now))) return 'Yesterday';
  // "Jun 17" rather than "17 Jun": the day is scanned down a column, and the
  // month is what a reader is placing it by.
  const parts = Object.fromEntries(
    DAY_MONTH.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return `${(parts.month ?? '').slice(0, 3)} ${parts.day}`;
}

export function runTime(iso: string): string {
  return TIME.format(new Date(iso));
}

// The whole instant, for the places a run is named rather than listed: a
// tooltip, a panel's "as read by the run of", a screen reader.
export function runStamp(iso: string): string {
  const at = new Date(iso);
  const parts = Object.fromEntries(
    FULL.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const month = (parts.month ?? '').slice(0, 3);
  return `${parts.weekday} ${parts.day} ${month} · ${TIME.format(at)}`;
}
