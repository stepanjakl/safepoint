import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  approvedRulebookSchema,
  type ApprovedRulebook,
  type Rulebook,
} from './schema';

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
): Promise<{ record: ApprovedRulebook; file: string }> {
  const version = ((await listRulebooks(processId)).at(-1)?.version ?? 0) + 1;
  const record = approvedRulebookSchema.parse({
    version,
    approved_at: new Date().toISOString(),
    drafted,
    rulebook,
  });
  await mkdir(dirFor(processId), { recursive: true });
  const file = path.join(dirFor(processId), `v${version}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { record, file: path.relative(process.cwd(), file) };
}
