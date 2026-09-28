/* Formatting for the interface. London time throughout, because the
   scenario's deadlines are London's. */

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(iso: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of londonParts.formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return parts;
}

export function formatLondonDateTime(iso: string): string {
  const p = partsOf(iso);
  const month = (p.month ?? '').replace(/\.$/, '').slice(0, 3);
  return `${p.weekday} ${p.day} ${month} ${p.hour}:${p.minute}`;
}

export function formatLondonTime(iso: string): string {
  const p = partsOf(iso);
  return `${p.hour}:${p.minute}`;
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatPercent(percent: number): string {
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

export function formatSignedPercent(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  const sign = percent < 0 ? '−' : percent > 0 ? '+' : '';
  return `${sign}${formatPercent(rounded)}`;
}

export function formatUnits(units: number): string {
  return `${units.toLocaleString('en-GB')} units`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Route parameter parsing
