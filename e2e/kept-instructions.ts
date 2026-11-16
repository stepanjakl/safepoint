import type { Page } from '@playwright/test';

import { hashOf } from '@/lib/definitions/fingerprint';
import { normalisedInstructions } from '@/lib/process/instruction-diff';
import type { ProcessSummary } from '@/lib/process/model';
import { promotionProcess } from '@/lib/process/placeholder-process';
import type { KeptVersion } from '@/server/storage/instructions';

import { mockProcedure } from './trpc';

/*
  What `instructions.list` answers for a process, as the server would: its
  declared versions, then versions published here, labelled on from the
  highest. For a test that needs versions already published without keeping
  any in the shared test database, which every test and both projects use.
*/
type Published = { text: string; publishedAt: string; note?: string | null };

export function listedInstructions(
  process: ProcessSummary,
  published: Published[] = [],
) {
  const declared = [...process.instructions.previous, process.instructions];
  const versions: KeptVersion[] = declared.map((version) => ({
    hash: hashOf(version.text),
    version: version.version,
    text: version.text,
    note: version.note,
    origin: 'declared',
    publishedBy: version.author,
    publishedAt: new Date(0).toISOString(),
    updatedLabel: version.updatedAt,
    promptedBy: version.promptedBy,
    changes: version.changes,
  }));
  let number = Math.max(...declared.map((v) => Number(v.version.slice(1))));
  for (const one of published) {
    const text = normalisedInstructions(one.text);
    versions.push({
      hash: hashOf(text),
      version: `v${++number}`,
      text,
      note: one.note ?? null,
      origin: 'published',
      publishedBy: null,
      publishedAt: one.publishedAt,
      updatedLabel: null,
      promptedBy: null,
      changes: [],
    });
  }
  return { versions, next: `v${number + 1}` };
}

// Serves the promotion process's list with versions already published.
export function mockPromotionInstructions(page: Page, published: Published[]) {
  return mockProcedure(page, 'instructions.list', {
    data: listedInstructions(promotionProcess, published),
  });
}
