'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { createStoredRecord, parseStored } from '../stored-record';
import type { ProcessSummary } from '@/lib/process/model';

/*
  Instruction versions a person has published, and the draft they are working
  on, keyed by process id. The process supplies its own history -- earlier
  versions and the current one -- and every publish here appends the next
  version and never rewrites an earlier one, so a run can always say which
  version it ran under.

  Saved in this browser. The recorded run ran under the fixture's version, and
  publishing here does not run anything. v2 of the key: versions are one text
  now, where v1 stored a list of clauses.
*/
const entrySchema = z.object({
  published: z.array(
    z.object({
      text: z.string().min(1),
      publishedAt: z.string(),
      note: z.string().nullable(),
    }),
  ),
  draft: z.string().nullable(),
});
const schema = z.record(z.string(), entrySchema);
type Entry = z.infer<typeof entrySchema>;
type Stored = z.infer<typeof schema>;
const EMPTY: Entry = { published: [], draft: null };
const store = createStoredRecord<Stored>(
  'safepoint.instructions.v2',
  'safepoint:instructions',
);
const parse = (value: string | null) => parseStored(schema, value, {});

export type InstructionVersion = {
  version: string;
  text: string;
  updatedLabel: string;
  author: string;
  note: string | null;
  promptedBy: string | null;
  changes: string[];
};

const PUBLISHED_AT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/London',
});

// The app's own date shape -- "Thu 4 Sep · 09:00", as runs and evidence read
// -- rather than the locale's, which says "Sept" and puts a comma before the
// time.
function publishedLabel(iso: string): string {
  const parts = Object.fromEntries(
    PUBLISHED_AT.formatToParts(new Date(iso)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${parts.weekday} ${parts.day} ${(parts.month ?? '').slice(0, 3)} · ${parts.hour}:${parts.minute}`;
}

// Versions are numbered on from the process's own, so a process at v4
// publishes v5 next. The number is derived, not stored: nothing can skip or
// repeat one.
function versionNumber(version: string): number {
  const number = Number.parseInt(version.replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : 1;
}

// The date alone, for a place that supplies its own verb.
export const labelDate = (updatedLabel: string) =>
  updatedLabel.replace(/^(Updated|Published|Drafted|Written)\s+/, '');

// The day in a stored label -- "Updated 24 Aug 2026", "Published Thu 4 Sep ·
// 09:00" -- which is all a version keeps of when it was made.
function dayOf(label: string) {
  const match = /(\d{1,2}) ([A-Z][a-z]{2})[a-z]*\.?(?: (\d{4}))?/.exec(label);
  if (!match) return null;
  return { day: match[1]!, month: match[2]!, year: match[3] ?? null };
}

/*
  When a version was the one a run would run under: from its own date to the
  next version's, or to now for the current one. Month first, as the runs rail
  dates a run; the month is said once where both ends share it, and the year
  only where it is not the newest one a version states.
*/
export function liveRange(versions: InstructionVersion[], index: number) {
  const from = dayOf(versions[index]!.updatedLabel);
  const nextLabel = versions[index + 1]?.updatedLabel;
  const to = nextLabel ? dayOf(nextLabel) : null;
  // The newest year any version states: one published here gives none.
  const latest =
    versions
      .map((version) => dayOf(version.updatedLabel)?.year ?? null)
      .findLast((year) => year !== null) ?? null;
  if (!from || (nextLabel && !to)) {
    const raw = labelDate(versions[index]!.updatedLabel);
    return nextLabel ? `${raw} – ${labelDate(nextLabel)}` : `Since ${raw}`;
  }
  const year = (at: { year: string | null }) =>
    at.year && at.year !== latest ? `, ${at.year}` : '';
  const start = `${from.month} ${from.day}${year(from)}`;
  if (!to) return `${start} – now`;
  const sameMonth = to.month === from.month && to.year === from.year;
  return sameMonth
    ? `${start.replace(year(from), '')} – ${to.day}${year(to)}`
    : `${start} – ${to.month} ${to.day}${year(to)}`;
}

export function useInstructions(
  processId: string,
  instructions: ProcessSummary['instructions'],
) {
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const entry = useMemo(() => parse(raw)[processId] ?? EMPTY, [raw, processId]);
  const start = versionNumber(instructions.version);

  // Oldest first: the process's earlier versions, its current one, then any
  // published in this browser.
  const versions = useMemo<InstructionVersion[]>(
    () => [
      ...[...instructions.previous, instructions].map((version) => ({
        version: version.version,
        text: version.text,
        updatedLabel: version.updatedAt,
        author: version.author,
        note: version.note,
        promptedBy: version.promptedBy,
        changes: version.changes,
      })),
      // Published here: the reason is the note written at publishing, and
      // there is no change log beyond the comparison itself.
      ...entry.published.map((published, index) => ({
        version: `v${start + index + 1}`,
        text: published.text,
        updatedLabel: `Published ${publishedLabel(published.publishedAt)}`,
        author: 'You, in this browser',
        note: published.note,
        promptedBy: null,
        changes: [],
      })),
    ],
    [instructions, entry, start],
  );

  // Each write starts from storage rather than this render's entry, so a
  // keystroke and a publish in one tick cannot overwrite each other.
  const change = (apply: (entry: Entry) => Entry) => {
    const all = parse(store.read());
    store.save({ ...all, [processId]: apply(all[processId] ?? EMPTY) });
  };

  return {
    versions,
    current: versions.at(-1)!,
    next: `v${start + entry.published.length + 1}`,
    draft: entry.draft,
    saveDraft: (text: string) =>
      change((stored) => ({ ...stored, draft: text })),
    discardDraft: () => change((stored) => ({ ...stored, draft: null })),
    publish: (text: string, note: string | null) =>
      change((stored) => ({
        published: [
          ...stored.published,
          { text, publishedAt: new Date().toISOString(), note },
        ],
        draft: null,
      })),
  };
}
