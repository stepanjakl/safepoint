/*
  Runs every kind of the import and says what each did. Separate from the
  command so a test can run it on a scratch database and a made-up folder.
*/
import type { Database } from '@/server/db/client';

import { KINDS, type Kind, type Shared, type Tally } from './kinds';

export type Report = { kind: string; tally: Tally }[];

export async function importKeptData(
  db: Database,
  dataDir: string,
  { dryRun = false, kinds = KINDS }: { dryRun?: boolean; kinds?: Kind[] } = {},
): Promise<Report> {
  const report: Report = [];
  const shared: Shared = { reads: new Set() };
  for (const kind of kinds)
    report.push({
      kind: kind.name,
      tally: await kind.run(db, dataDir, dryRun, shared),
    });
  return report;
}

// What a person reads: a line per kind, and under it each thing refused.
export function describe(report: Report, dryRun: boolean): string {
  const width = Math.max(...report.map(({ kind }) => kind.length));
  const lines = report.map(
    ({ kind, tally }) =>
      `${kind.padEnd(width)}  files ${tally.files}  ${dryRun ? 'would insert' : 'inserted'} ${tally.inserted}  present ${tally.present}  refused ${tally.refused.length}`,
  );
  for (const { kind, tally } of report)
    for (const { what, why } of tally.refused)
      lines.push(`  refused (${kind}) ${what}: ${why}`);
  return lines.join('\n');
}

export const refusals = (report: Report) =>
  report.reduce((sum, { tally }) => sum + tally.refused.length, 0);
