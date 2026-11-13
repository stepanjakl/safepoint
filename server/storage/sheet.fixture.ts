import type { OutputSheet } from '@/lib/definitions/apply';
import type { KeptRead } from '@/lib/definitions/records';

// A sheet held in memory, for tests of writing to one: no network, and
// nothing written to the repository. It records what was asked of it, and
// each failure can be turned on and off between calls.
export function memorySheet(
  now: KeptRead,
  tab: unknown[][] | null = null,
  { failWrite = false, garble = false } = {},
) {
  const sheet: OutputSheet & {
    grid: unknown[][] | null;
    added: string[];
    writes: string[];
    failWrite: boolean;
    failAdd: boolean;
    // How many reads of a tab, from now, fail.
    failReads: number;
  } = {
    grid: tab,
    added: [] as string[],
    writes: [] as string[],
    failWrite,
    failAdd: false,
    failReads: 0,
    readNow: async () => now,
    readTab: async () => {
      if (sheet.failReads > 0) {
        sheet.failReads -= 1;
        throw new Error('The sheet could not be read.');
      }
      return sheet.grid;
    },
    addTab: async (name: string) => {
      if (sheet.failAdd) throw new Error('The sheet said no.');
      sheet.added.push(name);
      sheet.grid = [];
    },
    writeRange: async (_: string, range: string, values: unknown[][]) => {
      if (sheet.failWrite) throw new Error('The sheet said no.');
      sheet.writes.push(range);
      const [from = 'A1'] = range.split(':');
      const left = from.charCodeAt(0) - 65;
      const top = Number(from.slice(1)) - 1;
      const grid = (sheet.grid ??= []);
      values.forEach((row, r) => {
        const at = (grid[top + r] ??= []);
        row.forEach((cell, c) => {
          at[left + c] = garble ? 'garbled' : cell;
        });
      });
    },
  };
  return sheet;
}
