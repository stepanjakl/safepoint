import { readFileSync } from 'node:fs';

import { DATA_TABS } from '@/lib/processes/brunch-orders/process';
import type { SheetRead } from '@/lib/sheets/composio';

import type { DataTab, KeptRead } from './records';

// The captured read of the Brunch orders sheet, as a run keeps it: the data
// the engine's tests run on. A test that changes a tab works on its own copy.
const snapshot = JSON.parse(
  readFileSync('fixtures/brunch-orders/sheet-snapshot.json', 'utf8'),
) as SheetRead;

export const capturedTabs = (): DataTab[] =>
  DATA_TABS.map((name) => ({
    name,
    values: structuredClone(
      (snapshot.valueRanges.find((vr) => vr.range.startsWith(name))?.values ??
        []) as unknown[][],
    ),
  }));

export const capturedRead = (tabs: DataTab[] = capturedTabs()): KeptRead => ({
  id: 'test',
  readAt: snapshot.readAt,
  source: 'captured',
  spreadsheet: { title: null, url: '' },
  tabs,
});
