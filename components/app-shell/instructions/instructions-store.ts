'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
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
const KEY = 'safepoint.instructions.v2';
const CHANGE = 'safepoint:instructions';
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
let temporary: string | null = null;

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

function parse(value: string | null): Stored {
  try {
    const parsed = schema.safeParse(JSON.parse(value ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch {
    // An old or edited preference must never hide the instructions.
  }
  return {};
}

function read() {
  if (temporary !== null) return temporary;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE, notify);
  };
}

function save(stored: Stored) {
  const value = JSON.stringify(stored);
  try {
    localStorage.setItem(KEY, value);
    temporary = null;
  } catch {
    temporary = value;
  }
  window.dispatchEvent(new Event(CHANGE));
}

// Versions are numbered on from the process's own, so a process at v4
// publishes v5 next. The number is derived, not stored: nothing can skip or
// repeat one.
function versionNumber(version: string): number {
  const number = Number.parseInt(version.replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : 1;
}

export function useInstructions(
  processId: string,
  instructions: ProcessSummary['instructions'],
) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
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
    const all = parse(read());
    save({ ...all, [processId]: apply(all[processId] ?? EMPTY) });
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
