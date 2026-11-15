import type { OutputSheet } from '@/lib/definitions/apply';
import type { KeptRead } from '@/lib/definitions/records';

type Operation = 'readNow' | 'readTab' | 'addTab' | 'writeRange';

// A call held at the door: `reached` once it arrives, and it goes on, as
// if the service had answered only then, when `open` is called.
export type Gate = { reached: Promise<void>; open: () => void };

// A sheet held in memory, for tests of writing to one: no network, and
// nothing written to the repository. It records what was asked of it, and
// each failure can be turned on and off between calls. `hold` stops the next
// call of an operation until the test lets it go, so two callers can be
// interleaved exactly, with no waiting on time.
export function memorySheet(
  now: KeptRead,
  tab: unknown[][] | null = null,
  { failWrite = false, garble = false } = {},
) {
  const gates: Partial<Record<Operation, (() => Promise<void>)[]>> = {};
  const door = async (operation: Operation) => {
    await gates[operation]?.shift()?.();
  };
  const sheet: OutputSheet & {
    grid: unknown[][] | null;
    added: string[];
    writes: string[];
    failWrite: boolean;
    failAdd: boolean;
    // How many reads of a tab, from now, fail.
    failReads: number;
    hold: (operation: Operation) => Gate;
  } = {
    grid: tab,
    added: [] as string[],
    writes: [] as string[],
    failWrite,
    failAdd: false,
    failReads: 0,
    hold: (operation) => {
      let arrive!: () => void;
      let open!: () => void;
      const reached = new Promise<void>((done) => (arrive = done));
      const opened = new Promise<void>((done) => (open = done));
      (gates[operation] ??= []).push(async () => {
        arrive();
        await opened;
      });
      return { reached, open };
    },
    readNow: async () => {
      await door('readNow');
      return now;
    },
    readTab: async () => {
      await door('readTab');
      if (sheet.failReads > 0) {
        sheet.failReads -= 1;
        throw new Error('The sheet could not be read.');
      }
      return sheet.grid;
    },
    addTab: async (name: string) => {
      await door('addTab');
      if (sheet.failAdd) throw new Error('The sheet said no.');
      sheet.added.push(name);
      sheet.grid = [];
    },
    writeRange: async (_: string, range: string, values: unknown[][]) => {
      await door('writeRange');
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
