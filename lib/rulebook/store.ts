import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChecksReport } from './checks';
import type { Draft } from './draft';
import {
  decisionSchema,
  type Decision,
  approvedRulebookSchema,
  type ApprovedRulebook,
  type Rulebook,
} from './schema';
import { runDataDir } from '@/lib/storage/run-data';

/*
  Server-only, development only. Approved rulebooks are versioned files in the
  repository, so an approval is visible in the diff and the tests can use it.
  A version is never overwritten; approving again writes the next one.
*/

const dirFor = (processId: string) =>
  path.join(process.cwd(), 'fixtures', processId, 'rulebooks');

async function listRulebooks(processId: string): Promise<ApprovedRulebook[]> {
  let files: string[];
  try {
    files = await readdir(dirFor(processId));
  } catch {
    return [];
  }
  const versions = await Promise.all(
    files
      .filter((f) => /^v\d+\.json$/.test(f))
      .map(async (f) =>
        approvedRulebookSchema.parse(
          JSON.parse(await readFile(path.join(dirFor(processId), f), 'utf8')),
        ),
      ),
  );
  return versions.sort((a, b) => a.version - b.version);
}

export async function activeRulebook(processId: string) {
  return (await listRulebooks(processId)).at(-1) ?? null;
}

export async function approveRulebook(
  processId: string,
  rulebook: Rulebook,
  drafted: ApprovedRulebook['drafted'],
  decisions: Decision[] = [],
): Promise<{ record: ApprovedRulebook; file: string }> {
  const version = ((await listRulebooks(processId)).at(-1)?.version ?? 0) + 1;
  const record = approvedRulebookSchema.parse({
    version,
    approved_at: new Date().toISOString(),
    drafted,
    rulebook,
    decisions,
  });
  await mkdir(dirFor(processId), { recursive: true });
  const file = path.join(dirFor(processId), `v${version}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { record, file: path.relative(process.cwd(), file) };
}

// Every draft, failed ones included, kept outside version control so a
// failure can be read after the page is gone. Model inputs and outputs only.
export type DraftRecord = {
  source: string;
  draft: Draft;
  checks: ChecksReport | null;
};

const draftsDir = (processId: string) => runDataDir(processId, 'drafts');

export async function saveDraftRecord(
  processId: string,
  runId: string,
  record: DraftRecord,
): Promise<string> {
  await mkdir(draftsDir(processId), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(
    draftsDir(processId),
    `${stamp}-${runId.slice(0, 8)}.json`,
  );
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  return path.relative(process.cwd(), file);
}

export type DraftSummary = {
  file: string;
  startedAt: string;
  models: string[];
  durationMs: number;
  steps: number;
  rounds: number;
  passed: boolean;
  interrupted: string | null;
  stopped: Draft['stopped'];
  resumed: boolean;
  problems: number;
  checks: { passed: number; total: number } | null;
};

// Newest first. Records that no longer parse are skipped, not fatal.
export async function listDraftRecords(
  processId: string,
): Promise<DraftSummary[]> {
  let files: string[];
  try {
    files = await readdir(draftsDir(processId));
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (file): Promise<DraftSummary | null> => {
        const record = await readDraftRecord(processId, file);
        if (!record?.draft?.stages) return null;
        const { draft, checks } = record;
        return {
          file,
          startedAt: draft.startedAt,
          models: draft.models ?? [draft.model],
          durationMs: draft.durationMs,
          steps: draft.stages.length,
          rounds: Math.max(1, ...draft.stages.map((s) => s.round ?? 1)),
          passed: Boolean(draft.rulebook),
          interrupted: draft.interrupted ?? null,
          stopped: draft.stopped ?? null,
          resumed: Boolean(draft.resumedFrom),
          problems: draft.issues.length,
          checks: checks
            ? {
                passed: checks.results.filter((c) => c.passed).length,
                total: checks.results.length,
              }
            : null,
        };
      }),
  );
  return summaries
    .filter((s): s is DraftSummary => s !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readDraftRecord(
  processId: string,
  file: string,
): Promise<DraftRecord | null> {
  // A bare file name only: nothing outside the drafts folder can be read.
  if (!/^[\w.-]+\.json$/.test(file)) return null;
  try {
    return JSON.parse(
      await readFile(path.join(draftsDir(processId), file), 'utf8'),
    ) as DraftRecord;
  } catch {
    return null;
  }
}

// The owner's decisions, in the repository beside the rulebooks: they are
// policy, reviewed in the diff like a rulebook, and never written to the sheet.
const decisionsFile = (processId: string) =>
  path.join(process.cwd(), 'fixtures', processId, 'decisions.json');

export async function listDecisions(processId: string): Promise<Decision[]> {
  try {
    return decisionSchema
      .array()
      .parse(JSON.parse(await readFile(decisionsFile(processId), 'utf8')));
  } catch {
    return [];
  }
}

async function saveDecisions(processId: string, decisions: Decision[]) {
  await mkdir(path.dirname(decisionsFile(processId)), { recursive: true });
  await writeFile(
    decisionsFile(processId),
    `${JSON.stringify(decisions, null, 2)}\n`,
  );
}

export async function addDecision(
  processId: string,
  input: Omit<Decision, 'id' | 'decided_at'>,
): Promise<Decision> {
  const decisions = await listDecisions(processId);
  const decision = decisionSchema.parse({
    ...input,
    id: `d${decisions.reduce((n, d) => Math.max(n, Number(d.id.slice(1)) || 0), 0) + 1}`,
    decided_at: new Date().toISOString(),
  });
  await saveDecisions(processId, [...decisions, decision]);
  return decision;
}

export async function removeDecision(processId: string, id: string) {
  const decisions = await listDecisions(processId);
  await saveDecisions(
    processId,
    decisions.filter((d) => d.id !== id),
  );
}
