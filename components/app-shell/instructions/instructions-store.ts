'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { useTRPC } from '@/components/trpc/provider';
import { createStoredRecord, parseStored } from '../stored-record';
import type { ProcessSummary } from '@/lib/process/model';
import type { AppRouter } from '@/server/api/root';

/*
  A process's instruction versions: its declared ones and every one a person
  has published, kept and labelled by the server (`instructions.list`), oldest
  first by number, and the draft a person is writing, which is theirs alone
  until they publish it and so stays in this browser. Publishing never rewrites
  a version, so a run can always say which one it ran under.

  Until the server has answered, the process's own declared versions stand in,
  so a page is first drawn as it settles; a version not yet answered has no
  hash, and so cannot start a run.

  The draft is saved under v3 of the key, `{ [process]: { draft } }`. v2 held
  the draft beside the versions published in this browser; its draft is read
  once, where v3 holds nothing yet for the process, so unpublished work is not
  lost.
*/
const draftSchema = z.record(
  z.string(),
  z.object({ draft: z.string().nullable() }),
);
const store = createStoredRecord<z.infer<typeof draftSchema>>(
  'safepoint.instructions.v3',
  'safepoint:instructions',
);
const parse = (value: string | null) => parseStored(draftSchema, value, {});

// The earlier key: published versions that were kept only in this browser,
// and a draft.
const earlierSchema = z.record(
  z.string(),
  z.object({
    published: z.array(
      z.object({
        text: z.string().min(1),
        publishedAt: z.string(),
        note: z.string().nullable(),
      }),
    ),
    draft: z.string().nullable(),
  }),
);
const EARLIER_KEY = 'safepoint.instructions.v2';
const earlierStore = createStoredRecord<z.infer<typeof earlierSchema>>(
  EARLIER_KEY,
  'safepoint:instructions',
);
const parseEarlier = (value: string | null) =>
  parseStored(earlierSchema, value, {});

type Listed = inferRouterOutputs<AppRouter>['instructions']['list'];
type Published = inferRouterOutputs<AppRouter>['instructions']['publish'];

export type InstructionVersion = {
  // Null for a declared version not yet answered by the server.
  hash: string | null;
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

// The number in a label: v4 is 4.
function versionNumber(version: string): number {
  const number = Number.parseInt(version.replace(/\D/g, ''), 10);
  return Number.isFinite(number) ? number : 1;
}

const viewOf = (kept: Listed['versions'][number]): InstructionVersion => ({
  hash: kept.hash,
  version: kept.version,
  text: kept.text,
  // A declared version says its own date; a published one the time it was.
  updatedLabel:
    kept.updatedLabel ?? `Published ${publishedLabel(kept.publishedAt)}`,
  author: kept.publishedBy ?? 'Published here',
  note: kept.note,
  promptedBy: kept.promptedBy,
  changes: kept.changes,
});

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
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listing = trpc.instructions.list.queryOptions({ process: processId });
  const asked = useQuery(listing);
  const raw = useSyncExternalStore(store.subscribe, store.read, store.server);
  const stored = useMemo(() => parse(raw)[processId], [raw, processId]);
  // Read once: the v2 draft, until v3 holds an entry for the process.
  const earlierRaw = useSyncExternalStore(
    earlierStore.subscribe,
    earlierStore.read,
    earlierStore.server,
  );
  const earlierDraft = useMemo(
    () => parseEarlier(earlierRaw)[processId]?.draft ?? null,
    [earlierRaw, processId],
  );
  const draft = stored ? stored.draft : earlierDraft;
  // Versions published in this browser before the server kept them: not
  // brought over, but their text can be taken as a draft.
  const earlier = useMemo(
    () =>
      (parseEarlier(earlierRaw)[processId]?.published ?? []).map((one) => ({
        text: one.text,
        label: `Published ${publishedLabel(one.publishedAt)}`,
      })),
    [earlierRaw, processId],
  );

  // Oldest first, by number. Declared versions stand in until the server's
  // answer arrives.
  const versions = useMemo<InstructionVersion[]>(
    () =>
      asked.data
        ? asked.data.versions.map(viewOf)
        : [...instructions.previous, instructions].map((version) => ({
            hash: null,
            version: version.version,
            text: version.text,
            updatedLabel: version.updatedAt,
            author: version.author,
            note: version.note,
            promptedBy: version.promptedBy,
            changes: version.changes,
          })),
    [asked.data, instructions],
  );
  const next =
    asked.data?.next ??
    `v${Math.max(...versions.map((v) => versionNumber(v.version))) + 1}`;

  // The answer is the new state: a created version joins the list, and the
  // label after it is the next; text that was already a version changes none.
  const publishing = useMutation(
    trpc.instructions.publish.mutationOptions({
      onSuccess: ({ version, created }: Published) => {
        if (!created) return;
        queryClient.setQueryData(listing.queryKey, (list) =>
          list
            ? {
                versions: [...list.versions, version],
                next: `v${versionNumber(version.version) + 1}`,
              }
            : list,
        );
      },
    }),
  );

  // Each write starts from storage rather than this render's entry, so a
  // keystroke and a publish in one tick cannot overwrite each other.
  const saveStored = (draft: string | null) =>
    store.save({ ...parse(store.read()), [processId]: { draft } });

  return {
    versions,
    current: versions.at(-1)!,
    next,
    // Whether the server has said which versions are kept.
    kept: asked.data !== undefined,
    draft,
    earlier,
    // Told once: the versions go, the draft stays.
    dismissEarlier: () => {
      const all = parseEarlier(earlierStore.read());
      earlierStore.save({
        ...all,
        [processId]: { published: [], draft: all[processId]?.draft ?? null },
      });
    },
    saveDraft: (text: string) => saveStored(text),
    discardDraft: () => saveStored(null),
    // Answers the version published, or the one the text already was
    // (`created: false`), and says why where the server refused.
    publish: async (
      text: string,
      note: string | null,
    ): Promise<{ version: InstructionVersion; created: boolean }> => {
      const answer = await publishing.mutateAsync({
        process: processId,
        text,
        note,
      });
      saveStored(null);
      return { version: viewOf(answer.version), created: answer.created };
    },
    publishing: publishing.isPending,
    publishError: publishing.error?.message ?? null,
    resetPublish: publishing.reset,
  };
}
