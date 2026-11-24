import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rulebookProcess } from '@/server/operations/kept-processes';

import { liveSheetOf } from './run-reads';

// Every request to the sheet counts against its reads a minute: a write's
// preparation reads it once, and only a write makes it read again.
const snapshot = JSON.parse(
  readFileSync('fixtures/brunch-orders/sheet-snapshot.json', 'utf8'),
);
const sheets = vi.hoisted(() => ({
  readWholeSheet: vi.fn(),
  readTab: vi.fn(),
  writeRange: vi.fn(),
  addTab: vi.fn(),
}));
vi.mock('@/lib/sheets/composio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sheets/composio')>()),
  ...sheets,
}));

describe('the live sheet a write prepares on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sheets.readWholeSheet.mockResolvedValue(snapshot);
    sheets.readTab.mockResolvedValue([['sku', 'order']]);
  });

  it('answers a tab from the read it just took, and reads afresh after a write', async () => {
    const sheet = liveSheetOf(rulebookProcess().runs.reads);
    await sheet.readNow();
    expect(await sheet.readTab('Products')).toEqual(
      snapshot.valueRanges[0].values,
    );
    expect(await sheet.readTab('No such tab')).toBeNull();
    expect(sheets.readTab).not.toHaveBeenCalled();
    await sheet.writeRange('Orders', 'A1', [['sku']]);
    expect(await sheet.readTab('Orders')).toEqual([['sku', 'order']]);
    expect(sheets.readTab).toHaveBeenCalledTimes(1);
  });
});
